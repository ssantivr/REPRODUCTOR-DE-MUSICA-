"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { PlaybackSource, Track } from "@/types/music";
import { GENRES, genreColor } from "@/lib/genres";
import { clamp, formatTime, KEY_NAMES, spotifyUrl, youtubeUrl } from "@/lib/utils";
import { ExternalIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon, RepeatIcon, ShuffleIcon, VolumeIcon } from "./icons";

export interface Progress {
  position: number;
  duration: number;
}

interface PlayerDockProps {
  track: Track | null;
  index: number;
  total: number;
  isPlaying: boolean;
  source: PlaybackSource;
  repeat: boolean;
  shuffle: boolean;
  volume: number;
  accent: string;
  getProgress: () => Progress | null;
  onToggle: () => void;
  onNext: () => void;
  onPrev: () => void;
  onRepeat: () => void;
  onShuffle: () => void;
  onVolume: (volume: number) => void;
  onSource: (source: PlaybackSource) => void;
}

const SOURCES: { id: PlaybackSource; label: string }[] = [
  { id: "synth", label: "Sintetizador" },
  { id: "youtube", label: "YouTube" },
  { id: "spotify", label: "Spotify" },
];

export default function PlayerDock(props: PlayerDockProps) {
  const { track, index, total, isPlaying, source, repeat, shuffle, volume, accent, getProgress } = props;
  const barRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);

  // Updated with requestAnimationFrame by writing straight to the DOM (no re-renders)
  useEffect(() => {
    if (source !== "synth") return; // the bar and the clock only exist for the synth
    let raf = 0;
    const loop = () => {
      const progress = getProgress();
      if (barRef.current) {
        barRef.current.style.width = progress ? `${clamp(progress.position / progress.duration, 0, 1) * 100}%` : "0%";
      }
      if (timeRef.current) {
        timeRef.current.textContent = progress
          ? `${formatTime(progress.position)} / ${formatTime(progress.duration)}`
          : "";
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [getProgress, source]);

  const canControl = source !== "spotify";

  return (
    <div className="glass flex flex-wrap items-center gap-x-6 gap-y-3 rounded-2xl px-4 py-3 lg:flex-nowrap">
      {/* Current song */}
      <div className="flex min-w-0 flex-1 items-center gap-3 lg:w-72 lg:flex-none">
        <motion.div
          className="h-11 w-11 shrink-0 rounded-full"
          style={{
            background: track
              ? `radial-gradient(circle at 35% 35%, #fff 0%, ${genreColor(track.genre)} 35%, ${genreColor(track.genre, 0.1)} 100%)`
              : "rgba(255,255,255,0.1)",
          }}
          animate={isPlaying ? { rotate: 360, scale: [1, 1.06, 1] } : { rotate: 0, scale: 1 }}
          transition={isPlaying ? { rotate: { duration: 8, repeat: Infinity, ease: "linear" }, scale: { duration: 60 / (track?.tempo ?? 120), repeat: Infinity } } : { duration: 0.4 }}
        />
        <div className="min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={track?.uid ?? "empty"}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              <p className="truncate text-sm font-semibold text-white">{track?.title ?? "Constelación vacía"}</p>
              <p className="truncate text-xs text-white/55">
                {track ? `${track.artist} · ${track.year}` : "Agrega canciones desde el buscador"}
              </p>
              {track && (
                <p className="mt-0.5 truncate text-[10px] text-white/40">
                  Estrella {index + 1} de {total} · <span style={{ color: genreColor(track.genre) }}>{GENRES[track.genre].label}</span> · {track.tempo} BPM · {KEY_NAMES[track.key]}
                </p>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Controls + progress */}
      <div className="flex w-full flex-col items-center gap-1.5 lg:w-auto lg:flex-1">
        <div className="flex items-center gap-3">
          <button
            onClick={props.onRepeat}
            title="Repetir: el final se conecta con el inicio"
            aria-pressed={repeat}
            className="rounded-full p-2 transition hover:bg-white/10"
            style={{ color: repeat ? accent : "rgba(255,255,255,0.4)" }}
          >
            <RepeatIcon width={16} height={16} />
          </button>
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={props.onPrev}
            disabled={!track}
            title="Anterior · ←"
            className="rounded-full p-2 text-white/80 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
          >
            <PrevIcon />
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.9 }}
            whileHover={{ scale: 1.06 }}
            onClick={props.onToggle}
            disabled={!track || !canControl}
            title={canControl ? "Reproducir / pausar · Espacio" : "Controla la reproducción desde el reproductor de Spotify"}
            className="flex h-12 w-12 items-center justify-center rounded-full text-[#05030f] shadow-lg transition disabled:opacity-40"
            style={{ background: accent, boxShadow: `0 0 30px ${accent}66` }}
          >
            {isPlaying && canControl ? <PauseIcon /> : <PlayIcon />}
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={props.onNext}
            disabled={!track}
            title="Siguiente · →"
            className="rounded-full p-2 text-white/80 transition hover:bg-white/10 hover:text-white disabled:opacity-30"
          >
            <NextIcon />
          </motion.button>
          <button
            onClick={props.onShuffle}
            title="Aleatorio: «Siguiente» salta a una estrella al azar"
            aria-pressed={shuffle}
            className="rounded-full p-2 transition hover:bg-white/10"
            style={{ color: shuffle ? accent : "rgba(255,255,255,0.4)" }}
          >
            <ShuffleIcon width={16} height={16} />
          </button>
        </div>

        <div className="flex w-full max-w-md items-center gap-2">
          <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-white/10">
            {source === "synth" ? (
              <div ref={barRef} className="h-full rounded-full" style={{ background: accent, width: "0%" }} />
            ) : (
              isPlaying && <div className="absolute inset-y-0 w-1/4 animate-drift rounded-full" style={{ background: accent }} />
            )}
          </div>
          {source === "synth" ? (
            <span ref={timeRef} className="w-20 text-right font-mono text-[10px] text-white/50" />
          ) : (
            <span className="w-20 text-right font-mono text-[10px] text-white/50">
              {source === "youtube" ? "YouTube" : "Spotify"}
            </span>
          )}
        </div>
      </div>

      {/* Source, volume and links */}
      <div className="flex w-full flex-wrap items-center justify-between gap-3 lg:w-auto lg:justify-end">
        <div className="flex rounded-full bg-white/5 p-0.5" role="radiogroup" aria-label="Fuente de reproducción">
          {SOURCES.map((item) => (
            <button
              key={item.id}
              role="radio"
              aria-checked={source === item.id}
              onClick={() => props.onSource(item.id)}
              className="relative rounded-full px-3 py-1 text-[11px] font-medium transition"
              style={{ color: source === item.id ? "#05030f" : "rgba(255,255,255,0.6)" }}
            >
              {source === item.id && (
                <motion.span layoutId="source-pill" className="absolute inset-0 rounded-full" style={{ background: accent }} />
              )}
              <span className="relative">{item.label}</span>
            </button>
          ))}
        </div>

        {source === "synth" && (
          <label className="flex items-center gap-2 text-white/60" title="Volumen del sintetizador">
            <VolumeIcon width={16} height={16} />
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(event) => props.onVolume(Number(event.target.value))}
              className="w-20"
              style={{ accentColor: accent }}
              aria-label="Volumen"
            />
          </label>
        )}

        {track && (
          <div className="flex items-center gap-1 text-[11px]">
            <a href={youtubeUrl(track)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-white/50 transition hover:bg-white/10 hover:text-white">
              YT <ExternalIcon width={12} height={12} />
            </a>
            <a href={spotifyUrl(track)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-white/50 transition hover:bg-white/10 hover:text-white">
              Spotify <ExternalIcon width={12} height={12} />
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
