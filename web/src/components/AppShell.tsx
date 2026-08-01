import { useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Disc3, Heart, History, ListMusic, ListOrdered, Radio, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { wsClient } from '@/lib/ws';
import { PlayerBar } from '@/components/player/PlayerBar';
import { AudioPlayer } from '@/components/player/AudioPlayer';
import { EmbedPlayer } from '@/components/player/EmbedPlayer';
import { ThemeSelector } from '@/components/ThemeSelector';
import { useQueueStore } from '@/stores/queue';
import { useThemeStore } from '@/stores/theme';

const NAV = [
  { to: '/', label: '搜索', icon: Search },
  { to: '/queue', label: '队列', icon: ListOrdered },
  { to: '/playlists', label: '歌单', icon: ListMusic },
  { to: '/collections', label: '收藏', icon: Heart },
  { to: '/history', label: '历史', icon: History },
  { to: '/sources', label: '音源', icon: Radio },
];

export function AppShell() {
  const theme = useThemeStore((state) => state.theme);

  useEffect(() => {
    wsClient.start();
    void useQueueStore.getState().refresh();

    // queue changes pushed by the server → refresh local snapshot
    const off = wsClient.on('queue:changed', () => {
      void useQueueStore.getState().refresh();
    });
    return off;
  }, []);

  return (
    <div data-testid="app-shell" data-theme={theme} className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 px-4 py-3">
        <div className="apple-glass-strong mx-auto flex max-w-5xl items-center gap-3 rounded-full px-4 py-2">
          <Disc3 className="h-5 w-5 text-primary" />
          <span className="hidden font-semibold sm:inline">Omnitunes</span>
          <nav className="ml-0 flex flex-1 items-center justify-center gap-1 sm:ml-3 sm:justify-start">
            {NAV.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  cn(
                    'apple-btn flex h-8 items-center gap-1.5 px-3 text-xs font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-transparent text-muted-foreground hover:bg-secondary hover:text-secondary-foreground',
                  )
                }
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{label}</span>
              </NavLink>
            ))}
          </nav>
          <ThemeSelector />
        </div>
      </header>

      <EmbedPlayer />

      <main className="flex-1 overflow-y-auto px-4 pb-28">
        <Outlet />
      </main>

      <PlayerBar />
      <AudioPlayer />
    </div>
  );
}
