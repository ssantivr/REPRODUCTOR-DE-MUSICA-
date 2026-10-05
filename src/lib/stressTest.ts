import { DoublyLinkedList } from "./DoublyLinkedList";
import { instrumentList, type ListMetrics } from "./ListMetrics";

export interface StressReport {
  size: number;
  removed: number;
  remaining: number;
  appendMs: number;
  shuffleMs: number;
  traverseMs: number;
  removeMs: number;
  totalMs: number;
  /** True when every `prev` / `next` check passed */
  pointersOk: boolean;
}

/** Walking backward through `prev` must mirror walking forward through `next`. */
export function verifyPointers<T>(list: DoublyLinkedList<T>): boolean {
  const forward = list.toArray();
  const backward = list.toArrayReverse();
  if (forward.length !== list.length || backward.length !== list.length) return false;
  for (let i = 0; i < forward.length; i++) {
    if (forward[i] !== backward[forward.length - 1 - i]) return false;
  }
  if (list.head === null || list.tail === null) return list.length === 0 && list.head === list.tail;
  return list.circular
    ? list.tail.next === list.head && list.head.prev === list.tail
    : list.tail.next === null && list.head.prev === null;
}

const timed = (run: () => void): number => {
  const start = performance.now();
  run();
  return performance.now() - start;
};

/**
 * Stress test on a throwaway list (the playlist is never touched):
 * mass insertion, shuffle, full traversal and random removals, checking the
 * `prev` / `next` chain after every phase.
 */
export function runStressTest(size = 500, metrics?: ListMetrics, random: () => number = Math.random): StressReport {
  const list = new DoublyLinkedList<number>();
  if (metrics) instrumentList(list, metrics);
  let pointersOk = true;

  const appendMs = timed(() => {
    for (let i = 0; i < size; i++) list.append(i);
  });
  pointersOk &&= verifyPointers(list);

  const shuffleMs = timed(() => list.shuffle(random));
  pointersOk &&= verifyPointers(list);

  const traverseMs = timed(() => {
    // Native iteration: every value must still be there exactly once
    let checksum = 0;
    for (const value of list) checksum += value;
    if (checksum !== (size * (size - 1)) / 2) pointersOk = false;
    for (let i = 0; i < size; i++) {
      if (list.traverseToIndex(i) === null) pointersOk = false;
    }
  });

  // Removals run in circular mode, where a broken link would loop forever
  list.setCircular(true);
  const removed = Math.floor(size / 2);
  let removeMs = 0;
  for (let i = 0; i < removed; i++) {
    removeMs += timed(() => {
      if (list.removeAt(Math.floor(random() * list.length)) === null) pointersOk = false;
    });
    if (i % 25 === 0) pointersOk &&= verifyPointers(list);
  }
  pointersOk &&= verifyPointers(list);
  list.setCircular(false);
  pointersOk &&= verifyPointers(list) && list.length === size - removed;

  return {
    size,
    removed,
    remaining: list.length,
    appendMs,
    shuffleMs,
    traverseMs,
    removeMs,
    totalMs: appendMs + shuffleMs + traverseMs + removeMs,
    pointersOk,
  };
}
