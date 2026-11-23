- **Added: `tilingDrag` in `./tiling`, the layout half of a tiling drag.** `tilingDrag(tree, subject, { ops, area, min, ...splitOptions, still? })`
  works over a `TilingTree` adapter (the host's own tree and changes; geometry from its `split(tree)`, laid out with
  `layoutSplitTree`) and gives the lift and base layouts (the base is the tree with the subject released), `home` (the
  gap the release leaves: the subject's lift rect, or null for a member torn out of a stack that stays drawn), and
  `after(held)` for home, a swap, a side or a join: the tree a release commits, its layout, the landing, the panes it
  moves, or a refusal code (`self`, `still`, `missing`, `join`, `room-along`, `room-across`, `fit`). What a frame holding
  a place draws is what its release commits. `beside` and `join` act on the released tree, `swap` on the tree with the
  subject still in it, so a swap's partner lands in the subject's old place; home commits the lift tree itself, never
  normalized. `splitTreeOps` is the reference adapter over `StackedSplit` (a `Split` with stacks), and
  `tilingConformance` runs the drag's properties on any adapter. New API only: no existing output changes.
