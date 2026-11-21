- Behavior change: **"does not fit" is decided by the hand.** The float target's drop (`DockDrop.after`, so
  `dockDrag(...).after({ kind: "float", point })`) keeps a float clear of the docked items only while the pointer is
  still on the item at that clear place (on the hand rect as kept inside the stage). Otherwise the float lies at the
  hand, over the docked items it covers, still clear of the bars and the chrome, and the least-covered fallback is not
  used for it. A narrow float pushed at a column keeps the wall until the pointer enters the column, as before; a float
  wider than the open room follows the hand and lands where it is shown, instead of jumping to one of a few seams.
- Added: **`DockFloat.stays`**, the mark of a float the hand left over content. `solve` keeps a marked float inside the
  stage and clear of the bars and the chrome only, never beside what it covers (a `float-covers` note says what), so
  it stays put at rest; a float with no mark keeps the rule it had (it moves clear when a column opens under it or the
  window shrinks). The float target's drop decides the mark again each time; `floatAt` with a rect clears it;
  `resizeFloat`, `orientFloat`, `raiseFloat` and `markUsed` keep it. `FloatPlace.stays` sets it with a rect
  (`moveTo`), and the place `homeFor` gives carries it. `fitResize` on a marked float stops a growing edge at the bars
  and the chrome only. Stored as `stays: true` (`StoredDockStateFloat.stays`); a `stays` that isn't `true`, or one on an
  anchored float, is dropped and listed (`float:<id>:stays`).
- The conformance row `P5-neighbour-half-facing-it` now expects the float at the hand, over the neighbor's body
  (`140,190`), not beside it.
