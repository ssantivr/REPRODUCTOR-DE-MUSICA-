import { DoublyLinkedList } from "./DoublyLinkedList";

/**
 * QUEUE (FIFO) built on the doubly linked list: values enter at the tail and
 * leave from the head. enqueue / dequeue / peek are O(1) thanks to both end
 * pointers.
 */
export class Queue<T> {
  private readonly items = new DoublyLinkedList<T>();

  get size(): number {
    return this.items.length;
  }

  get isEmpty(): boolean {
    return this.items.length === 0;
  }

  /** Adds a value at the back. */
  enqueue(value: T): void {
    this.items.append(value);
  }

  /** Removes and returns the value at the front, or null when the queue is empty. */
  dequeue(): T | null {
    return this.items.removeAt(0);
  }

  peek(): T | null {
    return this.items.head?.value ?? null;
  }

  /** Takes a value out of the middle of the line (someone leaves before their turn). O(n/2) */
  removeAt(index: number): T | null {
    return this.items.removeAt(index);
  }

  /** Drops every value that does not pass the test, keeping the order of the rest. O(n) */
  retain(keep: (value: T) => boolean): void {
    for (let index = this.items.length - 1; index >= 0; index--) {
      const node = this.items.traverseToIndex(index);
      if (node && !keep(node.value)) this.items.removeAt(index);
    }
  }

  clear(): void {
    this.items.clear();
  }

  /** Front first. */
  toArray(): T[] {
    return this.items.toArray();
  }
}
