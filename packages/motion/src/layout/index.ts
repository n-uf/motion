/**
 * `@n-uf/motion/layout`: the window motion rules applied to a whole layout
 * (items settling to new rects on one frame loop), the held drag of a real
 * item and `anchoredMorph`. Host-free: an item reaches the screen through a
 * `Drawable` the host gives (`@n-uf/motion/browser` has the DOM one).
 *
 * See docs/motion.md, "Layout motion".
 */
export { createLayoutMotion } from "./motion";
export type { Drawable, DrawEntry, DrawFrame, LayoutItem, LayoutMotion, LayoutMotionOptions, LayoutTask } from "./motion";
export { holdItem } from "./held";
export type { HeldDrag } from "./held";
export { anchoredMorph, MORPH_TEMPO } from "./anchored";
export type { AnchoredMorph, BoxSize } from "./anchored";
