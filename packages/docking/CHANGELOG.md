# @n-uf/docking

Versions are calendar versions, `YY.M.R` (year, month of the release, counter within the month), shared with
`@n-uf/motion` and `@n-uf/placement`: the packages carry the same version, and a release bumps them all. Before this
package, the docking model shipped as `@n-uf/placement/scene` and `/scene/cases`; their history is in
[placement's CHANGELOG](https://github.com/n-uf/motion/blob/main/packages/placement/CHANGELOG.md).

## 26.11.54

The first release. The window's docking model moves here from `@n-uf/placement/scene`, and its conformance rows from
`@n-uf/placement/scene/cases` to `@n-uf/docking/testing`. Behavior is unchanged: for the same input, `solve`,
`targets`, `refusals`, `stops` and `lanes` give the same answers as `@n-uf/placement/scene` at its last state (26.11.53
and the fix below, unreleased there), and a stored state reads back to the same layout: the one exception is in form,
not in frames (a stored `floatSize` becomes `floatSizes`, see Removed). Each edge is fitted by `@n-uf/placement/stack`,
now this package's one dependency.

Fixed since `./scene` 26.11.53, on its release line when the model moved:
- **`endReach` only adds** (fix). With any `endReach` and an empty bar across a compact rail's end, the rail's end
  target shrank to the reach strip past the stage and its own end third was refused; with an inset (rail outside it, or
  the bar inside it) the predicted `entry` also stopped at the two-thirds line. A reach strip cut off from its zone's own
  room now takes no slot line and joins the zone's outermost slot (past a drawn bar it stops at the bar), and an edge's
  reach never takes another edge's own span. A column's footer gap under an empty bar no longer vanishes with reach:
  the panel bodies' cut places its line within the column's drawn ends, as the tiler does. The start side and both rails
  alike. New tests `rail-end-reach` and `end-reach-targets`; the pinned marks fixture's rail and bar boxes now run to
  the edge's end.

Host notes: install `@n-uf/docking`, change the imports, and apply the renames below (each a rename only, with the
same shape and meaning). A stored state from `storeScene` reads back with `readDockState` unchanged (the stored form
and its version are the same), but for one field: a stored `floatSize` reads back as `floatSizes` (see `floatSize`
under Removed). `@n-uf/docking/testing`'s types name `@n-uf/motion/drag`'s: `@n-uf/motion` is an optional peer
dependency, needed only by a suite that runs the landing rows. The edge-id error's prefix is `docking:` (it was
`placement:`): a host that matches the message changes the prefix.

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
- Added: **`DockItem.length`** (`{ column?, row? }`, px along the edge, per axis), the length a person asked an item to
  have, read by the edge's stack in place of a growing form's natural, and the verbs on it: **`dividers(state, layout?)`**
  (`DockDivider`), **`resizeBetween`**, **`resetBetween`** and **`resetLengths(state, edgeId)`**. `storeDockState` keeps
  the length and `readDockState` reads it back (a bad entry is dropped as `item:<id>:length:<axis>`; a store without it
  reads with none). Additive: a state that declares no length lays out exactly as before.
- Removed: **`SceneItem.floatSize`**, deprecated in 26.11.52. `floatSize` → `floatSizes[orient]`: declare the size for
  the orient the item floats in (both orients where it floats either way). A state stored with it still reads, and
  `storeDockState` writes `floatSizes` only. `readDockState` takes a stored `floatSize` as:
  - on an item the store docks: `floatSizes[floatOrientOf(item)]`, unless the store sizes that orient itself, so the
    user's float size survives the upgrade for the next float-out (a float target, `floatAt` with no rect);
  - on a float whose store gives `floatSizes`: the size for the orient the float is in, unless the store sizes it;
  - on a float whose store gives no `floatSizes`: nothing. It is dropped (`item:<id>:floatSize`), and the float stays
    framed at its stored rect, as before (a size there would replace that frame).
- `floatSizeOf(item, orient?)` and `floatSizesOf(item)` lose the orient the old size was set in (it was the legacy
  `floatSize`'s).
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
