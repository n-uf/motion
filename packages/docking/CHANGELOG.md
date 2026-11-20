# @n-uf/docking

Versions are calendar versions, `YY.M.R` (year, month of the release, counter within the month), shared with
`@n-uf/motion` and `@n-uf/placement`: the packages carry the same version, and a release bumps them all. Before this
package, the docking model shipped as `@n-uf/placement/scene` and `/scene/cases`; their history is in
[placement's CHANGELOG](https://github.com/n-uf/motion/blob/main/packages/placement/CHANGELOG.md).

## Unreleased

The first release. The window's docking model moves here from `@n-uf/placement/scene`, and its conformance rows from
`@n-uf/placement/scene/cases` to `@n-uf/docking/testing`. Behavior is unchanged: for the same input, `solve`,
`targets`, `refusals`, `stops` and `lanes` give the same answers as the last `@n-uf/placement/scene` (26.11.51). Each edge is
fitted by `@n-uf/placement/stack`, now this package's one dependency.

Host notes: install `@n-uf/docking`, change the imports, and apply the renames below (each a rename only, with the
same shape and meaning). A stored state from `storeScene` reads back with `readDockState` unchanged: the stored form
and its version are the same.

Entries:
- `@n-uf/placement/scene` → `@n-uf/docking`.
- `@n-uf/placement/scene/cases` → `@n-uf/docking/testing`.

The model's types:
- `Scene` → `DockState`; `Edge` → `DockEdge`; `SceneItem` → `DockItem`; `SceneFloat` → `DockFloat`.
- `SceneChrome` → `KeepClear`, and the dock state's field `chrome` → `keepClear` (same rects, same `for` scope).
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
  `DockLaneOptions`. `LaneRefusal` and `LaneSlide` keep their names.

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
- Added: **the landing rows check the hand rule** (a row's `moving.hand`; a host's `LandingPlay` may report its
  `stretchPositions`). While a lane holds, the landing is the nearest landing in its lane to the pointer and lies
  within `max(48, g / 2 + 6)` px of it (`max(56, g / 2 + 6)` on the frame before a hop), `g` the gap along the lane
  between the facing edges of the two adjacent landings the pointer lies between. The rows `landing-grip-*`,
  `landing-room-*` and `landing-step-down-room` use it instead of the fixed 48/56 px, so a lane with landings far apart
  (a docked item much longer than the held one) holds its bound there: `g` is about its length less the held item's,
  plus a gutter. Exports: `handBound(g, beforeHop?)`, `HAND_TRAIL`, `HAND_TRAIL_BEFORE_HOP`, `HAND_MARGIN`,
  `HAND_FAST`. Every row that passed still passes. Decision record
  [0001, the hand rule](https://github.com/n-uf/motion/blob/main/docs/decisions/0001-the-hand-rule.md).
- Removed: the release bookkeeping, `LANES_SINCE`, `GRAB_SINCE`, `GRIP_SINCE`, `ROOM_SINCE`, `STEP_SINCE`, `LAST_WITHOUT_LANES`,
  `LANES_DEADLINE` and `lanesRatchet`, with `CaseRequires.lanes` (`requires.lanes.since`), `LandingCaseHost.version`
  and `createLandingHost`'s `version` option. Every landing row runs on every host: drop the ratchet from your suite
  and assert that no row fails.
