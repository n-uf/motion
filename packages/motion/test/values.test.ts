import { describe, expect, it, vi } from "vitest";
import { createFakeClock, createFrameLoop } from "../src/clock";
import { computed, effect, signal } from "../src/signals";
import {
  createSpring,
  createTween,
  cubicBezier,
  ease,
  easeInOut,
  easeOutCubic,
  linear,
  resolveSpring,
  SPRING_DEFAULTS,
  springStep,
  springValue,
  tweenValue,
} from "../src/values";

const FRAME = 16;

/** Step a spring frame by frame until it settles; returns every value seen. */
function run(step: (dt: number) => boolean, value: () => number, maxFrames = 2000): number[] {
  const seen: number[] = [];
  for (let i = 0; i < maxFrames; i++) {
    const moving = step(FRAME);
    seen.push(value());
    if (!moving) return seen;
  }
  throw new Error("did not settle");
}

describe("spring", () => {
  it("defaults to critical damping", () => {
    const params = resolveSpring();
    expect(params).toEqual(SPRING_DEFAULTS);
    expect(params.dampingRatio).toBe(1);
    expect(params.damping).toBeCloseTo(2 * Math.sqrt(300), 12);
  });

  it("critically damped: approaches without overshoot and settles exactly on the target", () => {
    const spring = createSpring(0);
    spring.setTarget(100);
    expect(spring.settled).toBe(false);
    const seen = run((dt) => spring.step(dt), () => spring.value);
    expect(Math.max(...seen)).toBe(100);
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBeGreaterThanOrEqual(seen[i - 1]!);
    expect(spring.value).toBe(100);
    expect(spring.velocity).toBe(0);
    expect(spring.settled).toBe(true);
    expect(seen.length).toBeLessThan(60);
  });

  it("underdamped: overshoots, rings, and still settles exactly on the target", () => {
    const spring = createSpring(0, { dampingRatio: 0.3 });
    spring.setTarget(100);
    const seen = run((dt) => spring.step(dt), () => spring.value);
    const peak = Math.max(...seen);
    expect(peak).toBeGreaterThan(130);
    // It comes back below the target after the first overshoot.
    const afterPeak = seen.slice(seen.indexOf(peak));
    expect(Math.min(...afterPeak)).toBeLessThan(100);
    expect(spring.value).toBe(100);
    expect(spring.settled).toBe(true);
  });

  it("overdamped: no overshoot, slower than critical", () => {
    const critical = createSpring(0);
    critical.setTarget(100);
    const fast = run((dt) => critical.step(dt), () => critical.value);
    const sluggish = createSpring(0, { dampingRatio: 3 });
    sluggish.setTarget(100);
    const slow = run((dt) => sluggish.step(dt), () => sluggish.value);
    expect(Math.max(...slow)).toBe(100);
    expect(slow.length).toBeGreaterThan(fast.length);
  });

  it("an explicit damping wins over dampingRatio", () => {
    const params = resolveSpring({ stiffness: 100, damping: 10, dampingRatio: 1 });
    expect(params.damping).toBe(10);
    expect(params.dampingRatio).toBeCloseTo(0.5, 12);
  });

  it("rejects settings that would never settle or make no sense", () => {
    expect(() => resolveSpring({ stiffness: 0 })).toThrow(RangeError);
    expect(() => resolveSpring({ damping: 0 })).toThrow(/damping/);
    expect(() => resolveSpring({ dampingRatio: -1 })).toThrow(/dampingRatio/);
    expect(() => resolveSpring({ mass: Number.POSITIVE_INFINITY })).toThrow(RangeError);
  });

  it("is exact: one 160 ms step lands where ten 16 ms steps do", () => {
    for (const dampingRatio of [0.4, 1, 2]) {
      const coarse = createSpring(0, { dampingRatio });
      const fine = createSpring(0, { dampingRatio });
      coarse.setTarget(100);
      fine.setTarget(100);
      coarse.step(160);
      for (let i = 0; i < 10; i++) fine.step(16);
      expect(coarse.value).toBeCloseTo(fine.value, 9);
      expect(coarse.velocity).toBeCloseTo(fine.velocity, 7);
    }
  });

  it("springStep is the same step as a pure function", () => {
    const spring = createSpring(0, { dampingRatio: 0.5 });
    spring.setTarget(50);
    spring.step(16);
    const pure = springStep({ value: 0, velocity: 0 }, 50, resolveSpring({ dampingRatio: 0.5 }), 16);
    expect(pure.value).toBeCloseTo(spring.value, 12);
    expect(pure.velocity).toBeCloseTo(spring.velocity, 12);
  });

  it("keeps its velocity when the target changes mid-flight", () => {
    const spring = createSpring(0);
    spring.setTarget(100);
    for (let i = 0; i < 5; i++) spring.step(FRAME);
    const position = spring.value;
    const velocity = spring.velocity;
    expect(velocity).toBeGreaterThan(0);
    spring.setTarget(0);
    expect(spring.value).toBe(position);
    expect(spring.velocity).toBe(velocity);
    // The motion carries on: it keeps rising briefly before turning back.
    spring.step(4);
    expect(spring.value).toBeGreaterThan(position);
    run((dt) => spring.step(dt), () => spring.value);
    expect(spring.value).toBe(0);
  });

  it("takes a starting velocity (a fling) and comes back to the target", () => {
    const spring = createSpring(0);
    spring.setVelocity(2000);
    expect(spring.settled).toBe(false);
    const seen = run((dt) => spring.step(dt), () => spring.value);
    expect(Math.max(...seen)).toBeGreaterThan(20);
    expect(spring.value).toBe(0);
  });

  it("moves points, rects and vectors component by component, returning fresh plain values", () => {
    const rect = createSpring({ x: 0, y: 0, width: 100, height: 50 });
    rect.setTarget({ x: 40, y: -20, width: 200, height: 50 });
    rect.step(FRAME);
    const mid = rect.value;
    expect(Object.keys(mid).sort()).toEqual(["height", "width", "x", "y"]);
    expect(mid.x).toBeGreaterThan(0);
    expect(mid.y).toBeLessThan(0);
    expect(mid.width).toBeGreaterThan(100);
    expect(mid.height).toBe(50);
    rect.step(FRAME);
    expect(rect.value).not.toBe(mid);
    run((dt) => rect.step(dt), () => rect.value.x);
    expect(rect.value).toEqual({ x: 40, y: -20, width: 200, height: 50 });

    const point = createSpring({ x: 0, y: 0 });
    point.setTarget({ x: 3, y: 4 });
    run((dt) => point.step(dt), () => point.value.x);
    expect(point.value).toEqual({ x: 3, y: 4 });

    const vector = createSpring([0, 0, 0]);
    vector.setTarget([1, 2, 3]);
    run((dt) => vector.step(dt), () => vector.value[0]!);
    expect(vector.value).toEqual([1, 2, 3]);
  });

  it("refuses a target of another shape", () => {
    const spring = createSpring({ x: 0, y: 0 });
    const rect = { x: 0, y: 0, width: 1, height: 1 };
    expect(() => spring.setTarget(rect)).toThrow(TypeError);
    const vector = createSpring([0, 0]);
    expect(() => vector.setTarget([1, 2, 3])).toThrow(TypeError);
  });

  it("can be retuned mid-flight; position and velocity carry on", () => {
    const spring = createSpring(0);
    spring.setTarget(100);
    spring.step(FRAME);
    const position = spring.value;
    const velocity = spring.velocity;
    spring.configure({ stiffness: 800 });
    expect(spring.params.stiffness).toBe(800);
    expect(spring.params.dampingRatio).toBe(1);
    expect(spring.value).toBe(position);
    expect(spring.velocity).toBe(velocity);
  });

  it("jumpTo teleports at rest, snap finishes on the target", () => {
    const spring = createSpring(0);
    spring.setTarget(100);
    spring.step(FRAME);
    spring.snap();
    expect(spring.value).toBe(100);
    expect(spring.settled).toBe(true);
    expect(spring.step(FRAME)).toBe(false);
    spring.jumpTo(-5);
    expect(spring.value).toBe(-5);
    expect(spring.target).toBe(-5);
    expect(spring.settled).toBe(true);
  });
});

