# 0011: Which item counts as docked is the item's declaration

Whether an item counts as a docked panel, for the inset that `insetWhen: "docked"` switches on, is the item's own
declaration, `countsAsDocked`; left out, the old reading of its forms holds.

## Context

`insetWhen: "docked"` turns the window's inset on while a docked panel is open. Which item counted as docked was read
from its first column form (`open`, `header` or `rail`). A narrow side strip, an item that only moves the content aside
and is no panel card, declares an `open` column form, so opening it alone switched the inset on: the pages went from
1400 × 800 to 1352 × 776, offset by 12 px, though no panel was docked.

Weighed: a new form kind the reading skips, and a declaration on the item. Taken: the declaration. A kind is the host's
label, and the model reads flags, never words (placement's "Few words" principle).

## Decision

- `DockItem.countsAsDocked?: boolean` overrides the reading either way: `false` keeps an item from switching the inset
  on, `true` counts an item of another form.
- Left out, an item counts when it is not closed, not fixed and its first column form is `open`, `header` or `rail`.
- It is a declaration, as `pushable` is: taken from the base state, never stored.

## Consequences

- A side strip open alone leaves the inset off: the content is the stage less the strip's width, and the strip lies
  flush at the window's side. With a docked panel open as well, the inset is on, as before.
- A state that declares none lays out exactly as before.
- Guarded by docking's `test/strip-inset.test.ts` and the lab's side-strip presets.

## Date

2026-11-22, on `live/motion`, not yet released.
