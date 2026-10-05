import type { Song } from "@/types/music";
import { CATALOG } from "../catalog";
import { GENRES } from "../genres";
import { MusicIndex } from "../MusicIndex";
import { normalizeText } from "../utils";

function score(song: Song, terms: string[]): number {
  const title = normalizeText(song.title);
  const artist = normalizeText(song.artist);
  const genre = normalizeText(`${song.genre} ${GENRES[song.genre].label}`);

  let total = 0;
  for (const term of terms) {
    let termScore = 0;
    if (title.startsWith(term)) termScore += 5;
    else if (title.includes(term)) termScore += 3;
    if (artist.includes(term)) termScore += 2;
    if (genre.includes(term)) termScore += 1;
    if (String(song.year) === term) termScore += 2;
    // Every term must match something, otherwise the song is not a result
    if (termScore === 0) return 0;
    total += termScore;
  }
  return total;
}

/** Accent-insensitive search over the pre-coded catalog. */
export function searchLocalCatalog(query: string): Song[] {
  const terms = normalizeText(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  return CATALOG.map((song) => ({ song, points: score(song, terms) }))
    .filter((entry) => entry.points > 0)
    .sort((a, b) => b.points - a.points)
    .map((entry) => entry.song);
}

export function exploreCatalog(limit = 12): Song[] {
  return CATALOG.slice(0, limit);
}

/** True when a song with the same title and artist already exists in the catalog. */
export function isInCatalog(title: string, artist: string): boolean {
  const wanted = normalizeText(title);
  // Artist hash lookup: O(1) average instead of scanning the catalog
  return CATALOG_INDEX.byArtist(artist).some((song) => normalizeText(song.title) === wanted);
}

const CATALOG_INDEX = new MusicIndex(CATALOG);
