import { cn } from '@/lib/utils';
import { isThemeId, type ThemeId, useThemeStore } from '@/stores/theme';

const THEME_OPTIONS: Array<{ id: ThemeId; label: string; swatch: string }> = [
  { id: 'apple', label: 'Apple', swatch: 'bg-rose-400' },
  { id: 'emil', label: 'Emil', swatch: 'bg-lime-300' },
  { id: 'fusion', label: 'Fusion', swatch: 'bg-sky-300' },
];

export function ThemeSelector() {
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);

  return (
    <>
      <div className="ml-auto hidden shrink-0 items-center gap-1 rounded-full bg-secondary/80 p-1 md:flex" role="group" aria-label="界面主题">
        {THEME_OPTIONS.map(({ id, label, swatch }) => (
          <button
            key={id}
            type="button"
            aria-pressed={theme === id}
            onClick={() => setTheme(id)}
            className={cn(
              'apple-btn flex h-7 items-center gap-1.5 px-2 text-xs font-medium',
              theme === id
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-background/70 hover:text-foreground',
            )}
          >
            <span className={cn('h-2 w-2 rounded-full', swatch)} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <label className="ml-auto shrink-0 md:hidden">
        <span className="sr-only">界面主题</span>
        <select
          aria-label="界面主题"
          value={theme}
          onChange={(event) => {
            if (isThemeId(event.target.value)) {
              setTheme(event.target.value);
            }
          }}
          className="h-8 max-w-24 rounded-full border border-border bg-background px-2 text-xs font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {THEME_OPTIONS.map(({ id, label }) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}
