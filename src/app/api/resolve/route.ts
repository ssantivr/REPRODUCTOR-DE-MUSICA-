import { NextResponse } from "next/server";
import { resolveBindings } from "@/lib/search/searchGateway";
import { parseSong } from "@/lib/songSchema";

export const dynamic = "force-dynamic";

/** POST /api/resolve  { song } → { song } with its YouTube / Spotify bindings. */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { song?: unknown } | null;
  const song = parseSong(body?.song);
  if (!song) return NextResponse.json({ error: "invalid song" }, { status: 400 });

  try {
    return NextResponse.json({ song: await resolveBindings(song) });
  } catch (error) {
    console.warn("[resolve] bindings unavailable:", error);
    return NextResponse.json({ song });
  }
}
