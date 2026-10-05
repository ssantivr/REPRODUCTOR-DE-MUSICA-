/**
 * DOUBLY LINKED LIST
 * Data Structures workshop — Music Universe
 *
 * Every node stores a value (the song) and two pointers:
 *   prev → previous node
 *   next → following node
 *
 * Linear mode:    null ← [HEAD] ⇄ [ ] ⇄ [TAIL] → null
 * Circular mode:  [TAIL].next = [HEAD] and [HEAD].prev = [TAIL]
 *
 * Because the circular mode has no null at the ends, every traversal is
 * bounded by `length` instead of stopping at null.
 */

export class Node<T> {
  value: T;
  next: Node<T> | null = null;
  prev: Node<T> | null = null;

  constructor(value: T) {
    this.value = value;
  }
}

/** Details of the last traversal, used to visualize how a node was reached. */
export interface TraversalInfo {
  index: number;
  from: "head" | "tail";
  steps: number;
}

/** Plain JSON snapshot of a list: enough to rebuild every node and the cursor. */
export interface SerializedList<S> {
  version: 1;
  circular: boolean;
  currentIndex: number;
  items: S[];
}

export class DoublyLinkedList<T> {
  head: Node<T> | null = null;
  tail: Node<T> | null = null;
  length = 0;
  /** Playback cursor: the node that is currently selected. */
  current: Node<T> | null = null;
  /** When true the tail links back to the head (and the head back to the tail). */
  circular = false;
  lastTraversal: TraversalInfo | null = null;

  constructor(initialValues?: Iterable<T>) {
    if (initialValues) {
      for (const value of initialValues) this.append(value);
    }
  }

  // ---------------------------------------------------------------------------
  // Core operations
  // ---------------------------------------------------------------------------

  /** Adds a value at the end. O(1) thanks to the tail pointer. */
  append(value: T): Node<T> {
    const newNode = new Node(value);

    if (this.tail === null) {
      this.head = newNode;
      this.tail = newNode;
    } else {
      newNode.prev = this.tail;
      this.tail.next = newNode;
      this.tail = newNode;
    }

    this.length++;
    this.current ??= this.head;
    this.sealEnds();
    return newNode;
  }

  /** Adds a value at the beginning. O(1) thanks to the head pointer. */
  prepend(value: T): Node<T> {
    const newNode = new Node(value);

    if (this.head === null) {
      this.head = newNode;
      this.tail = newNode;
    } else {
      newNode.next = this.head;
      this.head.prev = newNode;
      this.head = newNode;
    }

    this.length++;
    this.current ??= this.head;
    this.sealEnds();
    return newNode;
  }

  /**
   * Inserts a value at `index`.
   *  - index <= 0       → prepend
   *  - index >= length  → append
   *  - otherwise the node is linked between (index - 1) and index.
   */
  insertAt(index: number, value: T): Node<T> {
    if (index <= 0) return this.prepend(value);
    if (index >= this.length) return this.append(value);

    const leader = this.traverseToIndex(index - 1);
    if (leader === null || leader.next === null) {
      return this.append(value);
    }

    const follower = leader.next;
    const newNode = new Node(value);

    // leader ⇄ newNode ⇄ follower
    newNode.prev = leader;
    newNode.next = follower;
    leader.next = newNode;
    follower.prev = newNode;

    this.length++;
    return newNode;
  }

  /** Removes the node at `index` and returns its value (null when it does not exist). */
  removeAt(index: number): T | null {
    const nodeToRemove = this.traverseToIndex(index);
    if (nodeToRemove === null) return null;

    const { prev, next } = nodeToRemove;

    if (this.length === 1) {
      this.head = null;
      this.tail = null;
    } else {
      if (prev !== null) prev.next = next;
      if (next !== null) next.prev = prev;
      if (nodeToRemove === this.head) this.head = next;
      if (nodeToRemove === this.tail) this.tail = prev;
    }

    // Keep the cursor valid: it moves to a neighbor of the removed node
    if (this.current === nodeToRemove) {
      this.current = this.length === 1 ? null : (next ?? prev);
    }

    // Detach the node so no dangling references remain
    nodeToRemove.next = null;
    nodeToRemove.prev = null;

    this.length--;
    this.sealEnds();
    return nodeToRemove.value;
  }

