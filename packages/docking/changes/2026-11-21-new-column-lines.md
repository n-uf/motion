- Fixed: **over a drawn rail, a new column's line and `targets()` and the lanes now decide the same** (the one-layout
  property over a rail has no exceptions left). A drawn rail owns its whole rect, so `targets()` no longer offers a
  `column:<side>:<ring>` over the rest of a rail (past its last tile, or below a held tile's own run) where the lanes
  stayed, and a new column's lane gives way to the rail as seen: its hit rect stops at the rail's inner side, so a
  pointer on the held tile's own rail stays home or floats, as `targets()` says, instead of picking the new column whose
  box lands where that rail was. The new column's marks are unchanged (they are laid in the layout that makes it).
