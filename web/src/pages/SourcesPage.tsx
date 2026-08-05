import { useEffect } from 'react';
import { Radio, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useSourcesStore } from '@/stores/sources';

const STATUS_META = {
  healthy: { label: '正常', variant: 'default' as const, className: 'bg-emerald-600 text-white border-transparent' },
  degraded: { label: '降级', variant: 'default' as const, className: 'bg-yellow-600 text-white border-transparent' },
  unavailable: { label: '不可用', variant: 'destructive' as const, className: '' },
};

export function SourcesPage() {
  const { sources, health, loading, refresh } = useSourcesStore();

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(timer);
  }, [refresh]);

  return (
    <div className="mx-auto max-w-2xl py-4">
      <header className="sticky top-[4.5rem] z-30 mb-5">
        <div className="apple-glass mx-auto flex items-center justify-between rounded-[1.75rem] p-4">
          <div className="flex items-center gap-3">
            <Radio className="h-5 w-5 text-muted-foreground" />
            <h1 className="apple-typo-headline">音源状态</h1>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refresh()}
            disabled={loading}
            className="apple-btn rounded-full"
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        {sources.map((s) => {
          const h = health[s.id];
          const meta = h ? STATUS_META[h.status] : null;
          return (
            <div key={s.id} className="apple-card p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">{s.displayName}</h2>
                {meta && <Badge className={meta.className}>{meta.label}</Badge>}
              </div>
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                {h?.message && <div className="text-yellow-500">{h.message}</div>}
                <div>
                  调用 {s.stats.totalCalls} 次 · 成功率 {(s.stats.successRate * 100).toFixed(0)}% · 平均{' '}
                  {s.stats.avgLatencyMs.toFixed(0)}ms
                </div>
                <div>
                  {s.stats.playabilitySuccessRate == null
                    ? '尚无可播放验证'
                    : `可播放验证 ${Math.round(s.stats.playabilitySuccessRate * 100)}%`}
                </div>
                <div>
                  能力：
                  {[
                    s.capabilities.search && '搜索',
                    s.capabilities.playOptions && '播放',
                    s.capabilities.health && '健康检查',
                  ]
                    .filter(Boolean)
                    .join(' / ')}
                </div>
                {s.stats.lastErrorCode && (
                  <div className="text-destructive">
                    最近错误：{s.stats.lastErrorCode}
                    {s.stats.lastErrorMessage ? ` · ${s.stats.lastErrorMessage}` : ''}
                  </div>
                )}
                {s.stats.lastPlayabilityErrorCode && (
                  <div className="text-destructive">
                    最近预检错误：{s.stats.lastPlayabilityErrorCode}
                    {s.stats.lastPlayabilityErrorMessage
                      ? ` · ${s.stats.lastPlayabilityErrorMessage}`
                      : ''}
                  </div>
                )}
                {(s.stats.playabilityRetryAt ?? s.stats.lastErrorRetryAt) != null && (
                  <div>
                    可重试：{new Date(
                      s.stats.playabilityRetryAt ?? s.stats.lastErrorRetryAt!,
                    ).toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
