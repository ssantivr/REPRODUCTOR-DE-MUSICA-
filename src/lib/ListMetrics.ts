import type { DoublyLinkedList } from "./DoublyLinkedList";

export const MEASURED_OPERATIONS = ["append", "removeAt", "traverseToIndex", "shuffle"] as const;
export type MeasuredOperation = (typeof MEASURED_OPERATIONS)[number];

export const THEORETICAL_COMPLEXITY: Record<MeasuredOperation, string> = {
  append: "O(1)",
  removeAt: "O(n/2)",
  traverseToIndex: "O(n/2)",
  shuffle: "O(n)",
};

export interface OperationStats {
  calls: number;
  totalMs: number;
  lastMs: number;
  maxMs: number;
  /** List length right after the last call */
  lastSize: number;
}

const emptyStats = (): OperationStats => ({ calls: 0, totalMs: 0, lastMs: 0, maxMs: 0, lastSize: 0 });

/** Live counters and timings of the measured list operations. */
export class ListMetrics {
  private stats = new Map<MeasuredOperation, OperationStats>();

  record(operation: MeasuredOperation, durationMs: number, size: number): void {
    const entry = this.stats.get(operation) ?? emptyStats();
    entry.calls++;
    entry.totalMs += durationMs;
    entry.lastMs = durationMs;
    entry.maxMs = Math.max(entry.maxMs, durationMs);
    entry.lastSize = size;
    this.stats.set(operation, entry);
  }

  get(operation: MeasuredOperation): OperationStats {
    return this.stats.get(operation) ?? emptyStats();
  }

  get totalCalls(): number {
    let total = 0;
    this.stats.forEach((entry) => (total += entry.calls));
    return total;
  }

  reset(): void {
    this.stats.clear();
  }
}

/**
 * Wraps the measured methods of one list instance so every call (including the
 * internal ones, like the traversal inside removeAt) is timed and counted.
 * The list class itself stays untouched.
 */
export function instrumentList<T>(list: DoublyLinkedList<T>, metrics: ListMetrics): void {
  const target = list as unknown as Record<MeasuredOperation, (...args: unknown[]) => unknown>;
  for (const operation of MEASURED_OPERATIONS) {
    const original = target[operation].bind(list);
    target[operation] = (...args) => {
      const start = performance.now();
      const result = original(...args);
      metrics.record(operation, performance.now() - start, list.length);
      return result;
    };
  }
}
