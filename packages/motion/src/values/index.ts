/**
 * `@n-uf/motion/values`: animators (spring, tween, settle), easing, `reveal`
 * and `popIn`, and `motionValue`, which steps an animator on a frame loop (a
 * consumer follows it with `subscribe`; it also reads as a signal), with the
 * shapes they animate.
 *
 * See docs/motion.md, "Values".
 */
export type { Animator } from "./animator";
export type { Animatable, Point, Rect, Vector, Widen } from "../shapes";
export {
  cubicBezier,
  ease,
  easeIn,
  easeInOut,
  easeInOutCubic,
  easeOut,
  easeOutCubic,
  linear,
} from "./easing";
export type { Easing } from "./easing";
export { createSpring, resolveSpring, SPRING_DEFAULTS, springStep } from "./spring";
export type { Spring, SpringConfig, SpringParams, SpringState } from "./spring";
export { createTween } from "./tween";
export type { Tween, TweenConfig } from "./tween";
export { createSettle, SETTLE_DEFAULTS, SETTLE_TEMPO } from "./settle";
export type { Settle, SettleConfig } from "./settle";
export { popIn, reveal } from "./reveal";
export type { PopIn, RevealFrame } from "./reveal";
export { motionValue, settleValue, springValue, tweenValue } from "./motion-value";
export type { AnimatorValue, MotionOptions, MotionValue, SetOptions } from "./motion-value";
