import { hashString } from "./utils";

/**
 * HASH TABLE with separate chaining and string keys.
 * get / set / delete are O(1) on average; the table doubles when the load factor passes 0.75.
 */
export class HashTable<V> {
  private buckets: [key: string, value: V][][];
  size = 0;
  /** Bucket touched by the last get / has / set / delete (-1 before the first one) */
  lastBucket = -1;
  /** How many times the table has doubled */
  resizes = 0;

  constructor(private readonly capacity = 16) {
    this.buckets = Array.from({ length: capacity }, () => []);
  }

  /** Number of buckets right now. */
  get bucketCount(): number {
    return this.buckets.length;
  }

  /** Bucket where a key lives (or would live). */
  bucketIndex(key: string): number {
    return hashString(key) % this.buckets.length;
  }

  /** The keys of every bucket, for drawing the table. O(n) */
  snapshot(): string[][] {
    return this.buckets.map((bucket) => bucket.map((entry) => entry[0]));
  }

  private bucketOf(key: string) {
    this.lastBucket = this.bucketIndex(key);
    return this.buckets[this.lastBucket];
  }

  get(key: string): V | undefined {
    for (const entry of this.bucketOf(key)) {
      if (entry[0] === key) return entry[1];
    }
    return undefined;
  }

  has(key: string): boolean {
    return this.bucketOf(key).some((entry) => entry[0] === key);
  }

  set(key: string, value: V): void {
    const bucket = this.bucketOf(key);
    for (const entry of bucket) {
      if (entry[0] === key) {
        entry[1] = value;
        return;
      }
    }
    bucket.push([key, value]);
    this.size++;
    if (this.size > this.buckets.length * 0.75) this.resize();
  }

  /** Removes a key. Returns false when it was not in the table. */
  delete(key: string): boolean {
    const bucket = this.bucketOf(key);
    const at = bucket.findIndex((entry) => entry[0] === key);
    if (at < 0) return false;
    // Order inside a bucket does not matter: the last entry takes the free place
    bucket[at] = bucket[bucket.length - 1];
    bucket.pop();
    this.size--;
    return true;
  }

  clear(): void {
    this.buckets = Array.from({ length: this.capacity }, () => []);
    this.size = 0;
  }

  private resize(): void {
    const old = this.buckets;
    this.buckets = Array.from({ length: old.length * 2 }, () => []);
    this.resizes++;
    for (const bucket of old) {
      for (const entry of bucket) this.buckets[this.bucketIndex(entry[0])].push(entry);
    }
  }
}