describe("tween", () => {
  it("runs from the value to the target over its duration with its easing", () => {
    const tween = createTween(0, { duration: 100, easing: linear });
    tween.setTarget(100);
    const seen: number[] = [];
    while (tween.step(25)) seen.push(tween.value);
    seen.push(tween.value);
    expect(seen).toEqual([25, 50, 75, 100]);
    expect(tween.settled).toBe(true);
    expect(tween.progress).toBe(1);
  });

  it("defaults to a cubic ease-out", () => {
    const tween = createTween(0, { duration: 100 });
    tween.setTarget(100);
    tween.step(50);
    expect(tween.value).toBeCloseTo(easeOutCubic(0.5) * 100, 12);
    expect(tween.value).toBeCloseTo(87.5, 12);
  });

  it("restarts from the current value on a new target (no jump)", () => {
    const tween = createTween(0, { duration: 100, easing: linear });
    tween.setTarget(100);
    tween.step(50);
    tween.setTarget(0);
    expect(tween.value).toBe(50);
    tween.step(50);
    expect(tween.value).toBe(25);
  });

  it("reports velocity in units per second", () => {
    const tween = createTween(0, { duration: 100, easing: linear });
    tween.setTarget(100);
    tween.step(40);
    expect(tween.velocity).toBeCloseTo(1000, 6);
    tween.snap();
    expect(tween.velocity).toBe(0);
  });

  it("with duration 0 reaches the target on the next step", () => {
    const tween = createTween({ x: 0, y: 0 }, { duration: 0 });
    tween.setTarget({ x: 5, y: 6 });
    expect(tween.step(1)).toBe(false);
    expect(tween.value).toEqual({ x: 5, y: 6 });
  });

  it("rejects a negative duration", () => {
    expect(() => createTween(0, { duration: -1 })).toThrow(RangeError);
  });
});