  /**
   * Returns the node at `index`, or null when the index is invalid.
   * Walks forward from the head for the first half and backward from the
   * tail for the second half, so the worst case is O(n/2).
   */
  traverseToIndex(index: number): Node<T> | null {
    if (!Number.isInteger(index) || index < 0 || index >= this.length) {
      return null;
    }

    let steps = 0;
    let currentNode: Node<T> | null;

    if (index < this.length / 2) {
      currentNode = this.head;
      while (currentNode !== null && steps < index) {
        currentNode = currentNode.next;
        steps++;
      }
      this.lastTraversal = { index, from: "head", steps };
    } else {
      currentNode = this.tail;
      const target = this.length - 1 - index;
      while (currentNode !== null && steps < target) {
        currentNode = currentNode.prev;
        steps++;
      }
      this.lastTraversal = { index, from: "tail", steps };
    }

    return currentNode;
  }

  // ---------------------------------------------------------------------------
  // Cursor navigation
  // ---------------------------------------------------------------------------

  /**
   * Moves the cursor forward through the `next` pointer.
   * In circular mode the tail's `next` is the head, so playback never stops.
   * Returns the new current node, or null when it cannot move.
   */
  next(): Node<T> | null {
    if (this.current === null) {
      this.current = this.head;
      return this.current;
    }
    const target = this.current.next;
    if (target !== null) this.current = target;
    return target;
  }

  /** Moves the cursor backward through the `prev` pointer. */
  prev(): Node<T> | null {
    if (this.current === null) {
      this.current = this.tail;
      return this.current;
    }
    const target = this.current.prev;
    if (target !== null) this.current = target;
    return target;
  }

  /** Places the cursor on the node at `index` (uses traverseToIndex). */
  moveTo(index: number): Node<T> | null {
    const node = this.traverseToIndex(index);
    if (node !== null) this.current = node;
    return node;
  }

  // ---------------------------------------------------------------------------
  // Loop / repeat mode
  // ---------------------------------------------------------------------------

  /** Turns the circular behavior on (tail ⇄ head linked) or off (ends point to null). */
  setCircular(circular: boolean): void {
    this.circular = circular;
    this.sealEnds();
  }

