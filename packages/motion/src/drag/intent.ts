import type { Point, Rect } from "../shapes";

/**
 * The drag intent model's tuning. Distances in px, speeds in px/ms, times in
 * ms; every value can be overridden per intent (see
 * {@link DragIntentOptions.tuning}).
 */
export interface DragTuning {
  /** A mouse press lifts once the pointer has moved this far. */
  readonly lift: number;
  /** A touch press lifts only after it has been held this long… */
  readonly touchHold: number;
  /** …and then moved this far (moving that far before the hold is over is not a drag). */
  readonly touchLift: number;
  /** The pointer's speed is measured over this window and smoothed. */
  readonly speedWindow: number;
  /** Aiming: the smoothed speed is below this… */
  readonly aimSpeed: number;
  /** …or the pointer has stayed within `still` px of one spot for `dwell` ms. */
  readonly still: number;
  readonly dwell: number;
  /** The current target holds while the pointer is within this band of its zone. */
  readonly band: number;
  /** A more precise target takes over at once when the pointer is this far inside it. */
  readonly breakthrough: number;
  /** A gap between zones shorter than this keeps the current target (for a pointer that aims). */
  readonly gapGrace: number;
  /** Aiming, the shown target moves to another one only once that one has held this long. */
  readonly switchHold: number;
  /** An indicator shown for less than this is a flash (what `switchHold` prevents). */
  readonly flash: number;
  /** Room is made once the shown target, and the place in it, have held this long. */
  readonly roomAfter: number;
  /** The pointer has left the item's home once it is outside the home shrunk by this much on every side. */
  readonly homeInset: number;
}

/**
 * The defaults: a mouse lifts after 5 px, a touch after a 180 ms hold and
 * 8 px; aiming is slower than 0.45 px/ms over 50 ms, or within 12 px for
 * 90 ms; a 10 px band, a 4 px breakthrough and a 120 ms gap grace; a switch
 * waits 150 ms (the shortest an indicator may show); room after 160 ms.
 */
export const DRAG_DEFAULTS: DragTuning = {
  lift: 5,
  touchHold: 180,
  touchLift: 8,
  speedWindow: 50,
  aimSpeed: 0.45,
  still: 12,
  dwell: 90,
  band: 10,
  breakthrough: 4,
  gapGrace: 120,
  switchHold: 150,
  flash: 150,
  roomAfter: 160,
  homeInset: 6,
};

/**
 * A drop target: plain data. `hit` is the zone the pointer can be in;
 * `priority` how precise it is (1 beats 2 beats 3; equal priorities go to the
 * smaller zone). `slot` is where the dragged item would land, `label` what to
 * call it; the model reads neither. A `free` target has no slot (the item
 * floats where it is dropped): no room is made for it.
 */
export interface DragTarget {
  readonly id: string;
  readonly priority: 1 | 2 | 3;
  readonly hit: Rect;
  readonly slot?: Rect;
  readonly label?: string;
  readonly free?: boolean;
}

/** Whether `point` lies in `rect` grown by `margin` px on every side (shrunk, for a negative margin). */
export function inRect(rect: Rect, point: Point, margin = 0): boolean {
  return point.x >= rect.x - margin && point.x <= rect.x + rect.width + margin && point.y >= rect.y - margin && point.y <= rect.y + rect.height + margin;
}

const area = (r: Rect): number => r.width * r.height;

/** The most precise target under `point`: the lowest priority number, then the smallest zone; null when none is. */
export function targetAt<T extends DragTarget>(targets: readonly T[], point: Point): T | null {
  let best: T | null = null;
  for (const t of targets) {
    if (!inRect(t.hit, point)) continue;
    if (!best || t.priority < best.priority || (t.priority === best.priority && area(t.hit) < area(best.hit))) best = t;
  }
  return best;
}

/** What a press does so far: not yet a drag (`wait`), a drag (`lift`), or never one (`refuse`: a touch that moved too soon). */
export type LiftDecision = "wait" | "lift" | "refuse";

/**
 * The lift rule for a press that has moved `distance` px in `elapsed` ms. A
 * mouse (or pen) lifts at `lift` px. A touch lifts only after `touchHold` ms,
 * then at `touchLift` px; moving `touchLift` px before the hold is over
 * refuses the drag (the finger is scrolling or swiping).
 */
