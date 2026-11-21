# Decisions

A decision record keeps one settled rule of the libraries: why it is the rule, what it is, and what follows from it. Each is one file, `NNNN-short-name.md`, numbered in the order it was settled. Numbers are never reused. A rule that changes gets a new record, and the old one says which record replaced it.

Each record has four parts:
- **Context:** the problem, and what was weighed.
- **Decision:** the rule, stated so a test can pin it.
- **Consequences:** what the rule makes true, what it costs, and the tests that guard it.
- **Date:** when it was settled (and the release that shipped it).

A proposal ([`../proposals/`](../proposals/)) that ships leaves its accepted rules here.

## Index

The landing model's distance bound is 0001. Three shipped rules have no record yet, and are added as they are written up: the one-preview drag model, place guides and empty lanes, and panel columns by halves with toolbars at the nearest spot.

| # | Decision | Date |
|---|---|---|
| 0001 | [The hand rule](0001-the-hand-rule.md): the landing is the nearest in its lane, within `max(48, g / 2 + 6)` px of the pointer | 2026-11-20 |
| 0002 | [A held frame's marks follow the edge as drawn](0002-held-marks-follow-the-drawn-edge.md): marks clip in the layout they are drawn in, the hit rect as seen | 2026-11-20 |
| 0003 | [One layout per held place of a drag](0003-one-layout-per-state.md): a held frame draws `after(held)`, which its release commits, while its room is open; the landing model takes a held place | 2026-11-20 |
