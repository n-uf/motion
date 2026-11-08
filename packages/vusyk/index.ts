/**
 * `@n-uf/vusyk`: one frame loop with an injected clock, signals, springs and
 * tweens, and a DOM-free gesture recogniser. No DOM, no framework, no
 * globals: the host passes a clock in (`@n-uf/vusyk/browser` has the browser
 * one). `@n-uf/vusyk/clock`, `/signals`, `/values` and `/gestures` are the
 * same folders on their own.
 */
export * from "./src/clock";
export * from "./src/signals";
export * from "./src/values";
export * from "./src/gestures";
export type { Animatable, Point, Rect, Vector, Widen } from "./src/shapes";
export { shapeEquals } from "./src/shapes";
