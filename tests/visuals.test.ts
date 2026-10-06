import { describe, expect, it } from "vitest";
import { AvlTree, type AvlSnapshot } from "../src/lib/AvlTree";
import { DoublyLinkedList } from "../src/lib/DoublyLinkedList";
import { HashTable } from "../src/lib/HashTable";
import { Heap } from "../src/lib/Heap";
import { insertSteps, moveSteps, removeSteps, type PointerFrame } from "../src/lib/pointerSteps";
import { decodeGalaxy, encodeGalaxy, payloadFromHash, shareUrl } from "../src/lib/shareLink";
import { Trie } from "../src/lib/Trie";
import { CATALOG } from "../src/lib/catalog";
import { mulberry32 } from "../src/lib/utils";

/** Labels of a frame following `next` from the head, after checking that `prev` mirrors it. */
function walk(frame: PointerFrame): string[] {
  const byId = new Map(frame.nodes.map((node) => [node.id, node]));
  const labels: string[] = [];
  let previous: string | null = null;
  for (let id = frame.head; id !== null; id = byId.get(id)?.next ?? null) {
    const node = byId.get(id);
    if (!node) throw new Error(`Dangling pointer to ${id}`);
    expect(node.prev).toBe(previous);
    labels.push(node.label);
    previous = id;
    if (labels.length > frame.nodes.length) throw new Error("Cycle");
  }
  expect(frame.tail).toBe(previous);
  return labels;
}

describe("pointerSteps", () => {
  const labels = ["a", "b", "c", "d", "e"];

  it("ends every operation exactly like the real list", () => {
    for (let i = 0; i <= labels.length; i++) {
      const list = new DoublyLinkedList(labels);
      list.insertAt(i, "x");
      const frames = insertSteps(labels, i, "x");
      expect(walk(frames[frames.length - 1])).toEqual(list.toArray());
    }
    for (let i = 0; i < labels.length; i++) {
      const list = new DoublyLinkedList(labels);
      list.removeAt(i);
      const frames = removeSteps(labels, i);
      expect(walk(frames[frames.length - 1])).toEqual(list.toArray());
      expect(frames[frames.length - 1].nodes).toHaveLength(labels.length - 1);
    }
    for (let from = 0; from < labels.length; from++) {
      for (let to = 0; to < labels.length; to++) {
        const list = new DoublyLinkedList(labels);
        list.move(from, to);
        const frames = moveSteps(labels, from, to);
        expect(walk(frames[frames.length - 1])).toEqual(list.toArray());
      }
    }
  });

  it("changes at most two pointers per step and explains each one", () => {
    const scripts = [insertSteps(labels, 2, "x"), insertSteps([], 0, "x"), removeSteps(labels, 0), removeSteps(["a"], 0), moveSteps(labels, 0, 4), moveSteps(labels, 3, 1)];
    for (const frames of scripts) {
      expect(frames.length).toBeGreaterThan(1);
      for (const frame of frames) {
        expect(frame.changed.length).toBeLessThanOrEqual(2);
        expect(frame.note.length).toBeGreaterThan(0);
      }
    }
    // A middle insertion is the textbook four pointers
    const changed = insertSteps(labels, 2, "x").flatMap((frame) => frame.changed);
    expect(changed).toEqual(["new:prev", "new:next", "n1:next", "n2:prev"]);
  });
});

