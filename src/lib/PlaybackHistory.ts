import { DoublyLinkedList } from "./DoublyLinkedList";

export interface HistoryEntry<T> {
  value: T;
  playedAt: number;
}

/**
 * Recently played tracker built on its own doubly linked list.
 * New plays are appended at the tail (O(1)); the oldest entry is dropped from
 * the head (O(1)) once the capacity is exceeded. The "most recent first" view
 * walks backward from the tail through the `prev` pointers.
 */
export class PlaybackHistory<T> {
  private readonly list = new DoublyLinkedList<HistoryEntry<T>>();

  constructor(
    private readonly capacity: number,
    private readonly sameItem: (a: T, b: T) => boolean,
  ) {}

  get size(): number {
    return this.list.length;
  }

  /** Records a play. Replaying the latest item does not create a duplicate entry. */
  record(value: T, playedAt = Date.now()): void {
    const latest = this.list.tail;
    if (latest && this.sameItem(latest.value.value, value)) {
      latest.value = { value, playedAt };
      return;
    }
    this.list.append({ value, playedAt });
    if (this.list.length > this.capacity) this.list.removeAt(0);
  }

  /** Most recent first, following `prev` from the tail. */
  recent(limit = this.capacity): HistoryEntry<T>[] {
    const entries: HistoryEntry<T>[] = [];
    let node = this.list.tail;
    while (node !== null && entries.length < limit) {
      entries.push(node.value);
      node = node.prev;
    }
    return entries;
  }

  clear(): void {
    this.list.clear();
  }
}
