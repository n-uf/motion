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

  it("a sample under 1 ms after the newest is the same sample: step, long, speed and steady read as before it, with few samples and with many", () => {
    for (const v of [0.6, 1.5, 2.4]) {
      for (const gap of [0, 0.05, 0.3, 0.5, 0.99]) {
        for (const n of [2, 4, 5, 12]) {
          const h = createHandSpeed();
          h.push({ x: 0, y: 0 }, 0);
          const at = feed(h, v, 8, n);
          const before = [h.step, h.long, h.speed, h.steady];
          // A sample a fraction of a millisecond after the last: a little further on, back, or off the line.
          for (const [dx, dy] of [
            [0, v * gap],
            [0, -v * gap],
            [3, 7],
          ] as const) {
            h.push({ x: dx, y: at.y + dy }, at.t + gap);
            expect([h.step, h.long, h.speed, h.steady], `v ${v}, gap ${gap}, ${n} samples, (${dx}, ${dy})`).toEqual(before);
          }
        }
      }
    }
  });

  it("an interval of 1 ms or more, 1 ms itself included, is its own step, not the one before it, with few samples and with many", () => {
    for (const [before, after] of [
      [0.6, 1.5],
      [0.6, 0.15],
      [2.4, 0.3],
    ] as const) {
      for (const gap of [1, 1.2, 1.4, 1.9, 3]) {
        const h = createHandSpeed();
        h.push({ x: 0, y: 0 }, 0);
        const at = feed(h, before, 8, 3);
        expect(h.step).toBeCloseTo(before, 9);
        // Fewer than 6 samples: `long` is unknown, so the speed is the newest step.
        expect(h.long).toBeNull();
        h.push({ x: 0, y: at.y + after * gap }, at.t + gap);
        expect(h.step, `${before} to ${after} px/ms over ${gap} ms`).toBeCloseTo(after, 9);
        expect(h.speed, `${before} to ${after} px/ms over ${gap} ms`).toBeCloseTo(after, 9);
      }
    }
    // With the span known the newest step still shows: a speed-up reads at once, over 1 ms.
    const h = createHandSpeed();
    h.push({ x: 0, y: 0 }, 0);
    const at = feed(h, 0.6, 8, 12);
    expect(h.long).not.toBeNull();
    h.push({ x: 0, y: at.y + 2 }, at.t + 1);
    expect(h.step).toBeCloseTo(2, 9);
    expect(h.speed).toBeCloseTo(2, 9);
  });

  it("a run of samples all under 1 ms apart is read over the first one 1 ms or more past the newest held: step, speed, long and steady follow the hand", () => {
    for (const dt of [0.125, 0.25, 0.3, 0.5, 0.9]) {
      for (const v of [0.1, 0.6, 1.5, 3]) {
        // From the lift, every interval under 1 ms.
        const h = createHandSpeed();
        h.push({ x: 0, y: 0 }, 0);
        const at = feed(h, v, dt, Math.ceil(20 / dt));
        expect(h.step, `from the lift, ${dt} ms, ${v} px/ms`).toBeCloseTo(v, 6);
        expect(h.speed, `from the lift, ${dt} ms, ${v} px/ms`).toBeCloseTo(v, 6);
        feed(h, v, dt, Math.ceil(300 / dt), at.t, at.y);
        expect(h.long, `${dt} ms, ${v} px/ms`).toBeCloseTo(v, 6);
        expect(h.steady, `${dt} ms, ${v} px/ms`).toBe(true);
      }
    }
  });

  it("a fling, then a creep sampled under 1 ms apart, reads slow once the creep has lasted the span: the fling is not remembered", () => {
    for (const flingDt of [8, 0.5]) {
      for (const dt of [0.25, 0.5, 0.9]) {
        const h = createHandSpeed();
        h.push({ x: 0, y: 0 }, 0);
        const fling = feed(h, 3, flingDt, Math.ceil(100 / flingDt));
        expect(h.speed).toBeCloseTo(3, 6);
        // 150 ms at 0.1 px/ms.
        let y = fling.y;
        let t = fling.t;
        let k = 0;
        while (t - fling.t < 150) {
          k++;
          y += 0.1 * dt;
          t = fling.t + dt * k;
          h.push({ x: 0, y }, t);
          // The newest step reads the creep from the second sample on.
          if (t - fling.t >= 4) expect(h.step, `fling ${flingDt} ms, creep ${dt} ms, ${t - fling.t} ms in`).toBeCloseTo(0.1, 6);
        }
        expect(h.speed, `fling ${flingDt} ms, creep ${dt} ms`).toBeCloseTo(0.1, 6);
        expect(h.steady, `fling ${flingDt} ms, creep ${dt} ms`).toBe(true);
      }
    }
  });

  it("reads the same speed at any sample rate: 60 Hz, 1, 2 and 8 kHz", () => {
    for (const hz of [60, 1000, 2000, 8000]) {
      for (const v of [0.1, 0.6, 1.5, 3]) {
        const dt = 1000 / hz;
        const h = createHandSpeed();
        h.push({ x: 0, y: 0 }, 0);
        feed(h, v, dt, Math.ceil(300 / dt));
        expect([hz, v, h.step.toFixed(6), h.long?.toFixed(6), h.speed.toFixed(6), h.steady]).toEqual([hz, v, v.toFixed(6), v.toFixed(6), v.toFixed(6), true]);
      }
    }
  });

  it("a sample timed before the newest held (an event's time against a frame's, up to a frame behind) is left out, as the same sample is", () => {
    for (const behind of [0.5, 3, 8, 16, 39]) {
      const plain = createHandSpeed();
      const mixed = createHandSpeed();
      plain.push({ x: 0, y: 0 }, 100);
      mixed.push({ x: 0, y: 0 }, 100);
      for (let k = 1; k <= 30; k++) {
        const t = 100 + 8 * k;
        const y = 1.5 * 8 * k;
        // The frame's own reading of the pointer, stamped `behind` ms before the newest sample, somewhere else.
        mixed.push({ x: 4, y: y + 5 }, t - 8 - behind);
        plain.push({ x: 0, y }, t);
        mixed.push({ x: 0, y }, t);
        expect([mixed.step, mixed.long, mixed.speed, mixed.steady], `${behind} ms behind, sample ${k}`).toEqual([plain.step, plain.long, plain.speed, plain.steady]);
      }
      expect(plain.steady).toBe(true);
    }
  });

  it("one sample stamped late, however far (51 ms, 500 ms), changes nothing, on a slow hand at a spot's edge as on a fast one", () => {
    for (const v of [0.1, 0.2, 0.3, 1.5]) {
      for (const behind of [40, 51, 100, 500]) {
        const plain = createHandSpeed();
        const mixed = createHandSpeed();
        plain.push({ x: 0, y: 0 }, 1000);
        mixed.push({ x: 0, y: 0 }, 1000);
        for (let k = 1; k <= 40; k++) {
          const t = 1000 + 8 * k;
          const y = v * 8 * k;
          // One release, stamped `behind` ms before the newest sample, at the point the hand is about to reach.
          if (k === 20) mixed.push({ x: 0, y: y + 0.4 }, t - 8 - behind);
          plain.push({ x: 0, y }, t);
          mixed.push({ x: 0, y }, t);
          expect([mixed.step, mixed.long, mixed.speed, mixed.steady], `${v} px/ms, ${behind} ms late, sample ${k}`).toEqual([plain.step, plain.long, plain.speed, plain.steady]);
        }
        expect(plain.long).not.toBeNull();
      }
    }
  });

  it("a stale sample now and then in a slide at 60 and 125 Hz changes nothing, nor do pairs of them (60 and 5 ms, 45 and 20, 41 and 1 behind the newest)", () => {
    for (const dt of [1000 / 60, 8]) {
      for (const v of [0.6, 1.2, 1.9]) {
        for (const pair of [[60], [60, 5], [45, 20], [41, 1]]) {
          const plain = createHandSpeed();
          const mixed = createHandSpeed();
          plain.push({ x: 0, y: 0 }, 5000);
          mixed.push({ x: 0, y: 0 }, 5000);
          for (let k = 1; k <= 60; k++) {
            const t = 5000 + dt * k;
            const y = v * dt * k;
            // Every fifth frame, first a move and then a release (stamped `pair` ms before the newest sample), from elsewhere.
            if (k % 5 === 0) for (const behind of pair) mixed.push({ x: 3, y: y - 4 }, t - dt - behind);
            plain.push({ x: 0, y }, t);
            mixed.push({ x: 0, y }, t);
            expect([mixed.step, mixed.long, mixed.speed, mixed.steady], `${dt} ms, ${v} px/ms, ${pair} behind, frame ${k}`).toEqual([plain.step, plain.long, plain.speed, plain.steady]);
          }
          expect(plain.steady).toBe(true);
        }
      }
    }
  });

  it("a move stamped 60 ms behind and then a release stamped 10 ms behind change nothing on a slow hand", () => {
    for (const v of [0.1, 0.2, 0.3]) {
      const plain = createHandSpeed();
      const mixed = createHandSpeed();
      plain.push({ x: 0, y: 0 }, 1000);
      mixed.push({ x: 0, y: 0 }, 1000);
      for (let k = 1; k <= 40; k++) {
        const t = 1000 + 8 * k;
        const y = v * 8 * k;
        if (k === 20) {
          mixed.push({ x: 0, y: y + 0.3 }, t - 8 - 60);
          mixed.push({ x: 0, y: y + 0.4 }, t - 8 - 10);
        }
        plain.push({ x: 0, y }, t);
        mixed.push({ x: 0, y }, t);
        expect([mixed.step, mixed.long, mixed.speed, mixed.steady], `${v} px/ms, sample ${k}`).toEqual([plain.step, plain.long, plain.speed, plain.steady]);
      }
    }
  });

  it("a repeated frame in order ends a run of stale samples: the next stale one starts a new run", () => {
    const h = createHandSpeed();
    h.push({ x: 0, y: 0 }, 1000);
    const at = feed(h, 1.5, 8, 12, 1000);
    const before = [h.step, h.long, h.speed, h.steady];
    // Two stale samples 40 ms apart, both far behind, restart the hand (known and accepted, below). With a repeated
    // frame between them they are two runs of one, and nothing changes.
    h.push({ x: 0, y: at.y + 1 }, at.t - 100);
    h.hold(at.t + 5);
    h.push({ x: 0, y: at.y + 2 }, at.t - 60);
    expect([h.step, h.long, h.speed, h.steady]).toEqual(before);
  });

  it("known and accepted: two stale samples both `gap` ms or more behind and `still` ms or more apart, with nothing in order between, restart the hand", () => {
    const h = createHandSpeed();
    h.push({ x: 0, y: 0 }, 1000);
    const at = feed(h, 1.5, 8, 12, 1000);
    h.push({ x: 0, y: at.y + 1 }, at.t - 100);
    expect(h.speed).toBeCloseTo(1.5, 9);
    h.push({ x: 0, y: at.y + 2 }, at.t - 60);
    expect([h.step, h.long, h.speed, h.steady]).toEqual([Infinity, null, Infinity, false]);
  });

  it("with `still` 0 (a landing model's `rest` of 0) one stale sample restarts nothing: two stamps under 1 ms apart are one sample", () => {
    const h = createHandSpeed({ still: 0 });
    h.push({ x: 0, y: 0 }, 1000);
    const at = feed(h, 1.5, 8, 12, 1000);
    const before = [h.step, h.long, h.speed, h.steady];
    h.push({ x: 0, y: at.y + 1 }, at.t - 100);
    expect([h.step, h.long, h.speed, h.steady]).toEqual(before);
    h.push({ x: 0, y: at.y + 1 }, at.t - 99.5);
    expect([h.step, h.long, h.speed, h.steady]).toEqual(before);
    // 1 ms apart is two samples: a run, as with any `still`.
    h.push({ x: 0, y: at.y + 1 }, at.t - 99);
    expect([h.step, h.long, h.speed, h.steady]).toEqual([Infinity, null, Infinity, false]);
  });

  it("a clock that steps back by `gap` ms or more for good starts the hand again once its samples have run on for `still` ms, and the hand reads on from it", () => {
    // (64: the sample that ends a run of 20 ms at 8 ms apart is still 40 ms behind. The last: the new clock starts at 0.)
    for (const back of [64, 100, 500, 5000, 10096]) {
      const h = createHandSpeed();
      h.push({ x: 0, y: 0 }, 10000);
      const at = feed(h, 1.5, 8, 12, 10000);
      expect(h.steady).toBe(true);
      const before = [h.step, h.long, h.speed, h.steady];
      // The new clock: the samples go on from `at.t - back`, 8 ms apart. The first ones are left out like any stale sample.
      let y = at.y;
      // Samples at 0, 8 and 16 ms of the run change nothing; the one at 24 ms (`still` is 20) ends it.
      for (let k = 0; k < 3; k++) {
        y += 12;
        h.push({ x: 0, y }, at.t - back + 8 * k);
        expect([h.step, h.long, h.speed, h.steady], `${back} ms back, sample ${k}`).toEqual(before);
      }
      y += 12;
      h.push({ x: 0, y }, at.t - back + 24);
      // Restarted at the sample that ends the run, its step unknown.
      expect([h.step, h.long, h.speed, h.steady], `${back} ms back`).toEqual([Infinity, null, Infinity, false]);
      // On from there at the same speed on the new clock: the hand reads it again, steady once its span is known.
      const from = at.t - back + 24;
      feed(h, 1.5, 8, 4, from, y);
      expect(h.step).toBeCloseTo(1.5, 9);
      feed(h, 1.5, 8, 12, from + 32, y + 1.5 * 32);
      expect(h.long).toBeCloseTo(1.5, 6);
      expect(h.steady, `${back} ms back`).toBe(true);
    }
  });

  it("an in-order sample ends a run of stale ones: the `still` ms count again from the next run", () => {
    const h = createHandSpeed();
    h.push({ x: 0, y: 0 }, 1000);
    const at = feed(h, 1.5, 8, 12, 1000);
    // Stale samples spread over more than `still` ms, each separated from the next by an in-order one: never a run.
    let t = at.t;
    let y = at.y;
    for (let k = 0; k < 12; k++) {
      h.push({ x: 0, y: y + 3 }, t + 8 - 100 + 8 * k);
      t += 8;
      y += 12;
      h.push({ x: 0, y }, t);
    }
    expect(h.step).toBeCloseTo(1.5, 9);
    expect(h.long).toBeCloseTo(1.5, 6);
    expect(h.steady).toBe(true);
  });

  it("with `gap` 0 (a landing model's `pause` of 0) a sample stamped at the newest's time is the same sample, never a clock step", () => {
    const h = createHandSpeed({ gap: 0 });
    h.push({ x: 0, y: 0 }, 0);
    const at = feed(h, 1.5, 8, 12);
    const before = [h.step, h.long, h.speed, h.steady];
    for (let k = 0; k < 20; k++) {
      h.push({ x: 2, y: at.y + k }, at.t);
      expect([h.step, h.long, h.speed, h.steady], `equal stamp ${k}`).toEqual(before);
    }
    // And a sample 0.5 ms behind, and 0.5 ms past.
    for (let k = 0; k < 40; k++) h.push({ x: 2, y: at.y + k }, at.t - 0.5 + (k % 2));
    expect([h.step, h.long, h.speed, h.steady]).toEqual(before);
  });

  it("a left-out sample leaves the rest the pointer was seen in standing: the gap it ends is a rest, not a lost stretch", () => {
    for (const late of [(at0: number) => at0 + 0.5, (at0: number) => at0 - 100]) {
      const h = createHandSpeed();
      h.push({ x: 0, y: 0 }, 0);
      const at = feed(h, 0.5, 8, 12);
      // Seen standing still for `still` ms and more, then a sample the hand leaves out (the same sample, or a stale one).
      h.hold(at.t + HAND_SPEED.still + 5);
      h.push({ x: 1, y: at.y + 1 }, late(at.t));
      // The pointer moved across the gap at the hand's speed: a lost stretch, but for the rest it was seen in.
      h.push({ x: 0, y: at.y + 0.5 * 60 }, at.t + 60);
      expect(h.speed).toBe(Infinity);
      expect(h.long).toBeNull();
    }
  });

  it("a clock that steps back by up to `gap` ms and a few samples for good (39, 40, 45, 59, 63 ms) carries on by itself: it reads the hand's speed again within a few spans", () => {
    for (const back of [5, 12, 30, HAND_SPEED.gap - 1, HAND_SPEED.gap, 45, 59, 63]) {
      const h = createHandSpeed();
      h.push({ x: 0, y: 0 }, 1000);
      const at = feed(h, 1.5, 8, 12, 1000);
      // The samples after it are `back` ms early by the new clock.
      let y = at.y;
      for (let k = 1; k <= 60; k++) {
        y += 1.5 * 8;
        h.push({ x: 0, y }, at.t + 8 * k - back);
      }
      expect(h.speed, `${back} ms back`).toBeCloseTo(1.5, 6);
      expect(h.steady, `${back} ms back`).toBe(true);
    }
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
