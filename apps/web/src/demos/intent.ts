/**
 * Drag intent, shared by every drag demo on the site: the aim gate (is the pointer aiming, or flying?) and a target
 * holder on top of it (what the drop shows, when it may switch, when the others make room). DOM-free.
 *
 * Aiming: moving slower than 0.45 px/ms, measured over the last 50 ms, or staying within 12 px for 90 ms. Time spent
 * crossing a big target doesn't count.
 */
export interface Point { x: number; y: number }

export const AIM = { speed: 0.45, window: 50, still: 12, dwell: 90, switchHold: 150, room: 160 } as const;

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

export interface Intent<T> {
  /**
   * Feed a pointer sample and the target under it (null for none, or for the dragged item's own place, which is
   * home and never a target). Returns what the drop shows, and whether the others make room for it yet.
   */
  update(p: Point, t: number, raw: T | null): { shown: T | null; room: boolean; aiming: boolean };
  readonly shown: T | null;
}

/**
 * What a drop shows: nothing while flying; the target under the pointer as soon as it aims; another target only after
 * that one has held for 150 ms; room for it 160 ms after it showed. Leaving the shown target hides it at once (a flight
 * keeps it only while the pointer stays on it). A release lands on what is shown.
 */
export function createIntent<T>(gate: AimGate = createAimGate()): Intent<T> {
  let shown: T | null = null, shownSince = 0, pending: T | null = null, pendingSince = 0;
  return {
    get shown() { return shown; },
    update(p, t, raw) {
      const aiming = gate.update(p, t);
      if (!aiming) {
        if (shown !== null && raw !== shown) shown = null;
        pending = null;
      } else if (raw !== shown) {
        if (shown === null || raw === null) {
          shown = raw;
          shownSince = t;
          pending = null;
        } else if (pending !== raw) {
          pending = raw;
          pendingSince = t;
        } else if (t - pendingSince >= AIM.switchHold) {
          shown = raw;
          shownSince = t;
          pending = null;
        }
      } else pending = null;
      return { shown, room: shown !== null && t - shownSince >= AIM.room, aiming };
    },
  };
}
