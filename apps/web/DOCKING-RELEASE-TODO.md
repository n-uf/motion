# Docking release: what is left

Held work on `fl/docking-pages` (n-uf/motion#85), rebased on the release (26.11.54, 2026-11-21). The samples, demos,
copy, data and config are on the released SDK; what is left needs the deployed site, a font or a decision.
Delete this file in the release PR once every box is ticked.

## Done at the rebase (2026-11-21)

- [x] Every sample and demo is on the released SDK: the home's code pair (`pair-motion.ts`, `pair-placement.ts` on
      `/popup` and `/tiling`, `pair-docking.ts` on `@n-uf/docking`), the hero's three illustrations (`hero-place.ts`
      takes `positionPopup` from `@n-uf/placement/popup`; `hero-doc.ts` is a `DockState` with `floatSizes`; `hero.ts` and
      `islands/hero.ts` use `drawBox` from `/browser`, `onActiveChange` and `frameInterval`), the docking layouts page
      (`desk.ts`), the lab. `grep -rn "placement/scene" apps/` finds nothing; no `Scene`, `SceneTarget`, `storeScene` or
      `readScene` is left, and no import of a removed placement entry.
- [x] The names, facts and claims in prose and FAQ answers are checked against `docs/docking.md`,
      `docs/docking-reference.md` and `packages/*/package.json` at the tag: docking depends on `@n-uf/placement`
      and has `@n-uf/motion` as an optional peer, so the hero lead ("Placement turned into a window kit") and the footer
      ("a window kit built on placement") stay true; the home says "Motion and placement also work alone", not docking.
- [x] `/docs/docking/` is built from `docs/docking.md` and links `docs/docking-reference.md` (the reference is linked,
      not rendered: it is 1,140 lines). `check-links` passes now that the file exists.
- [x] Dates: `RELEASE_DAY` is 2026-11-21, on `/`, `/docking-layouts/`, `/toolbar-groups/`, `/docs/`, `/docs/motion/` (its
      README changed), `/docs/placement/` and `/docs/docking/`.
- [x] `vercel.json` has the 301s for the one page that moved (`/desk-layouts/`, with and without the slash) and its
      share image. `/toolbar-groups/` keeps its URL.
- [x] The old lab routes `#/placement/desk` and `#/placement/toolbar` still open the Document window (`ALIASES` in
      `apps/lab/src/shell/pages.ts`, for old links); the site links `#/docwin`.

## Still open

- [x] Share images: `public/og.png`, `public/og/toolbar-groups.png` and `public/og/docking-layouts.png` are rendered
      from fresh captures of the built site (1200 x 630, checked). The docs pages use the default image, so there is no
      `/docs/docking/` one. To redo them: `PLAYWRIGHT_CORE=<playwright-core folder> node scripts/capture-og.mjs <site
      address>` (the home capture is `#demo`), then `python3 scripts/render-og.py --font <InterVariable.ttf>` (the font
      needs both axes, opsz and wght; Pillow needs raqm).
- [x] The `mermaid` block of `docs/docking.md` never reaches `/docs/docking/`: `docs-markdown.mjs` drops a mermaid
      fence (and a heading with nothing left under it), and a test pins it. The repo keeps its diagram. The prose under
      "How the parts fit" stays and still says "Every edge in the diagram"; reword it in `docs/docking.md` if that reads
      oddly without the picture.
- [ ] After deploy: `curl -sI https://motion.n-uf.com/desk-layouts/` shows `301` and `location: /docking-layouts/`, with
      and without the trailing slash; `/og/desk-layouts.png` redirects to `/og/docking-layouts.png`.
- [ ] After deploy: the sitemap lists `/docking-layouts/` and `/docs/docking/`, not `/desk-layouts/`; every JSON-LD
      parses; titles are at most 60 characters and descriptions 120 to 155.
- [ ] Resubmit the sitemap in Search Console; request indexing for `/`, `/docking-layouts/` and `/docs/docking/`.
- [ ] Outside the repo: the `n-uf.com` projects entry name (n-uf motion), GitHub About and the npm homepage of
      `@n-uf/docking`, and the package READMEs' mentions of the site's name.
