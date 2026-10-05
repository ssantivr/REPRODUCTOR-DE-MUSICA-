import type { LyricLine, LyricsResponse } from "@/types/music";
import { REQUEST_TIMEOUT_MS } from "./search/types";
import { normalizeText, primaryArtist } from "./utils";

/**
 * Lyrics from LRCLIB (https://lrclib.net): public and keyless. Many songs come
 * with synced lyrics in LRC format, one "[mm:ss.xx] text" line per verse.
 */

const SEARCH_URL = "https://lrclib.net/api/search";
const CACHE_TTL_MS = 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;
/** A candidate whose length differs more than this is probably another version of the song. */
const DURATION_TOLERANCE_SEC = 8;

interface LrclibItem {
  trackName?: string;
  artistName?: string;
  duration?: number;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

const NOT_FOUND: LyricsResponse = { found: false, instrumental: false, plain: null, synced: null };

const cache = new Map<string, { value: LyricsResponse; expiresAt: number }>();

const LRC_LINE = /^\[(\d{1,3}):(\d{2}(?:\.\d{1,3})?)\](.*)$/;

/** Parses LRC text into timed lines sorted by time. Lines without a timestamp are ignored. */
export function parseLrc(text: string): LyricLine[] {
  const lines: LyricLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const match = LRC_LINE.exec(raw.trim());
    if (!match) continue;
    lines.push({ time: Number(match[1]) * 60 + Number(match[2]), text: match[3].trim() });
  }
  return lines.sort((a, b) => a.time - b.time);
}

/** Index of the line being sung at `time` (binary search), or -1 before the first one. */
export function activeLineIndex(lines: LyricLine[], time: number): number {
  let low = 0;
  let high = lines.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (lines[middle].time <= time) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
}

/** Prefers the right artist, then synced lyrics, then the closest duration. */
function score(item: LrclibItem, artist: string, durationSec: number): number {
  let points = 0;
  if (normalizeText(item.artistName ?? "").includes(normalizeText(artist))) points += 4;
  if (item.syncedLyrics) points += 2;
  if (durationSec > 0 && typeof item.duration === "number" && Math.abs(item.duration - durationSec) <= DURATION_TOLERANCE_SEC) points += 1;
  return points;
}

/** Looks the lyrics up. Throws only when LRCLIB is unreachable. */
export async function findLyrics(title: string, artist: string, durationSec = 0): Promise<LyricsResponse> {
  const mainArtist = primaryArtist(artist);
  const cacheKey = normalizeText(`${title}|${mainArtist}`);
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const params = new URLSearchParams({ track_name: title, artist_name: mainArtist });
  const response = await fetch(`${SEARCH_URL}?${params}`, {
    headers: { "User-Agent": "UniversoMusical/1.0 (taller de estructuras de datos)" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`LRCLIB search failed: ${response.status}`);

  const items = ((await response.json()) as LrclibItem[]).filter((item) => item.instrumental || item.plainLyrics || item.syncedLyrics);
  let best: LrclibItem | null = null;
  let bestScore = -1;
  for (const item of items) {
    const points = score(item, mainArtist, durationSec);
    if (points > bestScore) {
      best = item;
      bestScore = points;
    }
  }

  let result = NOT_FOUND;
  if (best) {
    const synced = best.syncedLyrics ? parseLrc(best.syncedLyrics) : [];
    result = {
      found: true,
      instrumental: best.instrumental === true,
      plain: best.plainLyrics ?? (synced.length > 0 ? synced.map((line) => line.text).join("\n") : null),
      synced: synced.length > 0 ? synced : null,
    };
  }

  if (cache.size >= CACHE_MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  cache.set(cacheKey, { value: result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}
