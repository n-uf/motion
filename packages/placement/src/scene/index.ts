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
  type Edge,
  type FloatAnchor,
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
export { close, fold, floatAt, keep, lift, moveTo, open, orient, raise, resize, use, type DockPlace } from "./changes";
export { readScene, storeScene, type SceneRead, type StoredScene, type StoredSceneEdge, type StoredSceneFloat, type StoredSceneItem } from "./store";
