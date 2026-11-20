/**
 * @n-uf/placement: where things go. State in, rects and drop targets out; no DOM, no framework, no motion.
 *
 * The root holds what every entry shares: the shapes and their geometry and the drop-target shape. The rest is in its
 * own entries: `@n-uf/placement/stack` (the general layer: the edge cut, the edge fit, one edge's drop places and the
 * float fit), `/scene` (a whole window, laid edge by edge with `/stack`), `/scene/cases`, `/tiling` (panes dividing an
 * area) and `/popup` (the popup positioner).
 *
 * See docs/placement.md, Entry: root (the whole design is on that page).
 */
export {
  EPS,
  PLANE,
  area,
  center,
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
