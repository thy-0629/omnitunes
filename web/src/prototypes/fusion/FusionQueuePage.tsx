import { useState } from 'react';
import { ArrowDown, ArrowUp, Play, Trash2, X } from 'lucide-react';
import type { QueueItem } from '@/lib/api/types';
import './fusion-theme.css';

const MOCK_QUEUE: QueueItem[] = [
  { id: 'q-1', songWorkId: 'sw-1', songWork: { id: 'sw-1', title: '晴天', artists: '周杰伦' }, sourceItemId: 'si-1', enqueuedAt: Date.now() - 1000 * 60 * 5 },
  { id: 'q-2', songWorkId: 'sw-2', songWork: { id: 'sw-2', title: '起风了', artists: '买辣椒也用券' }, enqueuedAt: Date.now() - 1000 * 60 * 4 },
  { id: 'q-3', songWorkId: 'sw-3', songWork: { id: 'sw-3', title: '夜曲', artists: '周杰伦' }, sourceItemId: 'si-5', enqueuedAt: Date.now() - 1000 * 60 * 3 },
  { id: 'q-4', songWorkId: 'sw-4', songWork: { id: 'sw-4', title: '七里香', artists: '周杰伦' }, enqueuedAt: Date.now() - 1000 * 60 * 2 },
  { id: 'q-5', songWorkId: 'sw-5', songWork: { id: 'sw-5', title: '稻香', artists: '周杰伦' }, enqueuedAt: Date.now() - 1000 * 60 * 1 },
];

export function FusionQueuePage() {
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
    }, 220);
  };

  return (
    <div className="min-h-screen bg-background pb-28 text-foreground">
      <header className="sticky top-0 z-40 px-4 pt-4">
        <div className="fusion-glass-strong relative mx-auto flex max-w-3xl items-center justify-between rounded-[1.75rem] p-4">
          <div>
            <h1 className="fusion-title">播放队列</h1>
            <p className="text-xs text-muted-foreground">{items.length} 首歌曲</p>
          </div>
          <button
            type="button"
            onClick={() => items.length > 0 && setItems([])}
            className="fusion-btn flex h-9 items-center gap-1.5 rounded-full bg-secondary px-3 text-xs font-semibold text-secondary-foreground"
          >
            <Trash2 className="h-4 w-4" />
            清空
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pt-5">
        {activeIndex !== -1 && (
          <div className="fusion-glass relative mb-5 overflow-hidden rounded-[1.5rem] p-4"
          >
            <div className="absolute inset-0 bg-primary/[0.06]" />
            <div className="relative flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-orange-400 text-lg font-bold text-white shadow-md">
                ♪
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1 inline-flex items-center rounded-full bg-primary px-2 py-0.5 text-[10px] font-bold text-primary-foreground">
                  正在播放
                </div>
                <h2 className="truncate text-[17px] font-semibold">{items[activeIndex].songWork.title}</h2>
                <p className="truncate text-sm text-muted-foreground">{items[activeIndex].songWork.artists}</p>
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
            <div className="fusion-card py-16 text-center">
              <p className="text-sm text-muted-foreground">队列为空</p>
              <p className="mt-1 text-xs text-muted-foreground">去搜索页添加歌曲</p>
            </div>
          )}

          {items.map((item, index) => {
            const isActive = item.id === currentId;
            const isRemoving = item.id === removingId;
            return (
              <div
                key={item.id}
                className={`overflow-hidden rounded-2xl transition-all duration-220 ${
                  isRemoving ? 'opacity-0 -translate-x-4' : ''
                }`}
                style={{ transitionTimingFunction: 'var(--ease-out)' }}
              >
                <div
                  className={`fusion-card flex items-center gap-2 px-3 py-2.5 ${
                    isActive ? 'bg-primary/[0.04]' : ''
                  }`}
                >
                  <span
                    className={`w-6 shrink-0 text-center text-sm tabular-nums ${
                      isActive ? 'font-semibold text-primary' : 'text-muted-foreground'
                    }`}
                  >
                    {isActive ? '▶' : index + 1}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className={`truncate text-[15px] font-semibold ${isActive ? 'text-foreground' : ''}`}>
                      {item.songWork.title}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {item.songWork.artists}
                      {item.sourceItemId && ' · 已指定来源'}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={index === 0}
                    onClick={() => move(index, index - 1)}
                    className="fusion-icon-btn h-7 w-7 text-muted-foreground disabled:opacity-30"
                    aria-label="上移"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    disabled={index === items.length - 1}
                    onClick={() => move(index, index + 1)}
                    className="fusion-icon-btn h-7 w-7 text-muted-foreground disabled:opacity-30"
                    aria-label="下移"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setCurrentId(item.id)}
                    className="fusion-btn flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
                    aria-label="播放"
                  >
                    <Play className="h-4 w-4 fill-current" />
                  </button>

                  <button
                    type="button"
                    onClick={() => remove(item.id)}
                    className="fusion-icon-btn flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:text-destructive"
                    aria-label="移除"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
