"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { DoublyLinkedList } from "@/lib/DoublyLinkedList";
import { ListMetrics, instrumentList } from "@/lib/ListMetrics";
import { PlaybackHistory, type HistoryEntry } from "@/lib/PlaybackHistory";
import { parseSong, toSong } from "@/lib/songSchema";
import { Stack } from "@/lib/Stack";
import type { InsertOperation, PlaylistEvent, PlaylistEventTone, Song, Track } from "@/types/music";

const HISTORY_CAPACITY = 20;
const UNDO_CAPACITY = 30;

/** One undoable change: the list as it was before it, plus a Spanish label for the interface. */
interface HistoryStep {
  label: string;
  tracks: Track[];
  currentUid: string | null;
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
  if (listRef.current === null) {
    // Deterministic uids so the server and client renders match
    listRef.current = new DoublyLinkedList(initialSongs.map((song, i) => toTrack(song, `init-${i}-${song.id}`)));
    listRef.current.setCircular(true);
    instrumentList(listRef.current, metricsRef.current);
  }
  const list = listRef.current;

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

  const nextUid = useCallback((song: Song) => {
    uidCounter.current += 1;
    return `${song.id}~${uidCounter.current}`;
  }, []);

  // ---------------------------------------------------------------------------
  // Undo / redo (two stacks of list snapshots)
  // ---------------------------------------------------------------------------

  const undoRef = useRef<Stack<HistoryStep> | null>(null);
  undoRef.current ??= new Stack<HistoryStep>(UNDO_CAPACITY);
  const redoRef = useRef<Stack<HistoryStep> | null>(null);
  redoRef.current ??= new Stack<HistoryStep>(UNDO_CAPACITY);
  const undoStack = undoRef.current;
  const redoStack = redoRef.current;

  /** Snapshot of the list order, taken before a structural change. */
  const capture = useCallback(
    (label: string): HistoryStep => ({ label, tracks: list.toArray(), currentUid: list.current?.value.uid ?? null }),
    [list],
  );

  /** Makes a change undoable. A new change invalidates everything that could be redone. */
  const checkpoint = useCallback(
    (step: HistoryStep) => {
      undoStack.push(step);
      redoStack.clear();
    },
    [undoStack, redoStack],
  );

  /** Rebuilds the list from a snapshot without moving playback when the playing song survives. */
  const restore = useCallback(
    (step: HistoryStep) => {
      // Prefer the live objects: they may carry bindings resolved after the snapshot
      const live = new Map(list.toArray().map((track) => [track.uid, track]));
      const playingUid = list.current?.value.uid ?? null;
      list.clear();
      for (const track of step.tracks) list.append(live.get(track.uid) ?? track);

      const uids = step.tracks.map((track) => track.uid);
      let index = playingUid ? uids.indexOf(playingUid) : -1;
      if (index < 0 && step.currentUid) index = uids.indexOf(step.currentUid);
      if (index >= 0) list.moveTo(index);
    },
    [list],
  );

  /** Pops a step from one stack, pushes the present onto the other and restores the step. */
  const travel = useCallback(
    (from: Stack<HistoryStep>, to: Stack<HistoryStep>, verb: string, emptyMessage: string): boolean => {
      const step = from.pop();
      if (!step) {
        notify("warning", emptyMessage);
        return false;
      }
      to.push(capture(step.label));
      restore(step);
      notify("traverse", `${verb}: ${step.label}`);
      commit();
      return true;
    },
    [capture, restore, notify, commit],
  );

  const undo = useCallback(() => travel(undoStack, redoStack, "Deshecho", "No hay nada que deshacer"), [travel, undoStack, redoStack]);
  const redo = useCallback(() => travel(redoStack, undoStack, "Rehecho", "No hay nada que rehacer"), [travel, undoStack, redoStack]);

  // ---------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------

  /** Moves forward through `next`, or jumps randomly in shuffle mode. */
  const next = useCallback((): boolean => {
    if (shuffleRef.current && list.length > 1) {
      const node = list.jumpRandom();
      if (node) {
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
  }, [list, notify, commit]);

  /** Moves backward through `prev`. */
  const prev = useCallback((): boolean => {
    const wraps = list.circular && list.current === list.head;
    const node = list.prev();
    if (!node) {
      notify("warning", "Ya estás en el inicio de la constelación");
      return false;
    }
    notify("navigate", wraps ? `Inicio del recorrido: salto al final con «${node.value.title}»` : `Anterior: «${node.value.title}»`);
    commit();
    return true;
  }, [list, notify, commit]);

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
      notify("traverse", `Viaje a «${node.value.title}»${route}`);
      commit();
      return true;
    },
    [list, notify, commit],
  );

