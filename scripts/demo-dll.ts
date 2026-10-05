/**
 * Console checks for the doubly linked list and the playback history.
 * Run with:  npm run demo:dll
 */
import { DoublyLinkedList } from "../src/lib/DoublyLinkedList";
import { Heap, topK } from "../src/lib/Heap";
import { ListMetrics, MEASURED_OPERATIONS, THEORETICAL_COMPLEXITY } from "../src/lib/ListMetrics";
import { BinarySearchTree, HashTable, MusicIndex } from "../src/lib/MusicIndex";
import { activeLineIndex, parseLrc } from "../src/lib/lyrics";
import { PlaybackHistory } from "../src/lib/PlaybackHistory";
import { Queue } from "../src/lib/Queue";
import { Stack } from "../src/lib/Stack";
import { CATALOG } from "../src/lib/catalog";
import { DEFAULT_FILTER, matchesFilter, type SpatialFilter } from "../src/lib/spatialFilter";
import { runStressTest } from "../src/lib/stressTest";
import { mulberry32 } from "../src/lib/utils";

let failures = 0;

function check(description: string, condition: boolean) {
  console.log(`${condition ? "✔" : "✘"} ${description}`);
  if (!condition) failures++;
}

/** Walking backward through `prev` must mirror walking forward through `next`. */
function checkPointers(list: DoublyLinkedList<string>, label = "pointers are consistent") {
  const forward = list.toArray();
  const backward = list.toArrayReverse().reverse();
  const endsOk = list.circular
    ? list.length === 0 || (list.tail?.next === list.head && list.head?.prev === list.tail)
    : list.length === 0 || (list.tail?.next === null && list.head?.prev === null);
  check(
    `${label} (${forward.join(", ") || "empty"})`,
    JSON.stringify(forward) === JSON.stringify(backward) && forward.length === list.length && endsOk,
  );
}

const playlist = new DoublyLinkedList<string>();

console.log("\n== append / prepend / insertAt ==");
playlist.append("Blinding Lights");
playlist.append("Bohemian Rhapsody");
playlist.append("Despacito");
playlist.prepend("Take Five");
playlist.insertAt(2, "Get Lucky");
playlist.insertAt(0, "Clair de Lune");
playlist.insertAt(99, "Weightless");
playlist.printList();
check("length = 7", playlist.length === 7);
check('head = "Clair de Lune" and tail = "Weightless"', playlist.head?.value === "Clair de Lune" && playlist.tail?.value === "Weightless");
check('index 3 = "Get Lucky"', playlist.traverseToIndex(3)?.value === "Get Lucky");
checkPointers(playlist);

console.log("\n== traverseToIndex (both directions) ==");
playlist.traverseToIndex(1);
check("index 1 is reached from the head", playlist.lastTraversal?.from === "head");
playlist.traverseToIndex(6);
check("index 6 is reached from the tail in 0 steps", playlist.lastTraversal?.from === "tail" && playlist.lastTraversal.steps === 0);
check("out of range → null", playlist.traverseToIndex(42) === null && playlist.traverseToIndex(-1) === null);

console.log("\n== removeAt ==");
check('removeAt(0) returns "Clair de Lune"', playlist.removeAt(0) === "Clair de Lune");
check('removeAt(last) returns "Weightless"', playlist.removeAt(playlist.length - 1) === "Weightless");
check('removeAt(2) returns "Get Lucky"', playlist.removeAt(2) === "Get Lucky");
check("removeAt(invalid) → null", playlist.removeAt(10) === null);
checkPointers(playlist);

console.log("\n== next / prev (linear) ==");
playlist.moveTo(0);
check('next() → "Blinding Lights"', playlist.next()?.value === "Blinding Lights");
check('prev() → "Take Five"', playlist.prev()?.value === "Take Five");
check("prev() at the head → null (cursor stays)", playlist.prev() === null && playlist.current?.value === "Take Five");
playlist.moveTo(playlist.length - 1);
check("next() at the tail → null", playlist.next() === null);

console.log("\n== loop / circular mode ==");
playlist.setCircular(true);
checkPointers(playlist, "tail.next = head and head.prev = tail");
check('next() at the tail wraps to the head ("Take Five")', playlist.next()?.value === "Take Five");
check('prev() at the head wraps to the tail ("Despacito")', playlist.prev()?.value === "Despacito");
playlist.append("Levitating");
playlist.prepend("Faded");
checkPointers(playlist, "circular links survive append / prepend");
playlist.removeAt(0);
playlist.removeAt(playlist.length - 1);
checkPointers(playlist, "circular links survive removing head and tail");
check("printList terminates in circular mode", playlist.printList().includes("TAIL"));
playlist.setCircular(false);
checkPointers(playlist, "ends point to null again");

