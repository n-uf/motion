# 0006: No input of a solve comes from its own output

A rect the layout must keep clear may be anchored to a region of the layout. The solve resolves it from that layout, so
a drop's `after` and its commit read the same rect.

## Context

A host drew a thin overlay strip at the content's right edge (a spine over the pages) and fed it to the dock state as a
fixed keep-clear rect, taken from the committed layout. A drop that opened or closed a column moved the content, and the
strip with it, but the drop's `after` was solved with the strip where it had been: the commit moved it, and a float
re-fitted 24 px off its marker. The input of the solve came from the previous solve's output.

Weighed: the host re-solving after each drop (a second layout per drop, against decision
[0003](0003-one-layout-per-state.md)), and rects the solver resolves itself against the layout's own regions. Taken: the
second.

## Decision

- **The rule:** no input of a solve is derived from that solve's own output.
- **An anchored keep-clear entry** is `{ region: "content", side, size, for, id?, minRegion? }` (`AnchoredKeepClear`):
  `size` px deep at that side of the layout's content, along its whole length, clamped to it; an empty content gives no
  rect, and with `minRegion` the entry applies only while the content is at least that size. `region` is a union that
  starts with `"content"` and may grow (an edge's band).
- **One resolver**, inside `solve`, after the edges and the content are final and before the floats, writes the rects to
  `DockLayout.keepClear` with their ids, so the host draws the strip from there. Nothing that sizes the content reads
  keep-clear rects.
- **Each reader names its layout:** the hits a drag shows and a float resize by hand read the layout on screen; a drop's
  fit and its floats read the drop's own `after`. A guide predicted in another layout is trimmed by the anchored rects on
  screen.
- An anchored entry is a declaration, taken from the base state, never stored. Fixed rects stay for what truly lies in
  stage coordinates.

## Consequences

- `solve(after().state)` equals `after().layout` for every target, and a float's marker is its rect in `after().layout`.
- An anchored keep-clear is for an overlay that takes no room. A strip that takes room is a static edge with a fixed item.
- A state with fixed rects only lays out exactly as before, and its layout has no `keepClear`.
- Guarded by docking's `test/keep-clear-anchored.test.ts` (the strip at the content's side, never stored, `minRegion`'s
  bound, the model windows unchanged, `solve(after().state)` equal to `after().layout`) and the lab's anchored-strip
  presets.

## Date

2026-11-20, in release 26.11.57.
