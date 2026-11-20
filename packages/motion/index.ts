/**
 * `@n-uf/motion`: everything host-free, in one import: the clock and the
 * frame loop, springs, tweens and the settle curve, the gesture recognizer,
 * the drag intent and the landing model, layout motion, the shapes, and
 * signals for a host that wants them. No DOM, no framework, no globals: the
 * host passes a clock in. Each folder is also an entry of its own (`/clock`,
 * `/signals`, `/values`, `/gestures`, `/drag`, `/layout`). Two entries stay
 * apart: `@n-uf/motion/browser` (everything that touches a host: the browser
 * clock and the DOM writers) and `@n-uf/motion/testing` (frame-sampled checks
 * of the motion rules).
 *
 * See docs/motion.md, "The root entry" (and "Parts and how they fit").
 */
export * from "./src/clock";
export * from "./src/signals";
export * from "./src/values";
export * from "./src/gestures";
export * from "./src/drag";
export * from "./src/layout";
export type { Animatable, Point, Rect, Vector, Widen } from "./src/shapes";
export type { ModifierKey } from "./src/keys";
export { shapeEquals } from "./src/shapes";
