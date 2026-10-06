import { Queue } from "./Queue";

interface TrieNode<T> {
  children: Map<string, TrieNode<T>>;
  /** Values of the words that end exactly here */
  values: T[];
}

const emptyNode = <T>(): TrieNode<T> => ({ children: new Map(), values: [] });

/** One character of a prefix as the trie sees it. */
export interface TrieStep {
  character: string;
  /** False from the first character that has no node */
  found: boolean;
  /** Characters that can follow this one */
  branches: number;
  /** Words that end exactly here */
  ends: number;
}

/**
 * TRIE (prefix tree): every node is one character, and the path from the root
 * spells a prefix shared by all the words below it.
 *  - insert: O(m), m being the length of the word
 *  - startsWith: O(m + k) to reach the prefix and collect k results, however
 *    many words the trie holds
 */
export class Trie<T> {
  private readonly root: TrieNode<T> = emptyNode();
  /** Number of (word, value) pairs stored */
  size = 0;

  insert(word: string, value: T): void {
    let node = this.root;
    for (const character of word) {
      let child = node.children.get(character);
      if (!child) {
        child = emptyNode();
        node.children.set(character, child);
      }
      node = child;
    }
    node.values.push(value);
    this.size++;
  }

  /** The walk down the trie for `prefix`, character by character: what startsWith does before collecting. O(m) */
  trace(prefix: string): TrieStep[] {
    const steps: TrieStep[] = [];
    let node: TrieNode<T> | undefined = this.root;
    for (const character of prefix) {
      node = node?.children.get(character);
      steps.push({ character, found: node !== undefined, branches: node?.children.size ?? 0, ends: node?.values.length ?? 0 });
    }
    return steps;
  }

  /**
   * Distinct values of the words that start with `prefix`, shortest words
   * first: the subtree is walked level by level (breadth-first) with a queue.
   */
  startsWith(prefix: string, limit = Infinity): T[] {
    let node: TrieNode<T> | undefined = this.root;
    for (const character of prefix) {
      node = node.children.get(character);
      if (!node) return [];
    }

    const found = new Set<T>();
    const pending = new Queue<TrieNode<T>>();
    pending.enqueue(node);
    while (!pending.isEmpty && found.size < limit) {
      const current = pending.dequeue() as TrieNode<T>;
      for (const value of current.values) {
        if (found.size < limit) found.add(value);
      }
      current.children.forEach((child) => pending.enqueue(child));
    }
    return Array.from(found);
  }
}
