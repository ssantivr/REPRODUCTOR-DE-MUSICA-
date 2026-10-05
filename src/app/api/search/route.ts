import { NextResponse } from "next/server";
import { searchSongs } from "@/lib/search/searchGateway";
import type { SearchResponse } from "@/types/music";

export const dynamic = "force-dynamic";

/** GET /api/search?q=text */
export async function GET(request: Request) {
  const started = Date.now();
  const query = new URL(request.url).searchParams.get("q") ?? "";

  const body: SearchResponse = { ...(await searchSongs(query)), tookMs: Date.now() - started };
  return NextResponse.json(body);
}
