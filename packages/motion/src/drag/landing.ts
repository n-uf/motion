import type { Point, Rect } from "../shapes";
import { isHeld } from "../keys";
import { createHandSpeed, HAND_SPEED } from "./hand-speed";
import { DRAG_DEFAULTS, type DragKeys, type DragModifiers } from "./intent";
import { DRAG_PREVIEW_DEFAULT, guidesOf, type DragPreview, type PlaceGuides, type PreviewMode } from "./preview";
import type { LandingRegion } from "./region";

/**
 * The landing model: where a docking drag's item lands, as a held place rather than a per-frame guess. A host gives it the
 * drag's geometry (`@n-uf/docking`'s `dockDrag(...)` fits `LandingGeometry` as it is: the regions for hit-testing and
 * `landingOf(held)`) and each pointer sample; it says the region the pointer is in, the lane and spot held, the held place a
 * release lands (`frame.held`), where the item lands, whether the room is open, and which lanes' place guides show with
 * the held place each stands for. It picks held places and does no layout: every rect of a held place comes from the geometry. Every
 * change comes from where the pointer is and how it moved (margins, a path length, a step size): the model has no waits
 * of its own.
 *
 * - **The stage's edge** is the easiest place to dock: a pointer past the stage by up to `edge` px counts as on its
 *   edge, so it lies deep inside a lane drawn against that edge; beyond, it is nowhere.
 * - **A lane holds** while the pointer is inside its rect grown by `exit`, whatever lies under it. Inside, over a spot's
 *   stretch it is at that spot; over a refused stretch of the lane, refused ("Can't go here"). (Docking's `lanes()`
 *   joins a refused stretch shorter than the item to its spots.)
 * - **Entering a lane** needs one of two gates: `path` px of slow pointer path along it inside it (steps of at most
 *   `stepSpeed`), or a still step (at most `stillSpeed`) once `depth` px inside, the depth measured across the lane: only from its
 *   two sides parallel to its axis that face into the stage (on the edge it is deep), never from its ends along its axis
 *   (a rail's end that meets a bar is no wall). A fly-through of a thin bar or rail at any angle meets neither, so its
 *   room never opens. Inside a lane that touches the held one, past the held lane's exit margin, the held lane holds
 *   until that lane's gate passes or the pointer has slid `path` px along it (across it at most a third as far) as a
 *   steady slide no faster than `slideSpeed` (2 px/ms), as the hand's speed reads it: lane to lane never passes through the
 *   float, and never opens a crossed lane's room. A fling, along the lane or across it, is no entry: the touching lane is
 *   entered only by its own gate (the slow path, or a rest past `pause`). The cost: above 2 px/ms a hand sliding along a
 *   corner lane keeps the previous lane's end spot until it slows or rests, and a slide counts only once the hand's
 *   speed is known and steady (a span and a half, 72 ms at 125 Hz, 120 ms at 60 Hz). The hold through a touching lane is
 *   for crossing a corner: more than `path` past the held lane's exit margin the frame is held but refused (the lane
 *   kept for its guides; no spot, no landing, nothing pending; a release goes home), sticky until the pointer is back
 *   within `exit + path - spot`. Over a refused place (a lane's band lying over a column that takes nothing: an empty
 *   side rail's) a lane is entered on the first slow step there (not on the lift), as there is nothing else to mean
 *   there; a fly-through still opens no room. A touching lane's takeover reads the same rule, so a held lane never
 *   pre-empts it. After a fling (the hand's speed above `slideSpeed`) no lane is entered by a slow-step gate (still,
 *   over-refused) until the hand has read slow (or rested) for `pause`: jitter right after a flick docks nothing, while
 *   on the stage's edge a fling is taken at once.
 * - **The hand's speed** (`createHandSpeed`, ./hand-speed) is the one estimate every gate that asks "fast or slow"
 *   reads: the slide count and its entry, the settle rule, the slow path. It reads a speed-up at once (the newest step)
 *   and a slow-down only once it has lasted its span (at least 48 ms and 5 steps), so a fling whose timestamps jitter
 *   never reads slow; a gap of 40 ms or more that was a rest (the pointer seen standing still in it, or moving across
 *   it at less than half the hand's speed) starts the hand again, so a rest is never averaged into the next fling, while
 *   a gap the pointer moved on through (frames the host lost) carries the hand on, its lost frames filled in, so a
 *   dropped frame never loses a slide; a step across a gap is never a slow step; and a slide counts only while the hand
 *   reads steady (not gathering speed), from where the pointer crossed into the lane. A host sampling slower than 25 Hz
 *   (every step a gap, the hand with no speed yet) slides into a touching lane only by its own gates. A lane that owns
 *   its rect (`owns`: a rail drop strip at the window's side) takes the pointer inside it from any lane it overlaps, a
 *   held one too, once its own gate passes and only once the pointer came into it from outside since the lift. Within
 *   `margins.lift` of the lift point (`options.lift`, else the first point; fixed for the drag) an owning lane takes the
 *   pointer by no gate, so a pointer brought back there is in the item's own lane, not the strip. Elsewhere in the strip
 *   a slow slide along it can take the pointer before it is back at the lift point. More generally, within
 *   `margins.lift` of the lift point the lane is the item's own (`home.lane`) whenever the pointer lies in it, whatever
 *   lane the pointer came through (a plain lane's band over the home lane's corner included), and its spot is the
 *   item's own (`home.spot`; a sliding one still lets the landing follow the hand and snap): away and back to where the
 *   item was lifted is home on every layout, so no nudge to a neighboring spot is reachable within `lift` of the press.
 *   The zone is held like a held lane: the drag starts in it, leaves it past `lift` and re-enters only within
 *   `lift - spot`, so a wobble at its edge never flips a cut near the press.
 * - **A float's lift zone.** A lift is a float's when it has no `home` option and no lane has a spot marked `home` (a
 *   docked item's own place; docking always marks it), so a docked item lifted without `home` stays docked. A float has a zone of
 *   its own, the same `margins.lift` around the press: within it no lane takes the pointer, and the frame is judged as if
 *   the regions had no lanes (the float is at the hand, so a nudge moves it; blocked and refused places are judged as on
 *   any frame, so a float lying over one is refused there). No lane's path counts inside it. The zone is left once, at
 *   the first point farther than `lift` from the press, and never re-entered: the lanes act as usual from then on, a
 *   held lane included, so a slide back through the press point changes nothing. A float lying inside a lane's band
 *   (an empty bar's) stays a float for the first `lift` px, and the lane takes it by its gates after.
 * - **Along a lane** the spot changes once the pointer is `spot` px past the boundary; where the change moves another
 *   item (the two spots' `others` keys differ), on a step of at most `stepSpeed`, or once the held landing trails the
 *   pointer by more than `trail` (`landingOf` the spot held): the item chases only as far as it must. A change that
 *   moves only the held item follows the hand at any speed. With `spotsOf`, a reflowing change is kept only if, with the
 *   new spot held (its room open), the pointer still lies in that spot's stretch: the room shifting the boundary never
 *   bounces it.
 * - **A sliding spot** (a free stretch as one spot) lands where the hand is: the model names the spot and the pointer,
 *   and the geometry says where (`landingOf`). Nothing reflows inside it, so there are no steps there; a step comes only
 *   where the order changes (passing a neighbor), as between any two spots.
 * - **Outside every lane:** a refused place, refused; open space (`"open"`: the content less what blocks it, the page),
 *   the float at its landing; outside the stage (past `edge`), nowhere; else (docked content that takes nothing and
 *   refuses nothing) refused.
 * - **The float key** (`modifiers.floatKey`, Shift by default) turns a lane or open space into open space (the float), and
 *   hides the guides.
 * - **Guides** name lanes and the held place each lane's guide stands for (`frame.guides`); the geometry draws them (a lane's
 *   marks in that held place's layout). `"near"` shows a lane only where the pointer can enter it: the held lane's (also over its own
 *   refused stretch); else the pending lane's (the pointer inside it, its gate not passed: a release floats or goes
 *   home); else, with the pointer in open space, the approached lane's (the nearest within `reach`, by default the
 *   entry margin `exit`, acquired within `max(reach - spot, reach / 2)` and kept to `reach`, so it never blinks at the
 *   edge: a release floats). Over a refused place outside every lane no guide shows, however near the lane behind it
 *   lies; a host that wants the early guide sets `approach.reach` (in open space only: over a refused place none shows
 *   at any reach). That lane (the one the Near rule picks), held, stands for the frame's held place; pending or approached,
 *   for the held place the pointer would land in there (the spot it picks along it), so its guide before entry is its mark
 *   after it. `"all"` shows every lane's, every other lane standing for the frame's held place (the screen); with no Near
 *   lane, the lane nearest the pointer within `reach` stands for its would-land held place, for the corner only (not made
 *   Near, pending or enterable), switching exactly at `reach`. Where that lane's guide meets another's, the geometry
 *   gives it that lane.
 * - Steps are speeds (px/ms) between points that differ, so the gates read the same speed at any input rate from 60 Hz
 *   to 8 kHz. A point stamped under 1 ms after the newest one the hand holds is the same sample and changes no step (a
 *   run of them is read from the first one 1 ms or more past it); one stamped before it is left out too. A repeated
 *   point keeps the last step; it is still only once the pointer has stayed put for `rest` ms.
 * - **The pointer** is taken onto the stage by the model itself (past it by up to `edge`, onto its edge).
 *
 * **The host's part:** call `update` whenever you like: per pointer sample, per animation frame, or both. Times never go
 * back: give every call a time no earlier than the one before. Call it at least once more after the pointer stops,
 * `rest` ms or more later (every frame does), so it can become still and a rest reads as one (a rest the model never
 * sees is told from frames the host lost only by how far the pointer moved across it), and again with the same point
 * when a key changes. `release(point, time)` takes the release point as one more sample when it differs from the last.
 * When the state under the drag changes (a resize, a store change), hand the new geometry whole to `setGeometry`.
 */

