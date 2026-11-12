/**
 * How the desk page draws a drag, beside the drag model's own numbers (those are @n-uf/motion/drag's
 * `DRAG_DEFAULTS`): the drop indicator's fade and glide, and the strip's scroll at the stage's edge.
 */

/** The drop indicator fades in over `fade` ms and glides from one target to the next over `glide` ms. */
export const INDICATOR = { fade: 90, glide: 110 } as const;

/** The strip scrolls while the pointer is within `edge` px of the stage's side, at most `speed` px/ms (faster closer in). */
export const EDGE_SCROLL = { edge: 40, speed: 1 } as const;
