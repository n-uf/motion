/**
 * `@n-uf/vusyk/browser`: the clock on requestAnimationFrame, performance.now
 * and setTimeout, and the reduced-motion media query. The core entry has no
 * host access at all; this is the one place that touches the global.
 */
export { createBrowserClock, prefersReducedMotion } from "./src/browser/browser-clock";
export type { BrowserClockOptions, BrowserHost } from "./src/browser/browser-clock";
