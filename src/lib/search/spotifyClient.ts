import { REQUEST_TIMEOUT_MS, type ExternalTrack } from "./types";

/**
 * Spotify Web API client (Client Credentials flow).
 * Credentials come from SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET.
 */

const TOKEN_URL = "https://accounts.spotify.com/api/token";
const SEARCH_URL = "https://api.spotify.com/v1/search";

let cachedToken: { value: string; expiresAt: number } | null = null;

export function isSpotifyConfigured(): boolean {
  return Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 30_000) {
    return cachedToken.value;
  }

  const credentials = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString("base64");
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "client_credentials" }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Spotify token request failed: ${response.status}`);

  const data = (await response.json()) as { access_token: string; expires_in: number };
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

interface SpotifySearchPayload {
  tracks?: {
    items: {
      id: string;
      name: string;
      artists: { name: string }[];
      duration_ms?: number;
      album?: { release_date?: string; images?: { url: string }[] };
    }[];
  };
}

export async function searchSpotifyTracks(query: string, limit = 5): Promise<ExternalTrack[]> {
  const token = await getAccessToken();
  const params = new URLSearchParams({ q: query, type: "track", limit: String(limit) });
  const response = await fetch(`${SEARCH_URL}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Spotify search failed: ${response.status}`);

  const data = (await response.json()) as SpotifySearchPayload;
  return (data.tracks?.items ?? []).map((item) => {
    const year = Number.parseInt(item.album?.release_date?.slice(0, 4) ?? "", 10);
    return {
      title: item.name,
      artist: item.artists.map((artist) => artist.name).join(", ") || "Desconocido",
      year: Number.isNaN(year) ? undefined : year,
      durationMs: item.duration_ms,
      spotifyId: item.id,
      artworkUrl: item.album?.images?.[0]?.url,
    };
  });
}

/** Finds the Spotify track ID that matches a known title and artist. */
export async function findSpotifyTrackId(title: string, artist: string): Promise<string | undefined> {
  const [first] = await searchSpotifyTracks(`track:${title} artist:${artist}`, 1);
  return first?.spotifyId;
}
