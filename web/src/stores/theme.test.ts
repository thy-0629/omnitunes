import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_THEME, isThemeId, useThemeStore } from './theme';

describe('theme store', () => {
  beforeEach(() => {
    localStorage.clear();
    useThemeStore.setState({ theme: DEFAULT_THEME });
  });

  it('accepts only the supported theme identifiers', () => {
    expect(isThemeId('apple')).toBe(true);
    expect(isThemeId('emil')).toBe(true);
    expect(isThemeId('fusion')).toBe(true);
    expect(isThemeId('dark')).toBe(false);
    expect(isThemeId(null)).toBe(false);
  });

  it('updates the selected theme and persists it', () => {
    useThemeStore.getState().setTheme('emil');

    expect(useThemeStore.getState().theme).toBe('emil');
    expect(JSON.parse(localStorage.getItem('omnitunes-theme') ?? '{}')).toMatchObject({
      state: { theme: 'emil' },
    });
  });
});
