import type { FrameInfo, FrameLoop, Phase } from "../clock/frame-loop";
import type { Animatable, Widen } from "../shapes";
import { shapeEquals } from "../shapes";
import { batch, effect, signal, untracked, type ReadonlySignal, type Signal } from "../signals/signals";
import type { Animator } from "./animator";
import { createSettle, type Settle, type SettleConfig } from "./settle";
import { createSpring, type Spring, type SpringConfig } from "./spring";
import { createTween, type Tween, type TweenConfig } from "./tween";

/** Options of {@link motionValue}. */
export interface MotionOptions {
  /**
   * The frame phase that steps the value. Default `"layout"`: it steps after
   * that phase's one-shot tasks, so a target set in input, update or layout
   * moves the value in the same frame, and `write` sees the new value.
   */
  readonly phase?: Phase;
  /**
   * The reduced-motion switch: while it is (or returns) `true`, every new
   * target is reached at once, and a value in flight snaps on its next frame.
   * A function is read on each `set` and each frame, so it can read a signal
   * or a media query.
   */
  readonly reducedMotion?: boolean | (() => boolean);
}

/** Options of {@link MotionValue.set}. */
export interface SetOptions<T> {
  /** Start with this velocity (units per second), e.g. a gesture's release velocity. Springs only. */
  readonly velocity?: T;
}

/**
 * An animated value on a frame loop. Reading `value` inside a computed or an
 * effect tracks it; it changes once per frame while moving and the loop goes
 * idle when it settles.
 */
export interface MotionValue<T, A extends Animator<unknown> = Animator<T>> extends ReadonlySignal<T> {
  /** Where the value is heading. */
  readonly target: T;
  /** The current velocity, units per second. */
  readonly velocity: T;
  /** Whether it is moving (reactive). */
  readonly moving: boolean;
  /** The spring or tween underneath. */
  readonly animator: A;
  /** Head for `target`; a spring keeps its velocity. */
  set(target: T, options?: SetOptions<T>): void;
  /** Put the value at `value` at once, at rest. */
  jump(value: T): void;
  /** Finish now: put the value on its target, at rest. */
  snap(): void;
  /**
   * Keep heading for whatever `source` returns. `source` is tracked like an
   * effect, and re-read in this value's phase at most once per frame. Returns
   * a stop function.
   */
  follow(source: () => T): () => void;
  /**
   * Call `listener` each time the value comes to rest: on the frame it
   * settles, or at once when `set` (under reduced motion), `snap` or `jump`
   * leaves it at rest. Returns an unsubscribe function.
   */
  onSettle(listener: (value: T) => void): () => void;
  /** Stop stepping, drop listeners and follows. */
  dispose(): void;
}

class Motion<T> implements MotionValue<T> {
  readonly loop: FrameLoop;
  readonly animator: Animator<T>;
  readonly phase: Phase;
  readonly reduced: () => boolean;
  readonly current: Signal<T>;
  readonly movingSignal: Signal<boolean>;
  readonly listeners = new Set<(value: T) => void>();
  readonly follows = new Set<() => void>();
  stop: (() => void) | null = null;
  disposed = false;

  constructor(loop: FrameLoop, animator: Animator<T>, options: MotionOptions) {
    this.loop = loop;
    this.animator = animator;
    this.phase = options.phase ?? "layout";
    const reducedMotion = options.reducedMotion ?? false;
    this.reduced = typeof reducedMotion === "function" ? reducedMotion : () => reducedMotion;
    this.current = signal(animator.value, {
      equals: shapeEquals as (a: T, b: T) => boolean,
    });
    this.movingSignal = signal(false);
    if (!animator.settled) this.start();
  }

  get value(): T {
    return this.current.value;
  }

  peek(): T {
    return this.current.peek();
  }

  get target(): T {
    return this.animator.target;
  }

  get velocity(): T {
    return this.animator.velocity;
  }

  get moving(): boolean {
    return this.movingSignal.value;
  }

