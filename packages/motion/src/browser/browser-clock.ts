import type { ClockPort } from "../clock/port";

/**
 * The parts of a browser global this adapter uses. Typed here instead of
 * through lib.dom, so the package builds without DOM types and a test (or a
 * worker, or a server) can pass its own host.
 */
export interface BrowserHost {
  requestAnimationFrame?(callback: (time: number) => void): number;
  cancelAnimationFrame?(handle: number): void;
  setTimeout(callback: () => void, ms?: number): unknown;
  clearTimeout(handle: unknown): void;
  readonly performance?: { now(): number };
  matchMedia?(query: string): { readonly matches: boolean };
}

/** Options of {@link createBrowserClock}. */
export interface BrowserClockOptions {
  /** The global to use. Default `globalThis`. */
  readonly host?: BrowserHost;
  /** Frame interval when the host has no requestAnimationFrame. Default 1000/60. */
  readonly fallbackFrameInterval?: number;
}

/**
 * A {@link ClockPort} on requestAnimationFrame, performance.now and
 * setTimeout. Without requestAnimationFrame (a worker, a server) frames come
 * from setTimeout at `fallbackFrameInterval`; without performance, time comes from
 * Date.now.
 */
export function createBrowserClock(options: BrowserClockOptions = {}): ClockPort {
  const host = options.host ?? (globalThis as unknown as BrowserHost);
  const fallbackFrameInterval = options.fallbackFrameInterval ?? 1000 / 60;
  const performance = host.performance;
  const now = performance !== undefined ? () => performance.now() : () => Date.now();

  // Timer handles are numbers in browsers and objects in Node; the port
  // promises numbers, so keep our own.
  let nextTimer = 1;
  const timers = new Map<number, unknown>();

  const setTimer = (callback: () => void, ms: number): number => {
    const id = nextTimer++;
    timers.set(
      id,
      host.setTimeout(() => {
        timers.delete(id);
        callback();
      }, Math.max(0, ms)),
    );
    return id;
  };

  const clearTimer = (id: number): void => {
    const handle = timers.get(id);
    if (handle === undefined) return;
    timers.delete(id);
    host.clearTimeout(handle);
  };

  // eslint-disable-next-line @typescript-eslint/unbound-method -- always called as `raf.call(host, ...)` below; declaring the BrowserHost members as properties would change the published types
  const raf = host.requestAnimationFrame;
  // eslint-disable-next-line @typescript-eslint/unbound-method -- always called as `caf.call(host, ...)` below; declaring the BrowserHost members as properties would change the published types
  const caf = host.cancelAnimationFrame;
  if (raf !== undefined && caf !== undefined) {
    return {
      now,
      requestFrame: (callback) => raf.call(host, () => callback()),
      cancelFrame: (handle) => caf.call(host, handle),
      setTimer,
      clearTimer,
    };
  }
  return {
    now,
    requestFrame: (callback) => setTimer(callback, fallbackFrameInterval),
    cancelFrame: clearTimer,
    setTimer,
    clearTimer,
  };
}

/**
 * The user's reduced-motion preference as a function, for a motion value's
 * `reducedMotion` option. It reads the media query on each call, so a change
 * in the system setting applies to the next target and the next frame.
 * Without matchMedia it always returns `false`.
 */
export function prefersReducedMotion(host: BrowserHost = globalThis as unknown as BrowserHost): () => boolean {
  const query = host.matchMedia?.("(prefers-reduced-motion: reduce)");
  return () => query?.matches ?? false;
}
