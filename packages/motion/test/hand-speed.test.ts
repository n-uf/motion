/**
 * The hand's speed (`createHandSpeed`), the one estimate a landing model's fast-or-slow gates read: a speed-up reads at
 * once, a slow-down only once it has lasted the span; a jittered timestamp never turns a fling slow; a rest starts the
 * hand again; a hand gathering speed is not steady. Speeds are px/ms.
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
    expect(h.speed).toBeCloseTo(1.5, 6);
    feed(h, 1.5, 8, 4, 32, 48);
    expect(h.long).toBeCloseTo(1.5, 6);
  });

  it("reads a speed-up at once (the newest step) and a slow-down only once it has lasted the span", () => {
    const h = createHandSpeed();
    h.push({ x: 0, y: 0 }, 0);
    let at = feed(h, 1, 8, 10);
    expect(h.speed).toBeCloseTo(1, 6);
    at = feed(h, 3, 8, 1, at.t, at.y);
    expect(h.speed).toBeCloseTo(3, 6);
    // Back to 1 px/ms: the span still holds the fast step for 48 ms.
    at = feed(h, 1, 8, 3, at.t, at.y);
    expect(h.speed).toBeGreaterThan(1.0625);
    feed(h, 1, 8, 6, at.t, at.y);
    expect(h.speed).toBeCloseTo(1, 6);
  });

  it("a fling at 2.4 px/ms whose timestamps are off by up to 40% of a frame reads above 2 px/ms, though its steps don't", () => {
    for (const dt of [8, 16]) {
      const h = createHandSpeed();
      h.push({ x: 0, y: 0 }, 0);
      const err = [0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, -0.5, 0.5, 0.5];
      let slowStep = false;
      for (let k = 1; k <= err.length; k++) {
        h.push({ x: 0, y: 2.4 * dt * k }, dt * (k + err[k - 1]! * (dt === 8 ? 0.8 : 0.7)));
        if (h.step <= 2) slowStep = true;
        if (h.long !== null) expect(h.speed, `${dt} ms, sample ${k}`).toBeGreaterThan(2);
      }
      expect(slowStep).toBe(true);
    }
  });

  it("a gap of 40 ms or more the pointer rested in starts the hand again: the step over it is unknown and the span forgets what came before", () => {
    const h = createHandSpeed();
    h.push({ x: 0, y: 0 }, 0);
    const at = feed(h, 0.5, 8, 8);
    expect(h.long).not.toBeNull();
    // 8 px in 40 ms: under half the hand's 0.5 px/ms.
    h.push({ x: 0, y: at.y + 8 }, at.t + HAND_SPEED.gap);
    expect(h.step).toBe(Infinity);
    expect(h.speed).toBe(Infinity);
    expect(h.long).toBeNull();
    expect(h.steady).toBe(false);
  });

  it("a gap the pointer was seen standing still in is a rest, however far it moved across it", () => {
    const h = createHandSpeed();
    h.push({ x: 0, y: 0 }, 0);
    const at = feed(h, 0.5, 8, 8);
    h.hold(at.t + HAND_SPEED.still);
    h.push({ x: 0, y: at.y + 0.5 * 48 }, at.t + 48);
    expect(h.speed).toBe(Infinity);
    expect(h.long).toBeNull();
  });

  it("a gap the pointer moved on through at about the hand's speed (frames the host lost) carries the hand on, the frames filled in", () => {
    for (const dt of [8, 16]) {
      const h = createHandSpeed();
      h.push({ x: 0, y: 0 }, 0);
      const at = feed(h, 1.5, dt, 12);
      expect(h.steady).toBe(true);
      // A repeated sample within the frame of the move is no rest.
      h.hold(at.t + 3);
      h.push({ x: 0, y: at.y + 1.5 * 64 }, at.t + 64);
      // The gap's own step is never a slow step (it may end a rest), but the hand reads on across it.
      expect(h.step, `${dt} ms`).toBe(Infinity);
      expect(h.long, `${dt} ms`).toBeCloseTo(1.5, 6);
      expect(h.speed, `${dt} ms`).toBeCloseTo(1.5, 6);
      expect(h.steady, `${dt} ms`).toBe(true);
    }
  });

  it("with no speed yet (a single sample before the gap) a gap is a rest", () => {
    const h = createHandSpeed();
    h.push({ x: 0, y: 0 }, 0);
    h.push({ x: 0, y: 60 }, 50);
    expect(h.speed).toBe(Infinity);
  });

  it("second copy: a gap is a rest exactly when the pointer was seen still for `still` ms in it or moved across it at under `carry` times the hand's speed", () => {
    // The oracle, from the rule's words: the hand moves at a known `v` (its span full) before the gap.
    const rests = (v: number, d: number, dt: number, heldFor: number | null): boolean => (heldFor !== null && heldFor >= HAND_SPEED.still) || d / dt < HAND_SPEED.carry * v;
    let s = 99;
    const rnd = (): number => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    const bad: string[] = [];
    let rested = 0;
    for (let run = 0; run < 2000; run++) {
      const v = 0.2 + rnd() * 2.8;
      const frame = rnd() < 0.5 ? 8 : 1000 / 60;
      const gap = HAND_SPEED.gap + rnd() * 160;
      // Across the gap: from standing still to twice the hand's speed, never a crawl (3 px or less reads as it is).
      const d = Math.max(HAND_SPEED.slowStep + 1, rnd() * 2 * v * gap);
      const heldFor = rnd() < 0.4 ? rnd() * gap : null;
      const h = createHandSpeed();
      h.push({ x: 0, y: 0 }, 0);
      const at = feed(h, v, frame, 12);
      if (heldFor !== null && heldFor > 0) h.hold(at.t + heldFor);
      h.push({ x: 0, y: at.y + d }, at.t + gap);
      const want = rests(v, d, gap, heldFor);
      if (want) rested++;
      if (Number.isFinite(h.speed) === want) bad.push(`v ${v.toFixed(2)}, ${frame.toFixed(1)} ms, gap ${gap.toFixed(0)} ms, ${d.toFixed(1)} px, held ${heldFor?.toFixed(0) ?? "-"}: ${want ? "a rest read as a lost stretch" : "a lost stretch read as a rest"}`);
    }
    // Both kinds are drawn.
    expect(rested).toBeGreaterThan(400);
    expect(rested).toBeLessThan(1600);
    expect(bad).toEqual([]);
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
