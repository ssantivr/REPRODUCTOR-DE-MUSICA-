"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { DoublyLinkedList, type Node, type SerializedList } from "@/lib/DoublyLinkedList";
import { HashTable } from "@/lib/HashTable";
import { ListMetrics, instrumentList } from "@/lib/ListMetrics";
import { PlaybackHistory, type HistoryEntry } from "@/lib/PlaybackHistory";
import { Queue } from "@/lib/Queue";
import { parseSong, toSong } from "@/lib/songSchema";
import { Stack } from "@/lib/Stack";
import type { InsertOperation, PlaylistEvent, PlaylistEventTone, Song, SongBindings, Track } from "@/types/music";

const HISTORY_CAPACITY = 20;
const UNDO_CAPACITY = 30;
/** How many random jumps "previous" can walk back in shuffle mode. */
const TRAIL_CAPACITY = 50;
/** A jump to a position lights its whole path in about this time, however long it is. */
const WALK_JUMP_MS = 600;
const WALK_MAX_STEP_MS = 90;
const WALK_FADE_MS = 700;

/** A walk over the nodes from `from` to `to`, one every `stepMs`: the interface lights them in that order. */
export interface ListWalk {
  id: number;
  from: number;
  to: number;
  stepMs: number;
}

/**
 * One undoable change, stored as the operation that takes the list back (its
 * inverse) plus a Spanish label for the interface. Adding, removing and moving
 * a song only need a position, so a step costs O(1) of memory; a new order
 * (shuffle, import) has no shorter inverse than the order it replaced.
 */
type StepChange = { label: string } & (
  | { kind: "remove"; index: number }
  | { kind: "insert"; index: number; track: Track }
  | { kind: "move"; from: number; to: number }
  | { kind: "order"; tracks: Track[]; currentUid: string | null }
);
/** The `id` follows a change from one stack to the other, so the interface can show it travelling. */
type HistoryStep = StepChange & { id: number };

/** What the interface shows of a step waiting in the undo or the redo stack. */
export interface StepLabel {
  id: number;
  label: string;
}
export const PLAYLIST_FILE_FORMAT = "universo-musical/playlist";

const toTrack = (song: Song, uid: string): Track => ({ ...song, uid });

/**
 * Bridges the doubly linked list and React.
 * The list lives in a ref and is mutated in place; `version` forces a re-render
 * after every operation. Playback follows the list cursor (`list.next()` /
 * `list.prev()`); repeat mode makes the list circular. Every operation emits a
 * Spanish, human-readable event for the interface.
 */
