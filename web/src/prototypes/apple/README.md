# Apple-style Omnitunes Prototype

A self-contained UI exploration that applies Apple's design language — fluid physical motion, translucent materials, generous rounding, and restrained contrast — to the Omnitunes music app.

## Files

| File | Purpose |
|------|---------|
| `apple-theme.css` | Apple-specific design tokens, glass utilities, typography scale, and accessibility media queries. |
| `AppleSearchPage.tsx` | Redesigned search results page with a floating glass search header, pill source filters, and spring-press result cards. |
| `AppleQueuePage.tsx` | Redesigned queue page with a glass "Now Playing" card and draggable rows. |
| `ApplePlayerBar.tsx` | Redesigned bottom player bar with glass material, scrubbing progress, and an expandable sheet. |

## Design direction

- **Restrained palette.** Warm neutral canvas with a single disciplined rose accent, replacing the original purple theme. No gradients used as decoration; the only gradients are functional placeholders for album art.
- **Translucent materials.** Floating headers and the player use `backdrop-filter: blur()` with a semi-transparent background so content scrolls underneath, not behind opaque bars.
- **Physical feedback.** Buttons and cards respond on press with spring-like scale transforms. Rows have a drag-to-reorder gesture using Pointer Events.
- **Generous space + rounding.** Cards, search field, and player use `rounded-2xl` and above; touch targets are at least 44×44 px.
- **Light / dark tokens.** CSS variables mirror the Shadcn/Tailwind surface so toggling `.dark` on a parent updates every component.
- **Accessibility.** Respects `prefers-reduced-motion`, `prefers-reduced-transparency`, and `prefers-contrast: more`.

## How to preview

1. Import the CSS once at the app entry point (or inside the components):
   ```tsx
   import '@/prototypes/apple/apple-theme.css';
   ```
2. Render any prototype page. For example, add a temporary route in your router:
   ```tsx
   import { AppleSearchPage } from '@/prototypes/apple/AppleSearchPage';
   import { AppleQueuePage } from '@/prototypes/apple/AppleQueuePage';
   import { ApplePlayerBar } from '@/prototypes/apple/ApplePlayerBar';

   // Temporary preview route
   <Route path="/apple-search" element={<AppleSearchPage />} />
   <Route path="/apple-queue" element={<AppleQueuePage />} />
   ```
   The player bar is fixed and can be rendered alongside any page:
   ```tsx
   <ApplePlayerBar />
   ```
3. Toggle dark mode by adding/removing the `dark` class on `<html>` or a wrapper.

All components use mock/placeholder data and local state, so they compile and preview without backend calls.

## Notes on motion

This prototype intentionally avoids adding new dependencies. Press feedback and transitions are implemented with CSS cubic-beziers that approximate spring settling. For production gesture work, the skill recommends a real spring library (Motion / Framer Motion) so animations can be interrupted mid-flight and carry release velocity.
