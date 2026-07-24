/**
 * In-memory play queue — §六.
 *
 * MVP design: the queue lives in process memory, NOT in SQLite.
 * If the server restarts the queue is lost — this is acceptable for MVP.
 * Persisting the queue would go into a `queue_items` table in a future iteration.
 */

export interface QueueItem {
  /** unique per-entry id (for stable reference even after reordering) */
  id: string;
  songWorkId: string;
  /** optional: pin a specific source item instead of auto-resolving */
  sourceItemId?: string;
  /** epoch ms when enqueued */
  enqueuedAt: number;
}

export interface QueueSnapshot {
  items: QueueItem[];
  total: number;
}

let counter = 0;

function genQueueId(): string {
  counter += 1;
  return `q-${Date.now()}-${counter}`;
}

export class PlayQueue {
  private items: QueueItem[] = [];

  add(songWorkId: string, sourceItemId?: string): QueueItem {
    const item: QueueItem = {
      id: genQueueId(),
      songWorkId,
      sourceItemId,
      enqueuedAt: Date.now(),
    };
    this.items.push(item);
    return item;
  }

  /** Remove the item at 0-based position. Returns true if something was removed. */
  removeAt(position: number): boolean {
    if (position < 0 || position >= this.items.length) return false;
    this.items.splice(position, 1);
    return true;
  }

  /** Pop the next item (head of queue). Returns null if empty. */
  shift(): QueueItem | null {
    return this.items.shift() ?? null;
  }

  /** Peek at the next item without removing it. */
  peek(): QueueItem | null {
    return this.items[0] ?? null;
  }

  list(): QueueSnapshot {
    return { items: [...this.items], total: this.items.length };
  }

  clear(): number {
    const count = this.items.length;
    this.items = [];
    return count;
  }

  get length(): number {
    return this.items.length;
  }
}
