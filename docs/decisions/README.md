# Decisions

A decision record keeps one settled rule of the libraries: why it is the rule, what it is, and what follows from it. Each is one file, `NNNN-short-name.md`, numbered in the order it was settled. Numbers are never reused. A rule that changes gets a new record, and the old one says which record replaced it.

Each record has four parts:
- **Context:** the problem, and what was weighed.
- **Decision:** the rule, stated so a test can pin it.
- **Consequences:** what the rule makes true, what it costs, and the tests that guard it.
- **Date:** when it was settled (and the release that shipped it).

A proposal ([`../proposals/`](../proposals/)) that ships leaves its accepted rules here.

## Index

Records are added as the shipped rules are written up: the one-preview drag model, the landing model and its distance bound, place guides and empty lanes, and panel columns by halves with toolbars at the nearest spot.

| # | Decision | Date |
|---|---|---|
| 0001 | [The hand rule](0001-the-hand-rule.md): the landing is the nearest in its lane, within `max(48, g / 2 + 6)` px of the pointer | 2026-11-20 |
