# vusyk

A vusyk is a melon vine's tendril: it coils into a spring and reaches for
what it holds on to.

[`@n-uf/vusyk`](./packages/vusyk) is the motion layer under n-uf's interfaces:
one frame loop with an injected clock, fine-grained signals, springs and
tweens, and a DOM-free gesture recogniser. It knows nothing about the DOM,
canvas or React; hosts hand it a clock and plain event objects and read plain
numbers back. The package README has the API.

```sh
pnpm install
pnpm check   # typecheck, tests, build and dist check
pnpm bench   # signals benchmark (see packages/vusyk/bench/RESULTS.md)
```

- `packages/vusyk`: the library (`@n-uf/vusyk`, `@n-uf/vusyk/browser`).
- Versions are calendar versions `YY.M.R`, as in hypr-tiling: `pnpm version:bump`.
- Licensed under [PolyForm Perimeter 1.0.1](./LICENSE).
