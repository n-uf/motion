import type { ClockPort } from "./port";

/** Options of {@link createFakeClock}. */
export interface FakeClockOptions {
  /** Starting time in ms. Default 0. */
  readonly now?: number;
  /** How far {@link FakeClock.frame} moves time by default. Default 16 (round numbers in tests). */
  readonly frameMs?: number;
}

/**
 * A clock that only moves when a test moves it. Timers fire in time order
 * (ties in the order they were set), each with `now()` at its due time.
 * Frame callbacks run on {@link FakeClock.frame}; a callback requested during
 * a frame waits for the next one, as with requestAnimationFrame.
 */
export interface FakeClock extends ClockPort {
  /** The default frame step in ms. */
  readonly frameMs: number;
  /** Frame callbacks waiting for the next frame. */
  readonly pendingFrames: number;
  /** Timers not yet fired. */
  readonly pendingTimers: number;
  /** Move time forward by `ms`, firing the timers that come due on the way. */
  tick(ms: number): void;
  /** Move `now()` forward by `ms` without firing anything: work that takes time. */
  spend(ms: number): void;
  /**
   * Move time forward by `dt` (default {@link FakeClock.frameMs}), fire due
   * timers, then run the frame callbacks requested before this call. Returns
   * how many callbacks ran.
   */
  frame(dt?: number): number;
  /** Run `count` frames; returns how many callbacks ran in all. */
  frames(count: number, dt?: number): number;
  /**
   * Run frames until none is requested; returns how many frames ran. Throws
   * after `maxFrames` (default 1000): something keeps asking for frames.
   */
  runUntilIdle(options?: { readonly maxFrames?: number; readonly dt?: number }): number;
}

interface Timer {
  readonly at: number;
  readonly order: number;
  readonly callback: () => void;
}

/** A {@link FakeClock} for tests. */
export function createFakeClock(options: FakeClockOptions = {}): FakeClock {
  let now = options.now ?? 0;
  const frameMs = options.frameMs ?? 16;
  let nextHandle = 1;
  let order = 0;
  let frameCallbacks = new Map<number, () => void>();
  const timers = new Map<number, Timer>();

  const checkStep = (ms: number, what: string): void => {
    if (!Number.isFinite(ms) || ms < 0) throw new RangeError(`fake clock: ${what} needs a finite ms >= 0, got ${ms}`);
  };

  const fireDue = (until: number): void => {
    for (;;) {
      let dueHandle = -1;
      let due: Timer | null = null;
      for (const [handle, timer] of timers) {
        if (timer.at > until) continue;
        if (due === null || timer.at < due.at || (timer.at === due.at && timer.order < due.order)) {
          due = timer;
          dueHandle = handle;
        }
      }
      if (due === null) return;
      timers.delete(dueHandle);
      if (due.at > now) now = due.at;
      due.callback();
    }
  };

  const clock: FakeClock = {
    frameMs,
    get pendingFrames() {
      return frameCallbacks.size;
    },
    get pendingTimers() {
      return timers.size;
    },
    now: () => now,
    requestFrame(callback) {
      const handle = nextHandle++;
      frameCallbacks.set(handle, callback);
      return handle;
    },
    cancelFrame(handle) {
      frameCallbacks.delete(handle);
    },
    setTimer(callback, ms) {
      const handle = nextHandle++;
      timers.set(handle, { at: now + Math.max(0, ms), order: order++, callback });
      return handle;
    },
    clearTimer(handle) {
      timers.delete(handle);
    },
    tick(ms) {
      checkStep(ms, "tick");
      const until = now + ms;
      fireDue(until);
      if (until > now) now = until;
    },
    spend(ms) {
      checkStep(ms, "spend");
      now += ms;
    },
    frame(dt = frameMs) {
      clock.tick(dt);
      const due = frameCallbacks;
      frameCallbacks = new Map();
      for (const callback of due.values()) callback();
      return due.size;
    },
    frames(count, dt) {
      let ran = 0;
      for (let i = 0; i < count; i++) ran += clock.frame(dt);
      return ran;
    },
    runUntilIdle({ maxFrames = 1000, dt } = {}) {
      let frames = 0;
      while (frameCallbacks.size > 0) {
        if (frames >= maxFrames) {
          throw new Error(`fake clock: still requesting frames after ${maxFrames} frames`);
        }
        clock.frame(dt);
        frames++;
      }
      return frames;
    },
  };
  return clock;
}