console.log("\n== shuffle (pointer reassignment) ==");
const before = playlist.toArray();
const cursorBefore = playlist.moveTo(1);
playlist.shuffle(mulberry32(7));
playlist.printList();
check("same values after shuffle", [...playlist.toArray()].sort().join() === [...before].sort().join());
check("the cursor keeps pointing to the same node", playlist.current === cursorBefore);
checkPointers(playlist, "chain is intact after shuffle");
playlist.setCircular(true);
playlist.shuffle(mulberry32(3));
checkPointers(playlist, "circular chain is intact after shuffle");
const jumped = playlist.jumpRandom(mulberry32(1));
check("jumpRandom lands on a different node", jumped !== null && jumped !== cursorBefore);

console.log("\n== move (reorder by relinking) ==");
const order = new DoublyLinkedList(["A", "B", "C", "D", "E"]);
const nodeB = order.moveTo(1);
check("move(1, 3) → A, C, D, B, E", order.move(1, 3) && order.toArray().join() === "A,C,D,B,E");
check("no node is created: the cursor still points to the moved node", order.current === nodeB && order.length === 5);
checkPointers(order, "chain is intact after moving forward");
check("move(3, 0) puts it first → B, A, C, D, E", order.move(3, 0) && order.head === nodeB && order.toArray().join() === "B,A,C,D,E");
check("move(0, 4) puts it last → A, C, D, E, B", order.move(0, 4) && order.tail === nodeB && order.toArray().join() === "A,C,D,E,B");
checkPointers(order, "chain is intact after moving to both ends");
check("invalid positions are rejected and change nothing", !order.move(9, 0) && !order.move(0, 5) && !order.move(-1, 2) && order.toArray().join() === "A,C,D,E,B");
order.setCircular(true);
check("move works in circular mode → B, A, C, D, E", order.move(4, 0) && order.toArray().join() === "B,A,C,D,E");
checkPointers(order, "circular links survive a move");

console.log("\n== JSON export / import ==");
const snapshot = JSON.parse(JSON.stringify(playlist.toJSON()));
const rebuilt = DoublyLinkedList.fromJSON<string>(snapshot, (raw) => (typeof raw === "string" ? raw : null));
check("same order after import", rebuilt.toArray().join() === playlist.toArray().join());
check("cursor restored", rebuilt.current?.value === playlist.current?.value);
check("circular mode restored", rebuilt.circular && rebuilt.tail?.next === rebuilt.head);
const partial = DoublyLinkedList.fromJSON<string>({ ...snapshot, items: ["A", 42, "B"] }, (raw) => (typeof raw === "string" ? raw : null));
check("invalid items are skipped", partial.toArray().join() === "A,B");
let rejected = false;
try {
  DoublyLinkedList.fromJSON({ nope: true }, () => null);
} catch {
  rejected = true;
}
check("malformed snapshot is rejected", rejected);

console.log("\n== playback history (prev pointers) ==");
const history = new PlaybackHistory<string>(3, (a, b) => a === b);
["A", "B", "B", "C", "D"].forEach((item, i) => history.record(item, i));
check("repeated play is not duplicated and capacity is 3", history.size === 3);
check("most recent first: D, C, B", history.recent().map((entry) => entry.value).join() === "D,C,B");

console.log("\n== native iteration (Symbol.iterator) ==");
const iterable = new DoublyLinkedList(["A", "B", "C"]);
const collected: string[] = [];
for (const value of iterable) collected.push(value);
const [first, ...rest] = iterable;
check("for...of walks head → tail", collected.join() === "A,B,C");
check("destructuring and spread work", first === "A" && rest.join() === "B,C" && [...iterable].length === 3);
iterable.setCircular(true);
check("iteration terminates in circular mode", [...iterable].join() === "A,B,C");

console.log("\n== stress test (500 nodes) + live metrics ==");
const metrics = new ListMetrics();
const report = runStressTest(500, metrics, mulberry32(42));
for (const operation of MEASURED_OPERATIONS) {
  const stats = metrics.get(operation);
  console.log(
    `  ${operation.padEnd(16)} ${THEORETICAL_COMPLEXITY[operation].padEnd(7)} calls=${String(stats.calls).padEnd(5)} avg=${(stats.totalMs / stats.calls).toFixed(4)} ms  max=${stats.maxMs.toFixed(4)} ms`,
  );
}
console.log(`  total ${report.totalMs.toFixed(2)} ms (append ${report.appendMs.toFixed(2)}, shuffle ${report.shuffleMs.toFixed(2)}, traverse ${report.traverseMs.toFixed(2)}, remove ${report.removeMs.toFixed(2)})`);
check("500 nodes inserted, 250 removed, 250 remain", report.size === 500 && report.removed === 250 && report.remaining === 250);
check("prev / next chain intact after every phase", report.pointersOk);
check("metrics counted every call", metrics.get("append").calls === 500 && metrics.get("removeAt").calls === 250 && metrics.get("shuffle").calls === 1);

