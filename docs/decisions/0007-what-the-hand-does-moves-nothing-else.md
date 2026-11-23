# 0007: What the hand does to a float moves nothing else

A float the hand drops or grows wins the room it covers; a float the hand does not touch never moves.

## Context

Growing a float by its corner over an anchored float's place moved the anchored float away (by more than 300 px in one
window): the resize kept the grown float clear only of docked items, bars and chrome, and then the solve laid every
anchored float clear of every float with a rect of its own, so the anchored one yielded. A float dropped by the hand
over content had the same shape: the solve moved it to a clear place the hand never chose.

## Decision

- **What the hand covers, it wins.** A drop (`floatAt` with a rect) or a resize by hand (`resizeFloat`) whose new rect
  lies over an anchored float as drawn gives the float one more than the largest `since` there, so it covers the
  anchored float, whichever was floated first.
- **What the hand doesn't cover never moves.** A drop or a resize that stays clear of every anchored float keeps its
  `since`, so a nudge beside an anchored float moves nothing. An anchored float keeps clear only of the anchored floats
  and the floats with a rect of their own floated strictly before it.
- **A float the hand leaves over docked items stays there.** A float drop keeps clear of the docked items only while the
  pointer is still on the item there; else it lies at the hand, marked `stays`, and from then on is only kept inside the
  stage and clear of bars and chrome.

## Consequences

- A group sent to Float from a menu still lands beside the floats already there: no hand chose its rect.
- The switch between the column's wall and the hand has no hysteresis: a pointer jittering on the column's edge can flip
  the drawn float between the two by a pixel of travel. Known, not fixed.
- Guarded by docking's `test/float-anchored.test.ts` and `test/float-stays.test.ts`.

## Date

2026-11-20, in release 26.11.56.
