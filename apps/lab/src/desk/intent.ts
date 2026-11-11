/**
 * The drag model every desk construction shares: from the pointer's path, when the drop indicator shows, which
 * target it shows, when the others make room, and what a release lands on. Pure: fed pointer samples and the
 * construction's targets, no DOM.
 *
 * - The indicator shows only when the pointer has left the item's home, a target is under it, and it is aiming:
 *   its smoothed speed is below AIM_SPEED, or it has stayed within STILL px of one spot for DWELL ms (time spent
 *   crossing a big target doesn't count). Once shown, it stays while its target holds.
 * - The most precise target wins: priority 1 (rail icons, tab strips) beats 2 (slots, bottom dock, tile edges),
 *   which beats 3 (float here and other large areas); equal priorities go to the smaller zone.
 * - Hysteresis: the current target holds while the pointer is within BAND px of its zone, unless a more precise
 *   target is clearly (4 px inside) under the pointer; a gap between zones is bridged for GAP_GRACE ms.
 * - When the pointer leaves the shown target: flying, the indicator hides at once; aiming, it stays until the new
 *   target has held SWITCH_HOLD ms (with no new target, it hides once the gap grace is over). A more precise target
 *   breaking through switches it at once.
 * - Room is made once the indicator has stayed on one target for ROOM_AFTER ms (never for a free target), and
 *   closed at once when it leaves.
 * - A release over home does nothing; else it lands on the shown target if the pointer is within its band, else on
 *   the target under the pointer, else nowhere (the item settles home).
 */
import type { Rect } from "@n-uf/motion";
import type { Point } from "../shared/geometry";

export const DRAG = {
  /** Aiming: slower than this (px/ms), smoothed over SPEED_WINDOW ms. */
  AIM_SPEED: 0.45,
  SPEED_WINDOW: 50,
  /** Aiming: within STILL px of one spot for DWELL ms. */
  DWELL: 90,
  STILL: 12,
  /** The band around the current target's zone that keeps it. */
  BAND: 10,
  /** A gap between zones shorter than this keeps the current target. */
  GAP_GRACE: 120,
  /** The others make room once the indicator has stayed on one target this long. */
  ROOM_AFTER: 160,
  /** An indicator shown for less than this is a flash. */
  FLASH: 150,
  /** Aiming, a shown indicator moves to another target only once that target has held this long (a release doesn't wait). */
  SWITCH_HOLD: 150,
  /** On touch, a press lifts after a LONG_PRESS ms hold, then TOUCH_LIFT px (a mouse: shared/press's threshold). */
  LONG_PRESS: 180,
  TOUCH_LIFT: 8,
  /** The indicator's fade and glide (ms). */
  FADE: 90,
  GLIDE: 110,
  /** The strip scrolls when the pointer is this close to the stage's edge, at most EDGE_SPEED px/ms. */
  EDGE: 40,
  EDGE_SPEED: 1,
} as const;

/** A drop target: a zone the pointer can be in, and how precise it is. */
export interface Target {
  readonly id: string;
  readonly prio: 1 | 2 | 3;
  readonly hit: Rect;
  /** It floats where it is dropped: no room is made for it. */
  readonly free?: boolean;
}

export const within = (r: Rect, p: Point, m = 0): boolean => p.x >= r.x - m && p.x <= r.x + r.width + m && p.y >= r.y - m && p.y <= r.y + r.height + m;
const area = (r: Rect): number => r.width * r.height;

/** The most precise target under a point: the lowest priority number, then the smaller zone. */
export function rawTarget<T extends Target>(targets: readonly T[], p: Point): T | null {
  let best: T | null = null;
  for (const t of targets) {
    if (!within(t.hit, p)) continue;
    if (!best || t.prio < best.prio || (t.prio === best.prio && area(t.hit) < area(best.hit))) best = t;
  }
  return best;
}

export interface IntentFrame<T extends Target> {
  /** What the indicator shows (null: nothing). */
  readonly shown: T | null;
  /** The others make room for the shown target. */
  readonly room: boolean;
  /** The pointer is aiming (slow or still). */
  readonly aiming: boolean;
}

