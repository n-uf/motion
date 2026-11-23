# 0005: Growth is spare room

An item that grows owns only its natural length. The length it grows by is spare room: a drop may take it, and the item
yields it, never its natural length.

## Context

A form with `main.grows` takes the length its edge has to spare. Two cases read that grown length as the item's own:

- **A growing fixed title.** In a zone that also takes drops, the title filled the zone, so the zone's drop target had no
  room to land in and a drop there was refused ("Can't go here"); without `grows` the same drop passed.
- **A movable grower on a bar** (a toolbar group that should take its bar's free span, such as a row that stretches
  across the top bar). The fit gave it the stack's spare length end to end, so a centered neighbor moved, the places
  beside it depended on how far it had grown, and dragging it previewed and landed it at its grown length.

Weighed: a per-case exception in each target rule, and one reading of growth for every drop-room question. Taken: the
second.

## Decision

- **For drop room, a grower counts at its natural length.** A growing fixed title's least length, for a drop beside it,
  is its natural length. Every drop-room reading of a bar (its zone extents, slot lines, cards, the dragged item's own
  place and an empty zone's probe) is taken in one layout, the window solved with every movable grower's growth off,
  solved once per drag. A drop beside a grower lands as it would beside an item of its natural length that doesn't grow.
- **A movable grower takes its bar's free span.** On a top or bottom bar, a compact rail or a side toolbar bar (never a
  panel column, whose cards grow as before), the zones are laid with every growing item at its natural length; then each
  free stretch between two zones, or at an end with no zone there, goes to the movable growers in the zones beside it,
  shared by the growth the fit gave them. A centered item that doesn't grow stays put; a growing title on such a bar
  keeps its natural length; an asked length along the bar only weighs the shares.
- **Dragged, a movable grower previews and lands at its natural length.** Its drop layouts are the drop's state solved
  with its growth off; solving the state it lands in grows it. Its float takes its natural size (its `floatSizes`, never
  the default float size), under the pointer.

## Consequences

- A title zone that takes drops keeps its drop places beside a growing title; a neighbor may step so a drop lands, as
  beside a title that doesn't grow.
- A state with no grower on a bar lays out, targets and lands exactly as before.
- The cost: a held movable grower's frame is the one named exception to "a held frame draws its commit"
  ([0003](0003-one-layout-per-state.md)): it is drawn at its natural length, and the commit grows it.
- A growing fixed title's slack is still free room for the marks, so a box is drawn over the grown part of the title.
  The rule that the guides are cut in the drawn layout ([0010](0010-three-layouts.md)) would leave a line at most there;
  it is not built.
- Guarded by docking's `test/title-growth-room.test.ts` (a drop beside a growing title lands as beside the same title
  not growing; no place where only squeezing the title makes room) and `test/movable-grows.test.ts` (the free span,
  targets and refusals equal to the growth-off state's, the held layout, no guide over a grower as a frame draws it, the
  float under the pointer).

## Date

2026-11-20, the growing title in release 26.11.56. 2026-11-22, the movable grower: on `live/motion`, not yet released.
