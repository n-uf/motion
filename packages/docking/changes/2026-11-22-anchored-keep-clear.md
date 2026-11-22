- **Keep-clear rects anchored to the layout's content** (new, additive). A `DockState.keepClear` entry may now be
  `{ region: "content", side, size, for, id? }` (`AnchoredKeepClear`; `KeepClearRegion` is `"content"`, extensible):
  `size` px deep at that side of `DockLayout.content`, along its whole length, clamped to it, none in an empty content.
  `solve` resolves it once the edges and the content are final, before the floats, into the new
  `DockLayout.keepClear` (`DockKeepClearLayout`: `rect`, `for`, `id`), so an overlay strip a host draws at the content's
  edge moves with the content a drop opens or closes. Before, a host fed the strip as a fixed rect taken from the
  committed layout, and a drop that opened or closed a column solved its `after` with the strip where it was: the
  commit moved it and a float re-fitted off its marker. Nothing that sizes the content reads keep-clear rects. Each
  reader names its layout: the hits a drag shows and a float resize by hand read the layout on screen; a drop's fit
  and its floats read the drop's own `after`. A guide predicted in another layout (an empty lane, a Near lane not on
  screen) is trimmed by the anchored rects on screen; a `for: "floats"` rect cuts no lane guide. A declaration like
  `pushable`: taken from `base`, never stored. A state with fixed rects only lays out exactly as before, and its layout
  has no `keepClear`.
- Types: `DockState.keepClear` is now `readonly (KeepClear | AnchoredKeepClear)[]`. A host that reads its entries as
  rects narrows them first (`"region" in c` is an anchored one).