describe("easing", () => {
  it("cubicBezier passes through the curve's own points", () => {
    const [x1, y1, x2, y2] = [0.2, 0.8, 0.2, 1];
    const easing = cubicBezier(x1, y1, x2, y2);
    for (let i = 1; i < 20; i++) {
      const t = i / 20;
      const x = 3 * (1 - t) ** 2 * t * x1 + 3 * (1 - t) * t ** 2 * x2 + t ** 3;
      const y = 3 * (1 - t) ** 2 * t * y1 + 3 * (1 - t) * t ** 2 * y2 + t ** 3;
      expect(easing(x)).toBeCloseTo(y, 5);
    }
  });

  it("starts at 0, ends at 1, and the CSS curves rise monotonically", () => {
    for (const easing of [ease, easeInOut, easeOutCubic]) {
      expect(easing(0)).toBe(0);
      expect(easing(1)).toBe(1);
      let previous = 0;
      for (let i = 1; i <= 100; i++) {
        const value = easing(i / 100);
        expect(value).toBeGreaterThanOrEqual(previous - 1e-9);
        previous = value;
      }
    }
    expect(easeInOut(0.5)).toBeCloseTo(0.5, 6);
  });

  it("cubicBezier with control points on the diagonal is linear, and x outside [0, 1] is refused", () => {
    expect(cubicBezier(0.3, 0.3, 0.7, 0.7)).toBe(linear);
    expect(() => cubicBezier(-0.1, 0, 1, 1)).toThrow(RangeError);
    expect(() => cubicBezier(0, 0, 1.5, 1)).toThrow(RangeError);
  });
});

