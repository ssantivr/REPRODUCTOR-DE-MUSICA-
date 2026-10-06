interface AvlNode<T> {
  key: number;
  /** Every value sharing this key */
  values: T[];
  /** Nodes on the longest way down to a leaf, this one included */
  height: number;
  left: AvlNode<T> | null;
  right: AvlNode<T> | null;
}

/** Plain copy of a subtree, for drawing it: no values, only its shape. */
export interface AvlSnapshot {
  key: number;
  /** How many values share this key */
  count: number;
  height: number;
  /** Height of the left subtree minus the height of the right one */
  balance: number;
  left: AvlSnapshot | null;
  right: AvlSnapshot | null;
}

/** Called on every rotation with its direction and the key of the node that went down. */
export type RotationListener = (direction: "left" | "right", key: number) => void;

const heightOf = <T>(node: AvlNode<T> | null): number => node?.height ?? 0;

function refresh<T>(node: AvlNode<T>): void {
  node.height = 1 + Math.max(heightOf(node.left), heightOf(node.right));
}

/*
 *       y                x
 *      / \              / \
 *     x   C    →       A   y
 *    / \                  / \
 *   A   B                B   C
 */
function rotateRight<T>(y: AvlNode<T>): AvlNode<T> {
  const x = y.left as AvlNode<T>;
  y.left = x.right;
  x.right = y;
  refresh(y);
  refresh(x);
  return x;
}

function rotateLeft<T>(x: AvlNode<T>): AvlNode<T> {
  const y = x.right as AvlNode<T>;
  x.right = y.left;
  y.left = x;
  refresh(x);
  refresh(y);
  return y;
}

/** Restores the AVL rule on one node: its two subtrees may differ by one level at most. */
function rebalance<T>(node: AvlNode<T>, onRotate: RotationListener | null): AvlNode<T> {
  refresh(node);
  const balance = heightOf(node.left) - heightOf(node.right);
  if (balance > 1) {
    const left = node.left as AvlNode<T>;
    // Left-right case: a first rotation turns it into the left-left case
    if (heightOf(left.left) < heightOf(left.right)) {
      onRotate?.("left", left.key);
      node.left = rotateLeft(left);
    }
    onRotate?.("right", node.key);
    return rotateRight(node);
  }
  if (balance < -1) {
    const right = node.right as AvlNode<T>;
    if (heightOf(right.right) < heightOf(right.left)) {
      onRotate?.("right", right.key);
      node.right = rotateRight(right);
    }
    onRotate?.("left", node.key);
    return rotateLeft(node);
  }
  return node;
}

/**
 * AVL TREE: a binary search tree keyed by a number (the tempo) that rebalances
 * itself with rotations after every insertion and removal, so its height stays
 * O(log n) whatever the order the keys arrive in.
 *  - insert / remove: O(log n)
 *  - range query: O(log n + k), k being the number of results
 */
export class AvlTree<T> {
  private root: AvlNode<T> | null = null;
  /** Number of distinct keys */
  size = 0;
  /** Optional observer of the rotations, used to show them */
  onRotate: RotationListener | null = null;

  get height(): number {
    return heightOf(this.root);
  }

  insert(key: number, value: T): void {
    const insertInto = (node: AvlNode<T> | null): AvlNode<T> => {
      if (node === null) {
        this.size++;
        return { key, values: [value], height: 1, left: null, right: null };
      }
      if (key === node.key) {
        node.values.push(value);
        return node;
      }
      if (key < node.key) node.left = insertInto(node.left);
      else node.right = insertInto(node.right);
      return rebalance(node, this.onRotate);
    };
    this.root = insertInto(this.root);
  }

  /** Removes one value from its key; the node disappears with its last value. Returns false when it was not there. */
  remove(key: number, value: T): boolean {
    let removed = false;

    /** Unlinks the smallest node of a subtree (its in-order first). */
    const detachFirst = (node: AvlNode<T>): AvlNode<T> | null => {
      if (node.left === null) return node.right;
      node.left = detachFirst(node.left);
      return rebalance(node, this.onRotate);
    };

    const removeFrom = (node: AvlNode<T> | null): AvlNode<T> | null => {
      if (node === null) return null;
      if (key < node.key) node.left = removeFrom(node.left);
      else if (key > node.key) node.right = removeFrom(node.right);
      else {
        const at = node.values.indexOf(value);
        if (at < 0) return node;
        removed = true;
        node.values.splice(at, 1);
        if (node.values.length > 0) return node;

        this.size--;
        if (node.left === null) return node.right;
        if (node.right === null) return node.left;
        // Two children: the successor (smallest key of the right subtree) takes this place
        let successor = node.right;
        while (successor.left !== null) successor = successor.left;
        node.key = successor.key;
        node.values = successor.values;
        node.right = detachFirst(node.right);
      }
      return rebalance(node, this.onRotate);
    };

    this.root = removeFrom(this.root);
    return removed;
  }

  /** Values whose key is inside [min, max], in ascending key order. */
  range(min: number, max: number): T[] {
    const result: T[] = [];
    const visit = (node: AvlNode<T> | null) => {
      if (node === null) return;
      if (node.key > min) visit(node.left);
      if (node.key >= min && node.key <= max) result.push(...node.values);
      if (node.key < max) visit(node.right);
    };
    visit(this.root);
    return result;
  }

  /** Shape of the whole tree as plain objects (null when it is empty). O(n) */
  snapshot(): AvlSnapshot | null {
    const copy = (node: AvlNode<T> | null): AvlSnapshot | null =>
      node && {
        key: node.key,
        count: node.values.length,
        height: node.height,
        balance: heightOf(node.left) - heightOf(node.right),
        left: copy(node.left),
        right: copy(node.right),
      };
    return copy(this.root);
  }

  /** True when the keys are ordered and no node has subtrees differing by more than one level. */
  isBalanced(): boolean {
    const check = (node: AvlNode<T> | null, min: number, max: number): boolean => {
      if (node === null) return true;
      if (node.key <= min || node.key >= max) return false;
      if (Math.abs(heightOf(node.left) - heightOf(node.right)) > 1) return false;
      if (node.height !== 1 + Math.max(heightOf(node.left), heightOf(node.right))) return false;
      return check(node.left, min, node.key) && check(node.right, node.key, max);
    };
    return check(this.root, -Infinity, Infinity);
  }
}