  const indexOfUid = useCallback((uid: string) => list.toArray().findIndex((track) => track.uid === uid), [list]);

  // ---------------------------------------------------------------------------
  // Structure
  // ---------------------------------------------------------------------------

  /** Links a song with append, prepend or insertAt. Returns its final index. */
  const add = useCallback(
    (song: Song, operation: InsertOperation, index = 0): number => {
      const track = toTrack(toSong(song), nextUid(song));
      let position: number;
      checkpoint(capture(`agregar «${song.title}»`));

      if (operation === "append") {
        list.append(track);
        position = list.length - 1;
        notify("add", `«${song.title}» se unió al final de la constelación`);
      } else if (operation === "prepend") {
        list.prepend(track);
        position = 0;
        notify("add", `«${song.title}» ahora abre la constelación`);
      } else {
        position = Math.max(0, Math.min(index, list.length));
        list.insertAt(position, track);
        notify("add", `«${song.title}» entró en la posición ${position + 1}`);
      }

      commit();
      return position;
    },
    [list, notify, commit, nextUid, capture, checkpoint],
  );

  /** Removes by index. The list moves its cursor to a neighbor when needed. */
  const remove = useCallback(
    (index: number): Track | null => {
      const step = capture("");
      const removed = list.removeAt(index);
      if (!removed) return null; // nothing changed: skip the re-render
      step.label = `quitar «${removed.title}»`;
      checkpoint(step);
      notify("remove", `«${removed.title}» salió de la constelación`);
      commit();
      return removed;
    },
    [list, notify, commit, capture, checkpoint],
  );

  /** Attaches playback bindings to every node holding the song with this uid. */
  const enrich = useCallback(
    (uid: string, bindings: Pick<Song, "youtubeId" | "spotifyId">) => {
      for (const node of list.nodes()) {
        if (node.value.uid === uid) node.value = { ...node.value, ...bindings };
      }
      commit();
    },
    [list, commit],
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

  const toggleShuffleMode = useCallback(() => {
    const enabled = !shuffleRef.current;
    shuffleRef.current = enabled;
    setShuffleMode(enabled);
    notify("navigate", enabled ? "Modo aleatorio: «Siguiente» salta a una estrella al azar" : "Modo aleatorio desactivado");
  }, [notify]);

  /** Rearranges the whole list by relinking its nodes. */
  const shuffleOrder = useCallback(() => {
    if (list.length < 2) return;
    checkpoint(capture("mezclar la constelación"));
    list.shuffle();
    notify("traverse", "Constelación mezclada: nuevo orden, mismas estrellas");
    commit();
  }, [list, notify, commit, capture, checkpoint]);

  /** Walks the whole list (printList logs it to the developer console). */
  const traverseAll = useCallback((): number => {
    list.printList((track) => track.title);
    notify("traverse", `Recorrido completo: ${list.length} ${list.length === 1 ? "estrella" : "estrellas"} de inicio a fin`);
    return list.length;
  }, [list, notify]);

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
        const step = capture("importar una constelación");
        const count = list.importJSON(data, (raw) => {
          const song = parseSong(raw);
          return song ? toTrack(song, nextUid(song)) : null;
        });
        checkpoint(step);
        setRepeatState(list.circular);
        notify("add", `Constelación importada: ${count} ${count === 1 ? "estrella" : "estrellas"}`);
        commit();
        return true;
      } catch {
        notify("warning", "El archivo no es una constelación válida");
        return false;
      }
    },
    [list, notify, commit, nextUid, capture, checkpoint],
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
    return {
      tracks: list.toArray(),
      currentTrack: current?.value ?? null,
      currentIndex: current ? list.indexOfNode(current) : -1,
    };
  }, [list, version]);

  return {
    ...snapshot,
    metrics: metricsRef.current,
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
    history,
    recordPlay,
    next,
    prev,
    playAt,
    indexOfUid,
    add,
    remove,
    enrich,
    traverseAll,
    exportPlaylist,
    importPlaylist,
  };
}
