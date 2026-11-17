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
  /** A higher-priority target takes over at once when the pointer is this far inside it. */
  readonly breakthrough: number;
  /**
   * The band and the breakthrough scale with the zones: along each axis they are at most this share of the held
   * zone's extent and of the extent of the zone under the pointer (its `hit`), so a small zone (a 28 px row) can be
   * entered by a direct glide from its neighbor. Below a quarter, the pointer at a quarter of a zone is past them.
   */
  readonly bandShare: number;
  /** A gap between zones shorter than this keeps the current target (for a pointer that aims). */
  readonly gapGrace: number;
  /** Aiming, the shown target moves to another one only once that one has held this long. */
  readonly switchHold: number;
  /** Room is made once the shown target, and the place in it, have held this long. */
  readonly roomAfter: number;
  /** The pointer has left the item's home once it is outside the home shrunk by this much on every side. */
  readonly homeInset: number;
  /**
   * Spring-loading: a target marked `arm: "dwell"` takes the drop only once the pointer has stayed in its zone this long
   * (ms); before that it is no target, so a fast pass, or a drop before it, lands on what lies beneath. 0 arms it at once.
   * Armed, its zone is its `armedHit` (the magnet: its band); moving out past that band's outer edge disarms it, and
   * re-entering needs a new full dwell. It arms only after the pointer has ENTERED its zone during the drag: the point
   * the drag starts at counts as not entered, so a drag that starts inside the zone (a panel's grip under the strip at
   * the window's edge) must leave it and come back before it can arm; entering from over home counts.
   */
  readonly railArmDwellMs: number;
  /**
   * The lift zone, a radius in px about the point the drag was lifted at ({@link DragIntentOptions.lift}, else the first
   * sample): no spring-loaded target arms by dwell inside it. Coming back to where you lifted and pausing is the
   * "changed my mind" gesture, so it commits nothing even where a strip lies over the grip (a flush drawer's grip at the
   * window's edge). 16 px is about a grip's size. Elsewhere, home under a strip included, arming works as before, and
   * the rail key forces the rail anywhere, the lift zone too.
   */
  readonly liftZone: number;
  /** The keys that win over geometry while held (see {@link DragModifiers}). */
  readonly modifiers: DragModifiers;
}

/**
 * A modifier key, by its `KeyboardEvent.key` name, or `"Mod"`: ⌘ (Meta) on macOS and Ctrl elsewhere. `"Mod"` counts
 * either key as held, so no platform detection is needed.
 */
export type ModifierKey = "Shift" | "Alt" | "Control" | "Meta" | "Mod";

/** The modifier keys held on a sample (a pointer event's `shiftKey`, `altKey`, `ctrlKey`, `metaKey`). */
export interface DragKeys {
  readonly shift?: boolean;
  readonly alt?: boolean;
  readonly ctrl?: boolean;
  readonly meta?: boolean;
}

/**
 * Keys that win over geometry: while `floatKey` is held the drop floats (the `free` target) wherever the pointer is;
 * while `railKey` is held it goes to the nearest target marked `arm` (a side's rail), without reaching it. `floatKey`
 * wins when both are held. `on: false` turns both off.
 */
export interface DragModifiers {
  readonly on: boolean;
  readonly floatKey: ModifierKey;
  readonly railKey: ModifierKey;
}

