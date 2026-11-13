/**
 * The aim gate (is the pointer aiming, or flying?) for the drag-intent page's recorded-path model, which it compares
 * with a naive one. The desk and the hero run `@n-uf/motion/drag`'s `createDragIntent` instead. DOM-free.
 *
 * Aiming: moving slower than 0.45 px/ms, measured over the last 50 ms, or staying within 12 px for 90 ms. Time spent
 * crossing a big target doesn't count.
 */
export interface Point { x: number; y: number }

export const AIM = { speed: 0.45, window: 50, still: 12, dwell: 90 } as const;

export interface AimGate {
  /** Feed a pointer sample; returns whether the pointer is aiming now. */
  update(p: Point, t: number): boolean;
  /** The current speed in px/ms. */
  readonly speed: number;
}

/**
 * The aim gate. `smooth`: average each new speed with the last (the drag-intent model does, so one slow frame doesn't
 * count as aiming); off, the speed is the raw distance over the window.
 */
export function createAimGate(smooth = true): AimGate {
  const samples: { x: number; y: number; t: number }[] = [];
  let speed = 0, anchor: Point | null = null, stillSince = 0;
  return {
    get speed() { return speed; },
    update(p, t) {
      samples.push({ ...p, t });
      while (samples.length > 2 && t - samples[0]!.t > AIM.window) samples.shift();
      const a = samples[0]!;
      const v = Math.hypot(p.x - a.x, p.y - a.y) / Math.max(1, t - a.t);
      speed = smooth ? speed * 0.5 + v * 0.5 : v;
      if (!anchor || Math.hypot(p.x - anchor.x, p.y - anchor.y) > AIM.still) {
        anchor = { ...p };
        stillSince = t;
      }
      return speed < AIM.speed || t - stillSince >= AIM.dwell;
    },
  };
}