/** A place a drop in a lane lands: its stretch of the lane and its listed landing rect. Ids are stable across solves. */
export interface LandingSpot {
  readonly id: string;
  readonly along: readonly [number, number];
  /** Its landing as listed (a sliding spot's at rest): what `home` compares with. Where it lands now is `landingOf`. */
  readonly landing: Rect;
  /**
   * Where its drop draws every other item, as a key: a change between two spots with the same key moves only the held
   * item. Absent: every change to or from it counts as moving others.
   */
  readonly others?: string;
  /** The held item's own place at the lift (a docked item's; docking marks it): a lift with no spot marked home is a float's. */
  readonly home?: boolean;
}
export interface LandingLane {
  readonly id: string;
  readonly rect: Rect;
  readonly axis: "x" | "y";
  readonly spots: readonly LandingSpot[];
  readonly refused: readonly { readonly along: readonly [number, number] }[];
  /**
   * Its rect is its own (a rail drop strip at the window's side): inside it, once its gate passes, it takes the pointer
   * from any lane it overlaps, a held one too. Absent: where lanes overlap, the deeper one wins.
   */
  readonly owns?: boolean;
}
/** A drag's regions (`lanes()` gives them). */
export interface LandingRegions {
  readonly lanes: readonly LandingLane[];
  readonly refused: readonly Rect[];
  readonly content: Rect;
  readonly blocked: readonly Rect[];
  readonly stage: Rect;
}

/** One lane a frame shows place guides for, with the held place its guide stands for (`LandingFrame.guides`). */
export interface LandingGuideRef {
  readonly lane: string;
  readonly held: LandingHeld | null;
}

export interface LandingMargins {
  /** Past a held lane's rect before it lets go, px. */
  readonly exit: number;
  /** Past a spot boundary before the spot changes, px. */
  readonly spot: number;
  /** Past the stage that still counts as on its edge, px; beyond, nowhere. */
  readonly edge: number;
  /**
   * Around the lift point, px (16, as the drag intent's `liftZone`): an owning lane never takes the pointer there, so
   * away and back to where the item was lifted is home.
   */
  readonly lift?: number;
}
export interface LandingGates {
  /** Pointer path inside a lane that enters it, px. */
  readonly path: number;
  /** Depth inside a lane where a still step enters it, px. */
  readonly depth: number;
  /** The speed of a still step, at most, px/ms. */
  readonly stillSpeed: number;
  /**
   * The fastest step that changes the spot along a lane where the change reflows the window, px/ms; it also bounds the
   * steps the path gate counts (a fast crossing never enters).
   */
  readonly stepSpeed: number;
  /** How far the held landing may trail the pointer before a fast reflowing change is taken anyway, px. */
  readonly trail: number;
  /**
   * The time a pointer has to stay put before it counts as still, ms, where its last step was already slow (at most
   * `stepSpeed`) or it is on the stage's edge (a fling there is taken at once); repeated points before it aren't still.
   */
  readonly rest: number;
  /**
   * The time a pointer that last moved fast has to stay put before it counts as still, ms: longer than sample gaps. Also
   * the settle window after a fling (a step above `slideSpeed`): no lane is entered by a slow-step gate (still,
   * over-refused) until the hand has been slow, or resting, this long.
   */
  readonly pause: number;
  /**
   * The fastest step at which a slide along a lane touching the held one takes it, px/ms (default 2). Above it a fling
   * is no entry; the lane's own gate (the slow path, or a rest past `pause`) still enters it.
   */
  readonly slideSpeed: number;
}
/**
 * The approach for near guides, with the pointer in open space: the nearest lane within `reach`, kept until another is
 * `nearer` closer or past `keep` (read as at least `reach`: a kept lane is never shown past it). The guide shows only
 * within `reach` of the lane, so by default only where the pointer can enter it.
 */
