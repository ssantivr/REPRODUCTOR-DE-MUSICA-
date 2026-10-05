import { DoublyLinkedList } from "./DoublyLinkedList";

/**
 * STACK (LIFO) built on the doubly linked list: the tail is the top.
 * push / pop / peek are O(1) thanks to the tail pointer. With a capacity, the
 * oldest entry is dropped from the head (also O(1)) once the stack is full.
 */
export class Stack<T> {
  private readonly items = new DoublyLinkedList<T>();

  constructor(private readonly capacity = Infinity) {}

  get size(): number {
    return this.items.length;
  }

  get isEmpty(): boolean {
    return this.items.length === 0;
  }

  push(value: T): void {
    this.items.append(value);
    if (this.items.length > this.capacity) this.items.removeAt(0);
  }

  /** Removes and returns the top value, or null when the stack is empty. */
  pop(): T | null {
    return this.items.removeAt(this.items.length - 1);
  }

  peek(): T | null {
    return this.items.tail?.value ?? null;
  }

  clear(): void {
    this.items.clear();
  }

  /** Top first. */
  toArray(): T[] {
    return this.items.toArrayReverse();
  }
}
