# 0013: The grab is a function of the form the item is laid in

Where the pointer holds a dragged item is one function of the form the item is laid in and its size there. A plain
point becomes the library's own twin of that function at the lift, and every reader (the float, a sliding spot, the aim
cuts, a held frame) reads the one function.

## Context

A drag's `grab` was one point: the press's offset from the item's top-left corner, at the size it was lifted at. Three
rules read that one point: the float took it in px, a sliding spot and the aim cuts took its share of the item's long
side as lifted, and `HeldDrag.resize` took its share of the size held now. They agree only while the item is laid at
the size it was lifted at. A toolbar dragged from a bar (a row, 240 by 40, its grip a strip at its left end) onto a side
rail (an icons column, 40 by 196, its grip a strip at its top) comes out with the pointer 92 px below the grip under the
share rule; a milder bar-to-bar morph (lifted 49 px, laid 40 px) is off by a pixel or so, more near the far end.

Only the host knows where its grip lies in each form. Weighed: a host-side correction after the fact (the library would
still aim with the wrong point, so the landing and the held copy disagree), a separate `anchor` option beside `grab`,
a function type kept apart from the point type with two code paths, and a function the library memoizes by form.

## Decision

- **One option, one word.** `grab?: Point | ((form, size) => Point | undefined)` on `DockLaneOptions` and
  `DockDropOptions` (and the `grab` a target's `after(point, grab)` takes). The same word names the held point on every
  `DockAfter` and `DropResult` and the motion input (`holdItem(item, grab)`, `HeldDrag.resize(size, grab)`,
  `HeldDrag.grab`).
- **The form argument is the laid item's layout entry** (`DockItemLayout`: axis, form, form kind, rect) plus the place
  it really lies in (`place`: a float, a spot on an edge, or a side's rail with the rail's side and orient). No "home"
  place: at the lift the item lies where it lies. `size` is the laid rect's size; for a sliding spot, the size the item
  takes in its stretch.
- **One path.** At the lift a plain point becomes the twin function. The twin gives back what each kind of landing used
  before: the press itself at the item's own form and size; in a float the press in px (a movable grower pressed on its
  grown rect keeps its share of it); on a spot or a rail, along the item's own length the press's share, across it the
  middle. A host's function that gives `undefined` for a form leaves that form to the twin; what it gives is kept inside
  the laid rect.
- **The lift rule.** At the item's own form and size the function gives the press point. `dockDrag(...).after(null).grab`
  is that point, and a host seeds its held item (`holdItem`) with it: one source.
- **No memo of the function's answers.** Purity is the host's contract: the same form and size give the same point for
  the whole drag, with no reads of the pointer, the time or the page. The host keeps one closure per drag; the lift's
  memo keys a function by its identity.
- **A float** is aimed with the grab in the float's form (a probe: the float laid at its size). **A sliding spot** lands
  at the pointer less the grab along the lane, with the grab in the form the item takes in the stretch; the part across
  the lane moves nothing in the landing, and the held frame uses it.
- **One re-aim, and a band at a fold threshold.** Where a landing lies in another form than the grab was read in, it is
  aimed once more with the grab in that form, never again. The item switches form only where the new form holds under
  its own grab; where each form's grab lands it in the other (a fold threshold), the form it had stays. The grab given
  back is always the grab of the form the landing shows. Nothing is remembered from frame to frame: the band is the
  same both ways, so a release commits what the frame shows, and along a pointer sweep the form switches once.
- **A fixed spot** doesn't move to honor the grab: its slot belongs to the dock order. Its aim distance is measured from
  the pointer less the grab in that candidate's own form: the cut between two overlapping landings lies halfway between
  the points the pointer would hold in each. A release into a fixed slot glides by design.
- **`grab` is on every `DockAfter`, never null**: a float's and a sliding spot's are the grab they landed with, a fixed
  spot's the grab in its landing's form, rest's the press point.
- **The held copy is drawn at the pointer less `grab`**, at the size of the form it shows, home and refused places
  included. `HeldDrag.resize(size, grab)` takes the held point from the caller; the held point moves with the size on
  the item's one settle.

## Consequences

- A plain point lands byte for byte as before: `pnpm old-vs-new` against the 26.11.59 release shows no changed case in
  any package, and a function giving `undefined` everywhere (or the press at home and `undefined` elsewhere) draws every
  held place exactly as the plain point.
- Shown equals landed only when nothing is clamped (a keep-clear push excepted) and only on settled frames: while the
  item settles into a new size, the held point is on its way with it.
- With the pointer still, a frame and the next draw the same held place, landing, grab and held copy: one re-aim and no
  iteration leave no loop between form, position and grab to flicker in.
- A host that reads `options.grab` back as a point now has a union to narrow; one that passes a point needs no change.
- Guarded by docking's `test/grab-function.test.ts` (the twin, the lift, a grab on every landing, the grip under the
  pointer for unclamped floats and sliding landings, a still pointer's next two frames) and motion's held-drag tests in
  `test/layout.test.ts` (a resize with a grab, the held point and the size on one progress).

## Alternatives rejected

- **A separate `anchor` option:** two names for one concept, and every reader would have to choose between them.
- **A function path beside the point path:** the byte-identical proof would cover the point path only; the twin makes
  one path that both take.
- **A library memo by form and size:** it hides an impure host function instead of making its contract plain, and the
  lift's memo already keeps the work of one drag.
- **Moving a fixed spot to honor the grab:** a fixed slot is the dock order's; moving it would make the place depend on
  where it was pressed.
- **Iterating the form, position and grab to a fixed point:** it can flicker at a fold threshold or in a grower's slack;
  one re-aim is enough and always ends.

## Date

2026-11-23, on `live/motion`, not yet released.