export interface Intent<T extends Target> {
  /** A pointer sample at time `t` (ms), with the targets as they stand. */
  update(p: Point, t: number, targets: readonly T[]): IntentFrame<T>;
  /**
   * Hide the indicator (the strip is scrolling): the target is aimed at afresh afterwards, from fresh samples (the
   * first one never counts as aiming).
   */
  hide(t: number): void;
  /** The item's home moved with the desk (the strip scrolled) by (dx, dy). */
  moveHome(dx: number, dy: number): void;
  /** What a release at `p` lands on: a target, or null (home, or nothing under the pointer). */
  release(p: Point, targets: readonly T[]): T | null;
  readonly speed: number;
}

/** A drag's intent, for an item lifted from `from` (a release there does nothing). */
export function createIntent<T extends Target>(from: Rect): Intent<T> {
  let home = { ...from };
  let samples: { x: number; y: number; t: number }[] = [];
  let cur: T | null = null;
  /** When the current target became current. */
  let curSince = 0;
  let lastInside = 0;
  let shown: T | null = null;
  let shownSince = 0;
  let leftHome = false;
  let speed = 0;
  let anchor: Point | null = null;
  let stillSince = 0;
  /** A hide just started the aim afresh. */
  let restart = false;
  const same = (a: T | null, b: T | null): boolean => (a === null || b === null ? a === b : a.id === b.id);
  // Targets are rebuilt as the desk changes: follow the current ones by id.
  const fresh = (t: T | null, targets: readonly T[]): T | null => (t ? (targets.find((x) => x.id === t.id) ?? t) : null);
  return {
    get speed() {
      return speed;
    },
    update(p, t, targets) {
      samples.push({ x: p.x, y: p.y, t });
      while (samples.length > 2 && t - samples[0]!.t > DRAG.SPEED_WINDOW) samples.shift();
      const a = samples[0]!;
      const v = Math.hypot(p.x - a.x, p.y - a.y) / Math.max(1, t - a.t);
      speed = speed * 0.5 + v * 0.5;
      if (!anchor || Math.hypot(p.x - anchor.x, p.y - anchor.y) > DRAG.STILL) {
        anchor = { x: p.x, y: p.y };
        stillSince = t;
      }
      if (!within(home, p, -6)) leftHome = true;
      const atHome = within(home, p);
      const raw = atHome ? null : rawTarget(targets, p);
      cur = fresh(cur, targets);
      shown = fresh(shown, targets);
      let next = raw;
      if (cur && !atHome && within(cur.hit, p, DRAG.BAND)) {
        const breaks = raw !== null && !same(raw, cur) && raw.prio < cur.prio && within(raw.hit, p, -4);
        next = breaks ? raw : cur;
      }
      if (!next && cur && !atHome && t - lastInside < DRAG.GAP_GRACE) next = cur;
      if (next && within(next.hit, p)) lastInside = t;
      if (!same(next, cur)) curSince = t;
      cur = next;
      // The first sample after a hide never counts as aiming (it has nothing to measure a speed against).
      const aiming = !restart && (speed < DRAG.AIM_SPEED || t - stillSince >= DRAG.DWELL);
      restart = false;
      const show = (s: T | null): void => {
        if (!same(s, shown)) shownSince = t;
        shown = s;
      };
      // A target kept only by the gap grace isn't under the pointer: it can keep a shown indicator, not show one.
      const under = !!cur && within(cur.hit, p, DRAG.BAND);
      if (!shown) {
        if (cur && under && leftHome && aiming) show(cur);
      } else if (same(cur, shown)) {
        // Once shown, the indicator stays while its target holds, even if the pointer speeds up.
        shown = cur;
      } else if (!cur || !aiming) {
        // The pointer left the shown target: flying, or with nothing under it once the gap grace is over.
        show(null);
      } else if ((cur.prio < shown.prio && within(cur.hit, p, -4)) || (under && t - curSince >= DRAG.SWITCH_HOLD)) {
        // Aiming: a more precise target breaking through switches it at once, another one once it has held.
        show(cur);
      }
      return { shown, room: !!shown && !shown.free && t - shownSince >= DRAG.ROOM_AFTER, aiming };
    },
    hide(t) {
      shown = null;
      cur = null;
      shownSince = t;
      // Fresh samples: the first after the hide doesn't count as aiming, and a dwell starts again.
      samples = [];
      anchor = null;
      restart = true;
    },
    moveHome(dx, dy) {
      home = { ...home, x: home.x + dx, y: home.y + dy };
    },
    release(p, targets) {
      if (within(home, p)) return null;
      const s = fresh(shown, targets);
      if (s && within(s.hit, p, DRAG.BAND)) return s;
      return rawTarget(targets, p);
    },
  };
}
