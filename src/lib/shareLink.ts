import type { Song } from "@/types/music";
import type { SerializedList } from "./DoublyLinkedList";

/**
 * A playlist travelling inside a link: the whole list goes in the part of the
 * address after `#`, which browsers never send to the server.
 */
export interface SharedGalaxy {
  name: string;
  /** Not validated here: whoever loads it must check every song */
  list: unknown;
}

const HASH_KEY = "galaxia";
/** Longer payloads are ignored instead of being decompressed */
export const MAX_PAYLOAD_LENGTH = 20_000;

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, transform: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Packs a playlist into text that is safe inside an address. The first
 * character says how: "z" is compressed (deflate), "j" is plain JSON for
 * browsers without CompressionStream.
 */
export async function encodeGalaxy(name: string, list: SerializedList<Song>): Promise<string> {
  // The audio clip and the cover are long addresses, and the app looks them up again when the song plays
  const items = list.items.map(({ previewUrl: _clip, artworkUrl: _cover, ...song }) => song);
  const bytes = new TextEncoder().encode(JSON.stringify({ n: name, l: { ...list, items } }));
  if (typeof CompressionStream === "undefined") return `j${toBase64Url(bytes)}`;
  return `z${toBase64Url(await pipe(bytes, new CompressionStream("deflate-raw")))}`;
}

/** Reverse of encodeGalaxy. Returns null for anything that is not a shared playlist. */
export async function decodeGalaxy(payload: string): Promise<SharedGalaxy | null> {
  try {
    if (payload.length < 2 || payload.length > MAX_PAYLOAD_LENGTH) return null;
    const packed = fromBase64Url(payload.slice(1));
    const bytes = payload[0] === "z" ? await pipe(packed, new DecompressionStream("deflate-raw")) : payload[0] === "j" ? packed : null;
    if (!bytes) return null;
    const data = JSON.parse(new TextDecoder().decode(bytes)) as { n?: unknown; l?: unknown };
    if (typeof data.n !== "string" || typeof data.l !== "object" || data.l === null) return null;
    return { name: data.n, list: data.l };
  } catch {
    return null;
  }
}

/** Address of the app carrying a playlist. `base` is the address without its `#` part. */
export function shareUrl(base: string, payload: string): string {
  return `${base}#${HASH_KEY}=${payload}`;
}

/** The payload inside `location.hash`, or null when the address carries no playlist. */
export function payloadFromHash(hash: string): string | null {
  const prefix = `#${HASH_KEY}=`;
  return hash.startsWith(prefix) && hash.length > prefix.length ? hash.slice(prefix.length) : null;
}
