/**
 * @n-uf/placement: where things go. State in, rects and drop targets out; no DOM, no framework, no motion.
 *
 * The root holds what every entry shares: the shapes and the popup positioner. The rest is in its own entries:
 * `@n-uf/placement/tiling`, `/dock`, `/toolbar` and `/targets`.
 */
export { centre, clampInto, overlap, rect, type Point, type Rect, type Size } from "./src/geometry";
export { BELOW_LEFT, positionPopup, type Align, type Positioned, type PositionerRule } from "./src/positioner";
