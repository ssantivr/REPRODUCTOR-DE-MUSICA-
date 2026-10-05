import { YOUTUBE_ID_PATTERN } from "../utils";
import { REQUEST_TIMEOUT_MS, type ExternalTrack } from "./types";

/**
 * YouTube lookup.
 *  - With YOUTUBE_API_KEY: YouTube Data API v3.
 *  - Without a key: reads the video IDs from the public results page.
 * Every candidate is checked with oEmbed, which only answers 200 for videos
 * that exist and allow embedding, so the player never receives a dead ID.
 */

const API_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
const RESULTS_PAGE_URL = "https://www.youtube.com/results";
const OEMBED_URL = "https://www.youtube.com/oembed";
const MUSIC_CATEGORY_ID = "10";
const MAX_CANDIDATES = 5;

export function isYouTubeApiConfigured(): boolean {
  return Boolean(process.env.YOUTUBE_API_KEY);
}

/** The API returns HTML-escaped titles ("&amp;", "&#39;", ...). */
function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&"); // last, so "&amp;lt;" is not decoded twice
}

interface YouTubeSearchPayload {
  items?: {
    id?: { videoId?: string };
    snippet?: { title?: string; channelTitle?: string; publishedAt?: string };
  }[];
}

async function searchWithApi(query: string, limit: number): Promise<ExternalTrack[]> {
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    videoCategoryId: MUSIC_CATEGORY_ID,
    maxResults: String(limit),
    q: query,
    key: process.env.YOUTUBE_API_KEY ?? "",
  });
  const response = await fetch(`${API_SEARCH_URL}?${params}`, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`YouTube API search failed: ${response.status}`);

  const data = (await response.json()) as YouTubeSearchPayload;
  return (data.items ?? [])
    .filter((item) => item.id?.videoId)
    .map((item) => ({
      title: decodeEntities(item.snippet?.title ?? query),
      artist: decodeEntities(item.snippet?.channelTitle ?? "YouTube").replace(/ - Topic$/, "").replace(/VEVO$/, "").trim(),
      youtubeId: item.id?.videoId,
    }));
}

async function scrapeVideoIds(query: string): Promise<string[]> {
  const params = new URLSearchParams({ search_query: query });
  const response = await fetch(`${RESULTS_PAGE_URL}?${params}`, {
    headers: { "Accept-Language": "en-US,en;q=0.8", "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`YouTube results page failed: ${response.status}`);

  const html = await response.text();
  const ids = Array.from(html.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g), (match) => match[1]);
  return Array.from(new Set(ids)).slice(0, MAX_CANDIDATES);
}

/** True when the video exists and its owner allows embedding. */
async function isEmbeddable(videoId: string): Promise<boolean> {
  const params = new URLSearchParams({ url: `https://www.youtube.com/watch?v=${videoId}`, format: "json" });
  try {
    const response = await fetch(`${OEMBED_URL}?${params}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Returns an embeddable video ID for a song, or undefined when none is found. */
export async function findYouTubeVideoId(title: string, artist: string): Promise<string | undefined> {
  const query = `${artist} ${title}`;
  let candidates: string[] = [];

  if (isYouTubeApiConfigured()) {
    try {
      candidates = (await searchWithApi(query, MAX_CANDIDATES)).map((video) => video.youtubeId ?? "");
    } catch (error) {
      console.warn("[search] YouTube API unavailable, using the results page:", error);
    }
  }
  if (candidates.length === 0) candidates = await scrapeVideoIds(query);

  // Checked in parallel; the first candidate (best match) that is embeddable wins
  const valid = candidates.filter((id) => YOUTUBE_ID_PATTERN.test(id));
  const embeddable = await Promise.all(valid.map(isEmbeddable));
  return valid.find((_, index) => embeddable[index]);
}
