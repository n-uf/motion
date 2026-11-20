import type { Animatable, Layout } from "../shapes";
import { layoutOf, makeValue, sameLayout, writeComponents } from "../shapes";
import type { Animator } from "./animator";

/**
 * The exact critically damped step for one component, shared by the spring and the settle: displacement `d0` from the
 * target and velocity `v0` (per second) after `t` seconds, with `e` = e^(−w·t) worked out once per step. Writes into
 * out[0], out[1]: d(t) = e·(d0 + b·t), v(t) = e·(v0 − w·b·t), b = v0 + w·d0.
 */
export function criticalStep(w: number, e: number, d0: number, v0: number, t: number, out: Float64Array): void {
  const b = v0 + w * d0;
  out[0] = e * (d0 + b * t);
  out[1] = e * (v0 - w * b * t);
}

/**
 * What the spring and the settle share: a value of any {@link Animatable} shape kept as components (position, velocity
 * and target), its shape check, the rest test of a step, jump and snap. Each one adds only its own law: `begin` (what a
 * step works out once), `advance` (one component over `t` seconds) and `rests` (when a component counts as arrived).
 */
export abstract class ComponentAnimator implements Animator<Animatable> {
  readonly layout: Layout;
  readonly x: Float64Array;
  readonly v: Float64Array;
  readonly goal: Float64Array;
  readonly scratch = new Float64Array(2);
  settled = true;
  cachedValue: Animatable | null = null;
  /** How errors call it ("spring", "settle"). */
  private readonly name: string;

  constructor(initial: Animatable, name: string) {
    this.name = name;
    this.layout = layoutOf(initial);
    this.x = new Float64Array(this.layout.size);
    this.v = new Float64Array(this.layout.size);
    this.goal = new Float64Array(this.layout.size);
    writeComponents(initial, this.x);
    writeComponents(initial, this.goal);
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
      throw new TypeError(`${this.name}: ${what} has a different shape than the ${this.name}'s value`);
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

  abstract setTarget(target: Animatable): void;

  abstract setVelocity(velocity: Animatable): void;

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

  /** Work out what every component's step of `t` seconds shares. */
  protected abstract begin(t: number): void;
  /** One component, `d0` from its target at `v0` per second, after `t` seconds: into out[0], out[1]. */
  protected abstract advance(d0: number, v0: number, t: number, out: Float64Array): void;
  /** Whether component `i`, now `d` from its target at `v` per second, counts as arrived. */
  protected abstract rests(i: number, d: number, v: number): boolean;

  step(dtMs: number): boolean {
    if (this.settled) return false;
    if (!(dtMs > 0)) return true;
    const t = dtMs / 1000;
    const { x, v, goal, scratch } = this;
    this.begin(t);
    let resting = true;
    for (let i = 0; i < x.length; i++) {
      this.advance(x[i]! - goal[i]!, v[i]!, t, scratch);
      x[i] = goal[i]! + scratch[0]!;
      v[i] = scratch[1]!;
      if (resting && !this.rests(i, scratch[0]!, scratch[1]!)) resting = false;
    }
    this.cachedValue = null;
    if (resting) this.snap();
    return !this.settled;
  }
}
