/**
 * The hand's speed (`createHandSpeed`), the one estimate a landing model's fast-or-slow gates read: a speed-up reads at
 * once, a slow-down only once it has lasted the span; a jittered timestamp never turns a fling slow; a rest starts the
 * hand again; a hand gathering speed is not steady. Speeds are px per 8 ms.
 */
import { describe, expect, it } from "vitest";
import { createHandSpeed, HAND_SPEED } from "../src/drag/hand-speed";

/** Samples every `dt` ms at `v` px/ms along y, from `t0` at `y0`; timestamps from `stamp` when given. */
function feed(h: ReturnType<typeof createHandSpeed>, v: number, dt: number, n: number, t0 = 0, y0 = 0, stamp?: (k: number) => number): { t: number; y: number } {
  let t = t0;
  let y = y0;
  for (let k = 1; k <= n; k++) {
    y += v * dt;
    t = stamp ? stamp(k) : t0 + dt * k;
    h.push({ x: 0, y }, t);
  }
  return { t, y };
}

describe("the hand's speed", () => {
  it("is unknown over its span until the samples cover it (48 ms and 5 steps), then reads the hand's speed", () => {
    const h = createHandSpeed();
    h.push({ x: 0, y: 0 }, 0);
    feed(h, 1.5, 8, 4);
    expect(h.long).toBeNull();
    expect(h.speed).toBeCloseTo(12, 6);
    feed(h, 1.5, 8, 4, 32, 48);
    expect(h.long).toBeCloseTo(12, 6);
  });

  it("reads a speed-up at once (the newest step) and a slow-down only once it has lasted the span", () => {
    const h = createHandSpeed();
    h.push({ x: 0, y: 0 }, 0);
    let at = feed(h, 1, 8, 10);
    expect(h.speed).toBeCloseTo(8, 6);
    at = feed(h, 3, 8, 1, at.t, at.y);
    expect(h.speed).toBeCloseTo(24, 6);
    // Back to 1 px/ms: the span still holds the fast step for 48 ms.
    at = feed(h, 1, 8, 3, at.t, at.y);
    expect(h.speed).toBeGreaterThan(8.5);
    feed(h, 1, 8, 6, at.t, at.y);
    expect(h.speed).toBeCloseTo(8, 6);
  });

  it("a fling at 2.4 px/ms whose timestamps are off by up to 40% of a frame reads above 2 px/ms (16 per 8 ms), though its steps don't", () => {
    for (const dt of [8, 16]) {
      const h = createHandSpeed();
      h.push({ x: 0, y: 0 }, 0);
      const err = [0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, -0.5, 0.5, 0.5];
      let slowStep = false;
      for (let k = 1; k <= err.length; k++) {
        h.push({ x: 0, y: 2.4 * dt * k }, dt * (k + err[k - 1]! * (dt === 8 ? 0.8 : 0.7)));
        if (h.step <= 16) slowStep = true;
        if (h.long !== null) expect(h.speed, `${dt} ms, sample ${k}`).toBeGreaterThan(16);
      }
      expect(slowStep).toBe(true);
    }
  });

  it("a gap of 40 ms or more starts the hand again: the step over it is unknown and the span forgets what came before", () => {
    const h = createHandSpeed();
    h.push({ x: 0, y: 0 }, 0);
    const at = feed(h, 0.5, 8, 8);
    expect(h.long).not.toBeNull();
    h.push({ x: 0, y: at.y + 20 }, at.t + HAND_SPEED.gap);
    expect(h.step).toBe(Infinity);
    expect(h.long).toBeNull();
    expect(h.steady).toBe(false);
  });

  it("is steady only once it has read alike for half a span: a hand gathering speed out of a hesitation is not", () => {
    const h = createHandSpeed();
    h.push({ x: 0, y: 0 }, 0);
    // A ramp from 0 to 2.4 px/ms over 60 ms, 8 ms frames.
    let y = 0;
    for (let k = 1; k <= 8; k++) {
      y += Math.min(2.4, (2.4 * 8 * k) / 60) * 8;
      h.push({ x: 0, y }, 8 * k);
      expect(h.steady, `ramp sample ${k}`).toBe(false);
    }
    const s = createHandSpeed();
    s.push({ x: 0, y: 0 }, 0);
    feed(s, 1.5, 8, 12);
    expect(s.steady).toBe(true);
  });
});
