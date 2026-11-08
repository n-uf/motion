/**
 * What springs and tweens have in common. An animator holds a value, a target
 * and a velocity, and moves when it is stepped; it knows nothing about frames
 * or clocks. `motionValue` steps one on a frame loop.
 */
export interface Animator<T> {
  /** The current value: a fresh plain value after every change. */
  readonly value: T;
  /** The current velocity in units per second, same shape as the value. */
  readonly velocity: T;
  /** Where the value is heading. */
  readonly target: T;
  /** At rest on the target. */
  readonly settled: boolean;
  /** Head for `target` from where the value is now. */
  setTarget(target: T): void;
  /** Set the velocity (units per second), e.g. a gesture's release velocity. Tweens ignore it. */
  setVelocity?(velocity: T): void;
  /** Put the value at `value`, make it the target, and stop. */
  jumpTo(value: T): void;
  /** Put the value on the target and stop. */
  snap(): void;
  /** Advance by `dtMs` milliseconds. Returns `true` while still moving. */
  step(dtMs: number): boolean;
}
