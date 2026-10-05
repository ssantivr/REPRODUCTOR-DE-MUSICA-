import type { Song } from "@/types/music";

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** 32-bit FNV-1a hash: turns a string into a stable number. */
export function hashString(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Seeded pseudo-random generator (same seed → same sequence). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Lowercase and accent-free text, used to compare search queries. */
export function normalizeText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function titleCase(text: string): string {
  return text
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

const searchTerms = (song: Song) => `${song.title} ${song.artist}`;

export function youtubeUrl(song: Song): string {
  return song.youtubeId
    ? `https://www.youtube.com/watch?v=${song.youtubeId}`
    : `https://www.youtube.com/results?search_query=${encodeURIComponent(searchTerms(song))}`;
}

export function spotifyUrl(song: Song): string {
  return song.spotifyId
    ? `https://open.spotify.com/track/${song.spotifyId}`
    : `https://open.spotify.com/search/${encodeURIComponent(searchTerms(song))}`;
}

export const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
export const SPOTIFY_ID_PATTERN = /^[A-Za-z0-9]{22}$/;

/** Spanish note names shown in the interface. */
export const KEY_NAMES = ["Do", "Do#", "Re", "Re#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "La#", "Si"];
