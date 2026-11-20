# Docking release: site checklist

Held work on `fl/docking-pages` (n-uf/motion#85). The pages, copy, data and config for `@n-uf/docking` are written
before the package exists, from the SEO plan (`seo/products/motion/docking-release-plan.md`) and the libraries'
answers on the issue. Every code import still names `@n-uf/placement/scene` and `/scene/cases`. Delete this file in
the release PR once every box is ticked.

## 1. Re-check against `docs/docking.md`, `docs/docking-reference.md` and the README at the release tag

Names and facts I wrote. Each comes from the issue's planned export list, not from released code.

- [ ] Names in prose and FAQ answers: `DockState`, `DockDrop`, `solve`, `targets`, `stops`, `storeDockState`,
      `readDockState`, `refusals`, `lanes`, `moveTo`; `@n-uf/docking/testing` (named only in the `/docs/docking/`
      description as "the testing rows", and in the docking sheet on the home, `src/pages/index.astro:112`).
- [ ] Docking's dependencies (does it import `@n-uf/placement`?) before any "no dependencies" or "works alone" line.
      The home says "Motion imports neither of the others" and "Motion and placement also work alone" (FAQ) and
      "No DOM, no framework" for docking; `index.astro` still says "No DOM, no dependencies" for placement.
- [ ] `src/pages/index.astro:37`: the "all three at X" version line must also read `packages/docking/package.json`.
- [ ] `PairCode.astro`: replace placement's `/scene` sample (`pair-placement.ts`) with a placement sample (tiling or
      the positioner) and add docking's, not only add docking's.
