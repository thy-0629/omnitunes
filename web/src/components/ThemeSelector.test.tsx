import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useThemeStore } from '@/stores/theme';
import { ThemeSelector } from './ThemeSelector';

describe('ThemeSelector', () => {
  beforeEach(() => {
    useThemeStore.setState({ theme: 'apple' });
  });

  it('marks the active desktop theme and updates the shared preference', () => {
    render(<ThemeSelector />);

    const emil = screen.getByRole('button', { name: /emil/i });
    expect(emil).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(emil);

    expect(useThemeStore.getState().theme).toBe('emil');
    expect(emil).toHaveAttribute('aria-pressed', 'true');
  });

  it('offers every theme through the compact select control', () => {
    render(<ThemeSelector />);

    const select = screen.getByRole('combobox', { name: '界面主题' });
    fireEvent.change(select, { target: { value: 'fusion' } });

    expect(useThemeStore.getState().theme).toBe('fusion');
  });
});