  /** Re-applies the end links after any structural change. */
  private sealEnds(): void {
    if (this.head === null || this.tail === null) return;
    if (this.circular) {
      this.tail.next = this.head;
      this.head.prev = this.tail;
    } else {
      this.tail.next = null;
      this.head.prev = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Shuffle
  // ---------------------------------------------------------------------------

  /**
   * Rearranges the list in random order by reassigning the `prev` / `next`
   * pointers (Fisher–Yates over the nodes). No node is created or destroyed:
   * values and the cursor keep their identity, only the links change. O(n)
   */
  shuffle(random: () => number = Math.random): void {
    if (this.length < 2) return;
    const nodes = this.nodes();

    for (let i = nodes.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [nodes[i], nodes[j]] = [nodes[j], nodes[i]];
    }

    nodes.forEach((node, i) => {
      node.prev = nodes[i - 1] ?? null;
      node.next = nodes[i + 1] ?? null;
    });
    this.head = nodes[0];
    this.tail = nodes[nodes.length - 1];
    this.sealEnds();
  }

  /** Moves the cursor to a random node different from the current one. */
  jumpRandom(random: () => number = Math.random): Node<T> | null {
    if (this.length === 0) return null;
    if (this.length === 1) return this.moveTo(0);

    const currentIndex = this.current ? this.indexOfNode(this.current) : -1;
    let index = Math.floor(random() * (this.length - 1));
    if (index >= currentIndex && currentIndex >= 0) index++; // skip the current node
    return this.moveTo(index);
  }

  // ---------------------------------------------------------------------------
  // Serialization
  // ---------------------------------------------------------------------------

  /** Exports every value (in list order), the cursor position and the loop mode. */
  toJSON<S = T>(serialize: (value: T) => S = (value) => value as unknown as S): SerializedList<S> {
    return {
      version: 1,
      circular: this.circular,
      currentIndex: this.current ? this.indexOfNode(this.current) : -1,
      items: this.toArray().map(serialize),
    };
  }

  /**
   * Replaces the whole list with the nodes described by `data`.
   * `parse` validates every raw item; invalid items are skipped.
   * Returns the number of nodes that were rebuilt.
   */
  importJSON(data: unknown, parse: (raw: unknown) => T | null): number {
    if (typeof data !== "object" || data === null || !Array.isArray((data as SerializedList<unknown>).items)) {
      throw new Error("Invalid playlist snapshot");
    }
    const snapshot = data as SerializedList<unknown>;

    this.clear();
    // The cursor index refers to the raw items: skipped (invalid) items must not shift it
    let restored: Node<T> | null = null;
    snapshot.items.forEach((raw, index) => {
      const value = parse(raw);
      if (value === null) return;
      const node = this.append(value);
      if (index === snapshot.currentIndex) restored = node;
    });

    this.setCircular(snapshot.circular === true);
    this.current = restored ?? this.head;
    return this.length;
  }

  /** Builds a new list from a snapshot. */
  static fromJSON<T>(data: unknown, parse: (raw: unknown) => T | null): DoublyLinkedList<T> {
    const list = new DoublyLinkedList<T>();
    list.importJSON(data, parse);
    return list;
  }

  /** Removes every node, unlinking them so no references remain. */
  clear(): void {
    for (const node of this.nodes()) {
      node.next = null;
      node.prev = null;
    }
    this.head = null;
    this.tail = null;
    this.current = null;
    this.length = 0;
  }

  // ---------------------------------------------------------------------------
  // Traversal helpers (bounded by length, so they also work in circular mode)
  // ---------------------------------------------------------------------------

  /** Prints the list to the developer console and returns the generated text. */
  printList(format: (value: T) => string = (value) => String(value)): string {
    const parts = this.toArray().map((value, index) => `[${index}] ${format(value)}`);
    const ends = this.circular ? " ⟲" : "";
    const output = parts.length > 0 ? `HEAD ⇄ ${parts.join(" ⇄ ")} ⇄ TAIL${ends}` : "HEAD → null ← TAIL (empty list)";
    console.log(`DoublyLinkedList(length=${this.length}, circular=${this.circular}): ${output}`);
    return output;
  }

  /** Position of a specific node, or -1 when it is not in the list. O(n) */
  indexOfNode(node: Node<T>): number {
    let currentNode = this.head;
    for (let index = 0; index < this.length && currentNode !== null; index++) {
      if (currentNode === node) return index;
      currentNode = currentNode.next;
    }
    return -1;
  }

  /** Nodes from head to tail through `next`. */
  nodes(): Node<T>[] {
    const result: Node<T>[] = [];
    let currentNode = this.head;
    for (let i = 0; i < this.length && currentNode !== null; i++) {
      result.push(currentNode);
      currentNode = currentNode.next;
    }
    return result;
  }

  /** Walks from head to tail through `next`. */
  toArray(): T[] {
    return this.nodes().map((node) => node.value);
  }

  /** Walks from tail to head through `prev` (useful to verify the pointers). */
  toArrayReverse(): T[] {
    const values: T[] = [];
    let currentNode = this.tail;
    for (let i = 0; i < this.length && currentNode !== null; i++) {
      values.push(currentNode.value);
      currentNode = currentNode.prev;
    }
    return values;
  }

  /**
   * Native iteration protocol: enables `for (const track of playlist)`,
   * spread (`[...playlist]`) and destructuring (`const [first] = playlist`).
   * Bounded by `length`, so it also terminates in circular mode.
   */
  *[Symbol.iterator](): IterableIterator<T> {
    let currentNode = this.head;
    for (let i = 0; i < this.length && currentNode !== null; i++) {
      yield currentNode.value;
      currentNode = currentNode.next;
    }
  }
}
