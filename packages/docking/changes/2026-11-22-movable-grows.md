- Added: **a movable item that grows takes its bar's free span.** An item that isn't fixed, drawn in a form with
  `main.grows` on a bar (a top or bottom bar, a compact rail, a side toolbar bar; never a panel column, whose cards grow
  as before), no longer just takes the fit's spare length end to end: the zones are laid with every growing item at its
  natural length, then each free stretch goes to the movable growers in the zones beside it (a start-zone grower the
  stretch after its zone, an end-zone one the stretch before, a center one fills the stretches on both sides), so a
  centered item that doesn't grow stays put. Its asked length on a bar (`DockItem.lengths.row`) is replaced by the free
  span (it only weighs the shares where two growers border one stretch). A growing title on such a bar keeps its natural
  length. No new field: `main.grows` says it.
- Added: **for drop room a movable grower counts at its natural length**, as a growing title does: every drop-room
  reading of a bar (its zone extents, slot lines, cards, the dragged item's own place, an empty zone's probe, and
  `zoneExtents`) is taken in one layout, the window solved with every movable grower's growth off (once per drag), so
  what its growth pushes along (a toolbar after it in its zone) counts where it would lie without it. The targets,
  refusals and zone extents beside a grower are those of the same state with the growth off (a center drop beside it
  is no longer lost, a bar with a centered fixed item takes it).
- Added: **dragged, a movable grower previews and lands at its natural length.** Its drop layouts (a target's `after`,
  `dockDrag`'s `after(held)` and its `landing`, a lane spot's landing, the held item's size) are the drop's state solved
  with its growth off: it and its bar's neighbors lie at its natural length, with no hole in its zone, and solving the
  state grows it. This is the one exception to "a held frame and its commit read one layout". States with no movable
  grower on a bar lay out, target and land exactly as before.
