import type { Animatable, Layout, Widen } from "../shapes";
import { layoutOf, makeValue, sameLayout, writeComponents } from "../shapes";
import type { Animator } from "./animator";

/**
 * Tempos for {@link createSettle}, in 1/s: a settle covers 90 % of the way in
 * ln(10)/omega seconds and is within 1 % in twice that.
 *
 * - `calm` 20: 90 % in 115 ms, done in 230 ms.
 * - `default` 25: 90 % in 92 ms, done in 184 ms.
 * - `quick` 37: 90 % in 62 ms, done in 124 ms (a fast Hyprland setup).
 */
export const SETTLE_TEMPO = { calm: 20, default: 25, quick: 37 } as const;

/** Settings of {@link createSettle}. */
export interface SettleConfig {
  /** The tempo in 1/s (see {@link SETTLE_TEMPO}). Higher is faster. Default 25. */
  readonly omega?: number;
  /** Distance from the target that counts as arrived. Default 0.1 (tuned for pixels). */
  readonly restDelta?: number;
}

/**
 * The one curve for things that move to a new place: a window's rect between
 * layout targets, a drawer, a camera. Fast at the start, gentle at the end,
 * and it never passes its target.
 *
 * It is a critically damped spring (stiffness omega², damping 2·omega) with
 * one rule on its velocity, per component:
 *
 * - **Launch.** On a new target, each component gets the velocity
 *   omega · distance toward it, from wherever it is drawn: standing still,
 *   moving toward it, or moving away (it turns at once rather than drifting
 *   further first). From there the spring follows `distance · e^(−omega·t)`
 *   exactly: most of the move happens at once, the rest eases in.
 * - **Clamp.** That speed is also the most it may have toward the target, so a
 *   velocity set by hand (`setVelocity`, a fling) toward the target is capped
 *   there instead of shooting past.
 * - **Carry.** A velocity set by hand away from the target is kept, and the
 *   value turns around; a critically damped spring turning around never
 *   crosses the target either.
 *
 * So after a new target every component goes straight from where it is drawn
 * to the target and never past it: no overshoot on position, no wobble on
 * size, whatever the retargets. A new target starts from the drawn value,
 * never from the old start.
 *
 * Holding (a pointer owns the value): call `hold(value)` on each move. The
 * value sits exactly there, at rest; the next `setTarget` launches from it.
 */
export interface Settle<T> extends Animator<T> {
  /** The tempo in 1/s. */
  readonly omega: number;
  /** Put the value at `value`, at rest, with it as the target: a held value follows its owner 1:1. Same as `jumpTo`. */
  hold(value: T): void;
  /** Set the velocity (units per second); a component moving toward the target is clamped as in the launch rule. */
  setVelocity(velocity: T): void;
  /** Change the tempo or rest distance mid-flight; the value and velocity carry on, re-clamped. */
  configure(config: SettleConfig): void;
}

/** Defaults of {@link SettleConfig}. */
export const SETTLE_DEFAULTS = { omega: SETTLE_TEMPO.default, restDelta: 0.1 } as const;

function positive(name: string, value: number): number {
  if (!(value > 0) || !Number.isFinite(value)) throw new RangeError(`settle: ${name} must be a finite number > 0, got ${value}`);
  return value;
}

class SettleAnimator implements Settle<Animatable> {
  readonly layout: Layout;
  readonly x: Float64Array;
  readonly v: Float64Array;
  readonly goal: Float64Array;
  omega: number;
  restDelta: number;
  settled = true;
  cachedValue: Animatable | null = null;

  constructor(initial: Animatable, config: SettleConfig) {
    this.layout = layoutOf(initial);
    this.x = new Float64Array(this.layout.size);
    this.v = new Float64Array(this.layout.size);
    this.goal = new Float64Array(this.layout.size);
    writeComponents(initial, this.x);
    writeComponents(initial, this.goal);
    this.omega = positive("omega", config.omega ?? SETTLE_DEFAULTS.omega);
    this.restDelta = positive("restDelta", config.restDelta ?? SETTLE_DEFAULTS.restDelta);
  }

