/**
 * `@n-uf/motion/browser`: everything that touches a host. The clock on
 * requestAnimationFrame, performance.now and setTimeout, the reduced-motion
 * media query, and the DOM writers: a layout item drawn onto an element's
 * style (`domDrawable`, `layOutBox`, `drawBox`) and FLIP for DOM groups
 * (`flip`, `rectOf`). The root entry has no host access at all.
 *
 * See docs/motion.md, "Browser".
 */
export { createBrowserClock, prefersReducedMotion } from "./src/browser/browser-clock";
export type { BrowserClockOptions, BrowserHost } from "./src/browser/browser-clock";
export { domDrawable, drawBox, layOutBox } from "./src/browser/dom";
export type { BoxNodes, StyleLike, Styled } from "./src/browser/dom";
export { flip, rectOf } from "./src/browser/flip";
export type { FlipEntry, Measurable, RectLike } from "./src/browser/flip";
