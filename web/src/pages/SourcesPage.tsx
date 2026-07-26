import { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
    <div className="mx-auto max-w-3xl p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">音源状态</h1>
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {sources.map((s) => {
          const h = health[s.id];
          const meta = h ? STATUS_META[h.status] : null;
          return (
            <Card key={s.id}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">{s.displayName}</CardTitle>
                {meta && <Badge className={meta.className}>{meta.label}</Badge>}
              </CardHeader>
              <CardContent className="space-y-1 text-xs text-muted-foreground">
                {h?.message && <div className="text-yellow-500">{h.message}</div>}
                <div>
                  调用 {s.stats.totalCalls} 次 · 成功率 {(s.stats.successRate * 100).toFixed(0)}% · 平均{' '}
                  {s.stats.avgLatencyMs.toFixed(0)}ms
                </div>
                <div>
                  能力：{[
                    s.capabilities.search && '搜索',
                    s.capabilities.playOptions && '播放',
                    s.capabilities.health && '健康检查',
                  ]
                    .filter(Boolean)
                    .join(' / ')}
                </div>
                {s.stats.lastErrorCode && (
                  <div className="text-destructive">最近错误：{s.stats.lastErrorCode}</div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