  get value(): Animatable {
    if (this.cachedValue === null) this.cachedValue = makeValue(this.layout, this.x);
    return this.cachedValue;
  }

  get velocity(): Animatable {
    return makeValue(this.layout, this.v);
  }

  get target(): Animatable {
    return makeValue(this.layout, this.goal);
  }

  check(value: Animatable, what: string): void {
    if (!sameLayout(layoutOf(value), this.layout)) {
      throw new TypeError(`settle: ${what} has a different shape than the settle's value`);
    }
  }

  /** The launch/clamp/carry rule on component `i`: `launch` for a new target, else clamp or carry. */
  rule(i: number, launch: boolean): void {
    const d = this.x[i]! - this.goal[i]!;
    const v = this.v[i]!;
    const limit = d === 0 ? 0 : -this.omega * d;
    if (launch) {
      this.v[i] = limit;
      return;
    }
    if (d === 0) return;
    // Moving away from the target (d and v the same sign): carry.
    if (d * v > 0) return;
    // Moving toward it: no faster than a launch from here.
    if (Math.abs(v) > Math.abs(limit)) this.v[i] = limit;
  }

  updateSettled(): void {
    for (let i = 0; i < this.x.length; i++) {
      if (this.x[i] !== this.goal[i] || this.v[i] !== 0) {
        this.settled = false;
        return;
      }
    }
    this.settled = true;
  }

  setTarget(target: Animatable): void {
    this.check(target, "the target");
    writeComponents(target, this.goal);
    for (let i = 0; i < this.x.length; i++) this.rule(i, true);
    this.updateSettled();
  }

  setVelocity(velocity: Animatable): void {
    this.check(velocity, "the velocity");
    writeComponents(velocity, this.v);
    for (let i = 0; i < this.x.length; i++) this.rule(i, false);
    this.updateSettled();
  }

  jumpTo(value: Animatable): void {
    this.check(value, "the value");
    writeComponents(value, this.x);
    writeComponents(value, this.goal);
    this.v.fill(0);
    this.cachedValue = null;
    this.settled = true;
  }

  hold(value: Animatable): void {
    this.jumpTo(value);
  }

  snap(): void {
    this.x.set(this.goal);
    this.v.fill(0);
    this.cachedValue = null;
    this.settled = true;
  }

  configure(config: SettleConfig): void {
    if (config.omega !== undefined) this.omega = positive("omega", config.omega);
    if (config.restDelta !== undefined) this.restDelta = positive("restDelta", config.restDelta);
    for (let i = 0; i < this.x.length; i++) this.rule(i, false);
  }

  step(dtMs: number): boolean {
    if (this.settled) return false;
    if (!(dtMs > 0)) return true;
    const w = this.omega;
    const t = dtMs / 1000;
    const e = Math.exp(-w * t);
    const { x, v, goal, restDelta } = this;
    // At rest when every component is within restDelta and no faster than a launch from there would be.
    const restSpeed = w * restDelta * 1.000001;
    let resting = true;
    for (let i = 0; i < x.length; i++) {
      // The exact critically damped step: d(t) = e^(−wt)·(d + b·t), b = v + w·d.
      const d = x[i]! - goal[i]!;
      const b = v[i]! + w * d;
      const nd = e * (d + b * t);
      v[i] = e * (v[i]! - w * b * t);
      x[i] = goal[i]! + nd;
      // Within a few float steps of the goal counts as arrived too: a restDelta finer than that would never be met.
      const near = Math.max(restDelta, 4 * Number.EPSILON * Math.abs(goal[i]!));
      if (resting && (Math.abs(nd) > near || Math.abs(v[i]!) > Math.max(restSpeed, w * near))) resting = false;
    }
    this.cachedValue = null;
    if (resting) this.snap();
    return !this.settled;
  }
}

/**
 * A settle starting at rest on `initial` (a number, a vector, a point or a
 * rect; targets and velocities must have the same shape). See {@link Settle}.
 */
export function createSettle<T extends Animatable>(initial: T, config: SettleConfig = {}): Settle<Widen<T>> {
  return new SettleAnimator(initial, config) as unknown as Settle<Widen<T>>;
}
