"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Track } from "@/types/music";
import type { HistoryEntry } from "@/lib/PlaybackHistory";
import { genreColor } from "@/lib/genres";
import { DownloadIcon, PlayIcon, RedoIcon, ShuffleIcon, SparkIcon, TrashIcon, UndoIcon, UploadIcon } from "./icons";

interface ConstellationPanelProps {
  tracks: Track[];
  currentIndex: number;
  visible: boolean[];
  history: HistoryEntry<Track>[];
  accent: string;
  onPlayAt: (index: number) => void;
  onPlayHistory: (track: Track) => void;
  onRemove: (index: number) => void;
  onTraverse: () => void;
  onShuffle: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onExport: () => void;
  onImport: (text: string) => void;
}

type Tab = "constellation" | "history";

function timeAgo(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 10) return "ahora";
  if (seconds < 60) return `hace ${seconds} s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  return `hace ${Math.round(minutes / 60)} h`;
}

/** The playlist as a vertical chain of stars, plus the recently played tracker. */
export default function ConstellationPanel(props: ConstellationPanelProps) {
  const { tracks, currentIndex, visible, history, accent } = props;
  const [tab, setTab] = useState<Tab>("constellation");
  const [positionInput, setPositionInput] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const currentRef = useRef<HTMLLIElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const uidsInList = useMemo(() => new Set(tracks.map((track) => track.uid)), [tracks]);

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

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex rounded-full bg-white/5 p-0.5 text-[11px]" role="tablist">
          {(
            [
              ["constellation", `Constelación · ${tracks.length}`],
              ["history", "Recientes"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className="relative rounded-full px-3 py-1 font-medium transition"
              style={{ color: tab === id ? "#05030f" : "rgba(255,255,255,0.6)" }}
            >
              {tab === id && <motion.span layoutId="panel-tab" className="absolute inset-0 rounded-full" style={{ background: accent }} />}
              <span className="relative">{label}</span>
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          <IconButton title="Exportar constelación" onClick={props.onExport} disabled={tracks.length === 0}>
            <DownloadIcon width={14} height={14} />
          </IconButton>
          <IconButton title="Importar constelación" onClick={() => fileRef.current?.click()}>
            <UploadIcon width={14} height={14} />
          </IconButton>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={handleFile} />
        </div>
      </div>

      {tab === "constellation" ? (
        <>
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

          <ol className="scroll-thin -mr-2 flex-1 overflow-y-auto pr-2">
            <AnimatePresence initial={false}>
              {tracks.map((track, index) => {
                const isCurrent = index === currentIndex;
                return (
                  <motion.li
                    key={track.uid}
                    ref={isCurrent ? currentRef : undefined}
                    layout
                    initial={{ opacity: 0, scale: 0.85, filter: "blur(4px)" }}
                    animate={{ opacity: visible[index] || isCurrent ? 1 : 0.35, scale: 1, filter: "blur(0px)" }}
                    exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }}
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                  >
                    {index > 0 && <div className="ml-[1.35rem] h-3 w-px bg-gradient-to-b from-white/5 via-white/25 to-white/5" aria-hidden />}
                    <StarRow
                      track={track}
                      position={index + 1}
                      isCurrent={isCurrent}
                      accent={accent}
                      badges={[index === 0 && "Inicio", index === tracks.length - 1 && "Final"]}
                      onPlay={() => props.onPlayAt(index)}
                      onRemove={() => props.onRemove(index)}
                    />
                  </motion.li>
                );
              })}
            </AnimatePresence>
            {tracks.length === 0 && (
              <li className="py-8 text-center text-xs text-white/40">La constelación está vacía. Busca canciones para encender estrellas.</li>
            )}
          </ol>
        </>
      ) : (
        <ol className="scroll-thin -mr-2 flex-1 space-y-1.5 overflow-y-auto pr-2">
          <AnimatePresence initial={false}>
            {history.map((entry, i) => {
              const stillInList = uidsInList.has(entry.value.uid);
              return (
                <motion.li
                  key={`${entry.value.uid}-${entry.playedAt}`}
                  layout
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                >
                  <button
                    onClick={() => props.onPlayHistory(entry.value)}
                    className="group flex w-full items-center gap-2.5 rounded-xl border border-white/5 bg-white/[0.03] px-2.5 py-2 text-left transition hover:border-white/15 hover:bg-white/[0.06]"
                    title={stillInList ? "Volver a esta canción" : "Devolver a la constelación y reproducir"}
                  >
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: genreColor(entry.value.genre), opacity: 1 - i * 0.03 }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-white">{entry.value.title}</p>
                      <p className="truncate text-[10px] text-white/40">
                        {entry.value.artist}
                        {!stillInList && " · ya no está en la constelación"}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] text-white/35">{timeAgo(entry.playedAt, now)}</span>
                    <PlayIcon width={11} height={11} className="shrink-0 text-white/30 transition group-hover:text-white" />
                  </button>
                </motion.li>
              );
            })}
          </AnimatePresence>
          {history.length === 0 && <li className="py-8 text-center text-xs text-white/40">Aún no has escuchado nada. Dale play a una estrella.</li>}
        </ol>
      )}
    </div>
  );
}

interface StarRowProps {
  track: Track;
  position: number;
  isCurrent: boolean;
  accent: string;
  badges: (string | false)[];
  onPlay: () => void;
  onRemove: () => void;
}

function StarRow({ track, position, isCurrent, accent, badges, onPlay, onRemove }: StarRowProps) {
  return (
    <div
      className="group flex items-center gap-2.5 rounded-xl border px-2.5 py-2 transition"
      style={{
        borderColor: isCurrent ? accent : "rgba(255,255,255,0.06)",
        background: isCurrent ? `${accent}14` : "rgba(255,255,255,0.03)",
        boxShadow: isCurrent ? `0 0 18px ${accent}33` : "none",
      }}
    >
      <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
        <span className="absolute inset-0 rounded-full opacity-40 blur-[3px]" style={{ background: genreColor(track.genre) }} />
        <span className="relative h-2.5 w-2.5 rounded-full" style={{ background: genreColor(track.genre) }} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-white">
          <span className="mr-1.5 text-white/35">{position}</span>
          {track.title}
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
      <button onClick={onPlay} title="Reproducir" className="rounded-full p-1 text-white/40 transition hover:bg-white/10 hover:text-white">
        <PlayIcon width={12} height={12} />
      </button>
      <button onClick={onRemove} title="Quitar de la constelación" className="rounded-full p-1 text-white/40 transition hover:bg-rose-500/20 hover:text-rose-300">
        <TrashIcon width={12} height={12} />
      </button>
    </div>
  );
}

function IconButton({ title, onClick, disabled, children }: { title: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
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
