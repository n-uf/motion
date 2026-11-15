/**
 * @n-uf/placement: where things go. State in, rects and drop targets out; no DOM, no framework, no motion.
 *
 * The root holds what every entry shares: the shapes and their geometry, the drop-target shape and the popup
 * positioner. The rest is in its own entries: `@n-uf/placement/dock`, `/toolbar`, `/targets`, `/panels` and `/desk`
 * (presets as data on `/panels`).
 */
export {
  COLUMN_REACH,
  EPS,
  PLANE,
  RAIL_EDGE,
  area,
  centre,
  clamp,
  clampInto,
  contains,
  overlap,
  overlaps,
  rect,
  subtract,
  type Point,
  type Rect,
  type Size,
} from "./src/geometry";
export type { Target } from "./src/target";
export { BELOW_LEFT, positionPopup, type Align, type Positioned, type PositionerRule } from "./src/positioner";
