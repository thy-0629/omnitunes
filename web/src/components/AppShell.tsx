import { useEffect } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Disc3, Heart, History, ListMusic, ListOrdered, Radio, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import { wsClient } from '@/lib/ws';
import { PlayerBar } from '@/components/player/PlayerBar';
import { AudioPlayer } from '@/components/player/AudioPlayer';
import { EmbedPlayer } from '@/components/player/EmbedPlayer';
import { useQueueStore } from '@/stores/queue';

const NAV = [
  { to: '/', label: '搜索', icon: Search },
  { to: '/queue', label: '队列', icon: ListOrdered },
  { to: '/playlists', label: '歌单', icon: ListMusic },
  { to: '/collections', label: '收藏', icon: Heart },
  { to: '/history', label: '历史', icon: History },
  { to: '/sources', label: '音源', icon: Radio },
];

export function AppShell() {
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
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <Disc3 className="h-5 w-5 text-primary" />
        <span className="font-semibold">Omnitunes</span>
        <nav className="ml-6 flex gap-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors',
                  isActive ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent/50',
                )
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <EmbedPlayer />

      <main className="flex-1 overflow-y-auto pb-24">
        <Outlet />
      </main>

      <PlayerBar />
      <AudioPlayer />
    </div>
  );
}