/**
 * The defaults: a mouse lifts after 5 px, a touch after a 180 ms hold and
 * 8 px; aiming is slower than 0.45 px/ms over 50 ms, or within 12 px for
 * 90 ms; a 10 px band and a 4 px breakthrough, each at most a fifth of the
 * zones' extents, and a 120 ms gap grace; a switch waits 150 ms (the shortest
 * an indicator may show); room after 160 ms. A spring-loaded target arms after
 * 200 ms of dwell (long enough that a pass at travelling speed never arms it,
 * short enough to feel like the platforms' spring-loading); Shift floats, ⌘/Ctrl
 * (`"Mod"`) goes to the nearest rail. Alt is left free: an app with a frozen
 * layout uses it to unfreeze temporarily, and a key should have one meaning.
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
  bandShare: 0.2,
  gapGrace: 120,
  switchHold: 150,
  roomAfter: 160,
  homeInset: 6,
  railArmDwellMs: 200,
  liftZone: 16,
  modifiers: { on: true, floatKey: "Shift", railKey: "Mod" },
};

const KEY_FIELD: Record<Exclude<ModifierKey, "Mod">, keyof DragKeys> = { Shift: "shift", Alt: "alt", Control: "ctrl", Meta: "meta" };
/** Whether `key` is held in `keys` (`"Mod"`: ⌘ or Ctrl). */
const held = (keys: DragKeys | undefined, key: ModifierKey): boolean =>
  !!keys && (key === "Mod" ? !!(keys.meta || keys.ctrl) : !!keys[KEY_FIELD[key]]);

/**
 * A drop target: plain data. `hit` is the zone the pointer can be in;
 * `priority` how precise it is (1 beats 2 beats 3; equal priorities go to the
 * smaller zone). `slot` is where the dragged item would land, `label` what to
 * call it; the model reads neither. A `free` target has no slot (the item
 * floats where it is dropped): no room is made for it. `hits`, when given, is
 * the whole zone as several rects (a zone that isn't one rect, `hit` the
 * largest of them): the pointer is in the zone when it is in any of them.
 *
 * `arm: "dwell"` makes it spring-loaded: it is no target until the pointer has
 * dwelt in its zone for `railArmDwellMs`; once armed its zone is `armedHit`
 * when given (a magnet: the zone grown), and leaving that disarms it.
 *
 * `refuse: true` makes it a refusal: a place that takes no drop (a host says "No room here" there). It takes part in
 * the pick under the pointer, but it never becomes the current or the shown target, and a release over it lands
 * nowhere. Where the pick under the pointer is a refusal, no held target's band or gap grace keeps it: nothing shows,
 * and the frame's `refused` says which refusal it is.
 */
export interface DragTarget {
  readonly id: string;
  readonly priority: 1 | 2 | 3;
  readonly hit: Rect;
  readonly hits?: readonly Rect[];
  readonly slot?: Rect;
  readonly label?: string;
  readonly free?: boolean;
  readonly arm?: "dwell";
  readonly armedHit?: Rect;
  readonly refuse?: true;
}

/** Whether `point` lies in `rect` grown by `margin` px on every side (shrunk, for a negative margin). */
export function inRect(rect: Rect, point: Point, margin = 0): boolean {
  return point.x >= rect.x - margin && point.x <= rect.x + rect.width + margin && point.y >= rect.y - margin && point.y <= rect.y + rect.height + margin;
}

/** How far `point` lies from `rect` (0 inside it). */
const distanceTo = (rect: Rect, point: Point): number =>
  Math.hypot(Math.max(rect.x - point.x, 0, point.x - (rect.x + rect.width)), Math.max(rect.y - point.y, 0, point.y - (rect.y + rect.height)));

/** Whether `point` lies in a target's zone (`hits` when it has them, else `hit`), grown by `margin` px. */
const inZone = (t: DragTarget, point: Point, margin = 0): boolean => (t.hits ? t.hits.some((r) => inRect(r, point, margin)) : inRect(t.hit, point, margin));

/** A margin per axis: px grown (shrunk, when negative) left and right, and above and below. */
interface Margin {
  readonly x: number;
  readonly y: number;
}
/** Whether `point` lies in a target's zone grown by `m.x` px left and right and `m.y` px above and below. */
const inZoneBy = (t: DragTarget, point: Point, m: Margin): boolean =>
  (t.hits ?? [t.hit]).some((r) => point.x >= r.x - m.x && point.x <= r.x + r.width + m.x && point.y >= r.y - m.y && point.y <= r.y + r.height + m.y);
/** `px`, but along each axis at most `share` of each zone's extent (its `hit`) along it. */
const scaled = (px: number, share: number, zones: readonly (DragTarget | null)[]): Margin => {
  let x = px;
  let y = px;
  for (const z of zones) {
    if (!z) continue;
    x = Math.min(x, share * z.hit.width);
    y = Math.min(y, share * z.hit.height);
  }
  return { x, y };
};
const negate = (m: Margin): Margin => ({ x: -m.x, y: -m.y });

