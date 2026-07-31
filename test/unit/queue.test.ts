import { describe, it, expect, beforeEach } from 'vitest';
import { PlayQueue } from '../../src/modules/queue/queue.js';

const sw = (id: string) => ({ id, title: `Song ${id}`, artists: 'Artist' });

describe('PlayQueue', () => {
  let queue: PlayQueue;

  beforeEach(() => {
    queue = new PlayQueue();
  });

  describe('add()', () => {
    it('adds an item and returns it with an id', () => {
      const { item, isDuplicate } = queue.add('sw-1', sw('sw-1'), 'si-1');
      expect(isDuplicate).toBe(false);
      expect(item.id).toBeTruthy();
      expect(item.songWorkId).toBe('sw-1');
      expect(item.sourceItemId).toBe('si-1');
      expect(item.songWork.title).toBe('Song sw-1');
      expect(item.enqueuedAt).toBeGreaterThan(0);
    });

    it('increments length', () => {
      queue.add('sw-1', sw('sw-1'));
      queue.add('sw-2', sw('sw-2'));
      expect(queue.length).toBe(2);
    });

    it('generates unique ids', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(queue.add(`sw-${i}`, sw(`sw-${i}`)).item.id);
      }
      expect(ids.size).toBe(100);
    });

    it('detects duplicate by songWorkId when no sourceItemId is pinned', () => {
      const first = queue.add('sw-1', sw('sw-1'));
      const second = queue.add('sw-1', sw('sw-1'));
      expect(first.isDuplicate).toBe(false);
      expect(second.isDuplicate).toBe(true);
      expect(second.item.id).toBe(first.item.id);
      expect(queue.length).toBe(1);
    });

    it('detects duplicate when same sourceItemId is requested', () => {
      queue.add('sw-1', sw('sw-1'), 'si-1');
      const dup = queue.add('sw-1', sw('sw-1'), 'si-1');
      expect(dup.isDuplicate).toBe(true);
      expect(queue.length).toBe(1);
    });

    it('treats generic add as duplicate when a pinned version exists', () => {
      queue.add('sw-1', sw('sw-1'), 'si-1');
      const dup = queue.add('sw-1', sw('sw-1'));
      expect(dup.isDuplicate).toBe(true);
      expect(queue.length).toBe(1);
    });

    it('treats pinned add as duplicate when a generic version exists', () => {
      queue.add('sw-1', sw('sw-1'));
      const dup = queue.add('sw-1', sw('sw-1'), 'si-1');
      expect(dup.isDuplicate).toBe(true);
      expect(queue.length).toBe(1);
    });

    it('allows different sourceItemIds for the same songWorkId', () => {
      queue.add('sw-1', sw('sw-1'), 'si-1');
      const second = queue.add('sw-1', sw('sw-1'), 'si-2');
      expect(second.isDuplicate).toBe(false);
      expect(queue.length).toBe(2);
    });

    it('inserts at position 0 to play next', () => {
      queue.add('sw-1', sw('sw-1'));
      queue.add('sw-2', sw('sw-2'));
      queue.add('sw-3', sw('sw-3'), undefined, 0);
      const items = queue.list().items;
      expect(items[0]?.songWorkId).toBe('sw-3');
      expect(items[1]?.songWorkId).toBe('sw-1');
      expect(items[2]?.songWorkId).toBe('sw-2');
    });

    it('inserts in the middle', () => {
      queue.add('sw-1', sw('sw-1'));
      queue.add('sw-2', sw('sw-2'));
      queue.add('sw-3', sw('sw-3'), undefined, 1);
      const items = queue.list().items;
      expect(items.map((i) => i.songWorkId)).toEqual(['sw-1', 'sw-3', 'sw-2']);
    });

    it('appends when position is out of range', () => {
      queue.add('sw-1', sw('sw-1'));
      queue.add('sw-2', sw('sw-2'), undefined, 10);
      const items = queue.list().items;
      expect(items[1]?.songWorkId).toBe('sw-2');
    });
  });

  describe('move()', () => {
    beforeEach(() => {
      queue.add('sw-1', sw('sw-1'));
      queue.add('sw-2', sw('sw-2'));
      queue.add('sw-3', sw('sw-3'));
    });

    it('moves an item up', () => {
      expect(queue.move(1, 0)).toBe(true);
      expect(queue.list().items.map((i) => i.songWorkId)).toEqual(['sw-2', 'sw-1', 'sw-3']);
    });

    it('moves an item down', () => {
      expect(queue.move(0, 2)).toBe(true);
      expect(queue.list().items.map((i) => i.songWorkId)).toEqual(['sw-2', 'sw-3', 'sw-1']);
    });

    it('returns false for same index', () => {
      expect(queue.move(1, 1)).toBe(false);
    });

    it('returns false for out-of-range positions', () => {
      expect(queue.move(0, 3)).toBe(false);
      expect(queue.move(3, 0)).toBe(false);
      expect(queue.move(-1, 1)).toBe(false);
    });
  });

  describe('shift()', () => {
    it('pops the head (FIFO)', () => {
      queue.add('sw-1', sw('sw-1'));
      queue.add('sw-2', sw('sw-2'));
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
      queue.add('sw-1', sw('sw-1'));
      queue.add('sw-2', sw('sw-2'));
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
      queue.add('sw-1', sw('sw-1'));
      queue.add('sw-2', sw('sw-2'));
      queue.add('sw-3', sw('sw-3'));
      expect(queue.removeAt(1)).toBe(true);
      expect(queue.length).toBe(2);
      expect(queue.list().items[0]?.songWorkId).toBe('sw-1');
      expect(queue.list().items[1]?.songWorkId).toBe('sw-3');
    });

    it('returns false for out-of-range position', () => {
      expect(queue.removeAt(0)).toBe(false);
      queue.add('sw-1', sw('sw-1'));
      expect(queue.removeAt(1)).toBe(false);
      expect(queue.removeAt(-1)).toBe(false);
    });
  });

  describe('list()', () => {
    it('returns a snapshot copy (not the internal array)', () => {
      queue.add('sw-1', sw('sw-1'));
      const snap = queue.list();
      queue.add('sw-2', sw('sw-2'));
      // snapshot should be unaffected by later add
      expect(snap.total).toBe(1);
      expect(snap.items.length).toBe(1);
    });

    it('returns total count', () => {
      queue.add('sw-1', sw('sw-1'));
      queue.add('sw-2', sw('sw-2'));
      expect(queue.list().total).toBe(2);
    });
  });

  describe('clear()', () => {
    it('removes all items', () => {
      queue.add('sw-1', sw('sw-1'));
      queue.add('sw-2', sw('sw-2'));
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
      queue.add('sw-1', sw('sw-1'));
      queue.add('sw-2', sw('sw-2'));
      expect(queue.length).toBe(2);
      queue.shift();
      expect(queue.length).toBe(1);
      queue.clear();
      expect(queue.length).toBe(0);
    });
  });
});
