import type { Animatable, Layout, Widen } from "../shapes";
import { layoutOf, makeValue, sameLayout, writeComponents } from "../shapes";
import type { Animator } from "./animator";
import { easeOutCubic, type Easing } from "./easing";

/** Tween settings. */
export interface TweenConfig {
  /** Length of a run in ms. Default 250. 0 jumps to the target on the next step. */
  readonly duration?: number;
  /** Easing of the run. Default {@link easeOutCubic}. */
  readonly easing?: Easing;
}

/** A tween over any {@link Animatable} shape. */
export interface Tween<T> extends Animator<T> {
  /** Run progress in [0, 1]. */
  readonly progress: number;
  /** Change duration or easing; applies from the next target. */
  configure(config: TweenConfig): void;
}

class TweenAnimator implements Tween<Animatable> {
  readonly layout: Layout;
  readonly x: Float64Array;
  readonly from: Float64Array;
  readonly goal: Float64Array;
  duration: number;
  easing: Easing;
  elapsed = 0;
  settled = true;
  cachedValue: Animatable | null = null;

  constructor(initial: Animatable, config: TweenConfig) {
    this.layout = layoutOf(initial);
    const size = this.layout.size;
    this.x = new Float64Array(size);
    this.from = new Float64Array(size);
    this.goal = new Float64Array(size);
    writeComponents(initial, this.x);
    writeComponents(initial, this.from);
    writeComponents(initial, this.goal);
    this.duration = 250;
    this.easing = easeOutCubic;
    this.configure(config);
  }

  get value(): Animatable {
    if (this.cachedValue === null) this.cachedValue = makeValue(this.layout, this.x);
    return this.cachedValue;
  }

  get target(): Animatable {
    return makeValue(this.layout, this.goal);
  }

  get progress(): number {
    if (this.settled) return 1;
    return this.duration <= 0 ? 0 : Math.min(1, this.elapsed / this.duration);
  }

  /** The eased curve's slope at the current progress, as units per second. */
  get velocity(): Animatable {
    const out = new Float64Array(this.layout.size);
    if (!this.settled && this.duration > 0) {
      const p = this.progress;
      const h = 1e-3;
      const lo = Math.max(0, p - h);
      const hi = Math.min(1, p + h);
      const slope = (this.easing(hi) - this.easing(lo)) / (hi - lo);
      const perSecond = (slope / this.duration) * 1000;
      for (let i = 0; i < out.length; i++) out[i] = (this.goal[i]! - this.from[i]!) * perSecond;
    }
    return makeValue(this.layout, out);
  }

  configure(config: TweenConfig): void {
    if (config.duration !== undefined) {
      if (!(config.duration >= 0) || !Number.isFinite(config.duration)) {
        throw new RangeError(`tween: duration must be a finite number >= 0, got ${config.duration}`);
      }
      this.duration = config.duration;
    }
    if (config.easing !== undefined) this.easing = config.easing;
  }

  check(value: Animatable, what: string): void {
    if (!sameLayout(layoutOf(value), this.layout)) {
      throw new TypeError(`tween: ${what} has a different shape than the tween's value`);
    }
  }

  setTarget(target: Animatable): void {
    this.check(target, "the target");
    writeComponents(target, this.goal);
    // A new run starts from wherever the value is now (no jump).
    this.from.set(this.x);
    this.elapsed = 0;
    this.settled = true;
    for (let i = 0; i < this.x.length; i++) {
      if (this.x[i] !== this.goal[i]) {
        this.settled = false;
        break;
      }
    }
  }

  jumpTo(value: Animatable): void {
    this.check(value, "the value");
    writeComponents(value, this.x);
    writeComponents(value, this.from);
    writeComponents(value, this.goal);
    this.cachedValue = null;
    this.settled = true;
  }

  snap(): void {
    this.x.set(this.goal);
    this.from.set(this.goal);
    this.cachedValue = null;
    this.settled = true;
  }

  step(dtMs: number): boolean {
    if (this.settled) return false;
    this.elapsed += Math.max(0, dtMs);
    const p = this.duration <= 0 ? 1 : Math.min(1, this.elapsed / this.duration);
    if (p >= 1) {
      this.snap();
      return false;
    }
    const eased = this.easing(p);
    for (let i = 0; i < this.x.length; i++) {
      this.x[i] = this.from[i]! + (this.goal[i]! - this.from[i]!) * eased;
    }
    this.cachedValue = null;
    return true;
  }
}

/**
 * A tween starting at rest on `initial` (same shapes as `createSpring`).
 * Velocity doesn't carry over a retarget: a new target starts a new run from
 * the current value. Use a spring where motion must stay continuous.
 */
export function createTween<T extends Animatable>(initial: T, config: TweenConfig = {}): Tween<Widen<T>> {
  return new TweenAnimator(initial, config) as unknown as Tween<Widen<T>>;
}