export function liftDecision(press: { readonly touch: boolean; readonly distance: number; readonly elapsed: number }, tuning: Partial<DragTuning> = {}): LiftDecision {
  const t = { ...DRAG_DEFAULTS, ...tuning };
  if (!press.touch) return press.distance >= t.lift ? "lift" : "wait";
  if (press.elapsed < t.touchHold) return press.distance >= t.touchLift ? "refuse" : "wait";
  return press.distance >= t.touchLift ? "lift" : "wait";
}

/** One update's answer. */
export interface DragFrame<T extends DragTarget> {
  /** The target the drop indicator shows, or null. */
  readonly shown: T | null;
  /** The others make room for the shown target: it, and the place in it, have held `roomAfter` ms. */
  readonly room: boolean;
  /**
   * The place the room is made for, or null. Within one target it stays on
   * the old place until a new one has held `roomAfter` ms (see
   * {@link DragIntentOptions.placeOf}).
   */
  readonly roomPlace: string | null;
  /** The pointer is aiming: slow, or nearly still for a moment. */
  readonly aiming: boolean;
}

/** What a drag intent knows now. */
export interface DragIntentState<T extends DragTarget> {
  /** The pointer's smoothed speed, px/ms. */
  readonly speed: number;
  /** The target under the pointer as the hysteresis holds it, or null. */
  readonly current: T | null;
  /** The target the indicator shows, or null. */
  readonly shown: T | null;
  /** The pointer has left the item's home. */
  readonly leftHome: boolean;
}

export interface DragIntentOptions<T extends DragTarget> {
  /** Where the item was lifted from: the indicator stays off until the pointer leaves it, and a release there does nothing. */
  readonly home: Rect;
  /** Overrides of {@link DRAG_DEFAULTS}. */
  readonly tuning?: Partial<DragTuning>;
  /**
   * The place within a target the pointer is at (a tab index, a stack
   * position), unique across targets; default: the target's id. Moving between places of the
   * shown target moves the indicator at once but the room only once the new
   * place has held `roomAfter` ms.
   */
  readonly placeOf?: (target: T, point: Point) => string;
}

/** A drag's intent: feed it the pointer on every frame; it says what the indicator shows and what a release lands on. */
export interface DragIntent<T extends DragTarget> {
  /**
   * A pointer sample at `time` (ms), with the targets as they stand (they may
   * be rebuilt between calls: the model follows them by id). Call it once a
   * frame while the item is held, also when the pointer doesn't move: a
   * dwell is time passing.
   */
  update(point: Point, time: number, targets: readonly T[]): DragFrame<T>;
  /**
   * What a release at `point` lands on: the shown target if the pointer is
   * within its band, else the target under the pointer, else null (the item
   * goes home). A release over home is null: it does nothing.
   */
  release(point: Point, targets: readonly T[]): T | null;
  /**
   * Hide the indicator (the view is scrolling under the pointer, say). The
   * aim starts afresh: the next sample never counts as aiming, and a dwell
   * starts again.
   */
  hide(time: number): void;
  /** The item's home moved with the view (it scrolled) by (dx, dy). */
  moveHome(dx: number, dy: number): void;
  readonly state: DragIntentState<T>;
  readonly tuning: DragTuning;
}

/**
 * The drag intent model: when the drop indicator shows, which target it
 * shows, when the others make room, and what a release lands on. Pure: fed
 * pointer samples and plain-data targets, no DOM and no clock of its own.
 *
 * - The indicator shows only when the pointer has left the item's home, a
 *   target is under it, and it is aiming (slow, or nearly still for a
 *   moment). Time spent crossing a big target at speed doesn't count.
 * - The most precise target wins (priority, then the smaller zone).
 * - Hysteresis: the current target holds while the pointer is within `band`
 *   px of its zone, unless a more precise one is clearly (`breakthrough` px)
 *   under the pointer; for a pointer that aims, a short gap between zones
 *   (`gapGrace` ms) keeps it too.
 * - Leaving the shown target: flying, the indicator hides at once; aiming, it
 *   moves to the new target once that has held `switchHold` ms (so no
 *   indicator shows for less than that), at once for a breakthrough. A target
 *   kept only by the gap grace can keep the indicator, never show it.
 * - Room is made once the shown target has held `roomAfter` ms, never for a
 *   free target, and closes at once when it changes.
 */
