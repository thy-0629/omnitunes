import { describe, it, expect, beforeEach } from 'vitest';
import { PlayQueue } from '../../src/modules/queue/queue.js';

describe('PlayQueue', () => {
  let queue: PlayQueue;

  beforeEach(() => {
    queue = new PlayQueue();
  });

  describe('add()', () => {
    it('adds an item and returns it with an id', () => {
      const item = queue.add('sw-1', 'si-1');
      expect(item.id).toBeTruthy();
      expect(item.songWorkId).toBe('sw-1');
      expect(item.sourceItemId).toBe('si-1');
      expect(item.enqueuedAt).toBeGreaterThan(0);
    });

    it('increments length', () => {
      queue.add('sw-1');
      queue.add('sw-2');
      expect(queue.length).toBe(2);
    });

    it('generates unique ids', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(queue.add('sw').id);
      }
      expect(ids.size).toBe(100);
    });
  });

  describe('shift()', () => {
    it('pops the head (FIFO)', () => {
      queue.add('sw-1');
      queue.add('sw-2');
      const first = queue.shift();
      expect(first?.songWorkId).toBe('sw-1');
      expect(queue.length).toBe(1);
    });

    it('returns null on empty queue', () => {
      expect(queue.shift()).toBeNull();
    });
  });

  describe('peek()', () => {
    it('returns head without removing', () => {
      queue.add('sw-1');
      queue.add('sw-2');
      const head = queue.peek();
      expect(head?.songWorkId).toBe('sw-1');
      expect(queue.length).toBe(2);
    });

    it('returns null on empty queue', () => {
      expect(queue.peek()).toBeNull();
    });
  });

  describe('removeAt()', () => {
    it('removes item at given position', () => {
      queue.add('sw-1');
      queue.add('sw-2');
      queue.add('sw-3');
      expect(queue.removeAt(1)).toBe(true);
      expect(queue.length).toBe(2);
      expect(queue.list().items[0]?.songWorkId).toBe('sw-1');
      expect(queue.list().items[1]?.songWorkId).toBe('sw-3');
    });

    it('returns false for out-of-range position', () => {
      expect(queue.removeAt(0)).toBe(false);
      queue.add('sw-1');
      expect(queue.removeAt(1)).toBe(false);
      expect(queue.removeAt(-1)).toBe(false);
    });
  });

  describe('list()', () => {
    it('returns a snapshot copy (not the internal array)', () => {
      queue.add('sw-1');
      const snap = queue.list();
      queue.add('sw-2');
      // snapshot should be unaffected by later add
      expect(snap.total).toBe(1);
      expect(snap.items.length).toBe(1);
    });

    it('returns total count', () => {
      queue.add('sw-1');
      queue.add('sw-2');
      expect(queue.list().total).toBe(2);
    });
  });

  describe('clear()', () => {
    it('removes all items', () => {
      queue.add('sw-1');
      queue.add('sw-2');
      const removed = queue.clear();
      expect(removed).toBe(2);
      expect(queue.length).toBe(0);
    });

    it('returns 0 on empty queue', () => {
      expect(queue.clear()).toBe(0);
    });
  });

  describe('length getter', () => {
    it('reflects current size after operations', () => {
      queue.add('sw-1');
      queue.add('sw-2');
      expect(queue.length).toBe(2);
      queue.shift();
      expect(queue.length).toBe(1);
      queue.clear();
      expect(queue.length).toBe(0);
    });
  });
});