const area = (r: Rect): number => r.width * r.height;
/** A target's zone's area: its `hits` together, else its `hit`. */
const zoneArea = (t: DragTarget): number => (t.hits ? t.hits.reduce((s, r) => s + area(r), 0) : area(t.hit));

/** The most precise target under `point`: the lowest priority number, then the smallest zone; null when none is. */
export function targetAt<T extends DragTarget>(targets: readonly T[], point: Point): T | null {
  let best: T | null = null;
  for (const t of targets) {
    if (!inZone(t, point)) continue;
    if (!best || t.priority < best.priority || (t.priority === best.priority && zoneArea(t) < zoneArea(best))) best = t;
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
  /**
   * The pointer is back inside `home` after it has been outside `home` itself. Never true at the press, nor while the
   * pointer only moves about inside `home`, even near its edge (where `state.leftHome` is already true: that flag is for
   * the indicator's gate and uses `homeInset`; this one does not). Over home no target is shown and a release does
   * nothing, so a host that wants to say "a drop here returns it" draws its own indicator for this frame (at the home
   * rect); the intent still shows no target.
   */
  readonly atHome: boolean;
  /**
   * A spring-loaded target (`arm: "dwell"`) the pointer is in and dwelling on, not armed yet (a host highlights it), or
   * null. Once it arms it is a target like any other and may show.
   */
  readonly arming: T | null;
  /** A key held wins over geometry this frame: `"float"` (the float key) or `"rail"` (the rail key), else null. */
  readonly forced: "float" | "rail" | null;
  /**
   * The refusal (a target with `refuse: true`) the pointer is over, when it is the pick there: no target shows, and a
   * host says so at the pointer ("No room here"). Null otherwise, and while a key forces a target.
   */
  readonly refused: T | null;
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
  /** Where the press that lifted the item was (the grip); default the first sample's point. The lift zone is about it. */
  readonly lift?: Point;
  /** Overrides of {@link DRAG_DEFAULTS}. */
  readonly tuning?: Partial<DragTuning>;
  /**
   * The place within a target the pointer is at (a tab index, a stack
   * position, a pane's edge), unique across targets; default: the target's id.
   * Moving between places of the shown target moves the indicator at once but
   * the room only once the new place has held `roomAfter` ms.
   *
   * - `previous` is the place this target had on the last sample (null if it
   *   had none), so a place can hold near its boundary (hysteresis).
   * - A null place is no target: there is no drop at that point of the target.
   *   It isn't picked or held, the indicator hides there at once (or shows a
   *   target beneath that has a place), no room opens, and a release there
   *   lands on a target beneath, else goes home.
   * - It is also asked about the current target while the pointer is just
   *   outside its hit zone (within the band, or during the gap grace). Answer
   *   the nearest place there: returning null outside the zone drops the band
   *   and the grace, so the indicator hides a few px past the edge. Return null
   *   only for a part of the target that takes no drop.
   * - It is called on every sample for each target under the pointer and for
   *   the current one, so keep it cheap and free of side effects.
   */
  readonly placeOf?: (target: T, point: Point, previous: string | null) => string | null;
}

/** A drag's intent: feed it the pointer on every frame; it says what the indicator shows and what a release lands on. */
export interface DragIntent<T extends DragTarget> {
  /**
   * A pointer sample at `time` (ms), with the targets as they stand (they may
   * be rebuilt between calls: the model follows them by id). Call it once a
   * frame while the item is held, also when the pointer doesn't move: a
   * dwell is time passing. `keys`: the modifier keys held now (see {@link DragModifiers}).
   */
  update(point: Point, time: number, targets: readonly T[], keys?: DragKeys): DragFrame<T>;
  /**
   * What a release at `point` lands on: the shown target whenever one shows
   * (a drop lands where the indicator was), else the target under the
   * pointer, else null (the item goes home). A release over home is null: it
   * does nothing. Feed the release point to `update` first, so a last jump
   * of the pointer counts. With a modifier key held (`keys`), the target the key picks, even over home.
   */
  release(point: Point, targets: readonly T[], keys?: DragKeys): T | null;
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
 *   under the pointer; both scale down for small zones (`bandShare` of the
 *   held zone's and the entered zone's extents along each axis), so a small
 *   zone is entered by a direct glide; for a pointer that aims, a short gap between zones
 *   (`gapGrace` ms) keeps it too.
 * - Leaving the shown target: flying, the indicator hides at once; aiming, it
 *   moves to the new target once that has held `switchHold` ms (so no
 *   indicator shows for less than that), at once for a breakthrough. A target
 *   kept only by the gap grace can keep the indicator, never show it.
 * - Room is made once the shown target has held `roomAfter` ms, never for a
 *   free target, and closes at once when it changes.
 * - Where `placeOf` gives a target no place (null), it is no target: it is
 *   neither shown nor landed on there.
 * - Spring-loading: a target marked `arm: "dwell"` is no target until the
 *   pointer has stayed in its zone `railArmDwellMs` (the frame's `arming` says
 *   which one it dwells on); then it is armed: its zone is `armedHit` (the
 *   magnet) and it shows at once. Leaving that zone disarms it.
 * - Keys win over geometry (`modifiers`): the float key shows the `free` target
 *   wherever the pointer is, the rail key the nearest target marked `arm`; a
 *   release with the key held lands there.
 */
export function createDragIntent<T extends DragTarget>(options: DragIntentOptions<T>): DragIntent<T> {
  const tuning: DragTuning = { ...DRAG_DEFAULTS, ...options.tuning };
  const placeOf = options.placeOf ?? ((t: T) => t.id);
  // Each target's place on the last sample, by id: its `previous` on the next.
  let lastPlaces = new Map<string, string | null>();
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
  // The pointer has been outside `home` itself (`leftHome` turns on already near its edge): `atHome`'s own memory.
  let wentOut = false;
  let speed = 0;
  let anchor: Point | null = null;
  let stillSince = 0;
  let restart = false;
  // Spring-loading: the target armed (by id), and the one the pointer dwells on and since when.
  let armedId: string | null = null;
  let armingId: string | null = null;
  let armingSince = 0;
  // The spring-loaded targets (by id) the pointer has been outside of during this drag: only those can arm.
  const wasOutside = new Set<string>();
  // The point the drag was lifted at: no spring-loaded target arms by dwell within `liftZone` of it.
  let liftAt: Point | null = options.lift ? { ...options.lift } : null;
  const same =(a: T | null, b: T | null): boolean => (a === null || b === null ? a === b : a.id === b.id);
  // Targets may be rebuilt between calls: follow the ones held by id.
  const follow = (t: T | null, targets: readonly T[]): T | null => (t ? (targets.find((x) => x.id === t.id) ?? t) : null);
  /** An armed target as it acts: its zone is `armedHit` (the magnet) when it has one. */
  const asArmed = (x: T): T => {
    if (!x.armedHit) return x;
    const { hits: _pieces, ...rest } = x;
    return { ...rest, hit: x.armedHit } as T;
  };
  /** The targets as they act now: a spring-loaded one only once armed, in its armed zone. */
  const acting = (targets: readonly T[]): T[] => targets.filter((x) => x.arm !== "dwell" || x.id === armedId).map((x) => (x.id === armedId ? asArmed(x) : x));
  /** The target a held key picks at `p`: the float key the `free` target, the rail key the nearest spring-loaded one. */
  const forcedBy = (keys: DragKeys | undefined, p: Point, targets: readonly T[], ok: (x: T) => boolean): { kind: "float" | "rail"; target: T } | null => {
    const m = tuning.modifiers;
    if (!m.on || !keys) return null;
    if (held(keys, m.floatKey)) {
      const f = targets.find((x) => x.free && ok(x));
      return f ? { kind: "float", target: f } : null;
    }
    if (!held(keys, m.railKey)) return null;
    let best: T | null = null;
    let bestD = Infinity;
    for (const x of targets) {
      if (x.arm !== "dwell" || !ok(x)) continue;
      const d = distanceTo(asArmed(x).hit, p);
      if (d < bestD) {
        best = x;
        bestD = d;
      }
    }
    return best ? { kind: "rail", target: asArmed(best) } : null;
  };

  return {
    tuning,
    get state(): DragIntentState<T> {
      return { speed, current: cur, shown, leftHome };
    },
    update(point, time, given, keys) {
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
      if (!atHome) wentOut = true;
      // Each target's place at this point, worked out once per sample; a null place is no target.
      const places = new Map<string, string | null>();
      const placeAt = (x: T): string | null => {
        if (!places.has(x.id)) places.set(x.id, placeOf(x, p, lastPlaces.get(x.id) ?? null));
        return places.get(x.id)!;
      };
      const live = (x: T | null): x is T => x !== null && placeAt(x) !== null;
      // Spring-loading: the armed target holds while the pointer is in its armed zone; a target the pointer dwells in
      // arms once it has held `railArmDwellMs`. A key held wins over both.
      const forced = forcedBy(keys, p, given, () => true);
      if (armedId !== null) {
        const was = given.find((x) => x.id === armedId);
        if (!was || forced || !inZone(asArmed(was), p) || !live(was)) armedId = null;
      }
      // Spring-loading is not gated by `atHome`: a strip that overlaps the item's own place still arms by dwell.
      // A spring-loaded target arms only after the pointer has entered it: one it has been outside of during the drag.
      for (const x of given) if (x.arm === "dwell" && !inZone(x, p)) wasOutside.add(x.id);
      // Inside the lift zone nothing arms by dwell ("changed my mind"); the rail key still forces the rail.
      liftAt ??= { x: p.x, y: p.y };
      const inLiftZone = Math.hypot(p.x - liftAt.x, p.y - liftAt.y) <= tuning.liftZone;
      const dwelling = forced || inLiftZone ? null : targetAt(given.filter((x) => x.arm === "dwell" && x.id !== armedId && wasOutside.has(x.id) && inZone(x, p) && live(x)), p);
      let armedNow = false;
      if (!dwelling || armedId !== null) armingId = null;
      else {
        if (armingId !== dwelling.id) {
          armingId = dwelling.id;
          armingSince = t;
        }
        if (t - armingSince >= tuning.railArmDwellMs) {
          armedId = dwelling.id;
          armingId = null;
          armedNow = true;
        }
      }
      const arming = armingId === null ? null : (given.find((x) => x.id === armingId) ?? null);
      const targets = acting(given);
      // Over home no target is picked, except a spring-loaded one that is armed (its zone overlaps home): home gates
      // geometry, not an armed dwell.
      const pickable = (x: T): boolean => !atHome || (x.arm === "dwell" && x.id === armedId);
      // A refusal takes part in the pick (it needs no place), but it is never a target: never held, never shown.
      const raw = targetAt(targets.filter((x) => pickable(x) && inZone(x, p) && (x.refuse === true || live(x))), p);
      const refusedRaw = raw?.refuse === true ? raw : null;
      // A spring-loaded target that isn't armed (any more) is no target: neither held nor shown.
      const disarmed = (x: T | null): boolean => x?.arm === "dwell" && x.id !== armedId;
      cur = disarmed(cur) ? null : follow(cur, targets);
      shown = disarmed(shown) ? null : follow(shown, targets);
      if (!live(cur)) cur = null;
      // The band about a held zone, and the breakthrough into a zone, scaled with the zones (see `bandShare`).
      const bandOf = (held: T): Margin => scaled(tuning.band, tuning.bandShare, [held, raw && !same(raw, held) ? raw : null]);
      const pastBreakthrough = (x: T): boolean => inZoneBy(x, p, negate(scaled(tuning.breakthrough, tuning.bandShare, [x])));
      // Over a refusal nothing is held: no band and no gap grace keep the current target there.
      let next = refusedRaw ? null : raw;
      if (!refusedRaw && cur && pickable(cur) && inZoneBy(cur, p, bandOf(cur))) {
        // Over a `free` target (the float everywhere) there is no edge to hold against: a more precise target takes over
        // once the pointer is in it, so a zone that ends at the window's edge is reached at its very first px.
        const breaks = raw !== null && !same(raw, cur) && raw.priority < cur.priority && (cur.free === true || pastBreakthrough(raw));
        next = breaks ? raw : cur;
      }
      if (!refusedRaw && !next && cur && pickable(cur) && t - lastInside < tuning.gapGrace) next = cur;
      if (next && inZone(next, p)) lastInside = t;
      if (!same(next, cur)) curSince = t;
      cur = next;
      const aiming = !restart && (speed < tuning.aimSpeed || t - stillSince >= tuning.dwell);
      restart = false;
      const show = (s: T | null): void => {
        if (!same(s, shown)) shownSince = t;
        shown = s;
      };
      // Under the pointer (within its band), not just kept by the gap grace.
      const under = !!cur && inZoneBy(cur, p, bandOf(cur));
      // A shown target with no place here is no drop: the indicator hides at once (the switch hold is for targets).
      if (shown && !live(shown)) show(null);
      if (!shown) {
        if (cur && under && leftHome && aiming) show(cur);
      } else if (same(cur, shown)) {
        // It stays while its target holds; but a pointer flying out past the band hides it at once.
        if (!aiming && !under) show(null);
        else shown = cur;
      } else if (!cur || !aiming) {
        show(null);
      } else if ((cur.priority < shown.priority && (shown.free === true || pastBreakthrough(cur))) || (under && t - curSince >= tuning.switchHold)) {
        show(cur);
      }
      // An armed target shows at once: the dwell was the aim. A key held wins over all of it.
      if (armedNow && cur?.id === armedId && under) show(cur);
      if (forced) {
        if (!same(forced.target, cur)) curSince = t;
        cur = forced.target;
        show(forced.target);
      }
      // The place within the shown target, and the room: after the target and the place have both held.
      const at = shown ? placeAt(shown) : null;
      if (at !== place) {
        place = at;
        placeSince = t;
      }
      if (!shown || shown.free) roomPlace = null;
      else if (t - shownSince >= tuning.roomAfter && t - placeSince >= tuning.roomAfter) roomPlace = place;
      else if (shownSince === t) roomPlace = null;
      lastPlaces = places;
      return { shown, room: roomPlace !== null, roomPlace, aiming, atHome: !forced && wentOut && atHome, arming, forced: forced?.kind ?? null, refused: forced ? null : refusedRaw };
    },
    release(point, given, keys) {
      // A key held wins over geometry, home included.
      const forced = forcedBy(keys, point, given, () => true);
      if (forced) return given.find((x) => x.id === forced.target.id) ?? forced.target;
      // Over home a release does nothing, except onto an armed spring-loaded target whose zone overlaps home.
      if (inRect(home, point)) {
        const armed = armedId === null ? null : given.find((x) => x.id === armedId);
        return armed && inZone(asArmed(armed), point) && placeOf(armed, point, lastPlaces.get(armed.id) ?? null) !== null ? armed : null;
      }
      const targets = acting(given);
      // Drop = shown: a shown target is kept until it hides (flying out past its band hides it at once).
      const s = shown && !(shown.arm === "dwell" && shown.id !== armedId) ? follow(shown, given) : null;
      if (s) return s;
      // Else the target under the pointer that has a place there (a null place is no drop); a refusal there lands nowhere.
      const under = targetAt(
        targets.filter((x) => inZone(x, point) && (x.refuse === true || placeOf(x, point, lastPlaces.get(x.id) ?? null) !== null)),
        point,
      );
      return under && !under.refuse ? (given.find((x) => x.id === under.id) ?? under) : null;
    },
    hide(time) {
      shown = null;
      cur = null;
      armedId = null;
      armingId = null;
      shownSince = time;
      place = null;
      roomPlace = null;
      lastPlaces = new Map();
      samples = [];
      anchor = null;
      restart = true;
    },
    moveHome(dx, dy) {
      home = { ...home, x: home.x + dx, y: home.y + dy };
    },
  };
}
