# Decisions

A decision record keeps one settled rule of the libraries: why it is the rule, what it is, and what follows from it. Each is one file, `NNNN-short-name.md`, numbered in the order it was settled. Numbers are never reused. A rule that changes gets a new record, and the old one says which record replaced it.

Each record has four parts:
- **Context:** the problem, and what was weighed.
- **Decision:** the rule, stated so a test can pin it.
- **Consequences:** what the rule makes true, what it costs, and the tests that guard it.
- **Date:** when it was settled (and the release that shipped it).

A rule that is decided and built on a branch, not yet on `live/motion`, gets its record with an *In progress* line at the top; the line goes when it lands. [concept.md](../concept.md) lists every record with its status.

A proposal ([`../proposals/`](../proposals/)) that ships leaves its accepted rules here.

## Index

The landing model's distance bound is 0001. Three shipped rules have no record yet, and are added as they are written up: the one-preview drag model, place guides and empty lanes, and panel columns by halves with toolbars at the nearest spot.

| # | Decision | Date |
|---|---|---|
| 0001 | [The hand rule](0001-the-hand-rule.md): the landing is the nearest in its lane, within `max(48, g / 2 + 6)` px of the pointer | 2026-11-20 |
| 0002 | [A held frame's marks follow the edge as drawn](0002-held-marks-follow-the-drawn-edge.md): marks clip in the layout they are drawn in, the hit rect as seen | 2026-11-20 |
| 0003 | [One layout per held place of a drag](0003-one-layout-per-state.md): a held frame draws `after(held)`, which its release commits, while its room is open; the landing model takes a held place | 2026-11-20 |
| 0004 | [A fixed item may still step](0004-a-fixed-item-that-steps.md): `fixed` is a reserved place; `stepping` lets it take steps, read through `itemSteps` | 2026-11-20 |
| 0005 | [Growth is spare room](0005-growth-is-spare-room.md): a grower owns its natural length; drop room reads the growth-off layout; a movable grower takes its bar's free span | 2026-11-20 |
| 0006 | [No input of a solve comes from its own output](0006-keep-clear-anchored-to-the-layout.md): keep-clear rects anchored to the content, resolved inside `solve` | 2026-11-20 |
| 0007 | [What the hand does to a float moves nothing else](0007-what-the-hand-does-moves-nothing-else.md): what the hand covers it wins; an untouched float never moves | 2026-11-20 |
| 0008 | [Reach only adds](0008-reach-only-adds.md): a reach strip never takes another target's own hit | 2026-11-20 |
| 0009 | [One layout per held place of a tiling drag](0009-one-layout-per-tiling-place.md): `tilingDrag(...).after(held)` over a host's adapter; home is the gap the release leaves | 2026-11-22 |
| 0010 | [Three layouts, one job each](0010-three-layouts.md): `room` for which places exist, the landings for the aim cut, `shown` for drawing (in progress) | 2026-11-22 |
| 0011 | [Which item counts as docked is the item's declaration](0011-which-item-counts-as-docked.md): `countsAsDocked` | 2026-11-22 |
| 0012 | [One zone map per tiling drag, and swap-only run neighbors](0012-one-zone-map-per-tiling-drag.md): the hit is built once at the lift on the lift or the base, one hold rule; a side takes an insert only for a new arrangement | 2026-11-23 |
| 0013 | [The grab is a function of the form the item is laid in](0013-grab-as-a-function-of-the-form.md): one function every reader reads, a plain point its twin; `grab` on every `DockAfter`; the held copy at the pointer less it | 2026-11-23 |
| 0014 | [A frame gap is not a rest](0014-a-frame-gap-is-not-a-rest.md): a gap is a rest only when the pointer was seen resting or moved across it at under half the hand's speed; else the hand carries on, the lost frames filled in (in progress) | 2026-11-23 |
| 0015 | [One release rule for both drag models](0015-one-release-rule.md): a release reads the last frame and lands the place it holds, else home; the float needs no aim; a frame draws its held place and nothing else (in progress) | 2026-11-23 |
