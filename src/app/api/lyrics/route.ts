import { NextResponse } from "next/server";
import { findLyrics } from "@/lib/lyrics";
import type { LyricsResponse } from "@/types/music";

export const dynamic = "force-dynamic";

const MAX_FIELD_LENGTH = 200;

/** GET /api/lyrics?title=&artist=&duration=  → plain and synced lyrics of a song. */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const title = (params.get("title") ?? "").trim().slice(0, MAX_FIELD_LENGTH);
  const artist = (params.get("artist") ?? "").trim().slice(0, MAX_FIELD_LENGTH);
  const duration = Number(params.get("duration"));
  if (!title || !artist) return NextResponse.json({ error: "title and artist are required" }, { status: 400 });

  try {
    return NextResponse.json(await findLyrics(title, artist, Number.isFinite(duration) ? duration : 0));
  } catch (error) {
    console.warn("[lyrics] provider unavailable:", error);
    const empty: LyricsResponse = { found: false, instrumental: false, plain: null, synced: null };
    return NextResponse.json(empty, { status: 502 });
  }
}
