import { describe, expect, it, vi } from "vitest";
import { createBrowserClock, prefersReducedMotion, type BrowserHost } from "../browser";
import { createFrameLoop } from "../src/clock";

/** A host with the browser's shape, driven by hand. */
function fakeHost(options: { raf?: boolean; reduced?: boolean } = {}) {
  let now = 1000;
  let nextHandle = 1;
  const frames = new Map<number, (time: number) => void>();
  const timeouts = new Map<object, { at: number; callback: () => void }>();
  const host: BrowserHost = {
    setTimeout: (callback, ms = 0) => {
      const handle = { id: nextHandle++ };
      timeouts.set(handle, { at: now + ms, callback });
      return handle;
    },
    clearTimeout: (handle) => {
      timeouts.delete(handle as object);
    },
    performance: { now: () => now },
    matchMedia: (query) => ({ matches: query.includes("reduce") && options.reduced === true }),
  };
  if (options.raf !== false) {
    host.requestAnimationFrame = (callback) => {
      const handle = nextHandle++;
      frames.set(handle, callback);
      return handle;
    };
    host.cancelAnimationFrame = (handle) => {
      frames.delete(handle);
    };
  }
  return {
    host,
    paint(ms = 16) {
      now += ms;
      const due = Array.from(frames.values());
      frames.clear();
      for (const callback of due) callback(now);
    },
    advance(ms: number) {
      now += ms;
      for (const [handle, timeout] of Array.from(timeouts)) {
        if (timeout.at <= now) {
          timeouts.delete(handle);
          timeout.callback();
        }
      }
    },
    get frames() {
      return frames.size;
    },
    get timeouts() {
      return timeouts.size;
    },
  };
}

describe("browser clock", () => {
  it("reads performance.now and runs frames on requestAnimationFrame", () => {
    const fake = fakeHost();
    const clock = createBrowserClock({ host: fake.host });
    expect(clock.now()).toBe(1000);
    const callback = vi.fn();
    clock.requestFrame(callback);
    clock.cancelFrame(clock.requestFrame(vi.fn()));
    expect(fake.frames).toBe(1);
    fake.paint();
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("returns number timer handles even where the host's are objects", () => {
    const fake = fakeHost();
    const clock = createBrowserClock({ host: fake.host });
    const fired = vi.fn();
    const kept = clock.setTimer(fired, 50);
    const dropped = clock.setTimer(vi.fn(), 50);
    expect(typeof kept).toBe("number");
    clock.clearTimer(dropped);
    clock.clearTimer(12345);
    fake.advance(50);
    expect(fired).toHaveBeenCalledTimes(1);
    expect(fake.timeouts).toBe(0);
  });

  it("falls back to timeouts for frames without requestAnimationFrame", () => {
    const fake = fakeHost({ raf: false });
    const clock = createBrowserClock({ host: fake.host, fallbackFrameMs: 20 });
    const callback = vi.fn();
    clock.requestFrame(callback);
    fake.advance(19);
    expect(callback).not.toHaveBeenCalled();
    fake.advance(1);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("drives a frame loop", () => {
    const fake = fakeHost();
    const loop = createFrameLoop({ clock: createBrowserClock({ host: fake.host }) });
    const seen: number[] = [];
    loop.schedule("write", (frame) => seen.push(frame.time));
    fake.paint(16);
    expect(seen).toEqual([1016]);
    expect(fake.frames).toBe(0);
  });

  it("reads the reduced-motion media query", () => {
    expect(prefersReducedMotion(fakeHost({ reduced: true }).host)()).toBe(true);
    expect(prefersReducedMotion(fakeHost({ reduced: false }).host)()).toBe(false);
    expect(prefersReducedMotion({ setTimeout: () => 0, clearTimeout: () => {} })()).toBe(false);
  });
});
