- **Added: `tilingDrag(...).hit(basis)` in `./tiling`, which place the pointer is over in a tiling drag.** Ask for it at
  the lift, with `"lift"` (the layout at the lift, the dragged pane's slot open: a host that draws a mark over it) or
  `"base"` (the tree with the dragged pane released: a host that draws the landed layout); it is remembered per drag and
  basis, like `after`, so a second call gives the same hit and its hold. It builds one zone map that does not change
  during the drag, so what a frame draws never moves what the pointer is over. A host needs no motion for it:
  `hit.placeAt(point)` is the place id at a point, `hit.heldOf(id)` the place it names, and `hit.hold(state, point)` the
  pure step of the hold. For a host on `@n-uf/motion/drag` it gives the targets in its shape (one per pane, one per
  pane part, and home), the intent's options (`hit.intent`, with no home: `createDragIntent({ ...hit.intent })` is the
  wiring), and a reader: `hit.read(frame, point)` gives `{ held, refused, mark }` (a mark of the held place's kind:
  `beside`, `swap` or `join`), `hit.drawn(read)` what a frame draws and `hit.release(read)` what a release commits. A
  place exists when `after(place).refusal` is null; a refused zone holds nothing and falls to the zone beneath it. One
  hold rule keeps the held place: until the pointer is 6 px past the edge of the part of its zone that shows (home wins
  over what lies beneath it), and inside one pane until it is 24 px from where the place was taken (`TilingHold.from`),
  each at most a quarter of the zone (`TILING_HIT_DEFAULTS`; `edge`, `travel` and `cap` are options, and `regions`
  takes the five region options the hit reads, `TilingHitRegions`). A place that gives back the arrangement at the lift
  counts as home. New API only: nothing that exists changes.
- **Added: a side of a pane takes an insert only for a new arrangement.** For the pane next to the dragged one in the same
  run (whole children of one run, with the same bounds across it), the side that gives back the lift's order and the side
  that repeats the swap are gone, and their strips belong to the center: it is a strip, one swap rectangle and a strip,
  each the full length of the pane along the run, the swap 0.56 across it (the hit's option `neighborSwap`). A tab group
  next to the dragged pane loses only the side facing it. Every other pane keeps its five regions. Two 2×2 grids that
  look alike differ: built as two columns, the pane below the dragged one is swap-only; built as two rows, it is not.
- **Added: `TilingTree.parts(tree, pane, rect)`** (optional) for the parts of a pane that take a join (`TilingPart`: a
  title bar, a tab strip with its slots), and `splitTreeOps({ bar, tab })` as the reference. A host that leaves it out
  has no join under the pointer.
- **Added: `tilingHitConformance(trees, options)`** with the properties of `TILING_HIT_PROPERTIES` (a fixed map, the
  zone rule, stillness, the hold's measures, one pass, existence, lift equals home, shown under the pointer, shown equals
  landed, sides only for a new arrangement, convex zones, a map room does not move), run on a host's own adapter, with
  the rows that are counted and not failed (`swapsBeside`, `insertsMoveOthers`, `insertsMoveOthersBeside`).
- **Added: `paneRegionShapes(rect, options)`** (the five regions as convex polygons) and the option `sides` of
  `paneRegion` (which sides exist; a side left out gives its whole strip to the center). Without `sides`, every region
  and place is as before.
