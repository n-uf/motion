# 0009: One layout per held place of a tiling drag

A tiling drag has the docking drag's rule ([0003](0003-one-layout-per-state.md)): every held place has one layout,
`tilingDrag(...).after(held)`, which a frame holding it draws and its release commits. Home is the gap the release
leaves.

## Context

A tiling host decided a drag through about a dozen derivations: three hit-test bases (the tree with the gap closed, the
lift rect, the DOM re-mapped by a patch) and the commit tree derived three times (one per preview mode, and once more at
the commit, then normalized after what was drawn). Each open issue sat on one of those seams: a swap whose partner's
landing was never on screen, a merge target home covered, a group drag whose preview and commit differed, a commit that
stored a normalized tree no frame had drawn.

Weighed, for where the tree lives: moving the host's tree and its changes into placement (a `Split` with stack nodes),
or an adapter over the host's own tree. Taken: the adapter. The host keeps its tree type, its changes and its sizing
model; the library owns the rules (what is released and when, which tree each change takes, home, the refusals, one
layout per held place).

## Decision

- **The adapter** (`TilingTree<T, K>`) gives the tree as a `Split` (`split`, the one source of geometry, laid out with
  `layoutSplitTree` under the drag's options), its stacks (`stackOf`), and the changes: `release`, `beside`, `swap`,
  `join` and an optional `normalize`. Each is pure.
- **Which tree each change takes.** `beside` and `join` take the released tree: the subject leaves its old place first,
  so the place it lands in is measured and changed without it, and a stack never holds it twice. `swap` takes the tree
  with the subject still in it: the subject's old place is exactly where the partner goes.
- **`after(held)`** is `normalize(change)`: the tree a release commits, its layout, the subject's landing and every
  other pane it moves from where it was at the lift. What a frame draws is what a release stores, `normalize` included.
- **The base** is the tree with the subject released, laid out: what a frame draws at rest (nothing held, or a refused
  place), and the one hit basis of the drag, fixed at the lift (since [0012](0012-one-zone-map-per-tiling-drag.md): the
  lift or the base, as the host draws).
- **Home is the gap the release leaves:** the subject's lift rect when releasing it takes a drawn pane away (a pane alone,
  a whole stack), null when it takes none (a member torn out of a stack that stays drawn). A torn member's own place is
  then an ordinary place, the join back at its index. `after(home).tree` is the lift tree itself, never normalized.
- **Refusals are codes,** judged on the base (room, `canSplitPane`) and on the change's own layout (fit, `dropFits`'
  rule), never on another tree: `self`, `still`, `missing`, `join`, `room-along`, `room-across`, `fit`. A refused place's
  `after` is the lift: its release commits nothing.
- **A side drop's size is a declared kind** (`TilingSize`), half and half today. A later sizing rule is a new kind, never
  an option.

## Consequences

- The preview modes of a host differ only in what they draw, never in the tree they commit.
- Home lies only over base panes whose rect changed when the subject was released; `normalize` is idempotent on every
  `after`.
- A host proves its own adapter with `tilingConformance(trees, options)`: the properties (`TILING_PROPERTIES`) over every
  subject of its trees and every held place, with counts and the first failures in words, and no test runner.
- The hit half, which place the pointer is over, is built since: targets on one fixed layout, pane parts as join
  targets, the zone hold, and what a frame draws. See [0012](0012-one-zone-map-per-tiling-drag.md).
- Guarded by placement's `test/tiling-drag.test.ts`, which runs `tilingConformance` over generated trees on the
  reference adapter (`splitTreeOps`), and the lab's Tiling drag page.

## Date

2026-11-22, the layout half: on `live/motion`, not yet released. The hit half followed on 2026-11-23 (0012).
