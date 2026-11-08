import type { FrameSource } from "../clock/port";

/** Options of {@link createFrameCoalescer}. */
export interface CoalescerOptions<T> {
  /**
   * How a new sample folds into the pending one. Default: keep the latest
   * (pointer positions). Wheel deltas want a sum instead.
   */
  readonly merge?: (pending: T, next: T) => T;
}

/**
 * Collapses a burst of samples into at most one delivery per frame. Same
 * shape as hypr-tiling's `createFrameCoalescer` (`schedule`, `cancel`),
 * plus `flush` and `pending`.
 */
export interface FrameCoalescer<T> {
  /** Record a sample and make sure a frame is requested. */
  schedule(sample: T): void;
  /**
   * Deliver the pending sample now, if there is one (before a pointer-up, so
   * the last move is seen first). Returns whether it delivered.
   */
  flush(): boolean;
  /** Drop the pending sample and the requested frame. Nothing is delivered after this. */
  cancel(): void;
  /** Whether a sample is waiting for its frame. */
  readonly pending: boolean;
}

/**
 * Deliver samples to `onFrame` once per frame of `frames`: the browser clock,
 * the fake clock, or a frame loop phase (`loop.frames("input")`). `onFrame`
 * also gets how many samples were folded into this one.
 */
export function createFrameCoalescer<T>(
  onFrame: (sample: T, count: number) => void,
  frames: FrameSource,
  options: CoalescerOptions<T> = {},
): FrameCoalescer<T> {
  const merge = options.merge;
  let handle: number | null = null;
  let sample: T | undefined;
  let count = 0;

  const deliver = (): void => {
    const delivered = sample as T;
    const folded = count;
    sample = undefined;
    count = 0;
    onFrame(delivered, folded);
  };

  const onFrameDue = (): void => {
    handle = null;
    if (count > 0) deliver();
  };

  return {
    schedule(next) {
      sample = count > 0 && merge !== undefined ? merge(sample as T, next) : next;
      count++;
      if (handle === null) handle = frames.requestFrame(onFrameDue);
    },
    flush() {
      if (handle !== null) {
        frames.cancelFrame(handle);
        handle = null;
      }
      if (count === 0) return false;
      deliver();
      return true;
    },
    cancel() {
      if (handle !== null) {
        frames.cancelFrame(handle);
        handle = null;
      }
      sample = undefined;
      count = 0;
    },
    get pending() {
      return count > 0;
    },
  };
}
