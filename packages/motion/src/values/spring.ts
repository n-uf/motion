import type { Animatable, Layout, Widen } from "../shapes";
import { layoutOf, makeValue, sameLayout, writeComponents } from "../shapes";
import type { Animator } from "./animator";

/**
 * Spring settings. Time is in milliseconds everywhere in the API; the physics
 * runs in seconds, so velocity is in units per second.
 */
export interface SpringConfig {
  /** Spring constant k. Higher is snappier. Default 300. */
  readonly stiffness?: number;
  /** Damping coefficient c. When set it wins over `dampingRatio`. */
  readonly damping?: number;
  /**
   * Damping as a fraction of critical damping: 1 is critical (the fastest
   * approach with no overshoot), below 1 overshoots and rings, above 1 is
   * sluggish. Default 1.
   */
  readonly dampingRatio?: number;
  /** Mass m. Default 1. */
  readonly mass?: number;
  /** Distance from the target that counts as arrived. Default 0.1 (tuned for pixels). */
  readonly restDelta?: number;
  /** Speed, in units per second, that counts as stopped. Default 1 (tuned for pixels). */
  readonly restSpeed?: number;
}

/** A {@link SpringConfig} with every field resolved. */
export interface SpringParams {
  readonly stiffness: number;
  readonly damping: number;
  readonly dampingRatio: number;
  readonly mass: number;
  readonly restDelta: number;
  readonly restSpeed: number;
}

/** Defaults of {@link SpringConfig}: critically damped. */
export const SPRING_DEFAULTS: SpringParams = {
  stiffness: 300,
  damping: 2 * Math.sqrt(300),
  dampingRatio: 1,
  mass: 1,
  restDelta: 0.1,
  restSpeed: 1,
};

function positive(name: string, value: number): number {
  if (!(value > 0) || !Number.isFinite(value)) throw new RangeError(`spring: ${name} must be a finite number > 0, got ${value}`);
  return value;
}

/** Resolve a {@link SpringConfig} over the defaults. Throws on a non-positive field. */
export function resolveSpring(config: SpringConfig = {}): SpringParams {
  const stiffness = positive("stiffness", config.stiffness ?? SPRING_DEFAULTS.stiffness);
  const mass = positive("mass", config.mass ?? SPRING_DEFAULTS.mass);
  const critical = 2 * Math.sqrt(stiffness * mass);
  const damping = positive(
    config.damping !== undefined ? "damping" : "dampingRatio",
    config.damping ?? (config.dampingRatio ?? SPRING_DEFAULTS.dampingRatio) * critical,
  );
  return {
    stiffness,
    damping,
    dampingRatio: damping / critical,
    mass,
    restDelta: positive("restDelta", config.restDelta ?? SPRING_DEFAULTS.restDelta),
    restSpeed: positive("restSpeed", config.restSpeed ?? SPRING_DEFAULTS.restSpeed),
  };
}

const UNDERDAMPED = 0;
const CRITICAL = 1;
const OVERDAMPED = 2;

/** The closed-form solution's constants for one set of params. */
interface Solver {
  readonly mode: typeof UNDERDAMPED | typeof CRITICAL | typeof OVERDAMPED;
  readonly omega: number;
  readonly decay: number;
  readonly omegaD: number;
  readonly r1: number;
  readonly r2: number;
}

function solverFor(params: SpringParams): Solver {
  const omega = Math.sqrt(params.stiffness / params.mass);
  const zeta = params.dampingRatio;
  if (Math.abs(zeta - 1) < 1e-6) return { mode: CRITICAL, omega, decay: omega, omegaD: 0, r1: 0, r2: 0 };
  if (zeta < 1) {
    return { mode: UNDERDAMPED, omega, decay: zeta * omega, omegaD: omega * Math.sqrt(1 - zeta * zeta), r1: 0, r2: 0 };
  }
  const root = Math.sqrt(zeta * zeta - 1);
  return { mode: OVERDAMPED, omega, decay: 0, omegaD: 0, r1: -omega * (zeta - root), r2: -omega * (zeta + root) };
}

/**
 * Advance one component exactly: displacement `d0` from the target and
 * velocity `v0` (per second) after `t` seconds. Writes into out[0], out[1].
 * Exact for any `t`, so the curve doesn't depend on the frame rate.
 */
