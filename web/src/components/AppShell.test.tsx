import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useThemeStore } from '@/stores/theme';
import { AppShell } from './AppShell';

vi.mock('@/lib/ws', () => ({
  wsClient: {
    start: vi.fn(),
    on: vi.fn(() => () => undefined),
    sendProgress: vi.fn(),
  },
}));

vi.mock('@/stores/queue', () => ({
  useQueueStore: {
    getState: () => ({ refresh: async () => undefined }),
  },
}));

describe('AppShell', () => {
  beforeEach(() => {
    useThemeStore.setState({ theme: 'fusion' });
  });

  it('scopes every production descendant under the selected theme', () => {
    render(
      <MemoryRouter
        initialEntries={['/']}
        future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
      >
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<p>Search content</p>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByTestId('app-shell')).toHaveAttribute('data-theme', 'fusion');
    expect(screen.getByTestId('app-shell')).toHaveClass('h-dvh', 'min-h-0');
    expect(screen.getByText('Search content').closest('main')).toHaveClass(
      'min-h-0',
      'overflow-y-auto',
      'pb-36',
    );
    expect(screen.getByRole('button', { name: /emil/i })).toBeInTheDocument();
    expect(screen.getByText('Search content')).toBeInTheDocument();
  });
});
