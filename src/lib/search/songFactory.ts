import type { Genre, Song } from "@/types/music";
import { SPOTIFY_ID_PATTERN, YOUTUBE_ID_PATTERN, hashString, mulberry32, normalizeText, titleCase } from "../utils";
import type { ExternalTrack } from "./types";

type Range = [min: number, max: number];

/**
 * Typical attribute ranges per genre. External providers no longer expose
 * audio features (Spotify's audio-features endpoint is closed to new apps), so
 * energy, valence, tempo and key are estimated inside the genre's range with a
 * seed taken from title + artist: the same song always gets the same values.
 */
const GENRE_PROFILE: Record<Genre, { energy: Range; valence: Range; tempo: Range }> = {
  electronic: { energy: [0.6, 0.95], valence: [0.2, 0.8], tempo: [118, 132] },
  rock: { energy: [0.6, 0.95], valence: [0.2, 0.75], tempo: [100, 150] },
  pop: { energy: [0.5, 0.85], valence: [0.4, 0.95], tempo: [95, 125] },
  urban: { energy: [0.6, 0.9], valence: [0.4, 0.9], tempo: [85, 105] },
  jazz: { energy: [0.15, 0.5], valence: [0.3, 0.7], tempo: [90, 180] },
  ambient: { energy: [0.02, 0.25], valence: [0.1, 0.4], tempo: [60, 80] },
  classical: { energy: [0.03, 0.35], valence: [0.1, 0.5], tempo: [60, 110] },
  indie: { energy: [0.35, 0.75], valence: [0.2, 0.7], tempo: [100, 140] },
};

const GENRE_KEYWORDS: [Genre, RegExp][] = [
  ["urban", /hip.?hop|rap|reggaet|latin|urbano|r&b|soul|trap|dancehall|reggae/i],
  ["electronic", /electr|dance|house|techno|trance|edm|dubstep/i],
  ["jazz", /jazz|blues|swing|bossa/i],
  ["classical", /classic|cl[aá]sica|soundtrack|opera|orchestra|piano/i],
  ["ambient", /ambient|new age|chill|lo.?fi|meditation/i],
  ["indie", /indie|alternative|alternativ|folk/i],
  ["rock", /rock|metal|punk|grunge/i],
  ["pop", /pop|k-pop|singer/i],
];

export function genreFromName(name: string | undefined, seed: number): Genre {
  if (name) {
    for (const [genre, pattern] of GENRE_KEYWORDS) {
      if (pattern.test(name)) return genre;
    }
  }
  const fallback: Genre[] = ["pop", "rock", "indie", "electronic"];
  return fallback[seed % fallback.length];
}

const pick = (random: () => number, [min, max]: Range) => min + random() * (max - min);
const round2 = (value: number) => Math.round(value * 100) / 100;

/** Builds a Song with exactly the same fields as the pre-coded catalog songs. */
export function createSong(track: ExternalTrack): Song {
  const seed = hashString(normalizeText(`${track.title}|${track.artist}`));
  const random = mulberry32(seed);
  const genre = genreFromName(track.genreName, seed);
  const profile = GENRE_PROFILE[genre];

  const song: Song = {
    id: `ext-${seed.toString(36)}`,
    title: track.title,
    artist: track.artist,
    year: track.year ?? 2000 + Math.floor(random() * 26),
    genre,
    energy: round2(pick(random, profile.energy)),
    valence: round2(pick(random, profile.valence)),
    tempo: Math.round(pick(random, profile.tempo)),
    key: Math.floor(random() * 12),
    durationSec: track.durationMs ? Math.round(track.durationMs / 1000) : 150 + Math.floor(random() * 120),
  };
  return withBindings(song, track.youtubeId, track.spotifyId);
}

/** Attaches playback IDs only when they have a valid format. */
export function withBindings(song: Song, youtubeId?: string, spotifyId?: string): Song {
  const result: Song = { ...song };
  if (youtubeId && YOUTUBE_ID_PATTERN.test(youtubeId)) result.youtubeId = youtubeId;
  if (spotifyId && SPOTIFY_ID_PATTERN.test(spotifyId)) result.spotifyId = spotifyId;
  return result;
}

const SIMULATED_ARTISTS = ["Nébula Sur", "Los Satélites", "Aurora Binaria", "Cometa Azul", "Órbita 808", "Polvo de Estrellas"];

/** Offline fallback used only when every provider is unreachable. */
export function simulateSongs(query: string, count = 2): Song[] {
  const seed = hashString(normalizeText(query));
  return Array.from({ length: count }, (_, i) =>
    createSong({
      title: i === 0 ? titleCase(query) : `${titleCase(query)} (Versión acústica)`,
      artist: SIMULATED_ARTISTS[(seed + i * 7) % SIMULATED_ARTISTS.length],
    }),
  );
}