console.log("\n== stack (LIFO, undo / redo) ==");
const stack = new Stack<string>(3);
check("empty stack: pop and peek → null", stack.pop() === null && stack.peek() === null && stack.isEmpty);
["a", "b", "c", "d"].forEach((item) => stack.push(item));
check("capacity 3 drops the oldest entry", stack.size === 3 && stack.toArray().join() === "d,c,b");
check("pop returns the last pushed value", stack.pop() === "d" && stack.peek() === "c" && stack.size === 2);
const undoStack = new Stack<string[]>();
const redoStack = new Stack<string[]>();
let state = ["x"];
undoStack.push(state);
state = ["x", "y"];
redoStack.push(state);
state = undoStack.pop() ?? state;
check("undo restores the previous state", state.join() === "x");
undoStack.push(state);
state = redoStack.pop() ?? state;
check("redo re-applies the change", state.join() === "x,y" && redoStack.isEmpty);

console.log("\n== queue (FIFO, play next) ==");
const queue = new Queue<string>();
check("empty queue: dequeue and peek → null", queue.dequeue() === null && queue.peek() === null && queue.isEmpty);
["a", "b", "c", "d"].forEach((item) => queue.enqueue(item));
check("first in, first out", queue.peek() === "a" && queue.dequeue() === "a" && queue.dequeue() === "b" && queue.size === 2);
queue.enqueue("e");
check("removeAt takes a value out before its turn", queue.removeAt(1) === "d" && queue.toArray().join() === "c,e");
queue.enqueue("f");
queue.retain((item) => item !== "e");
check("retain drops values and keeps the order of the rest", queue.toArray().join() === "c,f");

console.log("\n== heap (priority queue, most played) ==");
const heap = new Heap<number>((a, b) => a - b, [5, 1, 9, 3, 7]);
check("the biggest value is on top", heap.peek() === 9 && heap.size === 5);
heap.push(12);
heap.push(4);
const drained: number[] = [];
while (!heap.isEmpty) drained.push(heap.pop() as number);
check("pop returns the values from biggest to smallest", drained.join() === "12,9,7,5,4,3,1" && heap.pop() === null);
const randomValues = Array.from({ length: 200 }, (_, i) => (i * 7919) % 1009);
check(
  "topK matches sorting everything",
  topK(randomValues, 5, (a, b) => a - b).join() === [...randomValues].sort((a, b) => b - a).slice(0, 5).join(),
);
check("topK with fewer values than k returns them all", topK([2, 8], 5, (a, b) => a - b).join() === "8,2");

console.log("\n== synced lyrics (LRC) ==");
const lrc = parseLrc("[00:12.50] second\n[00:05.00] first\nno timestamp\n[01:02.00]\n[01:10.25] last");
check("lines are parsed and sorted by time", lrc.map((line) => line.time).join() === "5,12.5,62,70.25" && lrc[0].text === "first" && lrc[2].text === "");
check(
  "the active line is found by binary search",
  activeLineIndex(lrc, 0) === -1 && activeLineIndex(lrc, 5) === 0 && activeLineIndex(lrc, 61.9) === 1 && activeLineIndex(lrc, 999) === 3,
);

console.log("\n== secondary index (hash table + BST) ==");
const table = new HashTable<number>(2);
for (let i = 0; i < 100; i++) table.set(`key-${i}`, i);
table.set("key-7", 700);
check("hash table survives resizing and overwrites", table.size === 100 && table.get("key-7") === 700 && table.get("key-99") === 99 && table.get("nope") === undefined);
const tree = new BinarySearchTree<string>();
tree.insertSorted([[60, "a"], [90, "b"], [90, "c"], [120, "d"], [180, "e"]]);
// Values sharing a key (b and c at 90) keep no particular order between themselves
check("BST range query is inclusive", tree.range(90, 120).sort().join() === "b,c,d" && tree.range(61, 89).length === 0 && tree.range(181, 300).length === 0);
check("BST range query returns keys in ascending order", tree.range(0, 300).join().replace("c,b", "b,c") === "a,b,c,d,e");
const index = new MusicIndex(CATALOG);
check("byGenre matches a full scan", index.byGenre("rock").length === CATALOG.filter((song) => song.genre === "rock").length);
check("byArtist ignores case and accents", index.byArtist("QUEEN").some((song) => song.id === "bohemian-rhapsody") && index.byArtist("nobody").length === 0);
const filters: SpatialFilter[] = [
  DEFAULT_FILTER,
  { genres: ["rock", "pop"], energy: [0.3, 0.9], tempo: [80, 140] },
  { genres: [], energy: [0, 0.5], tempo: [60, 100] },
  { genres: [], energy: [0.5, 1], tempo: [170, 180] },
  { genres: ["jazz"], energy: [0, 1], tempo: [60, 60] },
];
check(
  "index filter returns exactly what a full scan returns",
  filters.every((filter) => {
    const expected = CATALOG.filter((song) => matchesFilter(song, filter));
    const actual = index.filter(filter);
    return actual.size === expected.length && expected.every((song) => actual.has(song));
  }),
);

console.log("\n== empty the list ==");
while (playlist.length > 0) playlist.removeAt(0);
check("head, tail and cursor are null", playlist.head === null && playlist.tail === null && playlist.current === null);

console.log(failures === 0 ? "\nAll checks passed ✔" : `\n${failures} check(s) failed ✘`);
process.exit(failures === 0 ? 0 : 1);
