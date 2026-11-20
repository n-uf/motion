/**
 * `@n-uf/motion/layout`: the window motion rules applied to a whole layout
 * (items settling to new rects on one frame loop), the held drag of a real
 * item, `anchoredMorph`, FLIP, and drawing onto DOM styles.
 *
 * See docs/motion.md, "Layout motion".
 */
export { createLayoutMotion } from "./motion";
export type { Drawable, DrawEntry, DrawFrame, LayoutItem, LayoutMotion, LayoutMotionOptions, LayoutTask } from "./motion";
export { holdItem } from "./held";
export type { HeldDrag } from "./held";
export { anchoredMorph, MORPH_TEMPO } from "./anchored";
export type { AnchoredMorph, BoxSize } from "./anchored";
export { flip, rectOf } from "./flip";
export type { FlipEntry, Measurable, RectLike } from "./flip";
export { domDrawable, drawBox, layOutBox } from "./dom";
export type { BoxNodes, StyleLike, Styled } from "./dom";
