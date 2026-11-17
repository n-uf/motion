# motion

> [!CAUTION]
> ## Not yet stable
>
> **@n-uf/motion is young and still changing. Its API (the frame loop, signals, springs and tweens, and the gesture recogniser) and its timing behaviour are not final.**
>
> Version numbers are dates (YY.M.R), not semantic versions, so any release may break things, including how frames are scheduled, how springs settle and how gestures are timed. Pin an exact version and read the [CHANGELOG](./packages/motion/CHANGELOG.md) before you upgrade. If you need a stable animation library, use [Motion](https://motion.dev) or [GSAP](https://gsap.com). Both work on the DOM, so neither is a drop-in replacement.

Site and live demos: [motion.n-uf.com](https://motion.n-uf.com)

[`@n-uf/motion`](./packages/motion) is the motion layer under n-uf's
interfaces: one frame loop with an injected clock, fine-grained signals,
springs and tweens, and a DOM-free gesture recogniser. It knows nothing about
the DOM, canvas or React; hosts hand it a clock and plain event objects and
read plain numbers back. The package README has the API.

```sh
pnpm install
pnpm check   # typecheck, tests, build and dist check
pnpm bench   # signals benchmark (see packages/motion/bench/RESULTS.md)
pnpm lab     # the motion lab on http://localhost:3060
```

- `packages/motion`: the library (`@n-uf/motion` and its `/clock`, `/signals`,
  `/values`, `/gestures`, `/testing` and `/browser` entries).
- `apps/lab`: a lab (not published), with an overview, a glossary and three
  working pages: Motion, a tiling stage for the window motion rules (master,
  dwindle, columns, grid; drop indicator or snap to slot); Document window,
  one Scene host (panels, toolbars and floats in a window; every conformance
  row of `@n-uf/placement/scene/cases` and the drag intent's cases play on
  it, and its presets are tried by a real mouse); and Checks, which runs the
  pages' scenarios. Every move is checked frame by frame. "Run all scenarios"
  plays scripted moves; `window.__motionLab.runAll()` returns the results for
  a headless try.
- Versions are calendar versions `YY.M.R`, as in hypr-tiling: `pnpm version:bump`.
- Licensed under [PolyForm Perimeter 1.0.1](./LICENSE).

## Contributing checks

`pnpm check` runs, besides the typechecks, tests, builds and the lab's typecheck, two repository checks:

- `pnpm dirt`: a ratchet over the code's dirt. It counts dependency-cruiser rule violations (import cycles; the two
  packages importing each other; a package reaching into an app; an app reaching past a package's public entries; a
  folder reaching into another's files instead of its index), jscpd clones of 50 tokens and more, and knip findings (unused files, exports and dependencies) per
  kind, against the ceilings in `dirt-baseline.json`. A count above its ceiling fails; a count below it is reported, so
  the ceiling can come down (never up). `node scripts/dirt.mjs --write` stores today's counts as the new ceilings, and
  refuses to raise any of them.
- `pnpm public-words`: this is a public repository, so the check lists no private names and no process words (such as
  revision numbers or role names) in `packages/` and `apps/`. It keeps the names only as SHA-256 hashes, so the check
  itself leaks nothing; a node test (`scripts/public-words.test.mjs`) covers it with made-up words. A hit names the line
  and the word; reword the line, or, for a quote of third-party text, add the whole phrase to the allowed list in
  `scripts/public-words.mjs` with a reason.
