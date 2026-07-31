import { useRef, useState } from 'react';
import { GripVertical, Play, Plus, Trash2, X } from 'lucide-react';
import type { QueueItem } from '@/lib/api/types';

import './apple-theme.css';

const MOCK_QUEUE: QueueItem[] = [
  {
    id: 'q-1',
    songWorkId: 'sw-1',
    songWork: { id: 'sw-1', title: '晴天', artists: '周杰伦' },
    sourceItemId: 'si-1',
    enqueuedAt: Date.now() - 1000 * 60 * 5,
  },
  {
    id: 'q-2',
    songWorkId: 'sw-2',
    songWork: { id: 'sw-2', title: '起风了', artists: '买辣椒也用券' },
    enqueuedAt: Date.now() - 1000 * 60 * 4,
  },
  {
    id: 'q-3',
    songWorkId: 'sw-3',
    songWork: { id: 'sw-3', title: '夜曲', artists: '周杰伦' },
    sourceItemId: 'si-5',
    enqueuedAt: Date.now() - 1000 * 60 * 3,
  },
  {
    id: 'q-4',
    songWorkId: 'sw-4',
    songWork: { id: 'sw-4', title: '七里香', artists: '周杰伦' },
    enqueuedAt: Date.now() - 1000 * 60 * 2,
  },
  {
    id: 'q-5',
    songWorkId: 'sw-5',
    songWork: { id: 'sw-5', title: '稻香', artists: '周杰伦' },
    enqueuedAt: Date.now() - 1000 * 60 * 1,
  },
];

/**
 * Apple-style queue page.
 * Features large touch targets, glass now-playing card, and a swipe-to-remove
 * gesture on each row implemented with Pointer Events + requestAnimationFrame.
 */
export function AppleQueuePage() {
  const [items, setItems] = useState<QueueItem[]>(MOCK_QUEUE);
  const [currentId, setCurrentId] = useState<string>('q-1');
  const [removingId, setRemovingId] = useState<string | null>(null);

  const activeIndex = items.findIndex((it) => it.id === currentId);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    setItems((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const remove = (id: string) => {
    setRemovingId(id);
    setTimeout(() => {
      setItems((prev) => prev.filter((it) => it.id !== id));
      setRemovingId(null);
    }, 260);
  };

  const playItem = (id: string) => setCurrentId(id);

  return (
    <div className="apple-theme min-h-screen bg-background pb-28 text-foreground">
      <header className="sticky top-0 z-40 px-4 pt-4">
        <div className="apple-glass-strong mx-auto flex max-w-2xl items-center justify-between rounded-[1.75rem] p-4">
          <div>
            <h1 className="apple-typo-headline">播放队列</h1>
            <p className="text-xs text-muted-foreground">{items.length} 首歌曲</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="apple-btn flex h-9 items-center gap-1.5 rounded-full bg-secondary px-3 text-xs font-semibold text-secondary-foreground"
            >
              <Plus className="h-4 w-4" />
              添加
            </button>
            <button
              type="button"
              onClick={() => {
                if (items.length > 0) setItems([]);
              }}
              className="apple-btn flex h-9 items-center gap-1.5 rounded-full bg-secondary px-3 text-xs font-semibold text-secondary-foreground"
            >
              <Trash2 className="h-4 w-4" />
              清空
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pt-5">
        {activeIndex !== -1 && (
          <div className="apple-glass relative mb-5 overflow-hidden rounded-[1.5rem] p-4">
            <div className="absolute inset-0 bg-primary/5" />
            <div className="relative flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-orange-400 text-lg font-bold text-white shadow-md">
                ♪
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 inline-flex items-center rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                  正在播放
                </div>
                <h2 className="truncate text-[17px] font-semibold">
                  {items[activeIndex].songWork.title}
                </h2>
                <p className="truncate text-sm text-muted-foreground">
                  {items[activeIndex].songWork.artists}
                </p>
              </div>
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-2">
          {items.length === 0 && (
            <div className="apple-card py-16 text-center">
              <p className="text-sm text-muted-foreground">队列为空</p>
              <p className="mt-1 text-xs text-muted-foreground">去搜索页添加歌曲</p>
            </div>
          )}

          {items.map((item, index) => (
            <QueueRow
              key={item.id}
              item={item}
              index={index}
              isActive={item.id === currentId}
              isRemoving={item.id === removingId}
              onPlay={() => playItem(item.id)}
              onMove={move}
              onRemove={() => remove(item.id)}
            />
          ))}
        </div>
      </main>
    </div>
  );
}

interface QueueRowProps {
  item: QueueItem;
  index: number;
  isActive: boolean;
  isRemoving: boolean;
  onPlay: () => void;
  onMove: (from: number, to: number) => void;
  onRemove: () => void;
}

function QueueRow({ item, index, isActive, isRemoving, onPlay, onMove, onRemove }: QueueRowProps) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const dragState = useRef<{ startY: number; startIndex: number; dragging: boolean } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    const el = rowRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    dragState.current = { startY: e.clientY, startIndex: index, dragging: false };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragState.current) return;
    const deltaY = e.clientY - dragState.current.startY;
    if (!dragState.current.dragging && Math.abs(deltaY) > 10) {
      dragState.current.dragging = true;
    }
    if (dragState.current.dragging) {
      setDragOffset(deltaY);
    }
  };

  const onPointerUp = () => {
    if (!dragState.current) return;
    const rows = Math.round(dragOffset / 64);
    if (rows !== 0) {
      onMove(index, index + rows);
    }
    setDragOffset(0);
    dragState.current = null;
  };

  return (
    <div
      className={`relative overflow-hidden rounded-2xl transition-all duration-300 apple-ease-smooth ${
        isRemoving ? 'opacity-0 -translate-x-full' : ''
      }`}
    >
      {/* Delete action background */}
      <button
        type="button"
        onClick={onRemove}
        className="absolute inset-y-0 right-0 flex w-20 items-center justify-center rounded-2xl bg-destructive text-destructive-foreground"
        aria-label="移除"
      >
        <X className="h-5 w-5" />
      </button>

      <div
        ref={rowRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          transform: `translateY(${dragOffset}px) translateX(${isRemoving ? '-100%' : '0%'})`,
          zIndex: dragState.current?.dragging ? 10 : 1,
        }}
        className={`apple-card flex items-center gap-3 px-3 py-3 ${
          isActive ? 'bg-primary/[0.06]' : ''
        } ${dragState.current?.dragging ? 'shadow-lg' : ''}`}
      >
        <button
          type="button"
          className="apple-press cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
          aria-label="拖拽排序"
        >
          <GripVertical className="h-5 w-5" />
        </button>

        <span
          className={`w-6 shrink-0 text-center text-sm tabular-nums ${
            isActive ? 'font-semibold text-primary' : 'text-muted-foreground'
          }`}
        >
          {isActive ? '▶' : index + 1}
        </span>

        <div className="min-w-0 flex-1">
          <div
            className={`truncate text-[15px] font-semibold ${
              isActive ? 'text-foreground' : ''
            }`}
          >
            {item.songWork.title}
          </div>
          <div className="truncate text-xs text-muted-foreground">{item.songWork.artists}</div>
        </div>

        <button
          type="button"
          onClick={onPlay}
          className="apple-btn flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
          aria-label="播放"
        >
          <Play className="h-4 w-4 fill-current" />
        </button>

        <button
          type="button"
          onClick={onRemove}
          className="apple-btn flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-destructive"
          aria-label="移除"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
