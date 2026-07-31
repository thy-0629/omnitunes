/**
 * In-memory play queue — §六.
 *
 * MVP design: the queue lives in process memory, NOT in SQLite.
 * If the server restarts the queue is lost — this is acceptable for MVP.
 * Persisting the queue would go into a `queue_items` table in a future iteration.
 */

export interface QueueSongWorkSnapshot {
  id: string;
  title: string;
  artists: string;
}

export interface QueueItem {
  /** unique per-entry id (for stable reference even after reordering) */
  id: string;
  songWorkId: string;
  /** resolved song work metadata for display */
  songWork: QueueSongWorkSnapshot;
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

  add(
    songWorkId: string,
    songWork: QueueSongWorkSnapshot,
    sourceItemId?: string,
    position?: number,
  ): { item: QueueItem; isDuplicate: boolean } {
    const existing = this.items.find(
      (it) =>
        it.songWorkId === songWorkId &&
        (it.sourceItemId === sourceItemId ||
          !it.sourceItemId ||
          !sourceItemId),
    );
    if (existing) {
      return { item: existing, isDuplicate: true };
    }

    const item: QueueItem = {
      id: genQueueId(),
      songWorkId,
      songWork,
      sourceItemId,
      enqueuedAt: Date.now(),
    };

    if (position != null && position >= 0 && position <= this.items.length) {
      this.items.splice(position, 0, item);
    } else {
      this.items.push(item);
    }
    return { item, isDuplicate: false };
  }

  /** Move item from one 0-based position to another. Returns true if changed. */
  move(from: number, to: number): boolean {
    if (
      from === to ||
      from < 0 ||
      from >= this.items.length ||
      to < 0 ||
      to >= this.items.length
    ) {
      return false;
    }
    const [item] = this.items.splice(from, 1);
    this.items.splice(to, 0, item!);
    return true;
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
