/**
 * `@n-uf/motion/clock`: the clock interface (`ClockPort`), the fake clock for
 * tests, and the frame loop that runs tasks in the phases input, update,
 * layout and write. Nothing here reads a global clock.
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
