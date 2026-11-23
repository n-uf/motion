# 0008: Reach only adds

A reach strip past an edge's end extends a target's hit. It never takes area from another target's own hit.

## Context

`DockDropOptions.endReach` gives a bar a strip past each end (over an inset's strip beside the content, say), so a
pointer that overshoots the bar still picks its end place. That strip took the corner of the virtual new-column line's
own hit where the two met, so the line lost its corner points once `endReach` was set (96 lost areas across the inset
scenes compared); a line whose drop is the same move as home, or as a rail stop, lost pieces the same way.

## Decision

- A reach strip never takes what another target holds as its own: a drawn edge's owned band, or the tiles of an edge
  with no drawn ends (a new column's line, a rail stop) as it tiles on its own.
- Stated so a test can pin it: for every target, every piece of its hit at `endReach: 0` lies inside its hit at any
  larger reach.

## Consequences

- With `endReach`, a new column's line keeps its corner points, and a rail stop its pieces.
- Known: once a reach strip is cut around another target's pieces, a target's largest piece (`hit`) may no longer hold
  its whole reach-0 rect; its pieces (`hits`) still cover it. A reader of `hit` alone reads the largest piece only.
- Guarded by docking's `test/reach-only-adds.test.ts` (inset scenes, bars across the columns' ends),
  `test/end-reach-targets.test.ts` and `test/rail-end-reach.test.ts`.

## Date

2026-11-20, in release 26.11.57.
