import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './index.css';
import { AppShell } from '@/components/AppShell';
import { SearchPage } from '@/pages/SearchPage';
import { QueuePage } from '@/pages/QueuePage';
import { PlaylistsPage } from '@/pages/PlaylistsPage';
import { PlaylistDetailPage } from '@/pages/PlaylistDetailPage';
import { CollectionsPage } from '@/pages/CollectionsPage';
import { HistoryPage } from '@/pages/HistoryPage';
import { SourcesPage } from '@/pages/SourcesPage';

const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <SearchPage /> },
      { path: '/queue', element: <QueuePage /> },
      { path: '/playlists', element: <PlaylistsPage /> },
      { path: '/playlists/:id', element: <PlaylistDetailPage /> },
      { path: '/collections', element: <CollectionsPage /> },
      { path: '/history', element: <HistoryPage /> },
      { path: '/sources', element: <SourcesPage /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
