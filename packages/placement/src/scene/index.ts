/**
 * @n-uf/placement/scene: one model of a whole window. A `Scene` holds the stage, its edges (bars and columns along its
 * sides, each a stack of items from `./stack`), the items, the floats above the content and the chrome they keep
 * clear of. `solve(scene)` gives every rect a host draws; `targets(scene, dragged)` gives every drop target for one
 * item, each with the scene and layout a release there makes, so the preview is the result. The changes are pure, and
 * `storeScene` / `readScene` keep a scene across reloads. No time, no DOM, nothing module-global.
 *
 * Constants: `DEFAULT_HIT_BAND` (a column's gap band, px), `DEFAULT_STRIP` (an empty edge's drop strip, px),
 * `DEFAULT_FLOAT_SIZE`; `SIDES` and `ZONES` list the sides and zones in order.
 */
export {
  DEFAULT_FLOAT_SIZE,
  DEFAULT_HIT_BAND,
  DEFAULT_STRIP,
  SIDES,
  ZONES,
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
  type ZoneAccepts,
  floatOrientOf,
  floatSizeOf,
  zoneTakes,
  zonesTaking,
} from "./model";
export { solve } from "./solve";
export { close, dockHome, fold, floatAt, homeFor, keep, lift, moveTo, open, orient, raise, resize, setSide, use, type ColumnPlace, type DockPlace, type FloatPlace, type Place, type RailPlace } from "./changes";
export { readScene, storeScene, type SceneRead, type StoredScene, type StoredSceneEdge, type StoredSceneFloat, type StoredSceneItem } from "./store";
export { refusals, reservedRect, stops, targets, type SceneAfter, type ScenePlace, type SceneRefusal, type SceneTarget, type SceneTargetOptions } from "./targets";
