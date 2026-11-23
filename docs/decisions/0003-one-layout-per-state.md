# 0003: One layout per held place of a drag

While its room is open, a held frame draws exactly the layout its release commits: every item, the landing and every
guide come from one function, `dockDrag(...).after(held)`, and the landing model picks a held place instead of doing
geometry. (The other frames: see the float exception below.)

## Context

A docking drag's held frame was drawn from about ten derivations in three layers (docking's lanes, the landing model's
geometry, the host), each with its own layout: as seen, the held spot's, a predicted entry's, or the DOM. Three bugs had
one shape: the guide of an empty lane and its mark after entry came from two layouts; a held lane's marks were clipped
as seen while the commit drew the edge whole (decision 0002); and hosts rebuilt the held room by hand instead of reading
the layout the drop commits.

Weighed: patching each derivation (each fix added a layout), and one function for the layout of a held place, read by
the frame and the commit alike. Taken: the second.

## Decision

- **A held place** is where a release now lands: a lane's spot with the pointer, the float at the pointer, or rest.
  (Only the dock state, `DockState`, and `after(...).state` are called a state.)
- **`after(held)`** is THE layout of a held place: the dock state a release commits, its layout solved with the drag's
  one `previous` (the committed layout at the lift), the landing, every lane's marks in that one layout, and for a spot
  its lane's stretches there. A release commits exactly `after(release).state`.
- **The landing model takes a held place.** Its geometry is the regions for hit-testing, `landingOf(held)` and
  `spotsOf(spot)`; a frame names its held place (`frame.held`) and, per lane shown, the held place its guide stands for
  (`{ lane, held }`). It does no layout.
- **Hit-testing reads two layouts, named:** a lane's hit rect as seen, stable for the drag; the stretches along a held
  lane in that spot's own layout.
- **Rule B, as shipped:** a guide is drawn in the layout on screen, less the landing the pointer would take there; only
  a lane the screen doesn't draw (an empty edge, no band) takes the layout that creates it: the Near lane its would-land
  held place's, any other lane its one spot's, its room whole. Such a lane gives up where it meets a lane drawn on screen,
  and between two such the bar keeps the corner (`settle`'s rule, read in the layout drawn).
- **One corner rule remains under "all":** the Near lane's marks win, by rect subtraction in docking. With no Near lane,
  the lane nearest the pointer within the approach's reach names its would-land held place for the corner only, switching
  exactly at the reach.
- **The trail gate reads the landing the frame draws.** A fast change of spot that reflows the window waits for a slow
  step until the held landing trails the pointer by more than `trail` (40 px); that landing is `landingOf` the spot
  held. On a sliding spot it is the landing at the hand, not the spot's listed landing at rest, which can lie far from
  a hand holding the item flush at the stretch's end. Visible: passing a sliding spot's end fast toward the fixed spot
  after it, the item stays at the hand on the sliding spot until it trails by 40 px or the hand slows (one path in the
  old-vs-new record changed 6 px past the cut before, about 40 px past the landing now;
  `test/trail-gate-current-landing.test.ts`).
- **`owns` stays on the landing model's lane.** A rail drop strip taking the pointer from a lane it overlaps is a
  hit-testing rule with gates (its own entry gate, "came in since the lift", the lift zone), not geometry: it can't be
  expressed as rects without changing hit-testing.
- **No fallback.** The old paths are deleted in the same change: `lanes(…, { spot })`, the prediction (`entry`,
  `corners`), the model's sliding arithmetic, guide geometry and corner owner, and the lab's re-cut of the guides.

## Consequences

- The held frame and the commit agree by construction: the frame's items, landing and guides equal the commit's, exactly
  in node and within 1 px in the DOM. The DOM claim holds in the modes that open the room (Placeholder and Snap, the
  item preview); Outline draws the window at rest by design.
- A host draws every item but the held one in the layout the draw rule names (`after(frame.held).layout` while the
  room is open; see the float exception), the guides from `guides(frame)` through
  `guideRects` for cosmetics only, and stores `after(release).state`. It never passes an item's rect (a docked item, a
  float, the held item's landing) as a layout clear: the marks already leave them out. It may keep a cosmetic
  clearance around its own held chrome, the held copy's outline as drawn (the lab keeps guides 2 px clear of it in the
  held lane), through `guideRects`' `clear`; that only trims a guide by a few pixels and never decides where one lies.
- **The float exception, part of the contract.** What a held frame draws is the draw rule of docs/docking.md, "What a
  held frame draws". Decided (2026-11-21): for a float the gap closes when the item is let go, not during the drag.
- **No two boxes overlap; a line may cross another lane's box.** A panel joint drawn across a new column's room is a
  marker over a place, not two places claiming one room, and the box keeps the item's length (cutting it there would
  lose a real place).
- Per moved frame at most one solve, when a held place's key changes (a new sliding start, a new float point); a fixed spot
  costs none after the lift.
- Guarded by `packages/docking/test/one-layout-sweep.test.ts` (items, landing, store, hull, corner, overlap, near,
  entry, created, reach over the lift windows and eleven captured windows, near and all), `test/drag-after.test.ts`,
  `test/lanes-held-commit.test.ts`, and in the DOM the lab's `one-layout-items-landing` and
  `one-layout-guides-entry-reach`.

## Date

2026-11-20, in release 26.11.55, `@n-uf/docking` and `@n-uf/motion` together.

2026-11-21: `shown(frame)` names the drawn layout; guides are cut in it (26.11.55).

2026-11-21: a held place is named `held` (26.11.55).

2026-11-22: a movable grower held on a bar is drawn at its natural length, the one named exception
([0005](0005-growth-is-spare-room.md)); the tiling drag takes the same rule ([0009](0009-one-layout-per-tiling-place.md)).
