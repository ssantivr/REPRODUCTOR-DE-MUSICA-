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
}

export const REQUEST_TIMEOUT_MS = 6000;