- [ ] `src/data/faq.ts`, `/docking-layouts/` (3 answers) and `/toolbar-groups/` (5 answers):
  - `targets(state, id)` and `stops(state, id)`: the real parameter names and order;
  - `target.after(point, grab)` still exists on `DockDrop` and returns the new dock state and its `layout`;
  - `storeDockState` returns versioned plain data; `readDockState(data, base)` never throws, an unknown version gives
    the base back with the reason in `error`, unusable parts are listed in `dropped` (these were `readScene`'s rules);
  - note codes such as `column-folded`, the option names `giveWay`, `contentMin`, `floatKinds`, `span`;
  - the reading order of `stops` (left, top bars, bottom bars, right, floating last);
  - five toolbar areas, three zones, the insertion points.
  - Each answer must stay 40 to 60 words (`npm test` counts) after any rewording.
- [ ] Home FAQ: "none is stable yet" and "all under PolyForm Perimeter 1.0.1" (docking's licence and stability box);
      versions are dates (YY.M.R) for docking too; "Motion imports neither of the others"; "docking draws nothing and
      touches no DOM"; "pure functions over plain data with no DOM and no framework" for placement and docking; the
      dock state is "bars, rails, columns, items and floats".
- [ ] `src/data/parts.ts`: the one-liners (motion "how things move", placement "where things fit", docking "where
      panels and toolbars dock"), placement's `idea` and `does` (popup beside its anchor, stack that gives way, edge
      cut, one edge's drop places, tiled panes), docking's `idea` and `does`, the `BUILT_WITH` lines
      ("solve" for the layouts page; toolbar areas, zones, overflow and drop targets for the toolbar page), the README
      link `packages/docking/README.md`.
- [ ] `src/data/schema.ts`: the `#docking` and rewritten `#placement` descriptions, `alternateName`, the npm `sameAs`
      (`npmDockingUrl` in `site.ts` must be the real package page).
- [ ] `src/data/docs.ts`: the `/docs/docking/` title and description name `DockState`, `solve`, drop targets,
      refusals, `storeDockState`, `readDockState` and "the testing rows"; the placement title and description list
      "popups, stacks and tiling", "the edge cut, stack fit, one edge's drop places"; check them against what
      `packages/placement/README.md` has left.
- [ ] `src/pages/docking-layouts.astro` and `src/demos/desk.ts` prose: "four docked windows and five page sketches",
      `DockState`, `floatKinds`, `span`, "A, A2, C and F3 are docked", the card notes ("Docked:", "Sketch:") and the
      layout table.
- [ ] `src/pages/toolbar-groups.astro`: the sentence that `@n-uf/docking` gives the groups, toolbar areas, zones,
      overflow and drop targets.
- [ ] `src/pages/llms.txt.ts`: the header paragraph.
- [ ] `src/layouts/Docs.astro`: the "moved to @n-uf/docking" box wording; the docking page links `docs/docking.md`
      ("Design page on GitHub") and, when present, `docs/docking-reference.md`.
- [ ] Decide whether `/docs/docking/` should also render `docs/docking-reference.md`. Today only `docs/docking.md` is
      rendered; the reference file is linked.

## 2. Dates (`src/data/dates.mjs`)

- [ ] Set `RELEASE_DAY` to the release day (UTC, YYYY-MM-DD). It is `"TODO"` now on purpose: `/docs/docking/` takes it
      and the build fails with "Invalid time value" if it is left.
- [ ] Give `RELEASE_DAY` to the pages marked `TODO-RELEASE`: `/`, `/docking-layouts/`, `/toolbar-groups/`, `/docs/`,
      `/docs/placement/`. Not `/window-motion/` or `/drag-intent/` (a link changed there, not the text).
- [ ] `/docs/motion/`: bump it too if the motion README changed in substance at the release (it names docking).

## 3. What the release itself must do (not in this branch)

The web build's link check (`scripts/check-links.mjs`) fails on `/docs/docking/` until `docs/docking.md` exists; that
is expected, don't silence it (it also names `/lab/` where the lab is not built).

- [ ] Add `docs/docking.md` and `docs/docking-reference.md`; `packages/docking/` with `package.json` (the docking page
      builds from the first appearance of `docs/docking.md` and `packages/docking/package.json`).
- [ ] `apps/web/package.json`: add `"@n-uf/docking": "workspace:*"` (not added here: the package is not in the
      workspace and `pnpm install` would fail).
- [ ] Switch every import: `@n-uf/placement/scene` to `@n-uf/docking`, `@n-uf/placement/scene/cases` to
      `@n-uf/docking/testing`, in `src/demos/desk.ts`, `src/demos/hero-window.ts`,
      `src/snippets/pair-placement.ts` (becomes a docking sample, `pair-docking.ts`; `PairCode.astro` skips a library
      with no sample today, so add `docking` to its `code` and `entries` maps; `scripts/snippets.test.mjs` only
      knows `motion|placement` in its regex and package list), and in `apps/lab` (`docwin/host.ts`, `presets.ts`,
      `store.ts`, `kit-presets.ts`, `intent-presets.ts`, `feel-panel.ts`, `shell/checks.ts`, the lab's own text in
      `shell/pages.ts` and `pages/overview.html`). Keep `ALIASES` for the old lab ids (`#/placement/desk`,
      `#/placement/toolbar`): this site's pages link `/lab/#/placement/toolbar` and `/lab/#/docwin`.
- [ ] The home hero's shared window (`src/demos/hero-window.ts`, `src/components/HeroWindow.astro`,
      `src/islands/hero-window.ts`): docking's part imports `solve` and the `Scene` types from `@n-uf/placement/scene` and
      `StackForm` from `@n-uf/placement/stack`: switch them to `@n-uf/docking` (check where the release puts `StackForm`).
      Placement's part imports `positionPopup` and `BELOW_LEFT` from the root `@n-uf/placement`, which stays. Re-check what
      the window reads off `solve`: `SceneItemLayout.formKind` and `inMenu`, `SceneEdgeLayout.menu`, and that the numbers still
      give the story (Files open, Outline folded to its header, View in the » menu at 720 px; the callout sentence is built
      from the layout, so it says whatever `solve` gives). The window's comments name `DockState`; the code says `Scene`.
- [ ] The three hero slots are text only: the earlier scope, popup and window diagrams are gone from the home. The live
      tiling demo went too; the Place group of the home keeps a static tiling thumbnail only.
- [ ] Docs sources that name docking: the motion README and `docs/motion.md` (`createLandingModel` takes what
      docking's `lanes()` gives); placement's README loses the docking sections.
- [ ] Share images: render `public/og/docking-layouts.png` (the file here is the old desk-layouts image, only renamed),
      `public/og/toolbar-groups.png` (text now says `@n-uf/docking`), `public/og.png` (text still says "n-uf motion &
      placement"; the home worker may change it) and a new image for `/docs/docking/` if the docs pages get their own.
      Sources: `scripts/capture-og.mjs` (already points at `/docking-layouts/`; the capture lives in
      `scripts/og-src/docking-layouts.png`), `scripts/render-og.py` (card texts already updated).
- [ ] Root `package.json` scripts (build, typecheck, test, check filters), `scripts/sync-placement-version.mjs`
      (docking gets motion's version too), `knip.json`, `.dependency-cruiser.cjs`, `release.yml`, the first npm publish
      of the new name (trusted publisher set up first).
- [ ] Outside the repo: n-uf.com project entry for motion, GitHub About and the npm homepage of `@n-uf/docking`.

## 4. After deploy

- [ ] `curl -sI https://motion.n-uf.com/desk-layouts/` shows `301` and `location: /docking-layouts/`, with and without
      the trailing slash; `/og/desk-layouts.png` redirects to `/og/docking-layouts.png`.
- [ ] The sitemap lists `/docking-layouts/` and `/docs/docking/`, not `/desk-layouts/`; every JSON-LD parses; titles
      are at most 60 characters and descriptions 120 to 155.
- [ ] Resubmit the sitemap in Search Console; request indexing for `/`, `/docking-layouts/` and `/docs/docking/`.
