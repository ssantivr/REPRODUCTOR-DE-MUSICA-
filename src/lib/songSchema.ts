import type { Genre, Song } from "@/types/music";
import { GENRE_KEYS } from "./genres";
import { SPOTIFY_ID_PATTERN, YOUTUBE_ID_PATTERN } from "./utils";

const isNumberIn = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;

const isText = (value: unknown, maxLength: number): value is string =>
  typeof value === "string" && value.trim().length > 0 && value.length <= maxLength;

/**
 * Validates untrusted data (request bodies, imported files) and rebuilds it
 * as a Song with exactly the catalog fields. Returns null when invalid.
 */
export function parseSong(input: unknown): Song | null {
  if (typeof input !== "object" || input === null) return null;
  const data = input as Record<string, unknown>;

  if (
    !isText(data.id, 64) ||
    !isText(data.title, 200) ||
    !isText(data.artist, 200) ||
    !GENRE_KEYS.includes(data.genre as Genre) ||
    !isNumberIn(data.year, 1000, 3000) ||
    !isNumberIn(data.energy, 0, 1) ||
    !isNumberIn(data.valence, 0, 1) ||
    !isNumberIn(data.tempo, 20, 300) ||
    !isNumberIn(data.key, 0, 11) ||
    !isNumberIn(data.durationSec, 1, 7200)
  ) {
    return null;
  }

  const song: Song = {
    id: data.id,
    title: data.title,
    artist: data.artist,
    year: data.year,
    genre: data.genre as Genre,
    energy: data.energy,
    valence: data.valence,
    tempo: data.tempo,
    key: data.key,
    durationSec: data.durationSec,
  };
  if (typeof data.youtubeId === "string" && YOUTUBE_ID_PATTERN.test(data.youtubeId)) song.youtubeId = data.youtubeId;
  if (typeof data.spotifyId === "string" && SPOTIFY_ID_PATTERN.test(data.spotifyId)) song.spotifyId = data.spotifyId;
  return song;
}

/** Strips any extra runtime fields (like a playlist uid) and keeps only Song fields. */
export function toSong(value: Song): Song {
  const { id, title, artist, year, genre, energy, valence, tempo, key, durationSec, youtubeId, spotifyId } = value;
  const song: Song = { id, title, artist, year, genre, energy, valence, tempo, key, durationSec };
  if (youtubeId) song.youtubeId = youtubeId;
  if (spotifyId) song.spotifyId = spotifyId;
  return song;
}
