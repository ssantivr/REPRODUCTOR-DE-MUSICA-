/**
 * BINARY HEAP (priority queue) stored in an array.
 *
 * The children of the value at position i live at 2i + 1 and 2i + 2, and its
 * parent at (i - 1) / 2. `compare(a, b) > 0` means "a has more priority than
 * b", so the value with the most priority is always at position 0.
 */
export class Heap<T> {
  private readonly items: T[] = [];

  constructor(
    private readonly compare: (a: T, b: T) => number,
    initial: Iterable<T> = [],
  ) {
    this.items.push(...initial);
    // Floyd's heapify: sinking the upper half builds the heap in O(n), not O(n log n)
    for (let index = (this.items.length >> 1) - 1; index >= 0; index--) this.sink(index);
  }

  get size(): number {
    return this.items.length;
  }

  get isEmpty(): boolean {
    return this.items.length === 0;
  }

  /** The value with the most priority, without removing it. O(1) */
  peek(): T | null {
    return this.items[0] ?? null;
  }

  /** Adds a value at the bottom and lets it float to its place. O(log n) */
  push(value: T): void {
    this.items.push(value);
    this.float(this.items.length - 1);
  }

  /** Removes and returns the value with the most priority. O(log n) */
  pop(): T | null {
    if (this.items.length === 0) return null;
    const top = this.items[0];
    const last = this.items.pop() as T;
    if (this.items.length > 0) {
      this.items[0] = last;
      this.sink(0);
    }
    return top;
  }

  private float(index: number): void {
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.compare(this.items[index], this.items[parent]) <= 0) break;
      this.swap(index, parent);
      index = parent;
    }
  }

  private sink(index: number): void {
    const size = this.items.length;
    for (;;) {
      const left = 2 * index + 1;
      const right = left + 1;
      let best = index;
      if (left < size && this.compare(this.items[left], this.items[best]) > 0) best = left;
      if (right < size && this.compare(this.items[right], this.items[best]) > 0) best = right;
      if (best === index) return;
      this.swap(index, best);
      index = best;
    }
  }

  private swap(a: number, b: number): void {
    [this.items[a], this.items[b]] = [this.items[b], this.items[a]];
  }
}

/**
 * The `k` values with the most priority, best first: builds the heap in O(n)
 * and pops k times, O(n + k log n) instead of sorting everything in O(n log n).
 */
export function topK<T>(values: Iterable<T>, k: number, compare: (a: T, b: T) => number): T[] {
  const heap = new Heap(compare, values);
  const result: T[] = [];
  while (result.length < k && !heap.isEmpty) result.push(heap.pop() as T);
  return result;
}
