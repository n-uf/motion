- `./tiling`, **faster: `layoutSplit` and `layoutSplitTree`**, with the same outputs. A pane's rect and a split's box are
  now made once instead of copied, a divider is built only for a split with an `id`, and `layoutSplit` builds no split
  geometry at all (it used to build it for every split with an `id` and drop it). With no named splits, at 100 panes a
  layout takes about 4 µs against 7 µs, about 1.1x a hand-written layout that fills a map of rects. With every split
  named, `layoutSplitTree` still builds the geometry and takes about 7 µs against 10 µs (about 1.8x); `layoutSplit` on
  the same tree takes about 5 µs. No option was added: a host that needs only pane rects calls `layoutSplit`. `pnpm
  --filter @n-uf/placement bench` times it.
