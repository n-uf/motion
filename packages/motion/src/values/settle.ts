import type { Animatable, Widen } from "../shapes";
import { writeComponents } from "../shapes";
import type { Animator } from "./animator";
import { ComponentAnimator, criticalStep } from "./step";

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
 * Holding (a pointer owns the value): call `jumpTo(value)` on each move. The
 * value sits exactly there, at rest; the next `setTarget` launches from it.
 */
export interface Settle<T> extends Animator<T> {
  /** The tempo in 1/s. */
  readonly omega: number;
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

class SettleAnimator extends ComponentAnimator implements Settle<Animatable> {
  omega: number;
  restDelta: number;
  // One step's shared numbers (`begin`): e^(−omega·t) and the rest speed.
  private e = 1;
  private restSpeed = 0;

  constructor(initial: Animatable, config: SettleConfig) {
    super(initial, "settle");
    this.omega = positive("omega", config.omega ?? SETTLE_DEFAULTS.omega);
    this.restDelta = positive("restDelta", config.restDelta ?? SETTLE_DEFAULTS.restDelta);
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

  configure(config: SettleConfig): void {
    if (config.omega !== undefined) this.omega = positive("omega", config.omega);
    if (config.restDelta !== undefined) this.restDelta = positive("restDelta", config.restDelta);
    for (let i = 0; i < this.x.length; i++) this.rule(i, false);
  }

  protected begin(t: number): void {
    this.e = Math.exp(-this.omega * t);
    // At rest when every component is within restDelta and no faster than a launch from there would be.
    this.restSpeed = this.omega * this.restDelta * 1.000001;
  }

  protected advance(d0: number, v0: number, t: number, out: Float64Array): void {
    criticalStep(this.omega, this.e, d0, v0, t, out);
  }

  protected rests(i: number, d: number, v: number): boolean {
    // Within a few float steps of the goal counts as arrived too: a restDelta finer than that would never be met.
    const near = Math.max(this.restDelta, 4 * Number.EPSILON * Math.abs(this.goal[i]!));
    return !(Math.abs(d) > near || Math.abs(v) > Math.max(this.restSpeed, this.omega * near));
  }
}

/**
 * A settle starting at rest on `initial` (a number, a vector, a point or a
 * rect; targets and velocities must have the same shape). See {@link Settle}.
 */
export function createSettle<T extends Animatable>(initial: T, config: SettleConfig = {}): Settle<Widen<T>> {
  return new SettleAnimator(initial, config) as unknown as Settle<Widen<T>>;
}
