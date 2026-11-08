/**
 * The clock a frame loop, a coalescer or a machine runner is given. Nothing in
 * this package reads a global clock: every consumer gets one passed in.
 *
 * The shape is hypr-tiling's `SchedulerPort` (engine/scheduler-port.ts), so a
 * port built for one is a valid port for the other. Use
 * `createBrowserClock()` from `@n-uf/motion/browser` in an app and
 * {@link createFakeClock} in tests.
 */
export interface ClockPort {
  /** Monotonic time in milliseconds. */
  now(): number;
  /** Run `callback` on the next frame; returns a handle for {@link ClockPort.cancelFrame}. */
  requestFrame(callback: () => void): number;
  /** Cancel a frame requested with {@link ClockPort.requestFrame}. */
  cancelFrame(handle: number): void;
  /** Run `callback` after `ms` milliseconds; returns a handle for {@link ClockPort.clearTimer}. */
  setTimer(callback: () => void, ms: number): number;
  /** Cancel a timer set with {@link ClockPort.setTimer}. */
  clearTimer(handle: number): void;
}

/** The frame half of a clock. A frame loop phase provides one too (`loop.frames(phase)`). */
export type FrameSource = Pick<ClockPort, "requestFrame" | "cancelFrame">;

/** The time-and-timer half of a clock, all a machine runner needs. */
export type TimerSource = Pick<ClockPort, "now" | "setTimer" | "clearTimer">;
