/**
 * @n-uf/placement/scene: one model of a whole window. A `Scene` holds the stage, its edges (bars and columns along its
 * sides, each a stack of items from `./stack`), the items, the floats above the content and the chrome they keep
 * clear of. `solve(scene)` gives every rect a host draws; `targets(scene, dragged)` gives every drop target for one
 * item, each with the scene and layout a release there makes, so the preview is the result. The changes are pure, and
 * `storeScene` / `readScene` keep a scene across reloads. No time, no DOM, nothing module-global.
 */
export {
  DEFAULT_FLOAT_SIZE,
  DEFAULT_STRIP,
  SIDES,
  ZONES,
  axisOf,
  type ColumnTemplate,
  type Edge,
  type FloatAnchor,
  type RailSpec,
  type SceneRailLayout,
  type Kind,
  type Orient,
  type Scene,
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
} from "./model";
export { solve } from "./solve";
export { close, fold, floatAt, homeFor, keep, lift, moveTo, open, orient, prune, raise, resize, use, type ColumnPlace, type DockPlace, type FloatPlace, type Place, type RailPlace } from "./changes";
export { readScene, storeScene, type SceneRead, type StoredScene, type StoredSceneEdge, type StoredSceneFloat, type StoredSceneItem } from "./store";
export { COLUMN_REACH, PLANE, RAIL_EDGE, stops, targets, type SceneAfter, type ScenePlace, type SceneTarget, type SceneTargetOptions } from "./targets";
