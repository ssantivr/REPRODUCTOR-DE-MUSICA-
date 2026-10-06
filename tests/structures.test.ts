import { describe, expect, it } from "vitest";
import { AvlTree } from "../src/lib/AvlTree";
import { DoublyLinkedList } from "../src/lib/DoublyLinkedList";
import { HashTable } from "../src/lib/HashTable";
import { Heap, topK } from "../src/lib/Heap";
import { MusicIndex } from "../src/lib/MusicIndex";
import { Queue } from "../src/lib/Queue";
import { SuggestionIndex } from "../src/lib/search/suggestions";
import { Stack } from "../src/lib/Stack";
import { Trie } from "../src/lib/Trie";
import { CATALOG } from "../src/lib/catalog";
import { DEFAULT_FILTER, matchesFilter } from "../src/lib/spatialFilter";
import { verifyPointers } from "../src/lib/stressTest";
import { mulberry32 } from "../src/lib/utils";

/**
 * Model-based tests: each structure runs hundreds of random operations next to
 * a plain array / Map doing the same, and both must agree after every step.
 * The generator is seeded, so a failure always reproduces.
 */
const pick = (random: () => number, size: number) => Math.floor(random() * size);

describe("DoublyLinkedList", () => {
  it.each([false, true])("matches an array under random operations (circular: %s)", (circular) => {
    const random = mulberry32(circular ? 11 : 7);
    const list = new DoublyLinkedList<number>();
    list.setCircular(circular);
    const model: number[] = [];

    for (let step = 0; step < 600; step++) {
      const action = pick(random, 7);
      const at = pick(random, model.length + 1);
      if (action === 0) {
        list.append(step);
        model.push(step);
      } else if (action === 1) {
        list.prepend(step);
        model.unshift(step);
      } else if (action === 2) {
        list.insertAt(at, step);
        model.splice(at, 0, step);
      } else if (action === 3 && model.length > 0) {
        const index = pick(random, model.length);
        expect(list.removeAt(index)).toBe(model.splice(index, 1)[0]);
      } else if (action === 4 && model.length > 0) {
        const index = pick(random, model.length);
        const node = list.traverseToIndex(index);
        expect(node && list.removeNode(node)).toBe(model.splice(index, 1)[0]);
      } else if (action === 5 && model.length > 0) {
        const index = pick(random, model.length);
        const node = list.traverseToIndex(index);
        if (node) list.insertAfter(node, step);
        model.splice(index + 1, 0, step);
      } else if (action === 6 && model.length > 1) {
        const from = pick(random, model.length);
        const to = pick(random, model.length);
        expect(list.move(from, to)).toBe(true);
        model.splice(to, 0, model.splice(from, 1)[0]);
      }
      expect(list.toArray()).toEqual(model);
      expect(verifyPointers(list)).toBe(true);
      // The cursor never points outside the list
      expect(list.current === null).toBe(model.length === 0);
    }
  });

  it("removeNode and insertAfter never walk the list", () => {
    const list = new DoublyLinkedList(Array.from({ length: 100 }, (_, i) => i));
    const middle = list.traverseToIndex(50);
    list.lastTraversal = null;
    expect(middle && list.removeNode(middle)).toBe(50);
    expect(middle && list.removeNode(middle)).toBeNull();
    if (list.head) list.insertAfter(list.head, -1);
    expect(list.lastTraversal).toBeNull();
    expect(list.length).toBe(100);
    expect(list.traverseToIndex(1)?.value).toBe(-1);
  });

  it("removing the current node moves the cursor to a neighbor", () => {
    const list = new DoublyLinkedList(["A", "B", "C"]);
    const last = list.moveTo(2);
    if (last) list.removeNode(last);
    expect(list.current?.value).toBe("B");
  });

  it("jumpRandom visits every eligible node exactly once per round", () => {
    const list = new DoublyLinkedList(["A", "B", "C", "D", "E"]);
    const random = mulberry32(3);
    const played = new Set<string>([list.current?.value ?? ""]);
    for (let jump = 0; jump < 4; jump++) {
      const node = list.jumpRandom(random, (value) => !played.has(value));
      expect(node).not.toBeNull();
      played.add(node?.value ?? "");
    }
    expect(played.size).toBe(5);
    const stay = list.current;
    expect(list.jumpRandom(random, (value) => !played.has(value))).toBeNull();
    expect(list.current).toBe(stay);
  });
});

describe("Stack and Queue", () => {
  it("the stack is LIFO and drops the oldest entry when full", () => {
    const stack = new Stack<number>(3);
    [1, 2, 3, 4].forEach((value) => stack.push(value));
    expect(stack.toArray()).toEqual([4, 3, 2]);
    expect(stack.pop()).toBe(4);
    expect(stack.peek()).toBe(3);
  });

  it("retain keeps the order and matches Array.filter", () => {
    const random = mulberry32(21);
    const values = Array.from({ length: 300 }, () => pick(random, 50));
    const queue = new Queue<number>();
    values.forEach((value) => queue.enqueue(value));
    queue.retain((value) => value % 3 !== 0);
    expect(queue.toArray()).toEqual(values.filter((value) => value % 3 !== 0));
    queue.retain(() => false);
    expect(queue.isEmpty).toBe(true);
    expect(queue.dequeue()).toBeNull();
  });

  it("retain is linear: 20 000 values finish at once", () => {
    const queue = new Queue<number>();
    for (let value = 0; value < 20_000; value++) queue.enqueue(value);
    const start = performance.now();
    queue.retain((value) => value % 2 === 0);
    // The quadratic version needed about 100 million pointer steps here
    expect(performance.now() - start).toBeLessThan(500);
    expect(queue.size).toBe(10_000);
  });
});

