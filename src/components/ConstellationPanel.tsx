"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Song, Track } from "@/types/music";
import type { HistoryEntry } from "@/lib/PlaybackHistory";
import type { Galaxy, PlayCount } from "@/hooks/useLibrary";
import type { ListWalk } from "@/hooks/usePlaylist";
import { genreColor } from "@/lib/genres";
import {
  CloseIcon,
  DownloadIcon,
  GripIcon,
  HeartIcon,
  LinkIcon,
  PencilIcon,
  PlayIcon,
  PlusIcon,
  QueueIcon,
  RedoIcon,
  ShuffleIcon,
  SparkIcon,
  TrashIcon,
  UndoIcon,
  UploadIcon,
} from "./icons";

interface ConstellationPanelProps {
  tracks: Track[];
  currentIndex: number;
  visible: boolean[];
  isPlaying: boolean;
  /** Traversal being shown: its stars light up one after another */
  walk: ListWalk | null;
  history: HistoryEntry<Track>[];
  queue: Track[];
  topPlayed: PlayCount[];
  favorites: Song[];
  favoriteIds: Set<string>;
  galaxies: Galaxy[];
  activeGalaxyId: string;
  canCreateGalaxy: boolean;
  accent: string;
  onSwitchGalaxy: (id: string) => void;
  onCreateGalaxy: (name: string) => void;
  onRenameGalaxy: (id: string, name: string) => void;
  onDeleteGalaxy: (id: string) => void;
  onPlayAt: (index: number) => void;
  onPlayHistory: (track: Track) => void;
  onPlaySong: (song: Song) => void;
  onRemove: (index: number) => void;
  onMove: (from: number, to: number) => void;
  onEnqueue: (index: number) => void;
  onUnqueue: (position: number) => void;
  onClearQueue: () => void;
  onTraverse: () => void;
  onShuffle: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
  /** Copies a link that carries the whole active playlist */
  onShare: () => void;
  onImport: (text: string) => void;
}

type Tab = "constellation" | "queue" | "history" | "top";

/** Finger this close to the top or bottom edge of the list scrolls it while dragging. */
const AUTOSCROLL_EDGE_PX = 48;
const AUTOSCROLL_STEP_PX = 14;

/** Position of the star under a point of the screen, or null when there is none. */
function rowIndexAt(x: number, y: number): number | null {
  const row = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-row-index]");
  return row ? Number(row.dataset.rowIndex) : null;
}
type GalaxyAction = "create" | "rename" | "delete" | null;

/** Entrance of the content of a tab. */
const tabMotion = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.2 } };
const TAB_CLASS = "flex min-h-0 flex-1 flex-col gap-3";

