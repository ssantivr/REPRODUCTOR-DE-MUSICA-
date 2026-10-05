/** Raw metadata returned by an external provider before it becomes a Song. */
export interface ExternalTrack {
  title: string;
  artist: string;
  year?: number;
  /** Provider genre name, e.g. "Hip-Hop/Rap" */
  genreName?: string;
  durationMs?: number;
  spotifyId?: string;
  youtubeId?: string;
  previewUrl?: string;
  artworkUrl?: string;
}

/** Real audio clip and album cover of a song. */
export interface TrackMedia {
  previewUrl?: string;
  artworkUrl?: string;
}

export const REQUEST_TIMEOUT_MS = 6000;