  readonly tick = (frame: FrameInfo): boolean => {
    if (this.reduced()) this.animator.snap();
    else this.animator.step(frame.delta);
    if (!this.animator.settled) {
      this.current.value = this.animator.value;
      return true;
    }
    this.stop = null;
    this.rest();
    return false;
  };

  start(): void {
    if (this.stop !== null || this.disposed) return;
    this.stop = this.loop.repeat(this.phase, this.tick);
    this.movingSignal.value = true;
  }

  halt(): void {
    if (this.stop === null) return;
    this.stop();
    this.stop = null;
  }

  /** Publish the resting value and tell the listeners. */
  rest(): void {
    batch(() => {
      this.current.value = this.animator.value;
      this.movingSignal.value = false;
    });
    const value = this.animator.value;
    for (const listener of Array.from(this.listeners)) listener(value);
  }

  set(target: T, options?: SetOptions<T>): void {
    if (this.disposed) return;
    untracked(() => {
      this.animator.setTarget(target);
      if (options?.velocity !== undefined) this.animator.setVelocity?.(options.velocity);
      if (this.reduced()) this.animator.snap();
      if (this.animator.settled) {
        this.halt();
        this.rest();
      } else {
        this.start();
      }
    });
  }

  jump(value: T): void {
    if (this.disposed) return;
    untracked(() => {
      this.animator.jumpTo(value);
      this.halt();
      this.rest();
    });
  }

  snap(): void {
    if (this.disposed) return;
    untracked(() => {
      this.animator.snap();
      this.halt();
      this.rest();
    });
  }

  follow(source: () => T): () => void {
    if (this.disposed) return () => {};
    const dispose = effect(
      () => {
        const target = source();
        this.set(target);
      },
      { schedule: this.loop.scheduler(this.phase) },
    );
    const stop = (): void => {
      dispose();
      this.follows.delete(stop);
    };
    this.follows.add(stop);
    return stop;
  }

  onSettle(listener: (value: T) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.halt();
    for (const stop of Array.from(this.follows)) stop();
    this.listeners.clear();
    this.movingSignal.value = false;
  }
}

/** The value type an animator moves. */
export type AnimatorValue<A> = A extends Animator<infer T> ? T : never;

/** Step `animator` on `loop` while it moves, and expose it as a signal. */
export function motionValue<A extends Animator<unknown>>(
  loop: FrameLoop,
  animator: A,
  options: MotionOptions = {},
): MotionValue<AnimatorValue<A>, A> {
  return new Motion(loop, animator, options) as unknown as MotionValue<AnimatorValue<A>, A>;
}

/** A spring-driven {@link MotionValue}: `createSpring` plus `motionValue`. */
export function springValue<T extends Animatable>(
  loop: FrameLoop,
  initial: T,
  options: SpringConfig & MotionOptions = {},
): MotionValue<Widen<T>, Spring<Widen<T>>> {
  return motionValue(loop, createSpring(initial, options), options) as MotionValue<Widen<T>, Spring<Widen<T>>>;
}

/**
 * A settle-driven {@link MotionValue}: `createSettle` plus `motionValue`. The
 * one curve for things moving to a new place (see {@link Settle}). To hold it
 * to a pointer, `jump` it on each move; the next `set` launches from there.
 */
export function settleValue<T extends Animatable>(
  loop: FrameLoop,
  initial: T,
  options: SettleConfig & MotionOptions = {},
): MotionValue<Widen<T>, Settle<Widen<T>>> {
  return motionValue(loop, createSettle(initial, options), options) as MotionValue<Widen<T>, Settle<Widen<T>>>;
}

/** A tween-driven {@link MotionValue}: `createTween` plus `motionValue`. */
export function tweenValue<T extends Animatable>(
  loop: FrameLoop,
  initial: T,
  options: TweenConfig & MotionOptions = {},
): MotionValue<Widen<T>, Tween<Widen<T>>> {
  return motionValue(loop, createTween(initial, options), options) as MotionValue<Widen<T>, Tween<Widen<T>>>;
}
