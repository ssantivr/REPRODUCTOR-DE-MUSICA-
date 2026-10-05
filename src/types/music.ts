/** Domain types for the Music Universe project. */

export type Genre = "electronic" | "rock" | "pop" | "urban" | "jazz" | "ambient" | "classical" | "indie";

/** Where a search hit came from. */
export type HitOrigin = "local" | "global" | "spotify" | "simulated";

/**
 * Song data: the `value` stored by every node of the list.
 * Pre-coded songs and songs found by the search share this exact shape.
 */
export interface Song {
  id: string;
  title: string;
  artist: string;
  year: number;
  genre: Genre;
  /** 0 = very calm, 1 = very energetic */
  energy: number;
  /** 0 = dark / sad, 1 = bright / happy */
  valence: number;
  /** Beats per minute */
  tempo: number;
  /** Pitch class: 0 = C, 1 = C#, ..., 11 = B */
  key: number;
  durationSec: number;
  youtubeId?: string;
  spotifyId?: string;
}

/**
 * A song inside the playlist. The unique `uid` lets the same song appear
 * several times without two nodes being confused with each other.
 */
export interface Track extends Song {
  uid: string;
}

export type VisualMode = "universe" | "flow" | "night" | "energy";

export type PlaybackSource = "synth" | "youtube" | "spotify";

export type InsertOperation = "append" | "prepend" | "insertAt";

export type SearchSource = "local" | "external" | "simulated";

/**
 * A search result. External hits carry metadata only; their playback bindings
 * (YouTube video / Spotify track) are resolved when the song is added.
 */
export interface SearchHit {
  song: Song;
  origin: HitOrigin;
}

export interface SearchResponse {
  query: string;
  hits: SearchHit[];
  source: SearchSource;
  providers: { spotify: boolean; youtube: boolean };
  tookMs: number;
}

export type PlaylistEventTone = "navigate" | "add" | "remove" | "traverse" | "warning";

/** Human-readable notification of the last playlist operation (shown in Spanish). */
export interface PlaylistEvent {
  id: number;
  tone: PlaylistEventTone;
  message: string;
}
