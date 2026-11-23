- **The grab is a function of the laid form** ([decision 0013](https://github.com/n-uf/motion/blob/main/docs/decisions/0013-grab-as-a-function-of-the-form.md)).
  `DockLaneOptions.grab` and `DockDropOptions.grab` (and the `grab` a target's `after(point, grab)` takes) are now a
  `DockGrab`: a point, as before, or `(form, size) => Point | undefined`, where `form` is the laid item's layout entry
  with the place it lies in (`DockGrabForm`, `DockGrabPlace`: a float, a spot on an edge, or a side's rail with its side
  and orient) and the point is in the laid rect's own coordinates. A host whose grip lies elsewhere in each form (a
  row's at its left end, an icons column's at its top) keeps the pressed spot of the grip under the pointer when the
  form changes. A plain point becomes the library's own twin function at the lift, so every reader (the float, a
  sliding spot, the aim cuts) reads one function, and a plain point lands exactly as before. A function gives the press
  point at the item's own form and size, may give `undefined` for a form it can't place yet (the twin answers), and is
  pure for the drag: one closure per drag, remembered by identity.
- New: `DockAfter.grab`, on every held place, never absent: where the pointer holds the item in the form that place
  shows (a float's and a sliding spot's the grab they landed with, a fixed spot's the grab in its landing's form, rest's
  the press point, which a host seeds `holdItem` with). The held copy is drawn at the pointer less it.
  `DropResult.grab` (optional) says the grab a float's or a sliding spot's drop landed with.
- A float and a sliding spot whose landing lies in another form than the grab was read in are aimed once more with the
  grab in that form, never again; on a sliding spot only the grab's part along the lane moves the landing. A fixed spot
  doesn't move for the grab; the cut between two overlapping landings lies halfway between the points the pointer would
  hold in each, the grab read in each landing's own form.
- Types: `options.grab` is now a union; code that reads it back as a point narrows it first. Passing a point needs no
  change.
