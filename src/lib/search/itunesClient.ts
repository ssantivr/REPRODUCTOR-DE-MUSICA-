import { normalizeText, primaryArtist } from "../utils";
import { REQUEST_TIMEOUT_MS, type ExternalTrack, type TrackMedia } from "./types";

/**
 * iTunes Search API: public, keyless catalog used to obtain real metadata
 * (title, artist, year, genre, duration) for songs outside the local catalog,
 * plus a real 30-second audio clip and the album cover of any song.
 */

const SEARCH_URL = "https://itunes.apple.com/search";

interface ItunesPayload {
  results?: {
    trackName?: string;
    artistName?: string;
    primaryGenreName?: string;
    releaseDate?: string;
    trackTimeMillis?: number;
    previewUrl?: string;
    artworkUrl100?: string;
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
        previewUrl: item.previewUrl,
        // The API only lists the 100 px cover; the same path serves bigger sizes
        artworkUrl: item.artworkUrl100?.replace("100x100bb", "300x300bb"),
      };
    });
}

/**
 * Finds the audio clip and cover of a known song. Remixes and covers often rank
 * first, so an exact title match wins over a partial one.
 */
export async function findItunesMedia(title: string, artist: string): Promise<TrackMedia> {
  const candidates = await searchItunesTracks(`${title} ${primaryArtist(artist)}`, 8);
  const wanted = normalizeText(title);
  const match =
    candidates.find((track) => normalizeText(track.title) === wanted) ??
    candidates.find((track) => normalizeText(track.title).includes(wanted));
  return { previewUrl: match?.previewUrl, artworkUrl: match?.artworkUrl };
}
