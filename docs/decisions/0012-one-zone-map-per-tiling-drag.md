# 0012: One zone map per tiling drag, and swap-only run neighbors

A tiling drag decides which place the pointer is over on one layout that is fixed at the lift, with one hold rule for
every zone; and a side of a pane takes an insert only when that insert gives a new arrangement, so the pane next to the
dragged one is a swap and nothing else along the run.

## Context

[0009](0009-one-layout-per-tiling-place.md) gave a tiling drag one layout per held place (`after(held)`) and left the
other half open: which place the pointer is over. Two earlier tries made the hit depend on the layout the frame drew
(a held place kept in its zone where the frame draws its pane, then targets on the layout a frame draws). Both felt
unstable and were rolled back. Once the drawing feeds the hit test, the map depends on the held place, and that is
where the dead spots and the "whichever came first" cases come
from: with three columns S, A, B and S dragged, every side band of A names a place whose slot opens somewhere else, so
aiming at the nearest neighbor's edge does nothing.

A second problem showed on the pane next to the dragged one. Take S over N in one column. An insert of S above N gives
back the lift's order. An insert of S below N gives N above S, which is what a swap with N gives. Both sides were drawn
as places of their own, between home and the swap, so a straight drag onto N crossed a place that changed nothing, then
the swap, then a place that repeated the swap. The first draft of a cure, bands added to the swap's rectangle, made the
swap zone non-convex and a diagonal pass met places twice.

Weighed, for the hit layout: the layout the frame draws (the fixed point of draw and hit, as the first tries had it),
the lift for every host, and a choice of the lift or the base per host. For the neighbor: rects alone, and the tree
alone.

## Decision

- **One zone map per drag.** `tilingDrag(...).hit(basis)` builds the targets once, at the lift, from one layout:
  `"lift"` for a host that draws a mark over the layout at the lift, `"base"` for a host that draws the landed layout.
  The host says which at the lift, never per frame. The hit is remembered per drag and basis. Nothing is measured or
  laid out again per frame, and no rect comes from another layout.
- **Targets** are in `@n-uf/motion/drag`'s shape: one body target per pane the basis draws (the five regions of
  `paneRegion`), one target per pane part the adapter declares (`TilingTree.parts`, a join; the slot under the pointer
  gives the index), and home, the subject's lift rect, which wins over everything beneath it.
- **A place exists when `after(place).refusal` is null.** A refused zone holds nothing and falls to the target beneath
  it, never sideways, so the map never depends on room. A place whose release has the lift's arrangement is home.
- **One hold rule, two measures.** The held place keeps its zone until the pointer is `edge` px past the edge of the
  zone's visible part, the part no zone above it covers (6; every zone, home included; home wins over what lies beneath
  it); inside one pane, not over home, it also keeps until the pointer is `travel` px from where the place was taken
  (24). Both are at most `cap` (0.25) of the zone's extent on each axis. Any change of place takes the point anew.
- **What a frame draws.** On the lift basis, the lift and a mark that is a region of it (a side's half, a swap's or a
  join's outline, the wash in the open slot), never an `after` rect. On the base basis, `after(held)` from the first
  frame a place is held. A release commits `after(held)`, or the lift tree when nothing is held.
- **A side of a pane takes an insert only for a new arrangement:** not the lift's, and not the one a swap with that
  pane gives. A side that takes none belongs to the center.
  - A pane is a *run neighbor* of the subject when, in the lift tree, the two are whole children of one run (nested
    splits along one axis are one run) and stand next to each other in it, and the pane has the same bounds across the
    run (its rect, within 0.5 px). The tree decides "next to it", the rects only the bounds.
  - The side facing the subject goes (it gives the lift's order); the far side goes when the swap exchanges the two
    whole occupants. For a tab group as the neighbor only the facing side goes: a swap moves the active tab alone.
  - A torn tab has no run neighbor. A split with `master` is not part of a run.
  - With both sides along the run gone, the pane is a strip, the swap and a strip, each its full length along the run;
    the swap spans `neighborSwap` (0.56, an option of the hit) across the run, each strip 22 %.
  - It is judged once, on the lift tree, and is the same on both bases. A refused swap brings no strip back.
- **Every zone is convex.**

## Consequences

- Look-alike 2×2 grids behave differently by how they were built. Built as two columns, the pane below the dragged
  one is a run neighbor and is swap-only. Built as two rows that line up, the same pane is not in the subject's run:
  "above it" and "below it" are real results there (the subject leaves its row), and it keeps five regions. Moving the
  divider by a few px does not change this, because the tree decides it, not the rects.
- A strip is as large as a normal side band, so a side insert is as easy to hit on a neighbor as on any other pane. The
  cost is that the swap starts at the neighbor's edge, with no neutral band between home and the swap, and a pane
  grabbed by its title bar away from the middle goes into a strip, not the swap. If the swap feels too short, the cure
  is the one number, the share (`neighborSwap`, which a host can set).
- A swap trades the two slots, so "half each, beside the neighbor along the run" is no longer offered through that
  neighbor. When a swap is refused for size, the neighbor's middle offers nothing; if it is the last pane of its run,
  the order "N, then S" cannot be reached through it.
- On the lift basis every pane is a target, also one the base would cover with home. On the base, a pane whose rect
  lies wholly under home cannot be targeted; its places are reached through its neighbor.
- Neighbors no longer grow during a lift-basis drag, so the swap zone is its pane as drawn at the lift.
- Guarded by placement's `test/tiling-hit.test.ts` (the 13 diagonal sweeps of the failed draft kept as a table) and
  `tilingHitConformance` (the properties of `TILING_HIT_PROPERTIES`) over generated trees, both 2×2 grids, nested runs
  and tab groups, and the lab's Tiling drag page (Snap to slot on the base, Indicator on the lift; a check that the
  place read through the drag intent is the pure hold's).

## Alternatives rejected

- **A fixed point in Snap:** hit-test the layout the frame has just drawn, with a rule for the dragged pane's own slot.
  It still fails where the drawn layout is in lift geometry (the three-column case above), and the map moves with the
  held place.
- **Rect-only adjacency:** call a pane the neighbor when it touches the subject with the same bounds. It looks right
  and gives the same answer almost everywhere, but a 2×2 grid built as two rows lines up too, so its pane below would
  lose two real places (above and below it, each a new arrangement), and moving a divider by a few px would give it its
  five regions back.
- **Bands added to the swap,** so the swap reaches the neighbor's edge: a non-convex zone, and a diagonal pass meets a
  place twice.
- **The bands back when the swap is refused:** the map would depend on room, and a place that repeats the swap or the
  lift would return as a place of its own.
- **Plain siblings in the tree:** the subject's sibling is a sub-split in a nested column (S over A over B), so nobody
  would qualify.

## Date

2026-11-22 (the zone map and the hold rule) and 2026-11-23 (the run neighbor), on `live/motion`, not yet released.
