# Emil-style Omnitunes Prototype

A standalone Emil Kowalski–inspired redesign of three core surfaces in Omnitunes: search results, the playback queue, and the bottom player bar. The components are self-contained, use mock data, and import existing types/utilities from `@/lib/api/types` and `@/lib/utils` so they can be dropped into any route for preview.

## Files

| File | Purpose |
| --- | --- |
| `EmilSearchPage.tsx` | Redesigned search results with filters, loading/empty/error states, and tactile result cards. |
| `EmilQueuePage.tsx` | Redesigned queue with active-item highlight, reorder controls, and empty state. |
| `EmilPlayerBar.tsx` | Redesigned bottom player with interactive progress, volume, play/pause, error retry, and resolving state. |
| `emil-theme.css` | Tailwind-friendly design tokens: custom easing, durations, shadows, tactile press classes, staggered list entrances, and reduced-motion support. |
| `README.md` | This file. |

## How to preview

1. Import the theme once at the preview route root:

```tsx
import '@/prototypes/emil/emil-theme.css';
```

2. Add a temporary route in `web/src/main.tsx` (or render the components anywhere inside `AppShell`):

```tsx
import { EmilSearchPage } from '@/prototypes/emil/EmilSearchPage';
import { EmilQueuePage } from '@/prototypes/emil/EmilQueuePage';
import { EmilPlayerBar } from '@/prototypes/emil/EmilPlayerBar';
import '@/prototypes/emil/emil-theme.css';

function EmilPrototypePage() {
  return (
    <div className="min-h-screen bg-background">
      <EmilSearchPage />
      {/* or <EmilQueuePage /> */}
      <EmilPlayerBar />
    </div>
  );
}

// In your router:
{ path: '/prototypes/emil', element: <EmilPrototypePage /> }
```

3. Run the dev server:

```bash
pnpm dev
# or npm run dev
```

4. Visit `http://localhost:5173/prototypes/emil` (or whatever port Vite is using).

## Design direction

The goal is “software that feels right,” not trendy. The direction borrows from Emil Kowalski’s UI craft: invisible details that compound, tactile feedback, precise spacing, and restrained motion.

### Key decisions

- **No glassmorphism.** Surfaces are opaque cards with layered, soft shadows (`--shadow-card`, `--shadow-card-hover`, `--shadow-player`). Depth comes from shadow, not blur.
- **Tactile buttons.** Every pressable element uses `transform: scale(0.96–0.98)` on `:active` so the interface feels like it responds to touch immediately.
- **Custom easing.** All motion uses strong cubic-bezier curves (`--ease-out`, `--ease-in-out`) instead of default browser easings, which feel weak.
- **Transform/opacity only.** No layout-triggering animations; everything that moves is GPU-accelerated.
- **Restrained durations.** Press feedback is 120 ms; hover lifts are 150 ms; list entrances are 220 ms. Nothing lingers.
- **Hover guarded for touch.** Hover lift effects are wrapped in `@media (hover: hover) and (pointer: fine)` so they don’t fire falsely on touch devices.
- **First-class empty/error/loading states.** Skeletons, empty illustrations, and error retry are designed as carefully as the happy path.
- **Staggered list entrances.** Search results and queue items enter with a 40 ms cascade so they don’t appear all at once.
- **Reduced motion respected.** Movement and scale transitions are disabled under `prefers-reduced-motion`; opacity and color state changes remain.

### Tokens

The theme file exposes CSS variables for motion, shape, shadow, and typography. They are intentionally Tailwind-friendly: components still use Tailwind utility classes for layout and color, while the Emil-specific surfaces rely on the component classes in `emil-theme.css`.

## Notes

- Components do **not** modify original files (`SearchPage.tsx`, `QueuePage.tsx`, `PlayerBar.tsx`).
- They do **not** call live API endpoints or zustand stores; all interactivity is local/mock.
- `EmilPlayerBar` accepts props to preview different states (`status`, `error`, etc.). By default it simulates a playing track.
- Type `error` in the Emil search box to preview the search error state.
