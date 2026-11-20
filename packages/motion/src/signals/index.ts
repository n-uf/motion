/**
 * `@n-uf/motion/signals`: reactive values, computed values and effects. An
 * effect can run through a frame loop's `scheduler(phase)`, once per frame.
 *
 * See docs/motion.md, "Signals".
 */
export { batch, computed, effect, isSignal, signal, untracked } from "./signals";
export type {
  EffectCleanup,
  EffectOptions,
  Equals,
  ReadonlySignal,
  Signal,
  SignalOptions,
} from "./signals";
