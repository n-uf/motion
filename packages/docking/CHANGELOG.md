# @n-uf/docking

Versions are calendar versions, `YY.M.R` (year, month of the release, counter within the month), shared with
`@n-uf/motion` and `@n-uf/placement`: the packages carry the same version, and a release bumps them all. Before this
package, the docking model shipped as `@n-uf/placement/scene` and `/scene/cases`; their history is in
[placement's CHANGELOG](https://github.com/n-uf/motion/blob/main/packages/placement/CHANGELOG.md).

## Unreleased

The first release. The window's docking model moves here from `@n-uf/placement/scene`, and its conformance rows from
`@n-uf/placement/scene/cases` to `@n-uf/docking/testing`. Behavior is unchanged: for the same input, `solve`,
`targets`, `refusals`, `stops` and `lanes` give the same answers as `@n-uf/placement/scene` at its last state (26.11.52
and the two lane fixes below, unreleased there). Each edge is fitted by `@n-uf/placement/stack`, now this package's one
dependency.

Lane fixes that were unreleased in `@n-uf/placement/scene` and ship here:
- **An emptied side column that the dock state declares as an edge shows its guide while a panel is held elsewhere**
  (fix). Its box at real size was lost because the held panel fills the whole column, so its after-entry marks are
  empty; the lane now keeps its box as seen, and held in it nothing is drawn over the panel.
- **An empty lane's marks don't change when another lane is entered**, but for the corner (fix). With `spot` held,
  every other lane whose marks as seen are predicted keeps them, less the held lane's marks, which own their corners;
  before, an empty bar was cut at the columns that move aside once the held lane opens.

Host notes: install `@n-uf/docking`, change the imports, and apply the renames below (each a rename only, with the
same shape and meaning). A stored state from `storeScene` reads back with `readDockState` unchanged (the stored form
and its version are the same), but for one field: a stored `floatSize` reads back as `floatSizes` for its float's
orient on an item whose store declares `floatSizes`, and is dropped on one that declares none (see below). `@n-uf/docking/testing`'s types name `@n-uf/motion/drag`'s: `@n-uf/motion` is an optional peer
dependency, needed only by a suite that runs the landing rows.

Entries:
- `@n-uf/placement/scene` → `@n-uf/docking`.
- `@n-uf/placement/scene/cases` → `@n-uf/docking/testing`.

The model's types:
- `Scene` → `DockState`; `Edge` → `DockEdge`; `SceneItem` → `DockItem`; `SceneFloat` → `DockFloat`.
- `SceneChrome` → `KeepClear`, and the dock state's field `chrome` → `keepClear` (same rects, same `for` scope).
- The fields 26.11.52 added keep their names on the renamed types: `DockItem.pushable`, `DockItem.floatSizes`,
  `DockItemLayout.axis`.
- Added: **`DockItemLayout.tiers`**, the chosen form's `StackForm.tiers` (`@n-uf/placement/stack`'s `controlLadder`
  sets them), beside `hidden`: each shown control's tier by id, so a host draws each control at `tiers[id]` without
  knowing the ladder's order. Absent for a hand-written form, a `fold`, a `menu` and a » menu entry.
