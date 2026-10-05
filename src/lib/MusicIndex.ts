import type { Genre, Song } from "@/types/music";
import { TEMPO_LIMITS, matchesFilter, type SpatialFilter } from "./spatialFilter";
import { clamp, hashString, normalizeText } from "./utils";

/**
 * HASH TABLE with separate chaining and string keys.
 * get / set are O(1) on average; the table doubles when the load factor passes 0.75.
 */
export class HashTable<V> {
  private buckets: [key: string, value: V][][];
  size = 0;

  constructor(capacity = 16) {
    this.buckets = Array.from({ length: capacity }, () => []);
  }

  private bucketOf(key: string) {
    return this.buckets[hashString(key) % this.buckets.length];
  }

  get(key: string): V | undefined {
    for (const entry of this.bucketOf(key)) {
      if (entry[0] === key) return entry[1];
    }
    return undefined;
  }

  set(key: string, value: V): void {
    const bucket = this.bucketOf(key);
    for (const entry of bucket) {
      if (entry[0] === key) {
        entry[1] = value;
        return;
      }
    }
    bucket.push([key, value]);
    this.size++;
    if (this.size > this.buckets.length * 0.75) this.resize();
  }

  private resize(): void {
    const old = this.buckets;
    this.buckets = Array.from({ length: old.length * 2 }, () => []);
    for (const bucket of old) {
      for (const entry of bucket) this.bucketOf(entry[0]).push(entry);
    }
  }
}

interface TreeNode<T> {
  key: number;
  /** Every value sharing this key */
  values: T[];
  left: TreeNode<T> | null;
  right: TreeNode<T> | null;
}

/**
 * BINARY SEARCH TREE keyed by a number (the tempo).
 * A range query visits only the branches that can hold keys inside the range:
 * O(log n + k) on a balanced tree, k being the number of results.
 */
export class BinarySearchTree<T> {
  private root: TreeNode<T> | null = null;

  insert(key: number, value: T): void {
    const fresh = (): TreeNode<T> => ({ key, values: [value], left: null, right: null });
    if (this.root === null) {
      this.root = fresh();
      return;
    }
    let node = this.root;
    while (true) {
      if (key === node.key) {
        node.values.push(value);
        return;
      }
      const side = key < node.key ? "left" : "right";
      const child = node[side];
      if (child === null) {
        node[side] = fresh();
        return;
      }
      node = child;
    }
  }

  /** Inserts entries already sorted by key, middle first, so the tree ends up balanced. */
  insertSorted(entries: [key: number, value: T][], low = 0, high = entries.length - 1): void {
    if (low > high) return;
    const middle = (low + high) >> 1;
    this.insert(entries[middle][0], entries[middle][1]);
    this.insertSorted(entries, low, middle - 1);
    this.insertSorted(entries, middle + 1, high);
  }

  /** Values whose key is inside [min, max], in ascending key order. */
  range(min: number, max: number): T[] {
    const result: T[] = [];
    const visit = (node: TreeNode<T> | null) => {
      if (node === null) return;
      if (node.key > min) visit(node.left);
      if (node.key >= min && node.key <= max) result.push(...node.values);
      if (node.key < max) visit(node.right);
    };
    visit(this.root);
    return result;
  }
}

/**
 * Secondary index over a set of songs:
 *  - genre  → hash table   O(1) average
 *  - artist → hash table   O(1) average (accent and case insensitive)
 *  - tempo  → BST          O(log n + k) range queries
 * Built once in O(n log n); it replaces full scans when searching and filtering.
 */
export class MusicIndex<T extends Song> {
  private readonly genres = new HashTable<T[]>();
  private readonly artists = new HashTable<T[]>();
  private readonly tempos = new BinarySearchTree<T>();

  constructor(songs: T[]) {
    const push = (table: HashTable<T[]>, key: string, song: T) => {
      const group = table.get(key);
      if (group) group.push(song);
      else table.set(key, [song]);
    };
    for (const song of songs) {
      push(this.genres, song.genre, song);
      push(this.artists, normalizeText(song.artist), song);
    }
    // Same rule as the filter: tempos outside the slider limits count as the nearest limit
    const byTempo = songs.map((song): [number, T] => [clamp(song.tempo, TEMPO_LIMITS[0], TEMPO_LIMITS[1]), song]);
    this.tempos.insertSorted(byTempo.sort((a, b) => a[0] - b[0]));
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
