- `./tiling`, **faster: `layoutSplit` and `layoutSplitTree`**, with the same outputs. A pane's rect and a split's box are
  now made once instead of copied, a divider is built only for a split with an `id`, and `layoutSplit` builds no split
  geometry at all (it used to build it for every split with an `id` and drop it). At 100 panes a layout takes about 4 µs
  against 7 µs, about 1.1x a hand-written layout that fills a map of rects; with every split named, `layoutSplitTree`
  takes 7 µs against 10 µs. No option was added: a host that needs only pane rects calls `layoutSplit`. `pnpm --filter
  @n-uf/placement bench` times it.