function timeAgo(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 10) return "ahora";
  if (seconds < 60) return `hace ${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  return `hace ${Math.round(minutes / 60)} h`;
}

/** The playlist as a vertical chain of stars, plus the queue, the recently played tracker and the rankings. */
export default function ConstellationPanel(props: ConstellationPanelProps) {
  const { tracks, currentIndex, visible, isPlaying, walk, history, queue, topPlayed, favorites, favoriteIds, galaxies, activeGalaxyId, accent } = props;
  const [tab, setTab] = useState<Tab>("constellation");
  const [positionInput, setPositionInput] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [galaxyAction, setGalaxyAction] = useState<GalaxyAction>(null);
  const [galaxyName, setGalaxyName] = useState("");
  // Drag and drop: the row being dragged and the row it is hovering
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  // The drop must know the dragged row even if it arrives before the next render
  const dragIndexRef = useRef<number | null>(null);
  // Touch screens have no native drag and drop: the grip follows the finger with pointer events
  const [touchDrag, setTouchDrag] = useState(false);
  const touchTargetRef = useRef<number | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const currentRef = useRef<HTMLLIElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uidsInList = useMemo(() => new Set(tracks.map((track) => track.uid)), [tracks]);
  const activeGalaxy = galaxies.find((galaxy) => galaxy.id === activeGalaxyId);

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [currentIndex, tab]);

  // Refreshes the "time ago" labels while the history tab is open
  useEffect(() => {
    if (tab !== "history") return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, [tab, history]);

  /** Turn of a star inside the walk being shown (0 = where it starts), or null when the walk skips it. */
  const walkOrder = (index: number): number | null => {
    if (!walk || index < Math.min(walk.from, walk.to) || index > Math.max(walk.from, walk.to)) return null;
    return Math.abs(index - walk.from);
  };

  const travel = () => {
    const position = Number.parseInt(positionInput, 10);
    if (Number.isNaN(position)) return; // empty field: nothing to travel to
    // The interface counts from 1; the list counts from 0
    props.onPlayAt(position - 1);
  };

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // allows importing the same file twice
    if (file) props.onImport(await file.text());
  };

  const openGalaxyAction = (action: GalaxyAction) => {
    setGalaxyName(action === "rename" ? activeGalaxy?.name ?? "" : "");
    setGalaxyAction(action);
  };

  const submitGalaxy = (event: FormEvent) => {
    event.preventDefault();
    if (galaxyAction === "delete") props.onDeleteGalaxy(activeGalaxyId);
    else if (!galaxyName.trim()) return;
    else if (galaxyAction === "create") props.onCreateGalaxy(galaxyName);
    else if (galaxyAction === "rename") props.onRenameGalaxy(activeGalaxyId, galaxyName);
    setGalaxyAction(null);
  };

  const endDrag = () => {
    dragIndexRef.current = null;
    touchTargetRef.current = null;
    setDragIndex(null);
    setOverIndex(null);
    setTouchDrag(false);
  };

  const startTouchDrag = (event: ReactPointerEvent<HTMLButtonElement>, index: number) => {
    if (event.pointerType === "mouse") return; // the mouse uses native drag and drop
    // Captured: the grip keeps receiving the finger even when it leaves the button
    event.currentTarget.setPointerCapture(event.pointerId);
    dragIndexRef.current = index;
    touchTargetRef.current = index;
    setDragIndex(index);
    setOverIndex(index);
    setTouchDrag(true);
  };

  const moveTouchDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (touchTargetRef.current === null) return; // no finger is dragging
    const list = listRef.current;
    if (list) {
      const { top, bottom } = list.getBoundingClientRect();
      if (event.clientY < top + AUTOSCROLL_EDGE_PX) list.scrollTop -= AUTOSCROLL_STEP_PX;
      else if (event.clientY > bottom - AUTOSCROLL_EDGE_PX) list.scrollTop += AUTOSCROLL_STEP_PX;
    }
    // Between two stars or outside the list the last star touched stays as the target
    const over = rowIndexAt(event.clientX, event.clientY);
    if (over === null || over === touchTargetRef.current) return;
    touchTargetRef.current = over;
    setOverIndex(over);
  };

  const dropTouchDrag = () => {
    if (touchTargetRef.current === null) return;
    const from = dragIndexRef.current;
    const to = touchTargetRef.current;
    if (from !== null && to !== null && from !== to) props.onMove(from, to);
    endDrag();
  };

  const tabs: [Tab, string][] = [
    ["constellation", "Constelación"],
    ["queue", queue.length > 0 ? `Cola · ${queue.length}` : "Cola"],
    ["history", "Recientes"],
    ["top", "Top"],
  ];

  return (
    <div className="flex h-full flex-col gap-3">
      {/* Playlists ("galaxias") */}
      {galaxyAction === null ? (
        <div className="flex items-center gap-1 pr-10 lg:pr-0">
          <select
            value={activeGalaxyId}
            onChange={(event) => props.onSwitchGalaxy(event.target.value)}
            className="min-w-0 flex-1 truncate rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white focus:border-white/30 focus:outline-none"
            aria-label="Galaxia (lista de reproducción) activa"
            title="Cambiar de galaxia"
          >
            {galaxies.map((galaxy) => (
              <option key={galaxy.id} value={galaxy.id} className="bg-[rgb(var(--surface))]">
                {galaxy.name}
              </option>
            ))}
          </select>
          <IconButton title="Nueva galaxia" onClick={() => openGalaxyAction("create")} disabled={!props.canCreateGalaxy}>
            <PlusIcon width={14} height={14} />
          </IconButton>
          <IconButton title="Cambiar el nombre de esta galaxia" onClick={() => openGalaxyAction("rename")}>
            <PencilIcon width={14} height={14} />
          </IconButton>
          <IconButton title="Eliminar esta galaxia" onClick={() => openGalaxyAction("delete")} disabled={galaxies.length < 2}>
            <TrashIcon width={14} height={14} />
          </IconButton>
          <span className="mx-0.5 h-4 w-px bg-white/10" aria-hidden />
          <IconButton title="Exportar constelación" onClick={props.onExport} disabled={tracks.length === 0}>
            <DownloadIcon width={14} height={14} />
          </IconButton>
          <IconButton title="Importar constelación" onClick={() => fileRef.current?.click()}>
            <UploadIcon width={14} height={14} />
          </IconButton>
          <IconButton title="Copiar un enlace para compartir esta galaxia" onClick={props.onShare} disabled={tracks.length === 0}>
            <LinkIcon width={14} height={14} />
          </IconButton>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={handleFile} />
        </div>
      ) : (
        <form className="flex items-center gap-1.5 pr-10 text-[11px] lg:pr-0" onSubmit={submitGalaxy}>
          {galaxyAction === "delete" ? (
            <p className="min-w-0 flex-1 truncate text-white/75">
              ¿Eliminar «{activeGalaxy?.name}» y sus {tracks.length} estrellas?
            </p>
          ) : (
            <input
              autoFocus
              value={galaxyName}
              maxLength={30}
              onChange={(event) => setGalaxyName(event.target.value)}
              placeholder={galaxyAction === "create" ? "Nombre de la nueva galaxia" : "Nuevo nombre"}
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-xs text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
              aria-label="Nombre de la galaxia"
            />
          )}
          <button
            type="submit"
            className={`rounded-lg px-2.5 py-1.5 font-medium transition hover:brightness-110 ${galaxyAction === "delete" ? "bg-rose-500/80 text-white" : "text-[#05030f]"}`}
            style={galaxyAction === "delete" ? undefined : { background: accent }}
          >
            {galaxyAction === "create" ? "Crear" : galaxyAction === "rename" ? "Guardar" : "Eliminar"}
          </button>
          <IconButton title="Cancelar" onClick={() => setGalaxyAction(null)}>
            <CloseIcon width={14} height={14} />
          </IconButton>
        </form>
      )}

      <div className="flex rounded-full bg-white/5 p-0.5 text-[11px]" role="tablist">
        {tabs.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className="relative flex-1 whitespace-nowrap rounded-full px-2 py-1 font-medium transition"
            style={{ color: tab === id ? "#05030f" : "rgb(var(--ink) / 0.6)" }}
          >
            {tab === id && <motion.span layoutId="panel-tab" className="absolute inset-0 rounded-full" style={{ background: accent }} />}
            {/* The label is the key: the queue tab bounces when its count changes */}
            <motion.span key={label} initial={{ scale: 1.25 }} animate={{ scale: 1 }} className="relative inline-block">
              {label}
            </motion.span>
          </button>
        ))}
      </div>

      {tab === "constellation" && (
        <motion.div key="constellation" {...tabMotion} className={TAB_CLASS}>
          <div className="flex gap-1.5 text-[11px]">
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={props.onTraverse}
              disabled={tracks.length === 0}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 font-medium text-[#05030f] transition hover:brightness-110 disabled:opacity-40"
              style={{ background: accent }}
              title="Ilumina la constelación de inicio a fin"
            >
              <SparkIcon width={12} height={12} /> Recorrer
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.94 }}
              onClick={props.onShuffle}
              disabled={tracks.length < 2}
              className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-white/10 px-2 py-1.5 text-white/85 transition hover:bg-white/20 disabled:opacity-40"
              title="Reordena las estrellas al azar"
            >
              <ShuffleIcon width={12} height={12} /> Mezclar
            </motion.button>
            <IconButton title="Deshacer · Ctrl+Z" onClick={props.onUndo} disabled={!props.canUndo}>
              <UndoIcon width={14} height={14} />
            </IconButton>
            <IconButton title="Rehacer · Ctrl+Y" onClick={props.onRedo} disabled={!props.canRedo}>
              <RedoIcon width={14} height={14} />
            </IconButton>
          </div>

          <form
            className="flex items-center gap-2 text-[11px]"
            onSubmit={(event) => {
              event.preventDefault();
              travel();
            }}
          >
            <input
              type="number"
              min={1}
              max={tracks.length}
              value={positionInput}
              onChange={(event) => setPositionInput(event.target.value)}
              placeholder="Posición"
              className="w-24 rounded-lg border border-white/10 bg-black/30 px-2 py-1.5 text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
              aria-label="Posición a la que viajar"
            />
            <button type="submit" className="flex-1 rounded-lg bg-white/10 px-2 py-1.5 text-white/80 transition hover:bg-white/20 hover:text-white">
              Viajar a esa estrella
            </button>
          </form>

          <ol ref={listRef} className="scroll-thin -mr-2 flex-1 overflow-y-auto pr-2">
            <AnimatePresence initial={false}>
              {tracks.map((track, index) => {
                const isCurrent = index === currentIndex;
                // The line shows where the dragged star will land: after the target when moving down
                const dropEdge = overIndex === index && dragIndex !== null && dragIndex !== index ? (dragIndex < index ? "below" : "above") : null;
                const hop = walkOrder(index);
                const hopBefore = index > 0 ? walkOrder(index - 1) : null;
                // The link above a star is crossed between the turns of the two stars it joins
                const linkDelay = walk && hop !== null && hopBefore !== null ? (Math.min(hop, hopBefore) + 0.5) * walk.stepMs : null;
                return (
                  <motion.li
                    key={track.uid}
                    ref={isCurrent ? currentRef : undefined}
                    data-row-index={index}
                    layout
                    initial={{ opacity: 0, scale: 0.85, filter: "blur(4px)" }}
                    animate={{ opacity: visible[index] || isCurrent ? 1 : 0.35, scale: 1, filter: "blur(0px)" }}
                    exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }}
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  >
                    {index > 0 && (
                      <div className="relative ml-[1.35rem] h-3 w-px bg-gradient-to-b from-white/5 via-white/25 to-white/5" aria-hidden>
                        {walk && linkDelay !== null && (
                          <span
                            key={walk.id}
                            className="absolute -inset-x-px inset-y-0 rounded-full opacity-0 motion-safe:animate-hop"
                            style={{ background: accent, boxShadow: `0 0 8px ${accent}`, animationDelay: `${linkDelay}ms` }}
                          />
                        )}
                      </div>
                    )}
                    <StarRow
                      track={track}
                      position={index + 1}
                      isCurrent={isCurrent}
                      playing={isCurrent && isPlaying}
                      hop={walk && hop !== null ? { id: walk.id, delayMs: hop * walk.stepMs } : null}
                      isFavorite={favoriteIds.has(track.id)}
                      accent={accent}
                      badges={[index === 0 && "Inicio", index === tracks.length - 1 && "Final"]}
                      dragging={dragIndex === index}
                      dropEdge={dropEdge}
                      nativeDrag={!touchDrag}
                      onGripDown={(event) => startTouchDrag(event, index)}
                      onGripMove={moveTouchDrag}
                      onGripUp={dropTouchDrag}
                      onGripCancel={endDrag}
                      onPlay={() => props.onPlayAt(index)}
                      onRemove={() => props.onRemove(index)}
                      onEnqueue={() => props.onEnqueue(index)}
                      onStep={(delta) => props.onMove(index, index + delta)}
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = "move";
                        event.dataTransfer.setData("text/plain", track.title); // Firefox needs data to start a drag
                        dragIndexRef.current = index;
                        setDragIndex(index);
                      }}
                      onDragOver={(event) => {
                        if (dragIndexRef.current === null) return;
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        if (overIndex !== index) setOverIndex(index);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const from = dragIndexRef.current;
                        if (from !== null && from !== index) props.onMove(from, index);
                        endDrag();
                      }}
                      onDragEnd={endDrag}
                    />
                  </motion.li>
                );
              })}
            </AnimatePresence>
            {tracks.length === 0 && (
              <li className="py-8 text-center text-xs text-white/40">La constelación está vacía. Busca canciones para encender estrellas.</li>
            )}
          </ol>
        </motion.div>
      )}

      {tab === "queue" && (
        <motion.div key="queue" {...tabMotion} className={TAB_CLASS}>
          <div className="flex items-center justify-between gap-2 text-[11px] text-white/45">
            <p>Suenan antes que el orden normal, la primera que entró primero.</p>
            {queue.length > 0 && (
              <button onClick={props.onClearQueue} className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-white/80 transition hover:bg-white/20">
                Vaciar
              </button>
            )}
          </div>
          <ol className="scroll-thin -mr-2 flex-1 space-y-1.5 overflow-y-auto pr-2">
            <AnimatePresence initial={false}>
              {queue.map((track, position) => (
                <motion.li key={`${track.uid}-${position}`} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 40 }}>
                  <SongRow
                    song={track}
                    lead={<span className="w-4 shrink-0 text-center text-[10px] text-white/40">{position + 1}</span>}
                    detail={position === 0 ? "Sigue al pasar a la siguiente" : undefined}
                  >
                    <button
                      onClick={() => props.onUnqueue(position)}
                      title="Quitar de la cola"
                      className="rounded-full p-1 text-white/40 transition hover:bg-rose-500/20 hover:text-rose-300"
                    >
                      <CloseIcon width={12} height={12} />
                    </button>
                  </SongRow>
                </motion.li>
              ))}
            </AnimatePresence>
            {queue.length === 0 && (
              <li className="py-8 text-center text-xs text-white/40">La cola está vacía. Usa el botón de cola de una estrella para que suene después.</li>
            )}
          </ol>
        </motion.div>
      )}

      {tab === "history" && (
        <motion.ol key="history" {...tabMotion} className="scroll-thin -mr-2 flex-1 space-y-1.5 overflow-y-auto pr-2">
          <AnimatePresence initial={false}>
            {history.map((entry) => {
              const stillInList = uidsInList.has(entry.value.uid);
              return (
                <motion.li key={`${entry.value.uid}-${entry.playedAt}`} layout initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                  <SongRow
                    song={entry.value}
                    detail={stillInList ? undefined : "ya no está en la constelación"}
                    title={stillInList ? "Volver a esta canción" : "Devolver a la constelación y reproducir"}
                    onClick={() => props.onPlayHistory(entry.value)}
                  >
                    <span className="shrink-0 text-[10px] text-white/35">{timeAgo(entry.playedAt, now)}</span>
                    <PlayIcon width={11} height={11} className="shrink-0 text-white/30 transition group-hover:text-white" />
                  </SongRow>
                </motion.li>
              );
            })}
          </AnimatePresence>
          {history.length === 0 && <li className="py-8 text-center text-xs text-white/40">Aún no has escuchado nada. Dale play a una estrella.</li>}
        </motion.ol>
      )}

      {tab === "top" && (
        <motion.div key="top" {...tabMotion} className="scroll-thin -mr-2 flex-1 space-y-4 overflow-y-auto pr-2">
          <section>
            <h3 className="mb-1.5 text-[10px] uppercase tracking-widest text-white/40">Más escuchadas</h3>
            <ol className="space-y-1.5">
              {/* `layout`: a song that climbs the ranking slides to its new place */}
              <AnimatePresence initial={false}>
                {topPlayed.map((entry, rank) => (
                  <motion.li
                    key={entry.song.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  >
                    <SongRow
                      song={entry.song}
                      lead={
                        <span className="w-4 shrink-0 text-center text-xs font-semibold" style={{ color: rank === 0 ? accent : "rgb(var(--ink) / 0.4)" }}>
                          {rank + 1}
                        </span>
                      }
                      title="Reproducir"
                      onClick={() => props.onPlaySong(entry.song)}
                    >
                      <motion.span
                        key={entry.plays}
                        className="inline-block shrink-0 text-[10px]"
                        initial={{ scale: 1.4, color: accent }}
                        animate={{ scale: 1, color: "var(--ink-45)" }}
                        transition={{ duration: 0.4 }}
                      >
                        {entry.plays} {entry.plays === 1 ? "vez" : "veces"}
                      </motion.span>
                    </SongRow>
                  </motion.li>
                ))}
              </AnimatePresence>
              {topPlayed.length === 0 && <li className="py-4 text-center text-xs text-white/40">Escucha canciones y aquí aparecerán tus cinco más repetidas.</li>}
            </ol>
          </section>
          <section>
            <h3 className="mb-1.5 text-[10px] uppercase tracking-widest text-white/40">Favoritas · {favorites.length}</h3>
            <ol className="space-y-1.5">
              <AnimatePresence initial={false}>
                {favorites.map((song) => (
                  <motion.li key={song.id} layout initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, x: 40 }}>
                    <SongRow
                      song={song}
                      lead={<HeartIcon width={12} height={12} filled className="shrink-0 text-rose-400" />}
                      title="Reproducir"
                      onClick={() => props.onPlaySong(song)}
                    >
                      <PlayIcon width={11} height={11} className="shrink-0 text-white/30 transition group-hover:text-white" />
                    </SongRow>
                  </motion.li>
                ))}
              </AnimatePresence>
              {favorites.length === 0 && <li className="py-4 text-center text-xs text-white/40">Marca con el corazón del reproductor las canciones que más te gusten.</li>}
            </ol>
          </section>
        </motion.div>
      )}
    </div>
  );
}

/** Three bars that dance while the song plays. */
function Equalizer({ color }: { color: string }) {
  return (
    <span className="mr-1.5 inline-flex h-2.5 items-end gap-px" aria-hidden>
      {[0, 0.3, 0.15].map((delay) => (
        <span key={delay} className="h-full w-0.5 origin-bottom rounded-full motion-safe:animate-equalize" style={{ background: color, animationDelay: `-${delay}s` }} />
      ))}
    </span>
  );
}

/** Album cover when the song has one, the genre-colored star otherwise. */
function Cover({ song, size }: { song: Song; size: number }) {
  if (song.artworkUrl) {
    return (
      <img src={song.artworkUrl} alt="" width={size} height={size} loading="lazy" draggable={false} className="shrink-0 rounded object-cover" style={{ width: size, height: size }} />
    );
  }
  return (
    <span className="relative flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <span className="absolute inset-0 rounded-full opacity-40 blur-[3px]" style={{ background: genreColor(song.genre) }} />
      <span className="relative h-2.5 w-2.5 rounded-full" style={{ background: genreColor(song.genre) }} />
    </span>
  );
}

interface StarRowProps {
  track: Track;
  position: number;
  isCurrent: boolean;
  /** The current star while it is sounding */
  playing: boolean;
  /** Its turn in the traversal being shown: `id` restarts the flash, `delayMs` is when it lights up */
  hop: { id: number; delayMs: number } | null;
  isFavorite: boolean;
  accent: string;
  badges: (string | false)[];
  dragging: boolean;
  dropEdge: "above" | "below" | null;
  /** False while a finger drags: a long press must not start the browser's own drag */
  nativeDrag: boolean;
  onGripDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onGripMove: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onGripUp: () => void;
  onGripCancel: () => void;
  onPlay: () => void;
  onRemove: () => void;
  onEnqueue: () => void;
  /** Moves the star one place up (-1) or down (+1) */
  onStep: (delta: number) => void;
  onDragStart: (event: DragEvent<HTMLDivElement>) => void;
  onDragOver: (event: DragEvent<HTMLDivElement>) => void;
  onDrop: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}

function StarRow(props: StarRowProps) {
  const { track, position, isCurrent, playing, hop, isFavorite, accent, badges, dragging, dropEdge } = props;

  const handleGripKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    props.onStep(event.key === "ArrowUp" ? -1 : 1);
  };

  return (
    <div
      draggable={props.nativeDrag}
      onDragStart={props.onDragStart}
      onDragOver={props.onDragOver}
      onDrop={props.onDrop}
      onDragEnd={props.onDragEnd}
      className="group relative flex items-center gap-2 rounded-xl border px-2 py-2 transition"
      style={{
        borderColor: isCurrent ? accent : "rgb(var(--ink) / 0.06)",
        background: isCurrent ? `${accent}14` : "rgb(var(--ink) / 0.03)",
        boxShadow: isCurrent ? `0 0 18px ${accent}33` : "none",
        opacity: dragging ? 0.4 : 1,
      }}
    >
      {hop && (
        <span
          key={hop.id}
          className="pointer-events-none absolute inset-0 rounded-xl opacity-0 motion-safe:animate-hop"
          style={{ background: `${accent}26`, boxShadow: `inset 0 0 0 1px ${accent}, 0 0 16px ${accent}66`, animationDelay: `${hop.delayMs}ms` }}
          aria-hidden
        />
      )}
      {dropEdge && (
        <span className={`pointer-events-none absolute inset-x-1 h-0.5 rounded-full ${dropEdge === "above" ? "-top-1.5" : "-bottom-1.5"}`} style={{ background: accent }} aria-hidden />
      )}
      <button
        onKeyDown={handleGripKey}
        onPointerDown={props.onGripDown}
        onPointerMove={props.onGripMove}
        onPointerUp={props.onGripUp}
        onPointerCancel={props.onGripCancel}
        onContextMenu={(event) => event.preventDefault()}
        title="Arrastra para mover · con el teclado: flechas arriba y abajo"
        aria-label={`Mover «${track.title}», posición ${position}`}
        // touch-none: a finger on the grip drags the star instead of scrolling the list
        className="tap-tight -my-1.5 -ml-2 -mr-1.5 shrink-0 cursor-grab touch-none select-none rounded p-2 text-white/25 transition hover:text-white/70 focus-visible:text-white active:cursor-grabbing"
      >
        <GripIcon width={12} height={12} />
      </button>
      <Cover song={track} size={20} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-white">
          {playing ? <Equalizer color={accent} /> : <span className="mr-1.5 text-white/35">{position}</span>}
          {track.title}
          {isFavorite && <HeartIcon width={9} height={9} filled className="ml-1 inline text-rose-400" />}
        </p>
        <p className="truncate text-[10px] text-white/40">{track.artist}</p>
      </div>
      {badges.filter(Boolean).map((badge) => (
        <span
          key={badge as string}
          className={`rounded-full px-1.5 text-[9px] ${badge === "Inicio" ? "bg-cyan-400/15 text-cyan-300" : "bg-fuchsia-400/15 text-fuchsia-300"}`}
        >
          {badge}
        </span>
      ))}
      <button onClick={props.onEnqueue} title="Poner en la cola: suena después de la actual" className="tap-tight rounded-full p-1 text-white/40 transition hover:bg-white/10 hover:text-white">
        <QueueIcon width={12} height={12} />
      </button>
      <button onClick={props.onPlay} title="Reproducir" className="tap-tight rounded-full p-1 text-white/40 transition hover:bg-white/10 hover:text-white">
        <PlayIcon width={12} height={12} />
      </button>
      <button onClick={props.onRemove} title="Quitar de la constelación" className="tap-tight rounded-full p-1 text-white/40 transition hover:bg-rose-500/20 hover:text-rose-300">
        <TrashIcon width={12} height={12} />
      </button>
    </div>
  );
}

interface SongRowProps {
  song: Song;
  /** Shown before the cover: a rank, a turn number… */
  lead?: React.ReactNode;
  detail?: string;
  title?: string;
  onClick?: () => void;
  children?: React.ReactNode;
}

/** Compact row used by the queue, the history and the rankings. The whole row is a button when `onClick` is given. */
function SongRow({ song, lead, detail, title, onClick, children }: SongRowProps) {
  const className = "group flex w-full items-center gap-2.5 rounded-xl border border-white/5 bg-white/[0.03] px-2.5 py-2 text-left transition";
  const content = (
    <>
      {lead}
      <Cover song={song} size={20} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-white">{song.title}</p>
        <p className="truncate text-[10px] text-white/40">
          {song.artist}
          {detail && ` · ${detail}`}
        </p>
      </div>
      {children}
    </>
  );
  return onClick ? (
    <button onClick={onClick} title={title} className={`${className} hover:border-white/15 hover:bg-white/[0.06]`}>
      {content}
    </button>
  ) : (
    <div className={className}>{content}</div>
  );
}

function IconButton({ title, onClick, disabled, children }: { title: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className="rounded-full p-1.5 text-white/55 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
    >
      {children}
    </button>
  );
}
