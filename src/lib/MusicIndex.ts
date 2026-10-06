import type { Genre, Song } from "@/types/music";
import { AvlTree } from "./AvlTree";
import { HashTable } from "./HashTable";
import { TEMPO_LIMITS, matchesFilter, type SpatialFilter } from "./spatialFilter";
import { clamp, normalizeText } from "./utils";

/** Same rule as the filter: tempos outside the slider limits count as the nearest limit. */
const tempoKey = (song: Song) => clamp(song.tempo, TEMPO_LIMITS[0], TEMPO_LIMITS[1]);

/**
 * Secondary index over a set of songs:
 *  - genre  → hash table   O(1) average
 *  - artist → hash table   O(1) average (accent and case insensitive)
 *  - tempo  → AVL tree     O(log n + k) range queries
 * Adding or removing one song costs O(log n), so the index follows the list
 * change by change instead of being rebuilt; it replaces full scans when
 * searching and filtering.
 */
export class MusicIndex<T extends Song> {
  private readonly genres = new HashTable<T[]>();
  private readonly artists = new HashTable<T[]>();
  private readonly tempos = new AvlTree<T>();
  private readonly members = new Set<T>();

  constructor(songs: Iterable<T> = []) {
    for (const song of songs) this.add(song);
  }

  get size(): number {
    return this.members.size;
  }

  /** The AVL tree that orders the songs by tempo (read it, do not modify it). */
  get tempoTree(): AvlTree<T> {
    return this.tempos;
  }

  add(song: T): void {
    if (this.members.has(song)) return;
    this.members.add(song);
    this.group(this.genres, song.genre, song);
    this.group(this.artists, normalizeText(song.artist), song);
    this.tempos.insert(tempoKey(song), song);
  }

  remove(song: T): void {
    if (!this.members.delete(song)) return;
    this.ungroup(this.genres, song.genre, song);
    this.ungroup(this.artists, normalizeText(song.artist), song);
    this.tempos.remove(tempoKey(song), song);
  }

  /**
   * Makes the index hold exactly `songs`, touching only what changed: songs
   * that left are removed and new ones are added. Returns how many changed.
   */
  sync(songs: T[]): number {
    const wanted = new Set(songs);
    const gone = Array.from(this.members).filter((song) => !wanted.has(song));
    const fresh = songs.filter((song) => !this.members.has(song));
    gone.forEach((song) => this.remove(song));
    fresh.forEach((song) => this.add(song));
    return gone.length + fresh.length;
  }

  private group(table: HashTable<T[]>, key: string, song: T): void {
    const group = table.get(key);
    if (group) group.push(song);
    else table.set(key, [song]);
  }

  private ungroup(table: HashTable<T[]>, key: string, song: T): void {
    const group = table.get(key);
    if (!group) return;
    group.splice(group.indexOf(song), 1);
    if (group.length === 0) table.delete(key);
  }

  byGenre(genre: Genre): T[] {
    return this.genres.get(genre) ?? [];
  }

  byArtist(artist: string): T[] {
    return this.artists.get(normalizeText(artist)) ?? [];
  }

  byTempo(min: number, max: number): T[] {
    return this.tempos.range(min, max);
  }

  /**
   * Songs that pass the spatial filter. Starts from the smallest candidate set
   * the indexes can give (genre buckets, or the tempo range) instead of
   * testing every song.
   */
  filter(filter: SpatialFilter): Set<T> {
    if (filter.genres.length > 0) {
      const matches = new Set<T>();
      for (const genre of filter.genres) {
        for (const song of this.byGenre(genre)) {
          if (matchesFilter(song, filter)) matches.add(song);
        }
      }
      return matches;
    }
    const [minEnergy, maxEnergy] = filter.energy;
    return new Set(this.byTempo(filter.tempo[0], filter.tempo[1]).filter((song) => song.energy >= minEnergy && song.energy <= maxEnergy));
  }
}
