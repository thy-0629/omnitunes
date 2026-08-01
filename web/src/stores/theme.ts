import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const THEMES = ['apple', 'emil', 'fusion'] as const;
export type ThemeId = (typeof THEMES)[number];
export const DEFAULT_THEME: ThemeId = 'apple';

export const isThemeId = (value: unknown): value is ThemeId =>
  typeof value === 'string' && (THEMES as readonly string[]).includes(value);

interface ThemeState {
  theme: ThemeId;
  setTheme: (theme: ThemeId) => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: DEFAULT_THEME,
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'omnitunes-theme',
      merge: (persistedState, currentState) => {
        const persistedTheme = (persistedState as Partial<ThemeState> | undefined)?.theme;

        return {
          ...currentState,
          theme: isThemeId(persistedTheme) ? persistedTheme : DEFAULT_THEME,
        };
      },
    },
  ),
);
