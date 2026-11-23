# 0010: Three layouts, one job each

*Decided 2026-11-22. The aim order is on `live/motion`; the marks part is in progress (the Consequences say what holds
meanwhile).*

A docking drag reads three layouts, and every question has exactly one of them: `room` says which places exist and fit,
the landings say where one place's aim meets the next, and `shown(frame)` is what is drawn.

## Context

Two computations answered "which place is the pointer at" along a bar: `lanes()` cut halfway between the landings of
two adjacent places, each in its own layout, at the grab where they overlap; `targets()` cut a toolbar's neighbor at its
middle. For the same pointer a host reading the tiles and one reading the lanes could put a toolbar on opposite sides of
a neighbor (8 of 24 drops in one host's sweep). Unifying them raised a question growth ([0005](0005-growth-is-spare-room.md))
had left open: beside a movable grower, which layout does the aim cut read, the drawn one (the grower at its grown
length) or the growth-off one (where drop room is measured)? Read in the drawn layout, a place inside the grower's spare
room could never be reached; read in the growth-off layout, the cut could lie over a drawn neighbor.

The rule that toolbars take the nearest place and panel columns take halves is not reopened.

## Decision

- **`room`** (the window solved with every movable grower's growth off): which places exist and fit. Nothing else reads
  it.
- **The landings, each in its own commit layout:** the aim cut. Along a bar or a toolbar rail, where one place meets the
  next lies halfway between their landings, at the grab where two landings overlap; a panel column cuts by halves of what
  it draws. `targets()` and `lanes()` cut by this one rule (`aimCut`), so they give one aim order for every pointer.
  Whether a pointer reaches a place is judged on these cuts: a grower's spare room is reachable.
- **`shown(frame)`:** what is drawn, the guides included, which are cut in it.
- **Stops are the places.** A place whose landing is never the nearest to any pointer has no hit, and a spot with no
  stretch, but `stops()` still lists it, so "Move to" menus and the arrow keys keep every place.

## Consequences

- One aim order: a property checks that both paths give the same order over every pointer of the sweep's windows.
- Two conformance rows change their expectation: a toolbar over a neighbor of its own length stays before it on either
  side of its middle (the nearest landing), and a drop over a fixed item at a zone's end lands where its nearest landing
  is.
- Crossed cuts: a place whose cut after it would lie before its cut before it is nearer no pointer. It is left out of
  the cutting (its neighbors cut between themselves, so it moves no other cut) and has no stretch, though it stays a
  stop; never the item's own place. Both paths cut through the one helper (`crossFreeCuts`).
- The used count: every landing, and the room a drop over free room makes, is read with the dropped item counted as just
  used (`markUsed`), as its commit counts it, on both paths.
- One sliding range: a place over free room is read by both paths from one model (`slideRange`), and a landing counts
  for a place only where its own commit is that place. Every lane slide is a tile range but on an empty edge: there
  `targets()` offers the edge as its drop strips by zone (no slots, so no landing cuts), while `lanes()` slides one spot
  along its whole length.
- In progress, the marks part: a growing fixed title's slack is still free room for the marks, so a box is drawn over
  the grown part of the title instead of at most a line.
- Guarded by docking's target-model and sweep tests (the aim-order property) and the lab's aim-order sweeps by the tiles
  and by the landing model.

## Date

2026-11-22. In progress: the marks part only. The release is named here when it ships.
