/**
 * @n-uf/docking: where panels and toolbars dock. A `DockState` holds a window's stage, its edges (bars and columns along
 * its sides, each a stack of items), the items, the floats above the content and the rects they keep clear of
 * (`keepClear`). `solve(state)` gives every rect a host draws; `targets(state, dragged)` gives every drop place for one
 * item (`DockDrop`), each with the state and layout a release there makes, so the preview is the result; `lanes`
 * arranges the same places for a landing model. The changes are pure and named with their object (`openItem`,
 * `foldItem`, `resizeEdge`, ...), and `storeDockState` / `readDockState` keep a state across reloads. No time, no DOM,
 * nothing module-global.
 *
 * It is built on `@n-uf/placement`'s general layer (`@n-uf/placement/stack`: the edge cut, the edge fit and the float
 * fit) and never imports `@n-uf/motion`; the conformance rows and their runners are `@n-uf/docking/testing`.
 *
 * Constants: `DEFAULT_HIT_BAND` (a column's gap band, px), `DEFAULT_STRIP` (an empty edge's drop strip, px),
 * `DEFAULT_FLOAT_SIZE`; `SIDES` and `ZONES` list the sides and zones in order.
 *
 * See docs/docking.md: The dock state, Solving, Changes, Targets and refusals, Lanes and Storage, and Entry: docking.
 */
export {
  DEFAULT_FLOAT_SIZE,
  DEFAULT_HIT_BAND,
  DEFAULT_RAIL_MAGNET,
  DEFAULT_STRIP,
  EDGE_ROOM_HOLD,
  FLOAT_ANCHORS,
  RAIL_MODES,
  RAIL_STRIP_MIN,
  RAIL_VISIBILITIES,
  SIDES,
  ZONES,
  type ColumnTemplate,
  type DockEdge,
  type FloatAnchor,
  type FloatAnchorAt,
  type FloatAnchorOffset,
  type RailDropPolicy,
  type RailMode,
  type RailSpec,
  type RailVisibility,
  type DockRailLayout,
  type Kind,
  type Orient,
  type DockState,
  type KeepClear,
  type DockEdgeLayout,
  type DockFloat,
  type DockItem,
  type DockItemLayout,
  type DockLayout,
  type DockNote,
  type DockNoteCode,
  type Side,
  type SolveOptions,
  type Zone,
  type ZoneAccepts,
} from "./model";
export { anchorName, declaresFloatSizes, floatOrientOf, floatSizeOf, heldRect, isOutsideSideBar, isSideBar, isSideColumn, railModeOf, zoneTakes, zonesTaking } from "./helpers";
/** Whether an edge takes a kind anywhere: its `accepts` lists it and some zone takes it (the test drop targets ask). */
export { edgeTakes, namesZone, zoneIn } from "./helpers";
export { solve } from "./solve";
export { dividers, resetBetween, resetLengths, resizeBetween, type DockDivider } from "./dividers";
export {
  canFold,
  closeItem,
  dockHome,
  floatAt,
  foldItem,
  homeFor,
  keepItem,
  liftItem,
  markUsed,
  mergeSideColumns,
  moveTo,
  openItem,
  orientFloat,
  raiseFloat,
  resizeEdge,
  resizeFloat,
  setRailMode,
  setSide,
  type ColumnPlace, type DockPlace, type FloatPlace, type Place, type RailPlace } from "./changes";
export { fitResize, type FloatResize, type ResizeEdges, type ResizeLimit } from "./float-resize";
export { readDockState, storeDockState, type DockStateRead, type StoredDockState, type StoredDockStateEdge, type StoredDockStateFloat, type StoredDockStateItem } from "./store";
export { refusalTargets, refusals, reservedRect, stops, targets, type DropResult, type DropPlace, type DockRefusal, type DockRefusalTarget, type DockDrop, type DockDropOptions } from "./targets";
export { HATCH_EDGE, HATCH_END, lanes, SPOT_PITCH, type DockLane, type DockMark, type DockLaneOptions, type EmptyLanes, type LaneRefusal, type LaneSlide, type DockSpot, type DockRegions } from "./lanes";
export { parseTargetId, placeTargetId, targetId, virtualEdgeId, type TargetIdParts } from "./targets";
