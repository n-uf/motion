- Behavior change: **the float floated first wins the place both want; what the hand does moves nothing else.** An
  anchored float keeps clear of the anchored floats floated before it, as before, and of the floats with a rect of their
  own floated strictly before it (a smaller `since`), no longer of every float with a rect of its own. A float floated
  after an anchored float (or as early, with no `since`), grown over it by a corner resize or dropped on it, covers it
  (or lies under it, by the stacking order), and the anchored float keeps its place. A group sent to Float from a menu
  still lands beside the floats already there.
- Behavior change: **what the hand covers, it wins; what it doesn't cover never moves.** `floatAt` with a rect (a drop)
  and `resizeFloat` give the float one more than the largest `since` there only when its new rect lies over an anchored
  float as drawn, so a float dropped or grown over an anchored float wins over it whichever was floated first; a drop or
  resize that stays clear of every anchored float keeps its `since`, so a nudge beside an anchored float moves nothing.
  Re-anchoring with no rect, `raiseFloat` and `markUsed` keep it too.
