/**
 * `@n-uf/motion/testing`: frame-sampled checks of the motion rules, for unit
 * tests on the fake clock and for browser specs.
 *
 * See docs/motion.md, "Testing checks".
 */
export {
  checkContentScale,
  checkHeld,
  checkMonotonic,
  checkNoJumps,
  checkNoOvershoot,
  checkTempo,
} from "./checks";
export type { CheckResult, HeldSample, RectSample, ScaleSample, TargetSample, TempoResult } from "./checks";
