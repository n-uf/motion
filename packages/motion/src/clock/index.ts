/**
 * `@n-uf/motion/clock`: the clock interface (`ClockPort`), the fake clock for
 * tests, the frame loop that runs tasks in the phases input, update, layout
 * and write, and the frame coalescer (many samples, one delivery a frame).
 * Nothing here reads a global clock.
 *
 * See docs/motion.md, "Clock".
 */
export type { ClockPort, FrameSource, TimerSource } from "./port";
export { createFakeClock } from "./fake-clock";
export type { FakeClock, FakeClockOptions } from "./fake-clock";
export { createFrameLoop, PHASES } from "./frame-loop";
export type {
  FrameInfo,
  FrameLoop,
  FrameLoopOptions,
  FrameStats,
  FrameTask,
  Phase,
  RepeatingTask,
  ScheduleOptions,
} from "./frame-loop";
export { createFrameCoalescer } from "./coalescer";
export type { CoalescerOptions, FrameCoalescer } from "./coalescer";