describe("motion value on a frame loop", () => {
  const setup = (reduced?: { on: boolean }) => {
    const clock = createFakeClock();
    const loop = createFrameLoop({ clock, frameMs: FRAME });
    const value = springValue(loop, 0, reduced === undefined ? {} : { reducedMotion: () => reduced.on });
    return { clock, loop, value };
  };

  it("steps once per frame until it settles, then the loop goes idle", () => {
    const { clock, loop, value } = setup();
    const writes: number[] = [];
    effect(() => {
      writes.push(value.value);
    }, { schedule: loop.scheduler("write") });
    clock.frame();
    value.set(100);
    expect(value.moving).toBe(true);
    expect(value.target).toBe(100);
    const frames = clock.runUntilIdle();
    expect(value.value).toBe(100);
    expect(value.moving).toBe(false);
    expect(loop.active).toBe(false);
    expect(writes.length).toBe(frames + 1);
    expect(writes.at(-1)).toBe(100);
    for (let i = 1; i < writes.length; i++) expect(writes[i]!).toBeGreaterThan(writes[i - 1]!);
  });

  it("moves in the same frame its target was set (update phase), before write", () => {
    const { clock, loop, value } = setup();
    const seenInWrite: number[] = [];
    loop.schedule("update", () => value.set(100));
    loop.schedule("write", () => seenInWrite.push(value.peek()));
    clock.frame();
    expect(seenInWrite[0]).toBeGreaterThan(0);
  });

  it("is a signal: computed values over it follow it", () => {
    const { clock, value } = setup();
    const doubled = computed(() => value.value * 2);
    value.set(10);
    clock.runUntilIdle();
    expect(doubled.value).toBe(20);
  });

  it("calls onSettle once when it comes to rest", () => {
    const { clock, value } = setup();
    const settled = vi.fn();
    value.onSettle(settled);
    value.set(50);
    clock.frames(3);
    expect(settled).not.toHaveBeenCalled();
    clock.runUntilIdle();
    expect(settled).toHaveBeenCalledTimes(1);
    expect(settled).toHaveBeenCalledWith(50);
  });

  it("snap and jump finish at once and report the rest", () => {
    const { clock, value } = setup();
    const settled = vi.fn();
    value.onSettle(settled);
    value.set(50);
    clock.frame();
    value.snap();
    expect(value.value).toBe(50);
    expect(value.moving).toBe(false);
    expect(clock.pendingFrames).toBe(0);
    value.jump(7);
    expect(value.value).toBe(7);
    expect(value.target).toBe(7);
    expect(settled).toHaveBeenCalledTimes(2);
  });

  it("starts with a release velocity", () => {
    const { clock, value } = setup();
    value.set(0, { velocity: 3000 });
    clock.frame();
    expect(value.value).toBeGreaterThan(0);
    clock.runUntilIdle();
    expect(value.value).toBe(0);
  });

  it("reduced motion: a new target is reached at once, with no frame", () => {
    const reduced = { on: true };
    const { clock, value } = setup(reduced);
    const settled = vi.fn();
    value.onSettle(settled);
    value.set(80);
    expect(value.value).toBe(80);
    expect(value.moving).toBe(false);
    expect(clock.pendingFrames).toBe(0);
    expect(settled).toHaveBeenCalledWith(80);
  });

  it("reduced motion switched on mid-flight snaps on the next frame", () => {
    const reduced = { on: false };
    const { clock, value } = setup(reduced);
    value.set(100);
    clock.frame();
    expect(value.value).toBeLessThan(100);
    reduced.on = true;
    clock.frame();
    expect(value.value).toBe(100);
    expect(value.moving).toBe(false);
    expect(clock.pendingFrames).toBe(0);
  });

  it("follows a target signal, once per frame, keeping velocity across retargets", () => {
    const { clock, value } = setup();
    const target = signal(100);
    const stop = value.follow(() => target.value);
    clock.frames(4);
    const velocity = value.velocity;
    expect(velocity).toBeGreaterThan(0);
    target.value = 300;
    target.value = 200;
    clock.frame();
    expect(value.target).toBe(200);
    clock.runUntilIdle();
    expect(value.value).toBe(200);
    stop();
    target.value = 0;
    clock.runUntilIdle();
    expect(value.value).toBe(200);
  });

  it("stops and lets the loop idle when disposed", () => {
    const { clock, value } = setup();
    const target = signal(10);
    value.follow(() => target.value);
    clock.frame();
    value.dispose();
    expect(clock.pendingFrames).toBe(0);
    target.value = 99;
    clock.frames(3);
    expect(value.target).toBe(10);
  });

  it("works with tweens and rects too", () => {
    const clock = createFakeClock();
    const loop = createFrameLoop({ clock, frameMs: FRAME });
    const rect = tweenValue(loop, { x: 0, y: 0, width: 10, height: 10 }, { duration: 64, easing: linear });
    rect.set({ x: 64, y: 0, width: 10, height: 74 });
    clock.frame();
    expect(rect.value).toEqual({ x: 16, y: 0, width: 10, height: 26 });
    expect(clock.runUntilIdle()).toBe(3);
    expect(rect.value).toEqual({ x: 64, y: 0, width: 10, height: 74 });
    expect(rect.animator.progress).toBe(1);
  });
});
