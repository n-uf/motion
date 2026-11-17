/**
 * @n-uf/placement/scene: one model of a whole window. A `Scene` holds the stage, its edges (bars and columns along its
 * sides, each a stack of items from `./stack`), the items, the floats above the content and the chrome they keep
 * clear of. `solve(scene)` gives every rect a host draws; `targets(scene, dragged)` gives every drop target for one
 * item, each with the scene and layout a release there makes, so the preview is the result. The changes are pure, and
 * `storeScene` / `readScene` keep a scene across reloads. No time, no DOM, nothing module-global.
 *
 * The Scene owns the whole window: its floats (`solve` fits them with `fitFloat`, also exported here), the float
 * target (`float:<id>`), every docked target and the stored form. `./stack` is only the edge solver it lays each edge
 * with; its own targets, store and floats are deprecated in favour of these.
 *
 * Constants: `DEFAULT_HIT_BAND` (a column's gap band, px), `DEFAULT_STRIP` (an empty edge's drop strip, px),
 * `DEFAULT_FLOAT_SIZE`; `SIDES` and `ZONES` list the sides and zones in order.
 */
export {
  DEFAULT_FLOAT_SIZE,
  DEFAULT_HIT_BAND,
  DEFAULT_RAIL_MAGNET,
  DEFAULT_STRIP,
  FLOAT_ANCHORS,
  RAIL_MODES,
  RAIL_STRIP_MIN,
  RAIL_VISIBILITIES,
  SIDES,
  ZONES,
  type ColumnTemplate,
  type Edge,
  type FloatAnchor,
  type FloatAnchorAt,
  type FloatAnchorOffset,
  type RailDropPolicy,
  type RailMode,
  type RailSpec,
  type RailVisibility,
  type SceneRailLayout,
  type Kind,
  type Orient,
  type Scene,
  type SceneChrome,
  type SceneEdgeLayout,
  type SceneFloat,
  type SceneItem,
  type SceneItemLayout,
  type SceneLayout,
  type SceneNote,
  type SceneNoteCode,
  type Side,
  type SolveOptions,
  type Zone,
  type ZoneAccepts,
} from "./model";
export { floatOrientOf, floatSizeOf, isOutsideSideBar, isSideBar, railModeOf, zoneTakes, zonesTaking } from "./helpers";
/** Whether an edge takes a kind anywhere: its `accepts` lists it and some zone takes it (the test drop targets ask). */
export { edgeTakes } from "./helpers";
export { solve } from "./solve";
export { fitFloat, type FloatFit } from "../float-fit";
export { canFold, close, dockHome, fold, floatAt, homeFor, keep, lift, moveTo, open, orient, raise, resize, setRailMode, setSide, use, type ColumnPlace, type DockPlace, type FloatPlace, type Place, type RailPlace } from "./changes";
export { fitResize, type FloatResize, type ResizeEdges, type ResizeLimit } from "./float-resize";
export { readScene, storeScene, type SceneRead, type StoredScene, type StoredSceneEdge, type StoredSceneFloat, type StoredSceneItem } from "./store";
export { refusalTargets, refusals, reservedRect, stops, targets, type SceneAfter, type ScenePlace, type SceneRefusal, type SceneRefusalTarget, type SceneTarget, type SceneTargetOptions } from "./targets";
export { parseTargetId, placeTargetId, targetId, virtualEdgeId, type TargetIdParts } from "./targets";