export function createDragIntent<T extends DragTarget>(options: DragIntentOptions<T>): DragIntent<T> {
  const tuning: DragTuning = { ...DRAG_DEFAULTS, ...options.tuning };
  const placeOf = options.placeOf ?? ((t: T) => t.id);
  let home: Rect = { ...options.home };
  let samples: { x: number; y: number; t: number }[] = [];
  let cur: T | null = null;
  let curSince = 0;
  let lastInside = 0;
  let shown: T | null = null;
  let shownSince = 0;
  let place: string | null = null;
  let placeSince = 0;
  let roomPlace: string | null = null;
  let leftHome = false;
  let speed = 0;
  let anchor: Point | null = null;
  let stillSince = 0;
  let restart = false;
  const same = (a: T | null, b: T | null): boolean => (a === null || b === null ? a === b : a.id === b.id);
  // Targets may be rebuilt between calls: follow the ones held by id.
  const follow = (t: T | null, targets: readonly T[]): T | null => (t ? (targets.find((x) => x.id === t.id) ?? t) : null);

  return {
    tuning,
    get state(): DragIntentState<T> {
      return { speed, current: cur, shown, leftHome };
    },
    update(point, time, targets) {
      const p = point;
      const t = time;
      samples.push({ x: p.x, y: p.y, t });
      while (samples.length > 2 && t - samples[0]!.t > tuning.speedWindow) samples.shift();
      const a = samples[0]!;
      speed = speed * 0.5 + (Math.hypot(p.x - a.x, p.y - a.y) / Math.max(1, t - a.t)) * 0.5;
      if (!anchor || Math.hypot(p.x - anchor.x, p.y - anchor.y) > tuning.still) {
        anchor = { x: p.x, y: p.y };
        stillSince = t;
      }
      if (!inRect(home, p, -tuning.homeInset)) leftHome = true;
      const atHome = inRect(home, p);
      const raw = atHome ? null : targetAt(targets, p);
      cur = follow(cur, targets);
      shown = follow(shown, targets);
      let next = raw;
      if (cur && !atHome && inRect(cur.hit, p, tuning.band)) {
        const breaks = raw !== null && !same(raw, cur) && raw.priority < cur.priority && inRect(raw.hit, p, -tuning.breakthrough);
        next = breaks ? raw : cur;
      }
      if (!next && cur && !atHome && t - lastInside < tuning.gapGrace) next = cur;
      if (next && inRect(next.hit, p)) lastInside = t;
      if (!same(next, cur)) curSince = t;
      cur = next;
      const aiming = !restart && (speed < tuning.aimSpeed || t - stillSince >= tuning.dwell);
      restart = false;
      const show = (s: T | null): void => {
        if (!same(s, shown)) shownSince = t;
        shown = s;
      };
      // Under the pointer (within its band), not just kept by the gap grace.
      const under = !!cur && inRect(cur.hit, p, tuning.band);
      if (!shown) {
        if (cur && under && leftHome && aiming) show(cur);
      } else if (same(cur, shown)) {
        // It stays while its target holds; but a pointer flying out past the band hides it at once.
        if (!aiming && !under) show(null);
        else shown = cur;
      } else if (!cur || !aiming) {
        show(null);
      } else if ((cur.priority < shown.priority && inRect(cur.hit, p, -tuning.breakthrough)) || (under && t - curSince >= tuning.switchHold)) {
        show(cur);
      }
      // The place within the shown target, and the room: after the target and the place have both held.
      const at = shown ? placeOf(shown, p) : null;
      if (at !== place) {
        place = at;
        placeSince = t;
      }
      if (!shown || shown.free) roomPlace = null;
      else if (t - shownSince >= tuning.roomAfter && t - placeSince >= tuning.roomAfter) roomPlace = place;
      else if (shownSince === t) roomPlace = null;
      return { shown, room: roomPlace !== null, roomPlace, aiming };
    },
    release(point, targets) {
      if (inRect(home, point)) return null;
      const s = follow(shown, targets);
      if (s && inRect(s.hit, point, tuning.band)) return s;
      return targetAt(targets, point);
    },
    hide(time) {
      shown = null;
      cur = null;
      shownSince = time;
      place = null;
      roomPlace = null;
      samples = [];
      anchor = null;
      restart = true;
    },
    moveHome(dx, dy) {
      home = { ...home, x: home.x + dx, y: home.y + dy };
    },
  };
}