- Removed: **`SceneItem.floatSize`**, deprecated in 26.11.52. `floatSize` → `floatSizes[orient]`: declare the size for
  the orient the item floats in (both orients where it floats either way). A state stored with it still reads:
  on an item whose store declares `floatSizes`, `readDockState` takes a stored `floatSize` as the size for the orient
  its float is in (the item's own where it floats nowhere), unless the store sizes that orient itself, and
  `storeDockState` writes `floatSizes` only. An item that declares no `floatSizes` is framed at its stored rect, as
  before: its old `floatSize` never set its frame and is dropped (`item:<id>:floatSize`), so the frames read the same.
  The one thing it still set, the size `floatAt` gives such an item with no rect, is now its natural size: pass a rect,
  or declare `floatSizes`. `floatSizeOf(item, orient?)` and
  `floatSizesOf(item)` lose the orient the old size was set in.
- `SceneLayout` → `DockLayout`; `SceneItemLayout` → `DockItemLayout`; `SceneEdgeLayout` → `DockEdgeLayout`;
  `SceneRailLayout` → `DockRailLayout`; `SceneNote` → `DockNote`; `SceneNoteCode` → `DockNoteCode`.
- `StoredScene` → `StoredDockState`; `StoredSceneEdge` → `StoredDockStateEdge`; `StoredSceneFloat` →
  `StoredDockStateFloat`; `StoredSceneItem` → `StoredDockStateItem`; `SceneRead` → `DockStateRead`, whose field
  `scene` is now `state` (`readDockState(data, base).state`).

Targets and lanes:
- `SceneTarget` → `DockDrop`; `SceneTargetOptions` → `DockDropOptions`; `ScenePlace` → `DropPlace`; `SceneAfter` →
  `DropResult`, whose field `scene` is now `state` (`after(point, grab).state`).
- `SceneRefusal` → `DockRefusal`; `SceneRefusalTarget` → `DockRefusalTarget`.
- `Regions` → `DockRegions`; `Lane` → `DockLane`; `LaneSpot` → `DockSpot`; `LaneMark` → `DockMark`; `LaneOptions` →
  `DockLaneOptions`. `LaneRefusal` and `LaneSlide` keep their names, and `Lane.entry` and `Lane.corners` are
  `DockLane.entry` and `DockLane.corners`.

Functions:
- `storeScene` → `storeDockState`; `readScene` → `readDockState`.
- `fold` → `foldItem`; `use` → `markUsed`; `keep` → `keepItem`; `open` → `openItem`; `close` → `closeItem`; `lift` →
  `liftItem`; `raise` → `raiseFloat`; `orient` → `orientFloat`.
- `resize` splits in two by what it resizes: `resize(state, edgeId, size)` → `resizeEdge(state, edgeId, size)`, and
  `resize(state, floatId, rect, moving?)` → `resizeFloat(state, floatId, rect, moving?)`.
- `fitFloat` and `FloatFit` are no longer re-exported here: import them from `@n-uf/placement/stack`.

What the model reads of a form: the form flags `body`, `folded` and `compact` from `@n-uf/placement/stack` (each
defaulting from the kind as before: `open`; `header` and `fold`; `icons`). A host that sets none sees no change.

Testing (`@n-uf/docking/testing`):
- `createSceneHost` → `createReferenceHost`; `SceneHost` → `ReferenceHost`, whose method `scene()` is now `state()`;
  `SceneHostOptions` → `ReferenceHostOptions`.
- `resizeStep(state, start, layout, gesture)` returns `{ state, start }` (its field `scene` is now `state`).
- `mapScene` → `mapState`; `winScene` → `winState`.
- A row's field `scene` → `state` (`CaseRow.state`, `LandingCase.state`), and a `CaseHost` loads with
  `load(state, settings)`. `CaseRequires.railDrop`'s one value is now `"state"`.
- Added: **`AssertLanding<R>`**, a type that compiles only while `R` fits `@n-uf/motion/drag`'s `LandingRegions`
  (`AssertLanding<DockRegions>` is checked in this package's tests). A type only: no runtime import of motion.
- Removed: `pickTarget`, the deprecated default pick. Pass `@n-uf/motion/drag`'s `targetAt` as `pick` (the reference
  host's default stays the same rule).
- Kept as 26.11.52 shipped them: the hand rule (`handBound`, `HAND_TRAIL`, `HAND_TRAIL_BEFORE_HOP`, `HAND_MARGIN`,
  `HAND_FAST`, a row's `moving.hand`) and the Near guides' rule (`nearGuideIssues`, `NEAR_REACH`, a row's
  `moving.nearGuides` and `moving.guideSwitches`, `end.pending`, `end.landing`, `LandingCaseFrame.pending`).
- Removed: the release bookkeeping, `LANES_SINCE`, `GRAB_SINCE`, `GRIP_SINCE`, `ROOM_SINCE`, `STEP_SINCE`, `NEAR_SINCE`, `LAST_WITHOUT_LANES`,
  `LANES_DEADLINE` and `lanesRatchet`, with `CaseRequires.lanes` (`requires.lanes.since`), `LandingCaseHost.version`
  and `createLandingHost`'s `version` option. Every landing row runs on every host: drop the ratchet from your suite
  and assert that no row fails.
