import type { Genre, Song } from "@/types/music";

/** Real-time filter applied to the particles of the universe. */
export interface SpatialFilter {
  /** Empty means every genre is visible */
  genres: Genre[];
  /** Inclusive energy range, 0–1 */
  energy: [number, number];
  /** Inclusive tempo range in BPM */
  tempo: [number, number];
}

export const TEMPO_LIMITS: [number, number] = [60, 180];

export const DEFAULT_FILTER: SpatialFilter = {
  genres: [],
  energy: [0, 1],
  tempo: TEMPO_LIMITS,
};

export function matchesFilter(song: Song, filter: SpatialFilter): boolean {
  if (filter.genres.length > 0 && !filter.genres.includes(song.genre)) return false;
  if (song.energy < filter.energy[0] || song.energy > filter.energy[1]) return false;
  // Songs outside the slider limits count as the nearest limit
  const tempo = Math.min(Math.max(song.tempo, TEMPO_LIMITS[0]), TEMPO_LIMITS[1]);
  return tempo >= filter.tempo[0] && tempo <= filter.tempo[1];
}

export function isFilterActive(filter: SpatialFilter): boolean {
  return (
    filter.genres.length > 0 ||
    filter.energy[0] > DEFAULT_FILTER.energy[0] ||
    filter.energy[1] < DEFAULT_FILTER.energy[1] ||
    filter.tempo[0] > TEMPO_LIMITS[0] ||
    filter.tempo[1] < TEMPO_LIMITS[1]
  );
}
