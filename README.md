# motion

> [!CAUTION]
> ## Not yet stable
>
> **@n-uf/motion, @n-uf/placement and @n-uf/docking are young and still changing. Their APIs (the frame loop, signals, springs and tweens, the gesture recognizer, the drag and landing models, the edge fit, the dock state and its solver) and their timing behavior are not final.**
>
> Version numbers are dates (YY.M.R), not semantic versions, so any release may break things, including how frames are scheduled, how springs settle and how gestures are timed. Pin an exact version and read the CHANGELOG of each package ([motion](./packages/motion/CHANGELOG.md), [placement](./packages/placement/CHANGELOG.md), [docking](./packages/docking/CHANGELOG.md)) before you upgrade. If you need a stable animation library, use [Motion](https://motion.dev) or [GSAP](https://gsap.com). Both work on the DOM, so neither is a drop-in replacement.

Site and live demos: [motion.n-uf.com](https://motion.n-uf.com)

Libraries under n-uf's interfaces, released together with one version. Motion and placement stand alone: neither
imports the other, and they meet only in plain data (a rect, a drop target). Docking, the window's docking model, is
built on placement and meets motion the same way.

## @n-uf/motion: how things move

One frame loop with an injected clock, springs, tweens and the settle curve, a DOM-free gesture recognizer, the drag
intent and the landing model, and layout motion. It knows nothing about the DOM, canvas or React;
hosts hand it a clock and plain event objects and read plain numbers back.

```sh
npm i @n-uf/motion
```

- [Design page](./docs/motion.md): the concept, the parts, the rules.
- [Reference](./docs/motion-reference.md): every entry point's API.
- [npm](https://www.npmjs.com/package/@n-uf/motion) and the [package README](./packages/motion/README.md).

## @n-uf/placement: where things fit

The stage cut into bands, the items along one edge fitted with their forms, one edge's drop places, floats kept
clear, panes tiled and popups positioned. Pure functions over plain data.

```sh
npm i @n-uf/placement
```

- [Design page](./docs/placement.md): the concept, the parts, the rules.
- [Reference](./docs/placement-reference.md): every entry point's rules and options.
- [npm](https://www.npmjs.com/package/@n-uf/placement) and the [package README](./packages/placement/README.md).

## @n-uf/docking: where panels and toolbars dock

A window's edges (bars, rails and columns), items and floats as one dock state, solved into a layout, with the
targets, refusals and lanes of every drag, and the conformance rows a host plays. Pure functions over plain data, on
`@n-uf/placement`.

```sh
npm i @n-uf/docking
```

- [Design page](./docs/docking.md): the concept, the parts, the rules.
- [Reference](./docs/docking-reference.md): every rule, id and option.
- [npm](https://www.npmjs.com/package/@n-uf/docking) and the [package README](./packages/docking/README.md).

## Working in this repository

```sh
pnpm install
pnpm check   # typecheck, tests, build and dist check
pnpm bench   # signals benchmark (see packages/motion/bench/RESULTS.md)
pnpm lab     # the motion lab on http://localhost:3060
```

- `packages/motion`: `@n-uf/motion` and its `/clock`, `/signals`, `/values`, `/gestures`, `/drag`, `/layout`,
  `/testing` and `/browser` entries.
- `packages/placement`: `@n-uf/placement` and its `/stack`, `/tiling` and `/popup` entries.
- `packages/docking`: `@n-uf/docking` and its `/testing` entry.
- [`docs/`](./docs): the design pages and the reference pages of the packages, [proposals](./docs/proposals)
  (features before they are built, the parked ones as the backlog) and [decisions](./docs/decisions) (one record per
  settled rule).
- `apps/lab`: a lab (not published), with an overview, a glossary and four
  working pages. Motion has two: Settle and tiling, a tiling stage whose
  windows are the items of one layout motion (master, dwindle, columns, grid;
  the drop preview is Outline, Placeholder or Glide), and Drag intent and
  previews, the drag intent's cases on the Document window. The Document window
  is one Reference host (panels, toolbars and floats in a window; every
  conformance row of `@n-uf/docking/testing` plays on it, and its presets are
  tried by a real mouse). Checks runs the pages' scenarios. Every move is
  checked frame by frame. "Run all scenarios" plays scripted moves;
  `window.__motionLab.runAll()` returns the results for a headless try.
- Versions are calendar versions `YY.M.R`, as in hypr-tiling: `pnpm version:bump`.
- Licensed under [PolyForm Perimeter 1.0.1](./LICENSE).

## Contributing checks

`pnpm check` runs, besides the typechecks, tests, builds and the lab's typecheck, two repository checks:

- `pnpm dirt`: a ratchet over the code's dirt. It counts dependency-cruiser rule violations (import cycles; the
  packages importing each other against their layering; a package reaching into an app; an app reaching past a package's public entries; a
  folder reaching into another's files instead of its index), jscpd clones of 50 tokens and more, and knip findings (unused files, exports and dependencies) per
  kind, against the ceilings in `dirt-baseline.json`. A count above its ceiling fails; a count below it is reported, so
  the ceiling can come down (never up). `node scripts/dirt.mjs --write` stores today's counts as the new ceilings, and
  refuses to raise any of them.
- `pnpm public-words`: this is a public repository, so the check lists no private names and no process words (such as
  revision numbers or role names) in `packages/` and `apps/`. It keeps the names only as SHA-256 hashes, so the check
  itself leaks nothing; a node test (`scripts/public-words.test.mjs`) covers it with made-up words. A hit names the line
  and the word; reword the line, or, for a quote of third-party text, add the whole phrase to the allowed list in
  `scripts/public-words.mjs` with a reason.