export interface LandingApproach {
  /**
   * How near a lane's rect the pointer is in open space for the lane's guides to show, px (default 12: the entry
   * margin). A lane is acquired within `max(reach - margins.spot, reach / 2)` and kept until `reach` (or `keep`), so
   * at the edge the guide never blinks.
   */
  readonly reach: number;
  /** How far a kept lane stays the approached one, px (default 12). Below `reach` it is `reach`. */
  readonly keep: number;
  /** How much nearer another lane has to be to take over from the kept one, px (default 16). */
  readonly nearer: number;
}

export const LANDING_MARGINS: LandingMargins = { exit: 12, spot: 6, edge: 48, lift: 16 };
/** A touch: wider margins, the finger's jitter. */
export const LANDING_TOUCH_MARGINS: LandingMargins = { exit: 16, spot: 8, edge: 48, lift: 16 };
/**
 * The gates: 40 px of path, 8 px deep, a still step at most 0.1875 px/ms, a reflowing one at most 0.375 px/ms, a slide
 * into a touching lane at most 2 px/ms.
 */
export const LANDING_GATES: LandingGates = { path: 40, depth: 8, stillSpeed: 0.1875, stepSpeed: 0.375, trail: 40, rest: 22, pause: 60, slideSpeed: 2 };
export const LANDING_APPROACH: LandingApproach = { reach: LANDING_MARGINS.exit, keep: LANDING_MARGINS.exit, nearer: 16 };

/**
 * The keys the landing model reads: the drag intent's {@link DragModifiers} less the arm key (the model has no
 * spring-loaded targets). While `floatKey` is held a lane or open space is open space and the guides hide; `on: false`
 * turns the key off. A host hands the model the same `modifiers` as its drag intent's tuning.
 */
export type LandingModifiers = Pick<DragModifiers, "on" | "floatKey">;
/** The default keys: the drag intent's (`DRAG_DEFAULTS.modifiers`), Shift floats. */
export const LANDING_MODIFIERS: LandingModifiers = { on: DRAG_DEFAULTS.modifiers.on, floatKey: DRAG_DEFAULTS.modifiers.floatKey };

/**
 * A held place of the drag: where a release now lands. A spot of a lane with the pointer (a sliding spot lands where the hand
 * holds it: the geometry says where), or the float at the pointer. A frame with none is at rest (it lands nowhere).
 */
export type LandingHeld =
  | { readonly kind: "spot"; readonly lane: string; readonly spot: string; readonly point: Point }
  | { readonly kind: "float"; readonly point: Point };

/**
 * The drag's geometry, from the host's docking layer (`@n-uf/docking`'s `dockDrag(...)` fits it as it is): the regions
 * for hit-testing, as seen, and the one rect the model reads of a held place.
 */
export interface LandingGeometry {
  /** Hit-testing: the lanes (hit rects, spots' stretches, refused stretches), refused places, content, blocked, stage. */
  readonly regions: LandingRegions;
  /**
   * Where the item lands in a held place (its rect in that held place's layout), or null where it lands nowhere (a float
   * where the item doesn't float). The frame's landing, and the trail gate's: the model does no geometry of its own.
   */
  readonly landingOf: (held: LandingHeld) => Rect | null;
  /**
   * A spot's lane with its stretches cut in that spot's own layout (a panel column by halves of what it draws), or null:
   * the stretches along a held lane, and the fixed-point check. Absent: the stretches as seen. Asked once per spot until
   * the geometry changes.
   */
  readonly spotsOf?: (spot: string) => readonly LandingSpot[] | null;
}

export interface LandingOptions extends LandingGeometry {
  /** The item's own place at the lift: its lane and spot (the drag starts there, the room open). */
  readonly home?: { readonly lane: string; readonly spot: string };
  /** Where the item was lifted (the press), in the regions' space; default the first point `update` gets. */
  readonly lift?: Point;
  readonly margins?: Partial<LandingMargins>;
  readonly gates?: Partial<LandingGates>;
  readonly approach?: Partial<LandingApproach>;
  /**
   * The keys that win over the lanes (see {@link LandingModifiers}): the same `modifiers` shape as the drag intent's
   * tuning, the float key only. Default Shift floats ({@link LANDING_MODIFIERS}).
   */
  readonly modifiers?: Partial<LandingModifiers>;
  /**
   * The drag's preview, the one `previewPlan` reads: its guide level (`placeGuides`, else the mode's default,
   * `PLACE_GUIDES_DEFAULT`) is how many lanes' guides the frame names. A mode alone is `{ mode }`. Default
   * `DRAG_PREVIEW_DEFAULT` (Glide: none). The guide level has no other home: a host passes the preview here and to
   * `previewPlan`.
   */
  readonly preview?: DragPreview | PreviewMode;
}

export type { LandingRegion };

export interface LandingFrame {
  readonly region: LandingRegion;
  /** The lane held (also over its refused stretch), or null. */
  readonly lane: string | null;
  /** The spot held, or null. */
  readonly spot: string | null;
  /** The held place a release now lands (the screen's: what the host draws), or null at rest. */
  readonly held: LandingHeld | null;
  /** Where a release now lands: `landingOf(held)`; null where it lands nowhere (the item goes home). */
  readonly landing: Rect | null;
  /** The room is open: a spot is held in a lane, the float key not held. */
  readonly room: boolean;
  /**
   * The lanes whose place guides show, each with the held place its guide stands for: the frame's `held` (the screen), or,
   * for the Near lane before entry (pending or approached), the held place the pointer would land there (the spot it picks
   * along it). The host's geometry draws them (`@n-uf/docking`'s `guides(frame)`).
   */
  readonly guides: readonly LandingGuideRef[];
  /** The float key (`modifiers.floatKey`, Shift by default) held: the region is open space wherever it was a lane or open space. */
  readonly shift: boolean;
  /**
   * The lane the pointer is inside but hasn't entered (its gate not passed yet: a fast pass, or the moment before a slow
   * step), else absent. A host shows no "Can't go here" while it is set, though a release now lands nowhere: the place
   * under the pointer is a lane's, not a refused one.
   */
  readonly pending?: string;
}

