import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import './index.css';
import '@/prototypes/apple/apple-theme.css';
import { AppShell } from '@/components/AppShell';
import { SearchPage } from '@/pages/SearchPage';
import { QueuePage } from '@/pages/QueuePage';
import { PlaylistsPage } from '@/pages/PlaylistsPage';
import { PlaylistDetailPage } from '@/pages/PlaylistDetailPage';
import { CollectionsPage } from '@/pages/CollectionsPage';
import { HistoryPage } from '@/pages/HistoryPage';
import { SourcesPage } from '@/pages/SourcesPage';

// Temporary prototype preview routes
import { AppleSearchPage } from '@/prototypes/apple/AppleSearchPage';
import { AppleQueuePage } from '@/prototypes/apple/AppleQueuePage';
import { ApplePlayerBar } from '@/prototypes/apple/ApplePlayerBar';
import { EmilSearchPage } from '@/prototypes/emil/EmilSearchPage';
import { EmilQueuePage } from '@/prototypes/emil/EmilQueuePage';
import { EmilPlayerBar } from '@/prototypes/emil/EmilPlayerBar';
import '@/prototypes/emil/emil-theme.css';
import { FusionSearchPage } from '@/prototypes/fusion/FusionSearchPage';
import { FusionQueuePage } from '@/prototypes/fusion/FusionQueuePage';
import { FusionPlayerBar } from '@/prototypes/fusion/FusionPlayerBar';
import '@/prototypes/fusion/fusion-theme.css';

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
  // Temporary prototype preview routes (outside AppShell so they render full-screen)
  {
    path: '/prototypes/apple',
    element: (
      <div className="apple-theme min-h-screen bg-background">
        <AppleSearchPage />
        <ApplePlayerBar />
      </div>
    ),
  },
  {
    path: '/prototypes/apple-queue',
    element: (
      <div className="apple-theme min-h-screen bg-background">
        <AppleQueuePage />
        <ApplePlayerBar />
      </div>
    ),
  },
  {
    path: '/prototypes/emil',
    element: (
      <div className="emil-theme min-h-screen bg-background">
        <EmilSearchPage />
        <EmilPlayerBar />
      </div>
    ),
  },
  {
    path: '/prototypes/emil-queue',
    element: (
      <div className="emil-theme min-h-screen bg-background">
        <EmilQueuePage />
        <EmilPlayerBar />
      </div>
    ),
  },
  {
    path: '/prototypes/fusion',
    element: (
      <div className="fusion-theme min-h-screen bg-background">
        <FusionSearchPage />
        <FusionPlayerBar />
      </div>
    ),
  },
  {
    path: '/prototypes/fusion-queue',
    element: (
      <div className="fusion-theme min-h-screen bg-background">
        <FusionQueuePage />
        <FusionPlayerBar />
      </div>
    ),
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
