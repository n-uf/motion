/**
 * `@n-uf/motion`: one frame loop with an injected clock, signals, springs and
 * tweens, and a DOM-free gesture recogniser. No DOM, no framework, no
 * globals: the host passes a clock in (`@n-uf/motion/browser` has the browser
 * one). `@n-uf/motion/clock`, `/signals`, `/values` and `/gestures` are the
 * same folders on their own. `@n-uf/motion/testing` (frame-sampled checks of
 * the motion rules, for tests and specs), `@n-uf/motion/drag` (the drag
 * intent model: when a drop indicator shows, what a release lands on) and
 * `@n-uf/motion/layout` (layout motion and the held drag) are only there,
 * not in the root.
 */
export * from "./src/clock";
export * from "./src/signals";
export * from "./src/values";
export * from "./src/gestures";
export type { Animatable, Point, Rect, Vector, Widen } from "./src/shapes";
export { shapeEquals } from "./src/shapes";
