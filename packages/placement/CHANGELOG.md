# @n-uf/placement

Versions are calendar versions, `YY.M.R` (year, month of the release, counter within the month), the same scheme
as `@n-uf/motion`.

## 26.11.0

The first release: where things go, as pure functions over plain data. No DOM, no framework, no motion, no
dependencies.

- `@n-uf/placement`: `Rect`, `Size`, `Point`, `rect`, `overlap`, `clampInto`, `centre`, and `positionPopup` (anchor,
  gravity, offset, then flip, slide, resize per axis) with the `BELOW_LEFT` rule.
- `@n-uf/placement/dock`: `createDesk({ panels, docTitle?, start, opened? })` gives the nine desk constructions as
  presets (edge docks with the bottom dock between or full width, one tiling tree, navigator + inspector, a
  scrolling strip, drawers, palettes over or around the documents, edge docks + tear-off). Each is a pure layout:
  state, stage size and options in, a placed rect per item and give-way notes out. The parts are exported too:
  `dockGeometry` (docks fold to rails, right first), `accordion` and `lruFold` (sections at their natural heights,
  the least recently used folding first), `palettes` (corner stacks that shade), `treeFloats`, `stripGeometry`,
  `pill`, `pillBetween`; and the state changes `withDocs`, `touch`, `toggleFold`, `toggleClosed`, `withActive`,
  `liftOut`.
- `@n-uf/placement/toolbar`: arrangements of groups in five hosts and three zones, or floating (`insertGroup`,
  `withoutGroup`, `floatGroup`, `dockGroup`, `resetGroup`, `moveToHost`, `moveBar`, `toggleCollapsed`);
  `layoutHost` (zones along the host, the centre centred, trailing-first collapse to handle and », an optional
  centre minimum counted in the need); `insertions` (before all, between, after all, empty zones); `isOwnPlace`.
- `@n-uf/placement/targets`: drop targets in the shape `@n-uf/motion/drag` takes. `deskTargets` and `deskDrop` for
  every construction (rails, dock slots, tree slots, strip columns, tab strips, corner stacks, free placement with
  edge snapping); `hostTargets` and `floatTarget` for toolbar groups (own place left out, returned as `own`).
