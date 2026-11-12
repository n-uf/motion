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
- `apps/lab`: a lab (not published) for the window motion rules, settle,
  hold and reveal, on two pages: a tiling stage (master, dwindle, columns,
  grid; drop indicator or snap to slot) and a desk (a toolbar between band,
  columns and pinned; panel columns; opening documents). Every move is
  checked frame by frame. "Run all scenarios" plays scripted moves;
  `window.__motionLab.runAll()` returns the results for a headless try.
- Versions are calendar versions `YY.M.R`, as in hypr-tiling: `pnpm version:bump`.
- Licensed under [PolyForm Perimeter 1.0.1](./LICENSE).
