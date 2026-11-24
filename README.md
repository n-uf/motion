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
- [Reference](./docs/motion-reference.md): every entry point's behavior; the exported types are the contract.
- [npm](https://www.npmjs.com/package/@n-uf/motion) and the [package README](./packages/motion/README.md).

## @n-uf/placement: where things fit

The stage cut into bands, the items along one edge fitted with their forms, one edge's drop places, floats kept
clear, panes tiled (with one layout per held place of a tiling drag and the place under its pointer, `tilingDrag`) and popups positioned. Pure
functions over plain data.

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
- [`docs/`](./docs): [the concept](./docs/concept.md) across the three packages, the design pages and the reference
  pages of the packages, [the SDK surface](./docs/sdk.md) (every entry's types and signatures), [the project
  structure](./docs/structure.md), [proposals](./docs/proposals) (features before they are built, the parked ones as
  the backlog) and [decisions](./docs/decisions) (one record per settled rule).
- `apps/lab`: a lab (not published), with an overview, a glossary and five
  working pages. Motion has two: Settle and tiling, a tiling stage whose
  windows are the items of one layout motion (master, dwindle, columns, grid;
  the drop preview is Outline, Placeholder or Glide), and Drag intent and
  previews, the drag intent's cases on the Document window. Placement has
  Tiling drag, `tilingDrag` over the reference adapter. The Document window
  is one Reference host (panels, toolbars and floats in a window; every
  conformance row of `@n-uf/docking/testing` plays on it, and its presets are
  tried by a real mouse). Checks runs the pages' scenarios. Every move is
  checked frame by frame. "Run all scenarios" plays scripted moves;
  `window.__motionLab.runAll()` returns the results for a headless try.
- Versions are calendar versions `YY.M.R`, as in hypr-tiling: `pnpm version:bump`.
- Licensed under [PolyForm Perimeter 1.0.1](./LICENSE).

## Contributing checks

Docking's heaviest test files (the sweeps, listed in `packages/docking/vitest.config.ts`) run apart from the rest:
`pnpm --filter @n-uf/docking test` skips them and `pnpm --filter @n-uf/docking test:sweep` runs only them. `pnpm check`
runs both; `pnpm check:quick` is the same without the sweeps (CI runs the two as parallel jobs).

`pnpm check` runs, besides the typechecks, tests, builds and the lab's typecheck, repository checks:

- `pnpm lint`: ESLint over the packages, `apps/lab`, `apps/web` and `scripts/`, with no warning allowed; it is the first
  step of `pnpm check:quick`. The rules are in `eslint.config.mjs`: the type-aware typescript-eslint set on the files a
  tsconfig covers, and the syntax-only set on the rest. A finding is fixed, or kept with an
  `eslint-disable-next-line <rule> -- <reason>` comment above it; an unused disable comment is an error too.
  `eslint-suppressions.json` lists known findings, per file and rule with an exact count, that are to be fixed on their own; a
  further finding of such a rule in that file, or a listed one that no longer occurs, fails the lint.
- `pnpm changes`: the changelog fragments (see "Changelog entries" below) are well formed, and `scripts/changelog.test.mjs` passes.

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

## Changelog entries

A change does not edit a CHANGELOG's `## Unreleased` section (parallel branches would always conflict there). It adds
one small file per package it changes, `packages/<pkg>/changes/<yyyy-mm-dd>-<slug>.md`: the date the change was written,
then a lower-case slug of words joined by `-` (for example `2026-11-21-asked-lengths.md`). The file holds exactly the
markdown that would go under Unreleased: bullets, with an optional `### Heading` line first for a grouped entry; no
`## ` heading. Fragments join in name order, so the date keeps them chronological (add a later date, or a slug that
sorts after, to put an entry after another).

- `node scripts/changelog.mjs check` (part of `pnpm check`) fails on an empty fragment, one that starts with neither a
  bullet nor a `###` line, or a malformed name.
- `node scripts/changelog.mjs preview [version]` prints what a release would write.
- `pnpm version:bump` ends with `node scripts/changelog.mjs join`: per package, the existing `## Unreleased` body first,
  then each fragment in order, go under a new `## <version>` heading where Unreleased was, and the fragments are
  deleted. It refuses when `## <version>` already exists, and writes nothing if any package refuses.

The `files` of each package list no `changes/` folder, so fragments are never published.

## A library change proves what it left alone

A change to a library runs `pnpm old-vs-new <base>` (the commit it started from) and commits its expect file under
`.changes-expect/<slug>.json` (or names it in the PR body): the list of outputs it means to change. The command records
the public outputs of the three packages at `<base>` and at the head over a fixed corpus and prints, per package and per
output kind, how many cases are the same and how many changed, with the first differences. The review reads that
printed summary; the change passes when it exits 0 with its expect file (`--expect .changes-expect/<slug>.json`).
How it works, the expect file and what the corpus doesn't cover: [docs/old-vs-new.md](./docs/old-vs-new.md).
