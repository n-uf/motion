/**
 * `@n-uf/motion/gestures`: the gesture recognizer (plain events in, one
 * gesture stream out), the double click, wheel rules, modifier keys (the
 * package's one `ModifierKey`), the machine runner, and the dwell,
 * touch-press and paged-swipe machines.
 *
 * See docs/motion.md, "Gestures".
 */
export * from "./types";
export { DOUBLE_CLICK, type DoubleClick } from "../double-click";
export type { Point } from "../shapes";
export { defaultDragModifier, isHeld, modHeld, platformButton, resolveDragModifier, toModifiers } from "./modifiers";
export {
  classifyWheel,
  dampWheelPan,
  WHEEL_DEFAULTS,
  WHEEL_PAN_DEFAULTS,
  wheelDelta,
  type WheelIntent,
  type WheelOptions,
  type WheelPanOptions,
} from "./wheel";
export {
  createRecognizer,
  RECOGNIZER_DEFAULTS,
  type Recognizer,
  type RecognizerOptions,
  type RecognizerTimers,
} from "./recognizer";
export { createMachine } from "./machine";
export type { Deadline, Machine, MachineOptions } from "./machine";
export { createDwellMachine, DWELL_DEFAULTS, DWELL_IDLE, dwellDeadline, dwellReducer } from "./dwell";
export type { DwellConfig, DwellInput, DwellMachineOptions, DwellState } from "./dwell";
export { createTouchPress, TOUCH_PRESS_DEFAULTS, TOUCH_PRESS_IDLE, touchPressDeadline, touchPressReducer } from "./touch-press";
export type { TouchPressConfig, TouchPressInput, TouchPressOptions, TouchPressState } from "./touch-press";
export {
  createPagedSwipe,
  PAGED_SWIPE_DEFAULTS,
  PAGED_SWIPE_EMPTY_CONTEXT,
  PAGED_SWIPE_IDLE,
  pagedSwipeDeadline,
  pagedSwipeReducer,
  swipeProgress,
} from "./paged-swipe";
export type { PagedSwipeConfig, PagedSwipeContext, PagedSwipeInput, PagedSwipeOptions, PagedSwipeState, SwipeSide } from "./paged-swipe";
