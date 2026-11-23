/**
 * @n-uf/placement: where things fit. Geometry in, rects and drop places out; no DOM, no framework, no motion.
 *
 * The root holds what every entry shares: the shapes and their geometry and the drop-target shape. The rest is in its
 * own entries: `@n-uf/placement/stack` (the edge cut, the edge fit, one edge's drop places and the float fit),
 * `/tiling` (panes dividing an area) and `/popup` (the popup positioner). A whole window's docking model is built on
 * them in `@n-uf/docking`.
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
export type { Axis, Side } from "./src/side";
export type { Target } from "./src/target";