describe("HashTable", () => {
  it("matches a Map under random set / delete", () => {
    const random = mulberry32(5);
    const table = new HashTable<number>(2);
    const model = new Map<string, number>();
    for (let step = 0; step < 2000; step++) {
      const key = `key-${pick(random, 300)}`;
      if (random() < 0.6) {
        table.set(key, step);
        model.set(key, step);
      } else {
        expect(table.delete(key)).toBe(model.delete(key));
      }
      expect(table.size).toBe(model.size);
    }
    model.forEach((value, key) => expect(table.get(key)).toBe(value));
    expect(table.has("never")).toBe(false);
    table.clear();
    expect(table.size).toBe(0);
    expect(table.get("key-1")).toBeUndefined();
  });
});

describe("AvlTree", () => {
  it("stays balanced and matches a sorted array under random inserts and removals", () => {
    const random = mulberry32(13);
    const tree = new AvlTree<string>();
    const model: [key: number, value: string][] = [];

    for (let step = 0; step < 1500; step++) {
      if (model.length === 0 || random() < 0.6) {
        const entry: [number, string] = [pick(random, 200), `v${step}`];
        tree.insert(entry[0], entry[1]);
        model.push(entry);
      } else {
        const [key, value] = model.splice(pick(random, model.length), 1)[0];
        expect(tree.remove(key, value)).toBe(true);
      }
      if (step % 50 === 0) expect(tree.isBalanced()).toBe(true);
    }

    expect(tree.isBalanced()).toBe(true);
    expect(tree.size).toBe(new Set(model.map(([key]) => key)).size);
    const inRange = model.filter(([key]) => key >= 40 && key <= 120);
    expect(tree.range(40, 120).sort()).toEqual(inRange.map(([, value]) => value).sort());
    // Ascending key order
    const keys = tree.range(-Infinity, Infinity).map((value) => model.find((entry) => entry[1] === value)?.[0] ?? -1);
    expect(keys).toEqual([...keys].sort((a, b) => a - b));
  });

  it("keys arriving in order do not degrade into a chain", () => {
    const tree = new AvlTree<number>();
    for (let key = 0; key < 4096; key++) tree.insert(key, key);
    // A perfectly balanced tree of 4096 keys has 13 levels; AVL allows at most ~1.44 times that
    expect(tree.height).toBeLessThanOrEqual(13);
    expect(tree.isBalanced()).toBe(true);
  });
});

describe("Heap", () => {
  it("topK matches sorting everything", () => {
    const random = mulberry32(17);
    const values = Array.from({ length: 500 }, () => pick(random, 10_000));
    const byNumber = (a: number, b: number) => a - b;
    expect(topK(values, 10, byNumber)).toEqual([...values].sort((a, b) => b - a).slice(0, 10));
    const heap = new Heap<number>(byNumber);
    values.forEach((value) => heap.push(value));
    expect(heap.pop()).toBe(Math.max(...values));
  });
});

describe("Trie and suggestions", () => {
  it("startsWith finds exactly the words under a prefix", () => {
    const words = ["sol", "sola", "solar", "soledad", "sombra", "luna", "lunar"];
    const trie = new Trie<string>();
    words.forEach((word) => trie.insert(word, word));
    for (const prefix of ["", "s", "so", "sol", "sola", "lun", "x", "solarium"]) {
      expect(trie.startsWith(prefix).sort()).toEqual(words.filter((word) => word.startsWith(prefix)).sort());
    }
    expect(trie.startsWith("sol")[0]).toBe("sol");
    expect(trie.startsWith("s", 3)).toHaveLength(3);
  });

  it("suggests songs and artists from any word, without accents or case", () => {
    const index = new SuggestionIndex(CATALOG);
    expect(index.suggest("rhaps").map((item) => item.text)).toContain("Bohemian Rhapsody");
    expect(index.suggest("ÁFRICA").map((item) => item.text)).toContain("Waka Waka (Esto es África)");
    expect(index.suggest("que").some((item) => item.kind === "artist" && item.text === "Queen")).toBe(true);
    expect(index.suggest("q")).toEqual([]);
    expect(index.suggest("the", 3)).toHaveLength(3);
  });

  it("learning the same song twice adds nothing", () => {
    const index = new SuggestionIndex(CATALOG);
    const before = index.size;
    CATALOG.forEach((song) => index.add(song));
    expect(index.size).toBe(before);
  });
});

describe("MusicIndex", () => {
  it("following the list change by change equals rebuilding", () => {
    const random = mulberry32(29);
    const index = new MusicIndex(CATALOG.slice(0, 10));
    for (let round = 0; round < 40; round++) {
      const songs = CATALOG.filter(() => random() < 0.5);
      index.sync(songs);
      expect(index.size).toBe(songs.length);
      for (const filter of [DEFAULT_FILTER, { genres: ["rock" as const, "pop" as const], energy: [0.3, 0.9] as [number, number], tempo: [80, 140] as [number, number] }]) {
        expect(Array.from(index.filter(filter)).sort((a, b) => a.id.localeCompare(b.id))).toEqual(
          songs.filter((song) => matchesFilter(song, filter)).sort((a, b) => a.id.localeCompare(b.id)),
        );
      }
    }
    expect(index.sync(CATALOG)).toBeGreaterThan(0);
    expect(index.sync(CATALOG)).toBe(0);
  });
});
