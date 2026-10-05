import type { SearchHit, SearchResponse, Song } from "@/types/music";
import { normalizeText } from "../utils";
import { searchItunesTracks } from "./itunesClient";
import { exploreCatalog, isInCatalog, searchLocalCatalog } from "./localSearch";
import { createSong, simulateSongs, withBindings } from "./songFactory";
import { findSpotifyTrackId, isSpotifyConfigured, searchSpotifyTracks } from "./spotifyClient";
import { findYouTubeVideoId, isYouTubeApiConfigured } from "./youtubeClient";

const MAX_QUERY_LENGTH = 80;
const MIN_EXTERNAL_QUERY_LENGTH = 3;
/** External candidates are added when the catalog returns fewer hits than this. */
const LOCAL_ENOUGH = 3;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

// In-memory caches: avoid repeating provider calls while the user types
const searchCache = new Map<string, CacheEntry<SearchHit[]>>();
const bindingCache = new Map<string, CacheEntry<Song>>();

function readCache<T>(cache: Map<string, CacheEntry<T>>, key: string): T | undefined {
  const entry = cache.get(key);
  if (entry && entry.expiresAt > Date.now()) return entry.value;
  cache.delete(key);
  return undefined;
}

function writeCache<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T) {
  // Bounded: drop expired entries, then the oldest ones (Map keeps insertion order)
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const now = Date.now();
    cache.forEach((entry, entryKey) => {
      if (entry.expiresAt <= now) cache.delete(entryKey);
    });
    const keys = cache.keys();
    while (cache.size >= CACHE_MAX_ENTRIES) cache.delete(keys.next().value as string);
  }
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function providers(): SearchResponse["providers"] {
  return { spotify: isSpotifyConfigured(), youtube: isYouTubeApiConfigured() };
}

/**
 * Search pipeline:
 *  1. Pre-coded catalog.
 *  2. Songs outside the catalog: Spotify (with credentials) or the keyless
 *     iTunes catalog, converted to the exact Song shape.
 *  3. Every provider unreachable: simulated songs.
 * It never throws, so the interface always receives a usable response.
 */
export async function searchSongs(rawQuery: string): Promise<Omit<SearchResponse, "tookMs">> {
  const query = rawQuery.trim().slice(0, MAX_QUERY_LENGTH);

  if (!query) {
    return { query, hits: exploreCatalog().map((song) => ({ song, origin: "local" })), source: "local", providers: providers() };
  }

  const local: SearchHit[] = searchLocalCatalog(query).map((song) => ({ song, origin: "local" }));
  if (local.length >= LOCAL_ENOUGH || query.length < MIN_EXTERNAL_QUERY_LENGTH) {
    return { query, hits: local, source: "local", providers: providers() };
  }

  const external = (await searchExternal(query)) ?? [];
  if (external.length > 0) {
    return { query, hits: [...local, ...external], source: "external", providers: providers() };
  }
  if (local.length > 0) return { query, hits: local, source: "local", providers: providers() };

  // Nothing matched anywhere (or the providers are unreachable): still offer a song
  const simulated = simulateSongs(query).map((song): SearchHit => ({ song, origin: "simulated" }));
  return { query, hits: simulated, source: "simulated", providers: providers() };
}

/** Returns external hits, or null when every provider failed. */
async function searchExternal(query: string): Promise<SearchHit[] | null> {
  const cacheKey = normalizeText(query);
  const cached = readCache(searchCache, cacheKey);
  if (cached) return cached;

  let hits: SearchHit[] | null = null;

  if (isSpotifyConfigured()) {
    try {
      const tracks = await searchSpotifyTracks(query);
      hits = tracks.map((track) => ({ song: createSong(track), origin: "spotify" }));
    } catch (error) {
      console.warn("[search] Spotify unavailable:", error);
    }
  }

  if (hits === null || hits.length === 0) {
    try {
      const tracks = await searchItunesTracks(query);
      hits = tracks.map((track) => ({ song: createSong(track), origin: "global" }));
    } catch (error) {
      console.warn("[search] iTunes unavailable:", error);
    }
  }

  if (hits === null) return null;

  // Songs already in the catalog are served by the local results instead
  const unique = new Map<string, SearchHit>();
  for (const hit of hits) {
    if (!isInCatalog(hit.song.title, hit.song.artist)) unique.set(hit.song.id, hit);
  }
  const result = Array.from(unique.values());
  writeCache(searchCache, cacheKey, result);
  return result;
}

/**
 * Resolves the playback bindings of a searched song: the embeddable YouTube
 * video and, with Spotify credentials, the Spotify track. Metadata is kept
 * untouched, so the song keeps exactly the same shape as the catalog songs.
 */
export async function resolveBindings(song: Song): Promise<Song> {
  const cached = readCache(bindingCache, song.id);
  if (cached) return cached;

  const [youtube, spotify] = await Promise.allSettled([
    song.youtubeId ? Promise.resolve(song.youtubeId) : findYouTubeVideoId(song.title, song.artist),
    song.spotifyId || !isSpotifyConfigured() ? Promise.resolve(song.spotifyId) : findSpotifyTrackId(song.title, song.artist),
  ]);

  const resolved = withBindings(
    song,
    youtube.status === "fulfilled" ? youtube.value : undefined,
    spotify.status === "fulfilled" ? spotify.value : undefined,
  );
  if (resolved.youtubeId || resolved.spotifyId) writeCache(bindingCache, song.id, resolved);
  return resolved;
}
