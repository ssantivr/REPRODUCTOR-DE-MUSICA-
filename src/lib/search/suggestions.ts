import type { Song } from "@/types/music";
import { HashTable } from "../HashTable";
import { Trie, type TrieStep } from "../Trie";
import { normalizeText, primaryArtist } from "../utils";

export interface Suggestion {
  text: string;
  kind: "song" | "artist";
  /** Artist of a suggested song */
  detail?: string;
}

const MIN_PREFIX_LENGTH = 2;

/**
 * Autocomplete over song titles and artists, backed by a trie.
 * Each text is stored once per word ("bohemian rhapsody" and "rhapsody"), so a
 * prefix matches from the start of any of its words.
 */
export class SuggestionIndex {
  private readonly trie = new Trie<Suggestion>();
  private readonly known = new HashTable<Suggestion>();

  constructor(songs: Iterable<Pick<Song, "title" | "artist">> = []) {
    for (const song of songs) this.add(song);
  }

  get size(): number {
    return this.known.size;
  }

  /** Learns the title and the main artist of a song; what it already knows is skipped. */
  add(song: Pick<Song, "title" | "artist">): void {
    this.learn({ text: song.title, kind: "song", detail: song.artist });
    this.learn({ text: primaryArtist(song.artist), kind: "artist" });
  }

  private learn(suggestion: Suggestion): void {
    const normalized = normalizeText(suggestion.text);
    const id = `${suggestion.kind}:${normalized}`;
    if (!normalized || this.known.has(id)) return;
    this.known.set(id, suggestion);
    for (let start = 0; start < normalized.length; start++) {
      if (start === 0 || normalized[start - 1] === " ") this.trie.insert(normalized.slice(start), suggestion);
    }
  }

  /** How the trie reads what is being typed, one character at a time. */
  trace(query: string): TrieStep[] {
    return this.trie.trace(normalizeText(query));
  }

  /** Up to `limit` completions of what is being typed, leaving out what is already fully written. */
  suggest(query: string, limit = 5): Suggestion[] {
    const prefix = normalizeText(query);
    if (prefix.length < MIN_PREFIX_LENGTH) return [];
    return this.trie
      .startsWith(prefix, limit + 1)
      .filter((suggestion) => normalizeText(suggestion.text) !== prefix)
      .slice(0, limit);
  }
}
