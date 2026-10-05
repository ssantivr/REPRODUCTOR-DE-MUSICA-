import { REQUEST_TIMEOUT_MS, type ExternalTrack } from "./types";

/**
 * iTunes Search API: public, keyless catalog used to obtain real metadata
 * (title, artist, year, genre, duration) for songs outside the local catalog.
 */

const SEARCH_URL = "https://itunes.apple.com/search";

interface ItunesPayload {
  results?: {
    trackName?: string;
    artistName?: string;
    primaryGenreName?: string;
    releaseDate?: string;
    trackTimeMillis?: number;
  }[];
}

export async function searchItunesTracks(query: string, limit = 5): Promise<ExternalTrack[]> {
  const params = new URLSearchParams({ term: query, entity: "song", media: "music", limit: String(limit) });
  const response = await fetch(`${SEARCH_URL}?${params}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`iTunes search failed: ${response.status}`);

  const data = (await response.json()) as ItunesPayload;
  return (data.results ?? [])
    .filter((item) => item.trackName && item.artistName)
    .map((item) => {
      const year = Number.parseInt(item.releaseDate?.slice(0, 4) ?? "", 10);
      return {
        title: item.trackName as string,
        artist: item.artistName as string,
        year: Number.isNaN(year) ? undefined : year,
        genreName: item.primaryGenreName,
        durationMs: item.trackTimeMillis,
      };
    });
}