/**
 * What a release lands: the last frame's held place (a spot with the pointer, `home` when it lands at the item's own place;
 * the float at the pointer), or nothing. The host commits that held place's layout (`@n-uf/docking`'s `after(release)`).
 */
export type LandingRelease =
  | { readonly kind: "spot"; readonly lane: string; readonly spot: string; readonly point: Point; readonly home: boolean }
  | { readonly kind: "float"; readonly point: Point }
  | null;

export interface LandingModel {
  update(point: Point, time: number, keys?: DragKeys): LandingFrame;
  /**
   * What a release at `point` and `time` lands: the same answer as the last frame's `landing`. A point that differs
   * from the last `update`'s is that update's sample first (with `keys`, else the last keys), so a last jump counts.
   */
  release(point: Point, time: number, keys?: DragKeys): LandingRelease;
  /**
   * The geometry changed (a resize, a store change, a scroll): the new state's regions and readers, whole. Spots map by
   * id; a lost one goes to its lane's nearest.
   */
  setGeometry(geometry: LandingGeometry): void;
  /** The view moved under the pointer: the gates start again, the lane is let go. */
  hide(): void;
  readonly frame: LandingFrame;
}

const inside = (r: Rect, p: Point, grow = 0): boolean => p.x >= r.x - grow && p.x <= r.x + r.width + grow && p.y >= r.y - grow && p.y <= r.y + r.height + grow;
const strictlyIn = (r: Rect, p: Point): boolean => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
/**
 * How deep `p` lies inside `lane` (0 on its edge or outside): measured across the lane, from its two sides parallel to
 * its axis (a rail's long sides, a bar's), and only from those that face into `stage`: a side on the stage's edge is
 * open, as deep as the pointer can go. The lane's ends along its own axis never count, wherever they lie (a rail's end
 * that meets a bar is no wall), so the depth is the same all along the lane.
 */
function depthIn(lane: LandingLane, p: Point, stage: Rect): number {
  const r = lane.rect;
  if (!strictlyIn(r, p)) return 0;
  const on = (a: number, b: number): boolean => Math.abs(a - b) < 1;
  const sides =
    lane.axis === "x"
      ? [on(r.y, stage.y) ? Infinity : p.y - r.y, on(r.y + r.height, stage.y + stage.height) ? Infinity : r.y + r.height - p.y]
      : [on(r.x, stage.x) ? Infinity : p.x - r.x, on(r.x + r.width, stage.x + stage.width) ? Infinity : r.x + r.width - p.x];
  return Math.max(0, Math.min(...sides));
}
const lerp = (a: Point, b: Point, u: number): Point => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });
/** Where the step from `a` (outside `r`) to `b` (inside it) crosses into `r`, as a share of the step (0 to 1). */
function entryOf(r: Rect, a: Point, b: Point): number {
  const enter = (from: number, to: number, lo: number, hi: number): number => (from < lo ? (lo - from) / (to - from) : from > hi ? (hi - from) / (to - from) : 0);
  return Math.min(1, Math.max(0, enter(a.x, b.x, r.x, r.x + r.width), enter(a.y, b.y, r.y, r.y + r.height)));
}
const distanceTo = (r: Rect, p: Point): number => Math.hypot(Math.max(r.x - p.x, 0, p.x - (r.x + r.width)), Math.max(r.y - p.y, 0, p.y - (r.y + r.height)));
const alongOf = (lane: LandingLane, p: Point): number => (lane.axis === "x" ? p.x : p.y);
const acrossOf = (lane: LandingLane, p: Point): number => (lane.axis === "x" ? p.y : p.x);
/** Two rects meet: they overlap or touch (within 1 px), corners included. */
const touches = (a: Rect, b: Rect): boolean => a.x <= b.x + b.width + 1 && b.x <= a.x + a.width + 1 && a.y <= b.y + b.height + 1 && b.y <= a.y + a.height + 1;
/** `p` onto `stage` when it lies past it by at most `reach`; else null (nowhere). */
function ontoStage(stage: Rect, p: Point, reach: number): Point | null {
  if (!inside(stage, p, reach)) return null;
  return { x: Math.min(Math.max(p.x, stage.x), stage.x + stage.width), y: Math.min(Math.max(p.y, stage.y), stage.y + stage.height) };
}

