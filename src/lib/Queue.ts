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

  /** Takes a value out of the middle of the line (someone leaves before their turn). O(n) */
  removeAt(index: number): T | null {
    return this.items.removeAt(index);
  }

  /** Drops every value that does not pass the test, keeping the order of the rest. O(n) */
  retain(keep: (value: T) => boolean): void {
    // One walk over the nodes; each one that fails is unlinked in O(1) because it is already at hand
    for (const node of this.items.nodes()) {
      if (!keep(node.value)) this.items.removeNode(node);
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
