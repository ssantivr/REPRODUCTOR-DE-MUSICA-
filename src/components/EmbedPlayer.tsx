"use client";

import { useEffect, useMemo, useRef } from "react";
import type { PlaybackSource, Track } from "@/types/music";
import { spotifyUrl, youtubeUrl } from "@/lib/utils";
import { ExternalIcon } from "./icons";

interface EmbedPlayerProps {
  track: Track;
  source: Exclude<PlaybackSource, "synth">;
  isPlaying: boolean;
  /** True while the missing bindings of this track are being looked up */
  resolving: boolean;
}

/**
 * Embedded YouTube or Spotify player. The parent sets `key={track.uid}`, so
 * moving to another node (next / prev) remounts the iframe with the new track.
 */
export default function EmbedPlayer({ track, source, isPlaying, resolving }: EmbedPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const playingAtMount = useRef(isPlaying);

  const youtubeSrc = useMemo(() => {
    if (!track.youtubeId) return null;
    const params = new URLSearchParams({
      autoplay: playingAtMount.current ? "1" : "0",
      enablejsapi: "1",
      rel: "0",
      playsinline: "1",
    });
    return `https://www.youtube.com/embed/${track.youtubeId}?${params.toString()}`;
  }, [track.youtubeId]);

  // YouTube play / pause through the iframe postMessage API
  useEffect(() => {
    if (source !== "youtube") return;
    const target = iframeRef.current?.contentWindow;
    if (!target) return;
    target.postMessage(
      JSON.stringify({ event: "command", func: isPlaying ? "playVideo" : "pauseVideo", args: [] }),
      "https://www.youtube.com",
    );
  }, [isPlaying, source]);

  if (source === "youtube" && youtubeSrc) {
    return (
      <iframe
        ref={iframeRef}
        src={youtubeSrc}
        title={`YouTube: ${track.title}`}
        className="aspect-video w-full rounded-xl"
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
      />
    );
  }

  if (source === "spotify" && track.spotifyId) {
    return (
      <iframe
        src={`https://open.spotify.com/embed/track/${track.spotifyId}?utm_source=generator&theme=0`}
        title={`Spotify: ${track.title}`}
        className="h-[152px] w-full rounded-xl"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"
        loading="lazy"
      />
    );
  }

  const url = source === "youtube" ? youtubeUrl(track) : spotifyUrl(track);
  const name = source === "youtube" ? "YouTube" : "Spotify";

  if (resolving) {
    return (
      <div className="flex h-[152px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-white/15 px-4 text-center">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/15 border-t-white/70" aria-hidden />
        <p className="text-sm text-white/70">
          Buscando <span className="font-semibold text-white">{track.title}</span> en {name}…
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-[152px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/15 px-4 text-center">
      <p className="text-sm text-white/70">
        <span className="font-semibold text-white">{track.title}</span> todavía no tiene {source === "youtube" ? "un video vinculado" : "una pista vinculada"} en {name}.
      </p>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-white/20"
      >
        Buscar en {name} <ExternalIcon width={14} height={14} />
      </a>
    </div>
  );
}
