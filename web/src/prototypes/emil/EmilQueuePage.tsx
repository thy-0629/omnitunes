import { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ListMusic,
  Play,
  SkipForward,
  Trash2,
  X,
} from 'lucide-react';
import type { QueueItem } from '@/lib/api/types';
import './emil-theme.css';

const MOCK_ITEMS: QueueItem[] = [
  {
    id: 'q-1',
    songWorkId: 'sw-1',
    songWork: { id: 'sw-1', title: '十年', artists: '陈奕迅' },
    sourceItemId: 'si-1-1',
    enqueuedAt: Date.now() - 1000 * 60 * 5,
  },
  {
    id: 'q-2',
    songWorkId: 'sw-3',
    songWork: { id: 'sw-3', title: 'K歌之王', artists: '陈奕迅' },
    enqueuedAt: Date.now() - 1000 * 60 * 4,
  },
  {
    id: 'q-3',
    songWorkId: 'sw-4',
    songWork: { id: 'sw-4', title: '红玫瑰', artists: '陈奕迅' },
    enqueuedAt: Date.now() - 1000 * 60 * 3,
  },
  {
    id: 'q-4',
    songWorkId: 'sw-5',
    songWork: { id: 'sw-5', title: '富士山下', artists: '陈奕迅' },
    enqueuedAt: Date.now() - 1000 * 60 * 2,
  },
];

function useQueue(initial: QueueItem[]) {
  const [items, setItems] = useState<QueueItem[]>(initial);
  const [loading, setLoading] = useState(true);
  const [currentId, setCurrentId] = useState<string | null>('q-1');

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 400);
    return () => clearTimeout(timer);
  }, []);

  const removeAt = (index: number) => {
    setItems((prev) => {
      const removed = prev[index];
      const next = prev.filter((_, i) => i !== index);
      if (currentId === removed?.id) {
        setCurrentId(next[0]?.id ?? null);
      }
      return next;
    });
  };

  const move = (from: number, to: number) => {
    setItems((prev) => {
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const clear = () => {
    setItems([]);
    setCurrentId(null);
  };

  const playNextFromQueue = () => {
    setItems((prev) => {
      if (prev.length === 0) return prev;
      const [current, ...rest] = prev;
      return [...rest, current];
    });
  };

  return {
    items,
    loading,
    currentId,
    setCurrentId,
    removeAt,
    move,
    clear,
    playNextFromQueue,
  };
}

export function EmilQueuePage() {
  const {
    items,
    loading,
    currentId,
    setCurrentId,
    removeAt,
    move,
    clear,
    playNextFromQueue,
  } = useQueue(MOCK_ITEMS);

  const activeIndex = items.findIndex((it) => it.id === currentId);

  return (
    <div className="mx-auto max-w-3xl px-4 pb-32 pt-6">
      <div className="flex items-start justify-between gap-4">
        <header>
          <h1 className="text-xl font-semibold tracking-[-0.01em]">播放队列</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {items.length > 0 ? `共 ${items.length} 首 · 当前第 ${Math.max(1, activeIndex + 1)} 首` : '队列为空'}
          </p>
        </header>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => playNextFromQueue()}
            disabled={items.length === 0}
            className="emil-surface emil-pill border border-border bg-transparent text-foreground disabled:opacity-40"
          >
            <SkipForward className="mr-1 h-3.5 w-3.5" />
            下一首
          </button>
          <button
            type="button"
            onClick={() => clear()}
            disabled={items.length === 0}
            className="emil-surface emil-pill border border-border bg-transparent text-destructive hover:bg-destructive/10 disabled:opacity-40"
          >
            <Trash2 className="mr-1 h-3.5 w-3.5" />
            清空
          </button>
        </div>
      </div>

      {currentId && items[activeIndex] && (
        <div className="emil-card mt-5 flex items-center gap-3 border border-primary/30 bg-primary/5 p-4">
          <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
            <Play className="h-3.5 w-3.5 fill-current" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-primary">正在播放</p>
            <p className="truncate text-[15px] font-semibold">{items[activeIndex].songWork.title}</p>
            <p className="truncate text-xs text-muted-foreground">
              {items[activeIndex].songWork.artists}
            </p>
          </div>
        </div>
      )}

      <div className="mt-5 space-y-2">
        {loading &&
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="emil-card h-16 w-full animate-pulse bg-muted/50"
              aria-hidden="true"
            />
          ))}

        {!loading && items.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <ListMusic className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm font-medium">队列为空</p>
            <p className="mt-1 text-xs text-muted-foreground">去搜索页添加几首歌再回来</p>
          </div>
        )}

        {!loading && (
          <div className="emil-list-enter space-y-2">
            {items.map((item, index) => {
              const isActive = item.id === currentId;
              return (
                <div
                  key={item.id}
                  className={`emil-card flex items-center gap-2 px-2 py-2.5 transition-colors ${
                    isActive ? 'border border-primary/30 bg-primary/[0.04]' : ''
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs tabular-nums ${
                      isActive
                        ? 'bg-primary font-medium text-primary-foreground'
                        : 'text-muted-foreground'
                    }`}
                  >
                    {isActive ? <Play className="h-3 w-3 fill-current" /> : index + 1}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{item.songWork.title}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {item.songWork.artists}
                      {item.sourceItemId && ' · 已指定来源'}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => move(index, index - 1)}
                      disabled={index === 0}
                      className="emil-surface emil-icon-btn h-8 w-8 text-muted-foreground disabled:opacity-30"
                      title="上移"
                      aria-label="上移"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, index + 1)}
                      disabled={index === items.length - 1}
                      className="emil-surface emil-icon-btn h-8 w-8 text-muted-foreground disabled:opacity-30"
                      title="下移"
                      aria-label="下移"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentId(item.id);
                        removeAt(index);
                      }}
                      className="emil-surface emil-icon-btn h-8 w-8 text-muted-foreground hover:text-primary"
                      title="立即播放"
                      aria-label="立即播放"
                    >
                      <Play className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeAt(index)}
                      className="emil-surface emil-icon-btn h-8 w-8 text-muted-foreground hover:text-destructive"
                      title="移除"
                      aria-label="移除"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
