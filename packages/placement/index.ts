/**
 * @n-uf/placement: where things go. State in, rects and drop targets out; no DOM, no framework, no motion.
 *
 * The root holds what every entry shares: the shapes and their geometry, the drop-target shape and the popup
 * positioner. The rest is in its own entries: `@n-uf/placement/scene` (a whole window, laid edge by edge with
 * `/stack`), `/scene/cases`, `/tiling` (panes dividing an area), and the legacy `/dock`, `/toolbar`, `/targets`,
 * `/panels` and `/desk`.
 *
 * See docs/placement.md, Entry: root (the whole design is on that page).
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
export { pickRank, REFUSAL_RANK, type Target } from "./src/target";
export { BELOW_LEFT, positionPopup, type Align, type Positioned, type PositionerRule } from "./src/positioner";