export function createLandingModel(options: LandingOptions): LandingModel {
  const margins = { ...LANDING_MARGINS, ...options.margins };
  const gates = { ...LANDING_GATES, ...options.gates };
  const approach = { ...LANDING_APPROACH, ...options.approach };
  const modifiers = { ...LANDING_MODIFIERS, ...options.modifiers };
  const guidesLevel: PlaceGuides = guidesOf(options.preview ?? DRAG_PREVIEW_DEFAULT);
  let base = options.regions;
  let landingOf = options.landingOf;
  let spotsOf = options.spotsOf;
  const cache = new Map<string, readonly LandingSpot[] | null>();
  /**
   * `lane` with `spot` held: its stretches in that spot's own layout (`spotsOf`, asked once per spot until the geometry
   * changes), else as seen.
   */
  const heldLaneOf = (lane: LandingLane, spot: string | null): LandingLane => {
    if (!spot || !spotsOf) return lane;
    if (!cache.has(spot)) cache.set(spot, spotsOf(spot));
    const spots = cache.get(spot);
    return spots ? { ...lane, spots } : lane;
  };

  let laneId: string | null = options.home?.lane ?? null;
  let spotId: string | null = options.home?.spot ?? null;
  let last: { p: Point; raw: Point; t: number } | null = null;
  /** The last point that differed from the one before, and the step then. */
  let moved: { raw: Point; t: number } | null = null;
  /** Where the item was lifted (`lift`, else the first point), fixed for the drag: back there, no owning lane takes it. */
  let liftAt: Point | null = options.lift ?? null;
  /** Whether the pointer is held in the lift zone (`nearLift`). */
  let inLiftZone = true;
  /** The lift is a float's: no `home` option and no spot marked home in the lanes at the lift (a docked item has one). */
  const floatLift = !options.home && !options.regions.lanes.some((l) => l.spots.some((s) => s.home));
  /** Whether a float lift has left its lift zone: once, for good (`floatZone`). */
  let floatLeft = false;
  /** Whether the held lane's hold is refused for lying far beyond it (sticky, as the lift zone is). */
  let farHeld = false;
  /**
   * The hand read faster than `gates.slideSpeed` (a fling), and hasn't settled since: until it has read slow (at most
   * `gates.stepSpeed`, or resting) for `pause` ms from `slowFrom`, no lane is entered by a slow-step gate (still,
   * over-refused).
   */
  let flung = false;
  let slowFrom: number | null = null;
  let lastStep = 0;
  /** The hand's speed (`createHandSpeed`): the one estimate every gate that asks "fast or slow" reads. */
  const hand = createHandSpeed({ gap: Math.min(HAND_SPEED.gap, gates.pause), still: Math.min(HAND_SPEED.still, gates.rest) });
  /** The keys the last `update` had: a release at a new point samples with them unless it names its own. */
  let lastKeys: DragKeys | undefined;
  /** Path inside each lane since the pointer last entered its rect. */
  const pathIn = new Map<string, number>();
  /** The path along and across each lane at any speed since the pointer entered it (a touching lane's takeover). */
  const slide = new Map<string, { along: number; across: number }>();
  /** The owning lanes the pointer has been outside since the lift: only those may take it (it came into them). */
  const cameIn = new Set<string>();
  let approached: string | null = null;
  /** The lane pending on the last frame: it stays pending while the pointer stays inside it (`pendingIn`). */
  let lastPending: string | null = null;
  /**
   * The pending lane among `here` (the lanes the pointer is strictly inside): the one pending on the last frame while it
   * is among them, until another is deeper by `margins.spot`; else the deepest. So at a corner where two lanes overlap
   * a wobble never flips the pending lane, nor its guides.
   */
  const pendingIn = (here: readonly LandingLane[], p: Point, stage: Rect): string => {
    const deepest = here.reduce((a, b) => (depthIn(b, p, stage) > depthIn(a, p, stage) ? b : a));
    const kept = here.find((l) => l.id === lastPending);
    return kept && depthIn(deepest, p, stage) <= depthIn(kept, p, stage) + margins.spot ? kept.id : deepest.id;
  };
  let previous: LandingRegion = laneId ? "lane" : "open";
  let frame: LandingFrame = { region: previous, lane: laneId, spot: spotId, held: null, landing: null, room: !!spotId, guides: [], shift: false };
  /** The spot the last frame lands on, as its lane lists it, or null. */
  let landedOn: LandingSpot | null = null;

  const laneIn = (regions: LandingRegions, id: string | null): LandingLane | undefined => (id ? regions.lanes.find((l) => l.id === id) : undefined);
  const spotIn = (lane: LandingLane | undefined, id: string | null): LandingSpot | undefined => (lane && id ? lane.spots.find((s) => s.id === id) : undefined);

  /** The spot a point along `lane` picks: the spot whose stretch holds it, null over a refused stretch, else the nearest. */
  function pick(lane: LandingLane, a: number): LandingSpot | null {
    if (lane.refused.some((r) => a >= r.along[0] && a <= r.along[1])) return null;
    const hit = lane.spots.find((s) => a >= s.along[0] && a <= s.along[1]);
    if (hit) return hit;
    let best: LandingSpot | null = null;
    let dist = Infinity;
    for (const s of lane.spots) {
      const d = a < s.along[0] ? s.along[0] - a : a - s.along[1];
      if (d < dist) {
        best = s;
        dist = d;
      }
    }
    return best;
  }

  /** Along a held lane: the spot after hysteresis, the step gate and the fixed-point check. */
  function along(lane: LandingLane, p: Point, step: number): LandingSpot | null {
    const held = heldLaneOf(lane, spotId);
    const a = alongOf(held, p);
    const now = spotIn(held, spotId);
    const cand = pick(held, a);
    if (!cand) return null;
    if (!now || cand.id === now.id) return cand;
    // Past the boundary by the margin, the same everywhere (a wobble within it never flips the spot); where the change
    // moves another item, on a slow enough step. Else the last spot holds.
    const past = a < now.along[0] - margins.spot || a > now.along[1] + margins.spot;
    const reflows = now.others === undefined || now.others !== cand.others;
    if (!past) return now;
    // A fast reflowing change waits for a slow step, unless the held landing already trails the pointer by `trail`: the
    // item chases only as far as it must, so a fast hand across docked items never leaves it far behind.
    if (reflows && step > gates.stepSpeed && distanceTo(landingOf({ kind: "spot", lane: lane.id, spot: now.id, point: p }) ?? now.landing, p) <= gates.trail) return now;
    // The fixed point: with the candidate held (its room open), the pointer still picks it along the lane.
    if (spotsOf && reflows) {
      const lane2 = heldLaneOf(lane, cand.id);
      if (pick(lane2, alongOf(lane2, p))?.id !== cand.id) return now;
    }
    return cand;
  }

  /**
   * The lanes whose guides show, each with the held place its guide stands for. `"near"`: the Near lane only; `"all"`: every
   * lane. The Near lane held stands for the frame's held place; pending or approached, for the held place the pointer would land in
   * there (the spot it picks along it), so its guide before entry is its mark after it. Every other lane stands for the
   * frame's held place (the screen). The geometry draws them; the model does none.
   */
  function guidesFor(p: Point, region: LandingRegion, shift: boolean, pending: string | null, held: LandingHeld | null): LandingFrame["guides"] {
    if (guidesLevel === "off" || shift) return [];
    const near = nearLane(p, region, pending, base);
    const wouldLand = (l: LandingLane): LandingHeld | null => {
      if (l.id === laneId) return held;
      const s = pick(l, alongOf(l, p));
      return s ? { kind: "spot", lane: l.id, spot: s.id, point: p } : held;
    };
    if (guidesLevel === "near") return near ? [{ lane: near.id, held: wouldLand(near) }] : [];
    // "all": with no Near lane, the lane nearest the pointer within `reach` stands for its would-land held place too, for the
    // corner only (it isn't made Near, pending or enterable): its guide is what entry draws, and it owns the corners it
    // meets. The switch lies exactly at `reach` of its rect.
    let owner = near;
    if (!owner) {
      let d = approach.reach;
      for (const l of base.lanes) {
        const dl = distanceTo(l.rect, p);
        if (dl <= d) {
          owner = l;
          d = dl;
        }
      }
    }
    return base.lanes.map((l) => ({ lane: l.id, held: owner && l.id === owner.id ? wouldLand(l) : held }));
  }

  /**
   * The lane whose guides the Near rule shows, or null: the held lane (also over its own refused stretch), else the
   * pending one, else, with the pointer in open space, the approached one (kept with hysteresis).
   */
  function nearLane(p: Point, region: LandingRegion, pending: string | null, regions: LandingRegions): LandingLane | null {
    // The held lane's, also over its own refused stretch.
    if ((region === "lane" || region === "refused") && laneId) {
      approached = laneId;
      return laneIn(regions, laneId) ?? null;
    }
    // The pending lane's: the pointer is inside it, its gate not passed (the place under it, a refused one too, is its).
    if (pending) {
      approached = pending;
      return laneIn(regions, pending) ?? null;
    }
    // Only in open space the approach counts: over a refused place outside every lane, or nowhere, no lane's guides show.
    if (region !== "open") {
      approached = null;
      return null;
    }
    let best: LandingLane | null = null;
    let bestD = Infinity;
    for (const l of regions.lanes) {
      const d = distanceTo(l.rect, p);
      if (d < bestD) {
        best = l;
        bestD = d;
      }
    }
    // The approached lane: the nearest within reach, kept until another is clearly nearer or it is past `keep` (at least
    // `reach`: a lane acquired within reach is never dropped at once). Acquired only within `max(reach - margins.spot,
    // reach / 2)`, so a pointer wobbling at the reach's edge never blinks the guide (a band between acquiring and letting
    // go), and a small reach or wide touch margins still leave half the reach to acquire in.
    const acquire = Math.max(0, approach.reach - margins.spot, approach.reach / 2);
    const kept = laneIn(regions, approached);
    if (kept) {
      const d = distanceTo(kept.rect, p);
      if (d > Math.max(approach.keep, approach.reach)) approached = null;
      else if (best && best.id !== kept.id && bestD + approach.nearer < d) approached = bestD <= acquire ? best.id : null;
    } else approached = best && bestD <= acquire ? best.id : null;
    return laneIn(regions, approached) ?? null;
  }

  function update(raw: Point, t: number, keys?: DragKeys): LandingFrame {
    lastKeys = keys;
    // Past the stage by up to `edge`: on its edge. Beyond: nowhere (kept as is).
    const p = ontoStage(base.stage, raw, margins.edge) ?? raw;
    // The step: the pointer's speed as it moved (a fling past the edge isn't still) since the last point that differed,
    // px/ms. A repeated point (a host updating per frame, or a gap between sparse samples) keeps the last step until the
    // pointer has stayed put for `rest` ms after a slow step or on the stage's edge, else for `pause` ms; only then is it
    // still. A hand moving fast with samples far apart is never still between them.
    let step = 0;
    if (moved && (raw.x !== moved.raw.x || raw.y !== moved.raw.y)) {
      const before = moved.t;
      moved = { raw, t };
      hand.push(raw, t);
      // The step across a gap (40 ms or `pause`, the smaller) may end a rest, so it says nothing about how the hand moves
      // now: unknown, never a slow step (a fling out of a rest docks nowhere on its first frame), unless it is no longer
      // than `HAND_SPEED.slowStep` (3) px (a hand creeping a pixel at a time, which is slow). The hand's speed reads
      // across a gap the pointer moved on through (frames the host lost), so a slide through it counts on.
      step = hand.step;
      lastStep = step;
      // A fling (the hand reading faster than `slideSpeed`) unsettles it; it is slow again from the last sample before it
      // reads slow (at most `stepSpeed`). A step the hand's speed can't read yet (the first after a rest) is neither.
      const sp = hand.speed;
      if (Number.isFinite(sp) && sp > gates.slideSpeed) {
        flung = true;
        slowFrom = null;
      } else if (!Number.isFinite(sp) || !Number.isFinite(step) || sp > gates.stepSpeed) slowFrom = null;
      else slowFrom ??= before;
    } else if (moved) {
      const stage = base.stage;
      const onEdge = p.x <= stage.x || p.y <= stage.y || p.x >= stage.x + stage.width || p.y >= stage.y + stage.height;
      const since = t - moved.t;
      step = since >= gates.pause || (since >= gates.rest && (lastStep <= gates.stepSpeed || onEdge)) ? 0 : lastStep;
      // The hand sees the pointer standing still: a gap it ends is a rest, whatever the pointer moves across it.
      hand.hold(t);
      // Resting: the hand has been still since its last sample.
      slowFrom ??= moved.t;
    } else {
      // The first point: how the pointer moves is unknown, never still (a lift over a lane's band doesn't enter it).
      moved = { raw, t };
      hand.reset();
      hand.push(raw, t);
      // (After `hide()` too, the lift point stays where the drag began.)
      liftAt ??= p;
      step = lastStep = Infinity;
    }
    // Settled again once slow for `pause` since the fling: only then do the slow-step gates (still, over-refused) count.
    // On the stage's edge a fling is taken at once, as the still gate's `rest` says: the edge is where a fling docks.
    if (flung && slowFrom !== null && t - slowFrom >= gates.pause) flung = false;
    const edgeStage = base.stage;
    const settled = !flung || p.x <= edgeStage.x || p.y <= edgeStage.y || p.x >= edgeStage.x + edgeStage.width || p.y >= edgeStage.y + edgeStage.height;
    const from = last?.p ?? null;
    // The pointer as it moved: a fling off the stage's edge moves across a lane there though its clamped point doesn't.
    const fromRaw = last?.raw ?? null;
    last = { p, raw, t };
    const shift = modifiers.on && isHeld(keys, modifiers.floatKey);
    // A float lift (`floatLift`): within `lift` of the press no lane takes the pointer (the frame is judged as if the regions
    // had no lanes: blocked and refused places as on any frame), until the pointer first lies farther than `lift`; once
    // left it is never re-entered, so a slide back through the press point changes nothing (a held lane stays held).
    if (floatLift && liftAt && Math.hypot(p.x - liftAt.x, p.y - liftAt.y) > (margins.lift ?? 16)) floatLeft = true;
    const floatZone = floatLift && !floatLeft && !!liftAt;
    const regions = floatZone ? { ...base, lanes: [] } : base;
    // The path inside each lane: the part along the lane of slow steps from a point inside it to another (the step that
    // enters doesn't count, nor a fast one), so a crossing at `stepSpeed` or faster never enters by path at any angle.
    // From a held lane, a touching lane counts the path along it and across it while the hand reads steady and no
    // faster than `slideSpeed` (`hand`): a brisk slide along it (across it at most a third as far as along) is no
    // crossing. (The slow path counts a step at most `stepSpeed`, as the hand's speed reads it: a jittered fling never;
    // nor a step across a gap, which may end a rest, though the hand's speed reads across frames the host lost.)
    const slow = Number.isFinite(step) && (Number.isFinite(hand.speed) ? hand.speed <= gates.stepSpeed : step <= gates.stepSpeed);
    for (const l of regions.lanes) {
      const was = from && strictlyIn(l.rect, from);
      const go = was ? Math.abs(alongOf(l, p) - alongOf(l, from)) : 0;
      const over = was && fromRaw ? Math.abs(acrossOf(l, raw) - acrossOf(l, fromRaw)) : 0;
      const inL = strictlyIn(l.rect, p);
      pathIn.set(l.id, inL ? (pathIn.get(l.id) ?? 0) + (slow ? go : 0) : 0);
      const s = slide.get(l.id);
      // Only a steady hand no faster than `slideSpeed` adds to the count: a fling (or a hand gathering speed out of a rest
      // or a hesitation, or one the speed can't read yet) adds nothing and resets nothing. So a fling never counts, even
      // where its timestamps jitter, while a steady slide whose timestamps jitter keeps its count. It counts from where
      // the pointer crossed into the lane: the step that enters adds its part inside it, so a step the host lost frames
      // of across the lane's edge counts what those frames would have.
      const counts = hand.steady && hand.speed <= gates.slideSpeed;
      const u = !was && inL && from && fromRaw ? entryOf(l.rect, from, p) : 0;
      const by =
        was ? { along: go, across: over }
        : u > 0 && from && fromRaw ? { along: Math.abs(alongOf(l, p) - alongOf(l, lerp(from, p, u))), across: Math.abs(acrossOf(l, raw) - acrossOf(l, lerp(fromRaw, raw, u))) }
        : { along: 0, across: 0 };
      slide.set(l.id, !inL ? { along: 0, across: 0 } : counts ? { along: (s?.along ?? 0) + by.along, across: (s?.across ?? 0) + by.across } : (s ?? { along: 0, across: 0 }));
      if (l.owns && !inL) cameIn.add(l.id);
    }

    let region: LandingRegion;
    let pending: string | null = null;
    if (!inside(regions.stage, p)) {
      // Outside the stage: nowhere, and the lane is let go.
      region = "nowhere";
      laneId = spotId = null;
    } else {
      const held = laneIn(regions, laneId);
      // (The still gate, like the over-refused rule, waits for a flung hand to settle.)
      const gate = (l: LandingLane): boolean => (pathIn.get(l.id) ?? 0) >= gates.path || (depthIn(l, p, regions.stage) >= gates.depth && step <= gates.stillSpeed && settled);
      // Lane to lane: inside a lane touching the held one, past the held lane's exit margin (inside it the held lane holds,
      // P1), the held lane still holds until that lane's gate passes, then that lane takes it. Never the float between
      // them, never a fly-through's room.
      const touching = held ? regions.lanes.find((l) => l.id !== held.id && strictlyIn(l.rect, p) && touches(l.rect, held.rect) && !inside(held.rect, p, margins.exit)) : undefined;
      const sl = touching ? slide.get(touching.id) : undefined;
      // A fling (the hand's speed above `slideSpeed`) is no entry, along the lane as well as across it.
      const slid = !!sl && sl.along >= gates.path && sl.across * 3 <= sl.along && hand.speed <= gates.slideSpeed;
      // A lane that owns its rect (a rail drop strip) takes the pointer inside it from any lane it overlaps, a held one
      // too, once its own gate passes (so a pass across it opens nothing), and only once the pointer came into it (it has
      // been outside it since the lift): a press in a column's outer edge, or a slow reorder along it, stays in the column.
      // Never within `lift` of where the item was lifted: away and back there is home, wherever a strip lies, while the
      // rest of the strip (all of it over a lone panel's own place) still takes it.
      // The zone is held, like a held lane: the drag starts in it, leaves it past `lift` of the lift point and
      // re-enters it only within `lift - spot`, so a wobble at its edge never flips a cut that lies near the press.
      const liftR = margins.lift ?? 16;
      if (liftAt) {
        const far = Math.hypot(p.x - liftAt.x, p.y - liftAt.y);
        inLiftZone = far <= (inLiftZone ? liftR : Math.max(0, liftR - margins.spot));
      }
      const nearLift = !!liftAt && inLiftZone;
      const owner = nearLift ? undefined : regions.lanes.find((l) => l.owns && l.id !== held?.id && cameIn.has(l.id) && strictlyIn(l.rect, p) && gate(l));
      // The lift zone is the item's own lane's: within `lift` of where it was lifted, in whatever lane the pointer came
      // through, the lane choice is the home lane (when the pointer lies in it, as the lift point did), and its spot the
      // item's own. So away and back to the lift point is home on every layout, a plain lane's band lying over the home
      // lane's corner included.
      const ownLane = nearLift && options.home ? laneIn(regions, options.home.lane) : undefined;
      const homeHere = ownLane && strictlyIn(ownLane.rect, p) ? ownLane : undefined;
      // The lanes the pointer is inside (within the lift zone an owning lane is no lane at all), and the over-refused
      // rule: over a place that takes nothing reaching past the lane (a column's panel under an empty rail's band), in no
      // other lane, a lane is entered on a slow step only (a fly-through opens no room). Entering reads it, and so does a
      // touching lane's takeover: a held lane never pre-empts it.
      const lanesHere = regions.lanes.filter((l) => strictlyIn(l.rect, p) && !(l.owns && nearLift));
      const within = (b: Rect, l: LandingLane): boolean => b.x >= l.rect.x - 1 && b.y >= l.rect.y - 1 && b.x + b.width <= l.rect.x + l.rect.width + 1 && b.y + b.height <= l.rect.y + l.rect.height + 1;
      const overRefused = (l: LandingLane): boolean =>
        Number.isFinite(step) && step <= gates.stepSpeed && settled && lanesHere.length === 1 && [...regions.blocked, ...regions.refused].some((b) => strictlyIn(b, p) && !within(b, l));
      const next = homeHere ? undefined : (owner ?? (touching && (gate(touching) || slid || overRefused(touching)) ? touching : undefined));
      // (The far refusal belongs to the held lane's hold: any other branch lets it go.)
      if (!(held && !homeHere && !next && (touching || inside(held.rect, p, margins.exit)))) farHeld = false;
      if (homeHere) {
        // Its spot is the item's own (a hand within the lift zone is at home: the home spot owns it, so a pointer coming
        // in a few px short of the lift point, or held at its edge by a grab at the item's far end, is not on a
        // neighbor's stretch); a lane that lost the id picks along it as entering does.
        const s = spotIn(homeHere, options.home!.spot) ?? pick(homeHere, alongOf(homeHere, p));
        laneId = homeHere.id;
        spotId = s?.id ?? null;
        region = s ? "lane" : "refused";
      } else if (held && !next && (touching || inside(held.rect, p, margins.exit))) {
        // The hold through a touching lane is for crossing a corner: more than `path` past the held lane's exit margin
        // (a fling up a rail that didn't enter it), the frame is held but refused: the lane kept (its guides stay), no
        // spot, no landing, nothing pending, so the host shows its tag and a release goes home. Sticky, like the lift
        // zone: set past `exit + path`, cleared only within `exit + path - spot`, so a wobble at its edge never flips it.
        const d = distanceTo(held.rect, p);
        farHeld = farHeld ? d > margins.exit + gates.path - margins.spot : d > margins.exit + gates.path;
        const far = farHeld;
        const s = far ? null : along(held, p, step);
        spotId = s?.id ?? spotId;
        region = s ? "lane" : "refused";
        if (!s) spotId = null;
        // Past its own rect, a held lane that refuses still holds (lane to lane never passes through the float), but
        // the pointer is in another lane it hasn't entered yet: that lane is pending, so a host shows no "Can't go here"
        // in a lane's first pixels when the pointer comes in over a refused stretch next to it.
        if (!s && !far && !strictlyIn(held.rect, p)) {
          const others = regions.lanes.filter((l) => l.id !== held.id && strictlyIn(l.rect, p));
          if (others.length > 0) pending = pendingIn(others, p, regions.stage);
        }
      } else {
        laneId = spotId = null;
        // Entering: a touching lane at once, else the path gate or the still gate; at a tie, the lane the pointer is
        // deeper in. Over a refused place (a lane's band over a column that takes nothing, an empty side rail's) a lane is
        // entered at once, never on the lift: there is nothing else the pointer can mean there, and nothing to fly
        // through to.
        // (Over something that takes nothing reaching past the lane, a column's panel under an empty rail's band, and in
        // no other lane; a drawn bar's own rect and its items lie within it, so its gate holds.)
        // Within the lift zone an owning lane is no lane at all: by no gate does it take the pointer there.
        let entered: LandingLane | null = next ?? null;
        if (!entered)
          for (const l of lanesHere) {
            const deep = depthIn(l, p, regions.stage);
            if ((gate(l) || overRefused(l)) && (!entered || deep > depthIn(entered, p, regions.stage))) entered = l;
          }
        // Inside a lane not entered yet: no refused place to say so of, whatever lies under it.
        if (!entered && lanesHere.length > 0) pending = pendingIn(lanesHere, p, regions.stage);
        if (entered) {
          laneId = entered.id;
          const s = pick(entered, alongOf(entered, p));
          spotId = s?.id ?? null;
          region = s ? "lane" : "refused";
        } else if (regions.refused.some((r) => inside(r, p))) region = "refused";
        else if (inside(regions.content, p) && !regions.blocked.some((b) => strictlyIn(b, p))) region = "open";
        // Inside a lane not yet entered: what it was (on the way in, the document's float).
        else if (regions.lanes.some((l) => strictlyIn(l.rect, p))) region = previous === "lane" ? "open" : previous;
        else region = "refused";
      }
    }
    // (A zone frame inside a real lane leaves `previous` as it was: the zone's lane-less verdict is not carried past it.)
    previous = floatZone && base.lanes.some((l) => strictlyIn(l.rect, p)) ? previous : region;
    lastPending = pending;
    const shown: LandingRegion = shift && (region === "lane" || region === "open") ? "open" : region;
    const lane0 = laneIn(base, laneId);
    const heldLane = lane0 ? heldLaneOf(lane0, spotId) : undefined;
    const spot = spotIn(heldLane, spotId);
    landedOn = shown === "lane" && spot ? spot : null;
    // The held place a release lands now, and where it lands: the geometry's (a sliding spot's landing follows the hand).
    const held: LandingHeld | null = shown === "lane" ? (spot && laneId ? { kind: "spot", lane: laneId, spot: spot.id, point: p } : null) : shown === "open" ? { kind: "float", point: p } : null;
    const landing = held ? landingOf(held) : null;
    frame = {
      region: shown,
      lane: laneId,
      spot: shown === "lane" ? spotId : null,
      held: held && (held.kind === "spot" || landing) ? held : null,
      landing,
      room: shown === "lane" && !!spot,
      guides: guidesFor(p, shown, shift, pending && shown !== "lane" ? pending : null, held && (held.kind === "spot" || landing) ? held : null),
      shift,
      ...(pending && shown !== "lane" ? { pending } : {}),
    };
    return frame;
  }

  return {
    update,
    release(point: Point, time: number, keys?: DragKeys): LandingRelease {
      // The last update's sample is the release's: a point that differs from it is one more sample first.
      if (!last || last.raw.x !== point.x || last.raw.y !== point.y) update(point, time, keys ?? lastKeys);
      const s = frame.held;
      if (s?.kind === "spot" && frame.region === "lane") {
        // Home only at the item's own place: its own spot, landing where it lies (a sliding spot anywhere else on its
        // stretch moves it).
        const ownSpot = !!options.home && options.home.spot === s.spot && options.home.lane === s.lane;
        const at = frame.landing;
        const home = ownSpot && !!landedOn && !!at && Math.max(Math.abs(at.x - landedOn.landing.x), Math.abs(at.y - landedOn.landing.y), Math.abs(at.width - landedOn.landing.width), Math.abs(at.height - landedOn.landing.height)) < 1e-6;
        return { kind: "spot", lane: s.lane, spot: s.spot, point: s.point, home };
      }
      if (s?.kind === "float" && frame.region === "open" && frame.landing) return { kind: "float", point: s.point };
      return null;
    },
    setGeometry(geometry: LandingGeometry): void {
      base = geometry.regions;
      landingOf = geometry.landingOf;
      spotsOf = geometry.spotsOf;
      cache.clear();
      const l = laneIn(base, laneId);
      if (laneId && !l) laneId = spotId = null;
      else if (l && spotId && !spotIn(l, spotId) && last) spotId = pick(l, alongOf(l, last.p))?.id ?? null;
    },
    hide(): void {
      laneId = spotId = null;
      approached = null;
      lastPending = null;
      farHeld = false;
      flung = false;
      slowFrom = null;
      pathIn.clear();
      slide.clear();
      cameIn.clear();
      last = moved = null;
      lastStep = 0;
    },
    get frame(): LandingFrame {
      return frame;
    },
  };
}