export function usePlaylist(initialSongs: Song[]) {
  const metricsRef = useRef<ListMetrics | null>(null);
  metricsRef.current ??= new ListMetrics();
  const listRef = useRef<DoublyLinkedList<Track> | null>(null);
  // uid → node: reaches the node of a song in O(1) on average instead of walking the list
  const nodesRef = useRef<HashTable<Node<Track>> | null>(null);
  nodesRef.current ??= new HashTable<Node<Track>>();
  const nodes = nodesRef.current;
  if (listRef.current === null) {
    // Deterministic uids so the server and client renders match
    listRef.current = new DoublyLinkedList(initialSongs.map((song, i) => toTrack(song, `init-${i}-${song.id}`)));
    listRef.current.setCircular(true);
    for (const node of listRef.current.nodes()) nodes.set(node.value.uid, node);
    instrumentList(listRef.current, metricsRef.current);
  }
  const list = listRef.current;

  /** Rebuilds the uid → node table after the whole list was replaced. O(n) */
  const reindex = useCallback(() => {
    nodes.clear();
    for (const node of list.nodes()) nodes.set(node.value.uid, node);
  }, [list, nodes]);

  const historyRef = useRef<PlaybackHistory<Track> | null>(null);
  historyRef.current ??= new PlaybackHistory<Track>(HISTORY_CAPACITY, (a, b) => a.uid === b.uid);

  const uidCounter = useRef(0);
  const eventCounter = useRef(0);
  const [version, setVersion] = useState(0);
  const [repeat, setRepeatState] = useState(true);
  const [shuffleMode, setShuffleMode] = useState(false);
  const shuffleRef = useRef(shuffleMode);
  shuffleRef.current = shuffleMode;
  const [event, setEvent] = useState<PlaylistEvent | null>(null);
  const [history, setHistory] = useState<HistoryEntry<Track>[]>([]);

  const notify = useCallback((tone: PlaylistEventTone, message: string) => {
    eventCounter.current += 1;
    setEvent({ id: eventCounter.current, tone, message });
  }, []);

  const commit = useCallback(() => setVersion((v) => v + 1), []);

  const [walk, setWalk] = useState<ListWalk | null>(null);
  const walkCounter = useRef(0);
  const walkTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  /** Shows the nodes a traversal went through; the walk clears itself once it has been shown. */
  const startWalk = useCallback((from: number, to: number, stepMs: number) => {
    walkCounter.current += 1;
    setWalk({ id: walkCounter.current, from, to, stepMs });
    clearTimeout(walkTimer.current);
    walkTimer.current = setTimeout(() => setWalk(null), Math.abs(to - from) * stepMs + WALK_FADE_MS);
  }, []);

  const nextUid = useCallback((song: Song) => {
    uidCounter.current += 1;
    return `${song.id}~${uidCounter.current}`;
  }, []);

  // ---------------------------------------------------------------------------
  // Undo / redo (two stacks of inverse operations)
  // ---------------------------------------------------------------------------

  const undoRef = useRef<Stack<HistoryStep> | null>(null);
  undoRef.current ??= new Stack<HistoryStep>(UNDO_CAPACITY);
  const redoRef = useRef<Stack<HistoryStep> | null>(null);
  redoRef.current ??= new Stack<HistoryStep>(UNDO_CAPACITY);
  const undoStack = undoRef.current;
  const redoStack = redoRef.current;

  /** The current order as a step: the inverse of whatever is about to rearrange the whole list. */
  const captureOrder = useCallback(
    (label: string): StepChange => ({ kind: "order", label, tracks: list.toArray(), currentUid: list.current?.value.uid ?? null }),
    [list],
  );

  /** Makes a change undoable. A new change invalidates everything that could be redone. */
  const stepCounter = useRef(0);
  const checkpoint = useCallback(
    (step: StepChange) => {
      stepCounter.current += 1;
      undoStack.push({ ...step, id: stepCounter.current });
      redoStack.clear();
    },
    [undoStack, redoStack],
  );

  /**
   * Applies a step and returns its own inverse, which is what the opposite
   * stack keeps: undoing an insertion leaves "insert it again" ready to redo.
   * Playback does not move while the playing song survives.
   */
  const revert = useCallback(
    (step: StepChange): StepChange | null => {
      const { label } = step;
      switch (step.kind) {
        case "remove": {
          const track = list.removeAt(step.index);
          if (!track) return null;
          nodes.delete(track.uid);
          return { kind: "insert", label, index: step.index, track };
        }
        case "insert":
          nodes.set(step.track.uid, list.insertAt(step.index, step.track));
          return { kind: "remove", label, index: step.index };
        case "move":
          return list.move(step.from, step.to) ? { kind: "move", label, from: step.to, to: step.from } : null;
        case "order": {
          const present = captureOrder(label);
          // Prefer the live objects: they may carry bindings resolved after the step was saved
          const live = new Map(list.toArray().map((track) => [track.uid, track]));
          const playingUid = list.current?.value.uid ?? null;
          list.clear();
          for (const track of step.tracks) list.append(live.get(track.uid) ?? track);
          reindex();
          const target = (playingUid && nodes.get(playingUid)) || (step.currentUid && nodes.get(step.currentUid)) || null;
          if (target) list.setCurrent(target);
          return present;
        }
      }
    },
    [list, nodes, captureOrder, reindex],
  );

  // ---------------------------------------------------------------------------
  // "Play next" queue (FIFO): songs of the list that jump ahead of the normal order
  // ---------------------------------------------------------------------------

  const queueRef = useRef<Queue<Track> | null>(null);
  queueRef.current ??= new Queue<Track>();
  const upNext = queueRef.current;
  const [queue, setQueue] = useState<Track[]>([]);
  const syncQueue = useCallback(() => setQueue(upNext.toArray()), [upNext]);

  /** Queued songs that are no longer in the list lose their turn. */
  const pruneQueue = useCallback(() => {
    if (upNext.isEmpty) return;
    upNext.retain((track) => nodes.has(track.uid));
    syncQueue();
  }, [nodes, upNext, syncQueue]);

  /** Pops a step from one stack, applies it and pushes its inverse onto the other. */
  const travel = useCallback(
    (from: Stack<HistoryStep>, to: Stack<HistoryStep>, verb: string, emptyMessage: string): boolean => {
      const step = from.pop();
      if (!step) {
        notify("warning", emptyMessage);
        return false;
      }
      const inverse = revert(step);
      if (inverse) to.push({ ...inverse, id: step.id });
      pruneQueue();
      notify("traverse", `${verb}: ${step.label}`);
      commit();
      return true;
    },
    [revert, pruneQueue, notify, commit],
  );

  const undo = useCallback(() => travel(undoStack, redoStack, "Deshecho", "No hay nada que deshacer"), [travel, undoStack, redoStack]);
  const redo = useCallback(() => travel(redoStack, undoStack, "Rehecho", "No hay nada que rehacer"), [travel, undoStack, redoStack]);

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  // Shuffle mode: the songs that already sounded in this round, and the way back for "previous"
  const playedRef = useRef<HashTable<true> | null>(null);
  playedRef.current ??= new HashTable<true>();
  const played = playedRef.current;
  const trailRef = useRef<Stack<string> | null>(null);
  trailRef.current ??= new Stack<string>(TRAIL_CAPACITY);
  const trail = trailRef.current;

  /** Moves forward through `next`, or jumps randomly in shuffle mode. */
  const next = useCallback((): boolean => {
    // Whoever waits in the queue goes before the normal order
    while (!upNext.isEmpty) {
      const queued = upNext.dequeue();
      const node = queued ? nodes.get(queued.uid) : undefined;
      if (!node) continue;
      list.setCurrent(node);
      syncQueue();
      notify("navigate", `De la cola: «${node.value.title}»`);
      commit();
      return true;
    }
    if (shuffleRef.current && list.length > 1) {
      const fromUid = list.current?.value.uid;
      if (fromUid) played.set(fromUid, true);
      // No song repeats until every one has sounded; then a new round starts
      let node = list.jumpRandom(Math.random, (track) => !played.has(track.uid));
      if (!node) {
        played.clear();
        if (fromUid) played.set(fromUid, true);
        node = list.jumpRandom();
      }
      if (node) {
        if (fromUid) trail.push(fromUid);
        notify("navigate", `Salto aleatorio a «${node.value.title}»`);
        commit();
        return true;
      }
    }
    const wraps = list.circular && list.current === list.tail;
    const node = list.next();
    if (!node) {
      notify("warning", "Llegaste al final de la constelación");
      return false;
    }
    notify("navigate", wraps ? `Fin del recorrido: de vuelta al inicio con «${node.value.title}»` : `Siguiente: «${node.value.title}»`);
    commit();
    return true;
  }, [list, nodes, upNext, played, trail, syncQueue, notify, commit]);

  /** Moves backward through `prev`; in shuffle mode it first walks back the random jumps. */
  const prev = useCallback((): boolean => {
    while (shuffleRef.current && !trail.isEmpty) {
      const uid = trail.pop();
      const node = uid ? nodes.get(uid) : undefined;
      if (!node) continue; // that song left the list
      list.setCurrent(node);
      notify("navigate", `De vuelta a «${node.value.title}»`);
      commit();
      return true;
    }
    const wraps = list.circular && list.current === list.head;
    const node = list.prev();
    if (!node) {
      notify("warning", "Ya estás en el inicio de la constelación");
      return false;
    }
    notify("navigate", wraps ? `Inicio del recorrido: salto al final con «${node.value.title}»` : `Anterior: «${node.value.title}»`);
    commit();
    return true;
  }, [list, nodes, trail, notify, commit]);

  /** Jumps to a position (the list uses traverseToIndex internally). */
  const playAt = useCallback(
    (index: number): boolean => {
      const node = list.moveTo(index);
      if (!node) {
        notify("warning", `No existe la posición ${index + 1}`);
        return false;
      }
      const info = list.lastTraversal;
      const route =
        info && info.steps > 0
          ? ` · ${info.steps} ${info.steps === 1 ? "salto" : "saltos"} desde ${info.from === "head" ? "el inicio" : "el final"}`
          : "";
      if (info && info.steps > 0) {
        startWalk(info.from === "head" ? 0 : list.length - 1, index, Math.min(WALK_MAX_STEP_MS, WALK_JUMP_MS / info.steps));
      }
      notify("traverse", `Viaje a «${node.value.title}»${route}`);
      commit();
      return true;
    },
    [list, notify, commit, startWalk],
  );

  /** Position of a song: its node comes from the hash table, the position from walking to it. */
  const indexOfUid = useCallback(
    (uid: string) => {
      const node = nodes.get(uid);
      return node ? list.indexOfNode(node) : -1;
    },
    [list, nodes],
  );

  // ---------------------------------------------------------------------------
  // Structure
  // ---------------------------------------------------------------------------

  /** Links a song with append, prepend or insertAt. Returns its final index. */
  const add = useCallback(
    (song: Song, operation: InsertOperation, index = 0): number => {
      const track = toTrack(toSong(song), nextUid(song));
      let position: number;
      let node: Node<Track>;

      if (operation === "append") {
        node = list.append(track);
        position = list.length - 1;
        notify("add", `«${song.title}» se unió al final de la constelación`);
      } else if (operation === "prepend") {
        node = list.prepend(track);
        position = 0;
        notify("add", `«${song.title}» ahora abre la constelación`);
      } else {
        position = Math.max(0, Math.min(index, list.length));
        node = list.insertAt(position, track);
        notify("add", `«${song.title}» entró en la posición ${position + 1}`);
      }

      nodes.set(track.uid, node);
      checkpoint({ kind: "remove", label: `agregar «${song.title}»`, index: position });
      commit();
      return position;
    },
    [list, nodes, notify, commit, nextUid, checkpoint],
  );

  /** Removes by index. The list moves its cursor to a neighbor when needed. */
  const remove = useCallback(
    (index: number): Track | null => {
      const removed = list.removeAt(index);
      if (!removed) return null; // nothing changed: skip the re-render
      nodes.delete(removed.uid);
      checkpoint({ kind: "insert", label: `quitar «${removed.title}»`, index, track: removed });
      pruneQueue();
      notify("remove", `«${removed.title}» salió de la constelación`);
      commit();
      return removed;
    },
    [list, nodes, notify, commit, checkpoint, pruneQueue],
  );

  /** Moves a song to another position by relinking its node (no node is created). */
  const move = useCallback(
    (from: number, to: number): boolean => {
      if (from === to) return false;
      const title = list.traverseToIndex(from)?.value.title;
      if (title === undefined || !list.move(from, to)) return false;
      checkpoint({ kind: "move", label: `mover «${title}»`, from: to, to: from });
      notify("traverse", `«${title}» pasó de la posición ${from + 1} a la ${to + 1}`);
      commit();
      return true;
    },
    [list, notify, commit, checkpoint],
  );

  /** Adds the song at `index` to the back of the "play next" queue. */
  const enqueue = useCallback(
    (index: number): boolean => {
      const track = list.traverseToIndex(index)?.value;
      if (!track) return false;
      upNext.enqueue(track);
      syncQueue();
      notify("add", `«${track.title}» entró a la cola en el turno ${upNext.size}`);
      return true;
    },
    [list, upNext, syncQueue, notify],
  );

  /** Takes a song out of the queue before its turn. */
  const unqueue = useCallback(
    (position: number) => {
      const track = upNext.removeAt(position);
      if (!track) return;
      syncQueue();
      notify("remove", `«${track.title}» salió de la cola`);
    },
    [upNext, syncQueue, notify],
  );

  const clearQueue = useCallback(() => {
    upNext.clear();
    syncQueue();
  }, [upNext, syncQueue]);

  /** Attaches playback bindings to the node holding the song with this uid. */
  const enrich = useCallback(
    (uid: string, bindings: SongBindings) => {
      const node = nodes.get(uid);
      if (!node) return;
      node.value = { ...node.value, ...bindings };
      commit();
    },
    [nodes, commit],
  );

  // ---------------------------------------------------------------------------
  // Advanced modes
  // ---------------------------------------------------------------------------

  /** Repeat mode = circular list: the tail links back to the head. */
  const setRepeat = useCallback(
    (value: boolean) => {
      list.setCircular(value);
      setRepeatState(value);
      notify("traverse", value ? "Repetir activado: el final se conecta con el inicio" : "Repetir desactivado: la constelación tiene principio y fin");
      commit();
    },
    [list, notify, commit],
  );

  /** A new shuffle session: nothing has sounded yet and there is no way back. */
  const resetShuffle = useCallback(() => {
    played.clear();
    trail.clear();
  }, [played, trail]);

  const toggleShuffleMode = useCallback(() => {
    const enabled = !shuffleRef.current;
    shuffleRef.current = enabled;
    setShuffleMode(enabled);
    resetShuffle();
    notify("navigate", enabled ? "Modo aleatorio: «Siguiente» salta a una estrella que aún no ha sonado" : "Modo aleatorio desactivado");
  }, [notify, resetShuffle]);

  /** Rearranges the whole list by relinking its nodes. */
  const shuffleOrder = useCallback(() => {
    if (list.length < 2) return;
    checkpoint(captureOrder("mezclar la constelación"));
    list.shuffle();
    notify("traverse", "Constelación mezclada: nuevo orden, mismas estrellas");
    commit();
  }, [list, notify, commit, captureOrder, checkpoint]);

  /** Walks the whole list (printList logs it to the developer console), one node every `stepMs`. */
  const traverseAll = useCallback((stepMs: number): number => {
    list.printList((track) => track.title);
    if (list.length > 0) startWalk(0, list.length - 1, stepMs);
    notify("traverse", `Recorrido completo: ${list.length} ${list.length === 1 ? "estrella" : "estrellas"} de inicio a fin`);
    return list.length;
  }, [list, notify, startWalk]);

  // ---------------------------------------------------------------------------
  // Serialization
  // ---------------------------------------------------------------------------

  /** JSON document with every song, the cursor position and the repeat mode. */
  const exportPlaylist = useCallback((): string => {
    const document = { format: PLAYLIST_FILE_FORMAT, exportedAt: new Date().toISOString(), ...list.toJSON(toSong) };
    notify("traverse", `Constelación exportada: ${list.length} ${list.length === 1 ? "estrella" : "estrellas"}`);
    return JSON.stringify(document, null, 2);
  }, [list, notify]);

  /** Rebuilds the list from an exported document. Returns false when the file is not valid. */
  const importPlaylist = useCallback(
    (text: string): boolean => {
      try {
        const data = JSON.parse(text) as { format?: unknown };
        if (data.format !== PLAYLIST_FILE_FORMAT) throw new Error("Unknown format");
        const step = captureOrder("importar una constelación");
        const count = list.importJSON(data, (raw) => {
          const song = parseSong(raw);
          return song ? toTrack(song, nextUid(song)) : null;
        });
        reindex();
        checkpoint(step);
        pruneQueue();
        setRepeatState(list.circular);
        notify("add", `Constelación importada: ${count} ${count === 1 ? "estrella" : "estrellas"}`);
        commit();
        return true;
      } catch {
        notify("warning", "El archivo no es una constelación válida");
        return false;
      }
    },
    [list, notify, commit, nextUid, captureOrder, checkpoint, pruneQueue, reindex],
  );

  /** Plain snapshot of the list (no notification): what gets saved in the browser. */
  const serialize = useCallback((): SerializedList<Song> => list.toJSON(toSong), [list]);

  /**
   * Replaces the whole list with a saved snapshot. Unlike an import this is a
   * change of playlist, not an edit: undo, redo and the queue start empty.
   */
  const load = useCallback(
    (data: unknown, message?: string): boolean => {
      try {
        list.importJSON(data, (raw) => {
          const song = parseSong(raw);
          return song ? toTrack(song, nextUid(song)) : null;
        });
      } catch {
        return false;
      }
      reindex();
      undoStack.clear();
      redoStack.clear();
      resetShuffle();
      upNext.clear();
      syncQueue();
      setRepeatState(list.circular);
      if (message) notify("traverse", message);
      commit();
      return true;
    },
    [list, undoStack, redoStack, upNext, syncQueue, notify, commit, nextUid, reindex, resetShuffle],
  );

  // ---------------------------------------------------------------------------
  // History
  // ---------------------------------------------------------------------------

  const recordPlay = useCallback((track: Track) => {
    historyRef.current?.record(track);
    setHistory(historyRef.current?.recent() ?? []);
  }, []);

  // ---------------------------------------------------------------------------

  const snapshot = useMemo(() => {
    void version; // the list is mutable: `version` signals that it changed
    const current = list.current;
    const labels = (stack: Stack<HistoryStep>): StepLabel[] => stack.toArray().map(({ id, label }) => ({ id, label }));
    return {
      tracks: list.toArray(),
      currentTrack: current?.value ?? null,
      currentIndex: current ? list.indexOfNode(current) : -1,
      // Top first: the step that the next undo / redo would apply
      undoSteps: labels(undoStack),
      redoSteps: labels(redoStack),
    };
  }, [list, version, undoStack, redoStack]);

  return {
    ...snapshot,
    metrics: metricsRef.current,
    /** uid → node table, exposed so the interface can draw its buckets */
    nodeTable: nodes,
    announce: notify,
    undo,
    redo,
    canUndo: !undoStack.isEmpty,
    canRedo: !redoStack.isEmpty,
    repeat,
    setRepeat,
    shuffleMode,
    toggleShuffleMode,
    shuffleOrder,
    event,
    walk,
    history,
    recordPlay,
    next,
    prev,
    playAt,
    indexOfUid,
    add,
    remove,
    move,
    enrich,
    queue,
    enqueue,
    unqueue,
    clearQueue,
    traverseAll,
    exportPlaylist,
    importPlaylist,
    serialize,
    load,
  };
}
