# motion-web

The home site of `@n-uf/motion` (motion.n-uf.com): a static Astro site with the window motion rules, the drag-intent
model, desk layouts and toolbar groups as interactive pages built on the library itself (`workspace:*`).

## Before adding UI

Open **`/design/`**, the living style guide: palette, type scale, spacing, radii, shadows, the page shell, the
figure's anatomy and the grip's states. It reads `src/styles/tokens.css` at build time and uses the site's own classes,
so it is always current. Add a token there before you add a value anywhere else. The page is `noindex`, out of the
sitemap and linked only from the footer.

## How a page is built

- `src/pages/*.astro`: the home page and the four demo pages. All their text (the h1, the intro, an h2 per rule or
  construction, captions) is server HTML, and so is the first state of each demo (`src/demos/*.ts` render it as
  strings).
- `src/islands/*.ts`: the interactive part of each demo, plain TypeScript with no framework. A page's `<script>`
  imports its island when the figure scrolls into view (`whenVisible` in `islands/rail.ts`). The islands bind the
  markup the server rendered; they render later states with the same `src/demos` code.
- `src/layouts/Base.astro` is the whole `<head>` (robots, canonical, Open Graph, icons, JSON-LD); `Site.astro` is the
  top bar, breadcrumb, page head and footer. Titles and descriptions live in `src/data/pages.ts`, change dates in
  `src/data/dates.mjs`, structured data in `src/data/schema.ts`.
- Every glide goes through `src/islands/motion.ts` (one frame loop, `@n-uf/motion`'s settle), which also honours
  reduced motion. **Speed** (¼× · ½× · 1×) scales that loop's clock, so every time-driven motion slows together while
  pointer-following stays 1:1; the drag's timing rules and the showcase pause read real time. **Tempo** (calm 20 ·
  default 25 · quick 37) re-tempos every live settle.
- Every figure is a window (`src/components/Chrome.astro`) whose controls are toolbar groups: the server renders the
  default arrangement, and `src/islands/chrome.ts` (the same module the toolbar-groups page demonstrates) makes the
  groups draggable between the title bar, top and bottom bars, edges and floating, collapsible, and remembered per
  figure. Shared bar controls: `DropModeSwitch.astro` (Drop indicator · Open gap · Snap to slot, `previewPlan` in
  `islands/drop-mode.ts`) and `Playback.astro` (Speed, Tempo). Automatic showcases register with
  `islands/showcase.ts`, which pauses them at the first user action and resumes them 10 s after the last.

## Commands

```sh
pnpm --filter motion-web dev        # astro dev
pnpm --filter motion-web test       # the link and live-block tests
pnpm --filter motion-web build      # astro build, then the internal link check
pnpm --filter motion-web typecheck  # the islands and demo modules
```

## Images

- `public/favicon.svg` is the mark; `scripts/render-favicons.py` draws the PNG and ICO sizes from it (rsvg-convert and
  Pillow).
- `scripts/capture-og.mjs` captures each demo from a running site into `scripts/og-src/`; `scripts/render-og.py
  --font InterVariable.ttf` draws `public/og.png` and `public/og/<page>.png` (1200 × 630) from those captures.
