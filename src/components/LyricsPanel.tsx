"use client";

import { useEffect, useRef, useState } from "react";
import type { LyricsResponse, Track } from "@/types/music";
import { activeLineIndex } from "@/lib/lyrics";

interface LyricsPanelProps {
  track: Track | null;
  accent: string;
  /**
   * Seconds elapsed of the full song, or null when the playing source cannot
   * tell (a 30-second clip starts somewhere in the middle of the song).
   */
  getSongTime: () => number | null;
  /**
   * Given when the listener can tell where the song is: it receives the time
   * of the line they say is sounding right now.
   */
  onAnchor?: (seconds: number) => void;
}

type Status = "idle" | "loading" | "ready" | "missing" | "error";

const SYNC_INTERVAL_MS = 200;

// Lyrics already fetched in this session, by song id
const lyricsCache = new Map<string, LyricsResponse>();

/** Lyrics of the current song. With a synced lyric and a known position, the line being sung is highlighted. */
export default function LyricsPanel({ track, accent, getSongTime, onAnchor }: LyricsPanelProps) {
  const [lyrics, setLyrics] = useState<LyricsResponse | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [activeLine, setActiveLine] = useState(-1);
  const lineRefs = useRef<(HTMLElement | null)[]>([]);
  const songId = track?.id;
  const title = track?.title;
  const artist = track?.artist;
  const durationSec = track?.durationSec;

  useEffect(() => {
    setActiveLine(-1);
    if (!songId || !title || !artist) {
      setLyrics(null);
      setStatus("idle");
      return;
    }
    const cached = lyricsCache.get(songId);
    if (cached) {
      setLyrics(cached);
      setStatus(cached.found ? "ready" : "missing");
      return;
    }

    const controller = new AbortController();
    setLyrics(null);
    setStatus("loading");
    const params = new URLSearchParams({ title, artist, duration: String(durationSec ?? 0) });
    fetch(`/api/lyrics?${params}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as LyricsResponse;
        lyricsCache.set(songId, data);
        setLyrics(data);
        setStatus(data.found ? "ready" : "missing");
      })
      .catch((error: Error) => {
        if (error.name !== "AbortError") setStatus("error");
      });
    return () => controller.abort();
  }, [songId, title, artist, durationSec]);

  // Follows the song: finds the line being sung a few times per second
  const synced = lyrics?.synced ?? null;
  useEffect(() => {
    if (!synced) return;
    const tick = () => {
      const time = getSongTime();
      setActiveLine(time === null ? -1 : activeLineIndex(synced, time));
    };
    tick();
    const timer = setInterval(tick, SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [synced, getSongTime]);

  useEffect(() => {
    lineRefs.current[activeLine]?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [activeLine]);

  const following = synced !== null && activeLine >= 0;

  return (
    <div className="flex max-h-[min(24rem,45vh,calc(var(--stage-h)_-_2rem))] flex-col gap-2">
      <div className="pr-10">
        <h2 className="truncate text-sm font-semibold text-white">{track ? track.title : "Letra"}</h2>
        <p className="truncate text-[11px] text-white/45">
          {track ? track.artist : "Elige una canción para ver su letra"}
          {following && " · siguiendo la canción"}
        </p>
      </div>

      <div className="scroll-thin -mr-2 flex-1 overflow-y-auto pr-2 text-center text-sm leading-7">
        {status === "loading" && <p className="py-6 text-xs text-white/45">Buscando la letra…</p>}
        {status === "missing" && <p className="py-6 text-xs text-white/45">No se encontró la letra de esta canción.</p>}
        {status === "error" && <p className="py-6 text-xs text-rose-300">No se pudo consultar el servicio de letras. Intenta de nuevo más tarde.</p>}
        {status === "ready" && lyrics?.instrumental && <p className="py-6 text-xs text-white/45">Esta canción es instrumental: no tiene letra.</p>}
        {status === "ready" && !lyrics?.instrumental && synced
          ? synced.map((line, index) => {
              const style = {
                color: index === activeLine ? accent : following ? "rgb(var(--ink) / 0.4)" : "rgb(var(--ink) / 0.8)",
                fontWeight: index === activeLine ? 600 : 400,
              };
              const setRef = (element: HTMLElement | null) => {
                lineRefs.current[index] = element;
              };
              return onAnchor ? (
                <button
                  key={`${line.time}-${index}`}
                  ref={setRef}
                  onClick={() => {
                    onAnchor(line.time);
                    setActiveLine(index);
                  }}
                  title="Este verso está sonando ahora"
                  className="tap-none block w-full rounded-lg transition-colors duration-300 hover:bg-white/5"
                  style={style}
                >
                  {line.text || "♪"}
                </button>
              ) : (
                <p key={`${line.time}-${index}`} ref={setRef} className="transition-colors duration-300" style={style}>
                  {line.text || "♪"}
                </p>
              );
            })
          : status === "ready" && !lyrics?.instrumental && <p className="whitespace-pre-line text-white/80">{lyrics?.plain}</p>}
      </div>

      {status === "ready" && synced && !lyrics?.instrumental && (onAnchor || !following) && (
        <p className="text-center text-[10px] text-white/35">
          {!onAnchor
            ? "Con la fuente YouTube la letra avanza sola; con la fuente Audio puedes sincronizarla tú."
            : following
              ? "¿Va desfasada? Toca el verso que suena ahora."
              : "El fragmento empieza en mitad de la canción: toca el verso que suena ahora y la letra lo seguirá."}
        </p>
      )}
    </div>
  );
}