describe("structure snapshots", () => {
  it("AvlTree reports its rotations and a snapshot that matches its shape", () => {
    const tree = new AvlTree<number>();
    const rotations: string[] = [];
    tree.onRotate = (direction, key) => rotations.push(`${direction}:${key}`);
    [10, 20, 30].forEach((key) => tree.insert(key, key));
    // 10 → 20 → 30 leans right: one left rotation on 10 puts 20 at the root
    expect(rotations).toEqual(["left:10"]);
    expect(tree.snapshot()).toMatchObject({ key: 20, balance: 0, left: { key: 10 }, right: { key: 30 } });

    rotations.length = 0;
    [5, 7].forEach((key) => tree.insert(key, key));
    // 10 → 5 → 7 is the left-right case: two rotations
    expect(rotations).toEqual(["left:5", "right:10"]);

    const count = (node: AvlSnapshot | null): number => (node ? 1 + count(node.left) + count(node.right) : 0);
    const random = mulberry32(7);
    for (let i = 0; i < 300; i++) tree.insert(Math.floor(random() * 500), i);
    expect(count(tree.snapshot())).toBe(tree.size);
    expect(tree.snapshot()?.height).toBe(tree.height);
    expect(tree.isBalanced()).toBe(true);
    expect(new AvlTree<number>().snapshot()).toBeNull();
  });

  it("HashTable exposes its buckets and counts every doubling", () => {
    const table = new HashTable<number>(4);
    expect(table.lastBucket).toBe(-1);
    for (let i = 0; i < 40; i++) table.set(`key-${i}`, i);
    expect(table.bucketCount).toBe(64);
    expect(table.resizes).toBe(4);
    const buckets = table.snapshot();
    expect(buckets.flat().sort()).toEqual(Array.from({ length: 40 }, (_, i) => `key-${i}`).sort());
    buckets.forEach((bucket, index) => bucket.forEach((key) => expect(table.bucketIndex(key)).toBe(index)));
    table.get("key-7");
    expect(table.lastBucket).toBe(table.bucketIndex("key-7"));
  });

  it("Heap reports the swaps of a pop, and replaying them gives the same array", () => {
    const random = mulberry32(11);
    const values = Array.from({ length: 40 }, () => Math.floor(random() * 1000));
    const compare = (a: number, b: number) => a - b;
    const heap = new Heap(compare, values);
    const mirror = heap.toArray();
    expect(mirror[0]).toBe(Math.max(...values));

    const last = mirror.pop() as number;
    mirror[0] = last;
    heap.onSwap = (a, b) => {
      [mirror[a], mirror[b]] = [mirror[b], mirror[a]];
    };
    heap.pop();
    expect(mirror).toEqual(heap.toArray());
  });

  it("Trie traces a prefix character by character", () => {
    const trie = new Trie<string>();
    ["sol", "sola", "sur"].forEach((word) => trie.insert(word, word));
    expect(trie.trace("sol")).toEqual([
      { character: "s", found: true, branches: 2, ends: 0 },
      { character: "o", found: true, branches: 1, ends: 0 },
      { character: "l", found: true, branches: 1, ends: 1 },
    ]);
    expect(trie.trace("sox").map((step) => step.found)).toEqual([true, true, false]);
    // Once the path breaks it stays broken, even if a later character exists elsewhere
    expect(trie.trace("xol").map((step) => step.found)).toEqual([false, false, false]);
    expect(trie.trace("")).toEqual([]);
  });
});

describe("shareLink", () => {
  const list = { version: 1 as const, circular: true, currentIndex: 2, items: CATALOG.slice(0, 12).map((song) => ({ ...song, previewUrl: "https://example.com/a.m4a", artworkUrl: "https://example.com/a.jpg" })) };

  it("round-trips a playlist through an address", async () => {
    const payload = await encodeGalaxy("Mi galaxia ñ", list);
    expect(payload).toMatch(/^[zj][A-Za-z0-9_-]+$/);
    const url = shareUrl("https://example.com/", payload);
    const shared = await decodeGalaxy(payloadFromHash(new URL(url).hash) as string);
    expect(shared?.name).toBe("Mi galaxia ñ");
    const restored = shared?.list as typeof list;
    expect(restored.currentIndex).toBe(2);
    expect(restored.items.map((song) => song.id)).toEqual(list.items.map((song) => song.id));
    // The long media addresses stay out of the link
    expect(restored.items.every((song) => song.previewUrl === undefined && song.artworkUrl === undefined)).toBe(true);
  });

  it("rejects anything that is not a shared playlist", async () => {
    expect(await decodeGalaxy("")).toBeNull();
    expect(await decodeGalaxy("zno-es-base64!!")).toBeNull();
    expect(await decodeGalaxy("zAAAA")).toBeNull();
    expect(await decodeGalaxy(`j${btoa(JSON.stringify({ n: 3, l: {} }))}`)).toBeNull();
    expect(await decodeGalaxy(`z${"A".repeat(30_000)}`)).toBeNull();
    expect(payloadFromHash("#otra=cosa")).toBeNull();
    expect(payloadFromHash("#galaxia=")).toBeNull();
  });
});