function advance(solver: Solver, d0: number, v0: number, t: number, out: Float64Array): void {
  if (solver.mode === CRITICAL) {
    const w = solver.omega;
    const e = Math.exp(-w * t);
    const b = v0 + w * d0;
    out[0] = e * (d0 + b * t);
    out[1] = e * (v0 - w * b * t);
  } else if (solver.mode === UNDERDAMPED) {
    const a = solver.decay;
    const wd = solver.omegaD;
    const e = Math.exp(-a * t);
    const cos = Math.cos(wd * t);
    const sin = Math.sin(wd * t);
    out[0] = e * (d0 * cos + ((v0 + a * d0) / wd) * sin);
    out[1] = e * (v0 * cos - ((a * v0 + solver.omega * solver.omega * d0) / wd) * sin);
  } else {
    const { r1, r2 } = solver;
    const c2 = (v0 - r1 * d0) / (r2 - r1);
    const c1 = d0 - c2;
    const e1 = Math.exp(r1 * t);
    const e2 = Math.exp(r2 * t);
    out[0] = c1 * e1 + c2 * e2;
    out[1] = c1 * r1 * e1 + c2 * r2 * e2;
  }
}

/** A scalar spring's position and velocity (units per second). */
export interface SpringState {
  readonly value: number;
  readonly velocity: number;
}

/**
 * One pure spring step for a scalar: where `state` is after `dtMs` heading for
 * `target`. Doesn't settle or snap; {@link createSpring} does that.
 */
export function springStep(state: SpringState, target: number, params: SpringParams, dtMs: number): SpringState {
  const out = new Float64Array(2);
  advance(solverFor(params), state.value - target, state.velocity, dtMs / 1000, out);
  return { value: target + out[0]!, velocity: out[1]! };
}

/** A spring over any {@link Animatable} shape, stepped by hand or by `motionValue`. */
export interface Spring<T> extends Animator<T> {
  /** The resolved settings. */
  readonly params: SpringParams;
  /** Set the velocity in units per second (a gesture's release velocity). */
  setVelocity(velocity: T): void;
  /** Change settings mid-flight; position and velocity carry on. */
  configure(config: SpringConfig): void;
}

class SpringAnimator implements Spring<Animatable> {
  readonly layout: Layout;
  readonly x: Float64Array;
  readonly v: Float64Array;
  readonly goal: Float64Array;
  readonly scratch = new Float64Array(2);
  config: SpringConfig;
  params: SpringParams;
  solver: Solver;
  settled = true;
  cachedValue: Animatable | null = null;

  constructor(initial: Animatable, config: SpringConfig) {
    this.layout = layoutOf(initial);
    const size = this.layout.size;
    this.x = new Float64Array(size);
    this.v = new Float64Array(size);
    this.goal = new Float64Array(size);
    writeComponents(initial, this.x);
    writeComponents(initial, this.goal);
    this.config = config;
    this.params = resolveSpring(config);
    this.solver = solverFor(this.params);
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
      throw new TypeError(`spring: ${what} has a different shape than the spring's value`);
    }
  }

  /** At rest exactly when on the target and not moving. */
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
    // Position and velocity stay as they are: a retarget carries the motion on.
    this.updateSettled();
  }

  setVelocity(velocity: Animatable): void {
    this.check(velocity, "the velocity");
    writeComponents(velocity, this.v);
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

  snap(): void {
    this.x.set(this.goal);
    this.v.fill(0);
    this.cachedValue = null;
    this.settled = true;
  }

  configure(config: SpringConfig): void {
    this.config = { ...this.config, ...config };
    this.params = resolveSpring(this.config);
    this.solver = solverFor(this.params);
  }

  step(dtMs: number): boolean {
    if (this.settled) return false;
    if (!(dtMs > 0)) return true;
    const t = dtMs / 1000;
    const { x, v, goal, scratch } = this;
    const { restDelta, restSpeed } = this.params;
    let resting = true;
    for (let i = 0; i < x.length; i++) {
      advance(this.solver, x[i]! - goal[i]!, v[i]!, t, scratch);
      x[i] = goal[i]! + scratch[0]!;
      v[i] = scratch[1]!;
      if (resting && (Math.abs(scratch[0]!) > restDelta || Math.abs(scratch[1]!) > restSpeed)) resting = false;
    }
    this.cachedValue = null;
    if (resting) this.snap();
    return !this.settled;
  }
}

/**
 * A spring starting at rest on `initial`. `initial` fixes the shape: a
 * number, a vector (array), a point `{ x, y }` or a rect `{ x, y, width,
 * height }`; targets and velocities must have the same shape.
 */
export function createSpring<T extends Animatable>(initial: T, config: SpringConfig = {}): Spring<Widen<T>> {
  return new SpringAnimator(initial, config) as unknown as Spring<Widen<T>>;
}
