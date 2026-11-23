# 0004: A fixed item may still step

A fixed item is a reserved place. Whether it takes give-way steps is a second property, `stepping`, and the solver reads
"takes steps" through one predicate, never `fixed` itself.

## Context

`fixed` (a title, window controls) meant two things at once: *its place is fixed* (it is never dragged, no target covers
it, nothing lands between it and its zone's anchor) and *its size is fixed* (it keeps its first form and never goes into
the »). A page readout at a title bar's end needs the first and not the second: it must never move or take a drop before
it, and it must still step down its own ladder (a `controlLadder`) and fold into the bar's » as the bar narrows.

Weighed:

- **Split `fixed` into two new flags** (a placement flag and a size flag). Every host that writes `fixed: true` would
  have to change, for no gain to them.
- **Keep `fixed` as "a reserved place" and add one opt-in on it**, the way `pushable` is "a fixed item that yields". Taken.
  It is named `stepping`; `giveWay` was rejected because `DockEdge.giveWay` already names a bar's own shrinking.

## Decision

- `StackItem.stepping` (placement) and `DockItem.stepping` (docking): a fixed item with `stepping: true` keeps only its
  reserved place. It steps through its forms, folds, and goes into its edge's » like a movable item with the same forms.
- `itemSteps(item)` (`@n-uf/placement/stack`) is the one reading: an item takes steps when it isn't `fixed`, or when it
  is fixed with `stepping`. Every rule of the ladder reads it; the rules about a place (never dragged, no hit, no stop
  before it) read `fixed`.
- A growing title holds its natural length while others still have steps (the title rule) only when it takes no steps
  and grows, so a stepping fixed item never holds.
- "Nothing lands before it" is judged on the order of ids, so it holds while the item is in the » and has no rect.
- `stepping` is a declaration, as `pushable` is: taken from the base state, never stored.

## Consequences

- A stepping fixed item fits exactly as a movable item with the same forms, `used` and `kept` would; a plain fixed item
  lays out byte for byte as before.
- A drop beside a stepping fixed item may step it, as it may a movable item, but never squeezes it under its least nor
  moves it off its zone's anchor; beside a plain fixed item the same drop is refused (`squeezes-fixed`).
- Guarded by placement's `test/stack-fixed-stepping.test.ts` and docking's `test/fixed-stepping.test.ts` (the ladder down
  to the fold and the », the fit of a movable item with the same forms, never dragged, nothing lands before it, never
  stored).

## Date

2026-11-20, in release 26.11.56.
