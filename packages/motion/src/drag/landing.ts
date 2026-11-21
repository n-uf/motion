import type { Point, Rect } from "../shapes";
import { guideRects, LINE_THICKNESS, MIN_BOX_LENGTH } from "./guide-rects";
import { createHandSpeed, HAND_SPEED } from "./hand-speed";
import type { DragKeys } from "./intent";
import type { PlaceGuides } from "./preview";
import type { LandingRegion } from "./region";

/**
 * The landing model: where a docking drag's item lands, as state rather than a per-frame guess. A host gives it the
 * drag's regions (from `@n-uf/docking`'s `lanes()`: plain data, the shapes below) and each pointer sample; it
 * says the region the pointer is in, the lane and spot held, where the item lands, whether the room is open, and the
 * place guides. Every change comes from where the pointer is and how it moved (margins, a path length, a step size):
 * the model has no waits of its own.
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
 *   never reads slow; a gap of 40 ms or more (a rest, a hesitation) starts the hand again, so a rest is never averaged
 *   into the next fling; and a slide counts only while the hand reads steady (not gathering speed). A host sampling
 *   slower than 25 Hz (every step a gap) slides into a touching lane only by its own gates. A lane that owns
 *   its rect (`owns`: a rail drop strip at the window's side) takes the pointer inside it from any lane it overlaps, a
 *   held one too, once its own gate passes and only once the pointer came into it from outside since the lift. Within
 *   `margins.lift` of the lift point (`options.lift`, else the first point; fixed for the drag) an owning lane takes the
 *   pointer by no gate, so a pointer brought back there is in the item's own lane, not the strip. Elsewhere in the strip
 *   a slow slide along it can take the pointer before it is back at the lift point. More generally, within
 *   `margins.lift` of the lift point the lane is the item's own (`home.lane`) whenever the pointer lies in it, whatever
 *   lane the pointer came through (a plain lane's band over the home lane's corner included), and its spot is the
 *   item's own (`home.spot`; a sliding one still lets the landing follow the hand and snap): away and back to where the
 *   item was lifted is home on every layout, so no nudge to a neighboring spot is reachable within `lift` of the press.
 *   The zone is a held state like a held lane: the drag starts in it, leaves it past `lift` and re-enters only within
 *   `lift - spot`, so a wobble at its edge never flips a cut near the press.
 * - **Along a lane** the spot changes once the pointer is `spot` px past the boundary; where the change moves another
 *   item (the two spots' `others` keys differ), on a step of at most `stepSpeed`, or once the held landing trails the
 *   pointer by more than `trail`: the item chases only as far as it must. A change that moves only the held item
 *   follows the hand at any speed. With `regionsFor`, a reflowing change is kept only if, in the new spot's own regions
 *   (its room open), the pointer still lies in that spot's stretch: the room shifting the boundary never bounces it.
 * - **A sliding spot** (`slide`: a free stretch as one spot) lands where the hand is: its landing moved along the lane to
 *   the pointer less the grab (`grab`), clamped to its range, and snapped to its ends, the item's own place or a dock
 *   inside within `snapDistance`. Nothing reflows inside it, so there are no steps there; a step comes only where the
 *   order changes (passing a neighbor), as between any two spots. A release reads where it starts (`at`) once.
 * - **Outside every lane:** a refused place, refused; open space (`"open"`: the content less what blocks it, the page),
 *   the float at its landing; outside the stage (past `edge`), nowhere; else (docked content that takes nothing and
 *   refuses nothing) refused.
 * - **Shift** turns a lane or open space into open space (the float), and hides the guides.
 * - **Guides** are the lane's `marks` (lines between items, a box per free stretch, in the layout as drawn), else its
 *   spots' landings. `"near"` shows a lane only where the pointer can enter it: the held lane's (also over its own
 *   refused stretch); else the pending lane's (the pointer inside it, its gate not passed: a release floats or goes
 *   home); else, with the pointer in open space, the approached lane's (the nearest within `reach`, by default the
 *   entry margin `exit`, acquired within `max(reach - spot, reach / 2)` and kept to `reach`, so it never blinks at the
 *   edge: a release floats). Over a refused place outside every lane no guide shows, however near the lane behind it
 *   lies; a host that wants the early guide sets `approach.reach` (in open space only: over a refused place none shows
 *   at any reach). That lane (the one the Near rule picks) shows its `entry` marks where it has them (docking's
 *   prediction of an empty lane's marks once entered), so its guide before entry is its mark after it. Its guide leaves
 *   out the held toolbar at the landing it takes there (held) or would take (the spot the pointer picks, a sliding
 *   spot's start from the grab), never at its floating rect, so a host passes no held rect in `guideRects`' `clear`; a
 *   part that cut leaves no longer than `MIN_BOX_LENGTH` (the padding before a clamped landing) is not drawn. `"all"`
 *   shows every lane's; the lane the Near rule picks shows its `entry` and owns the corners it shares: each lane it
 *   names in `corners` is cut by what the owner draws (its guide, less the landing), by the interval subtraction of
 *   `guideRects`, but only where that mark covers the lane's marks across their whole thickness; otherwise the named
 *   lane keeps the corner and the owner's mark gives the overlap up. Every mark is compared as it is drawn: inside its
 *   lane's `rect`, a line at its drawn thickness (2 px). Under `"near"` too the Near lane's `entry` is clipped to its
 *   `rect`. With no Near lane, the corner goes to the lane with `entry` nearest the pointer within `reach`, for the
 *   corner only (it isn't made Near, pending or enterable). Beyond reach of every such lane, every lane's `marks`,
 *   where the bar keeps a shared corner. No two lanes' guides overlap on any frame.
 * - Steps are speeds (px/ms) between points that differ, so the gates read the same at any input rate. A repeated
 *   point keeps the last step; it is still only once the pointer has stayed put for `rest` ms.
 * - **The pointer** is taken onto the stage by the model itself (past it by up to `edge`, onto its edge).
 *
 * **The host's part:** call `update` whenever you like: per pointer sample, per animation frame, or both. Call it at
 * least once more after the pointer stops (every frame does), so it can become still, and again with the same point
 * when a key changes. `release(point, time)` takes the release point as one more sample when it differs from the last.
 * Give `setRegions` the `regionsFor` that answers for the new state.
 */

/** A place a drop in a lane lands: its stretch of the lane and its landing rect. Ids are stable across solves. */
export interface LandingSpot {
  readonly id: string;
  readonly along: readonly [number, number];
  readonly landing: Rect;
  /**
   * Where its drop draws every other item, as a key: a change between two spots with the same key moves only the held
   * item. Absent: every change to or from it counts as moving others.
   */
  readonly others?: string;
  /**
   * A sliding spot (a free stretch exposed as one spot): over it the landing follows the pointer, `landing` moved along
   * the lane to the pointer less the grab, clamped to `[from, to]` and snapped to a point of `snaps` within
   * `snapDistance`, else on whole pixels (`step`). Absent: the landing is `landing`.
   */
  readonly slide?: LandingSlide;
}
/** A sliding spot's range: where its landing's start may lie along the lane, and the points it snaps to. */
export interface LandingSlide {
  /** The landing's start at the stretch's start (flush against the neighbor before it), px along the lane. */
  readonly from: number;
  /** The landing's start at the stretch's end (flush against the neighbor after it), px along the lane. */
  readonly to: number;
  /** The starts it snaps to: its two ends, the item's own place where it lies here, any discrete dock inside. */
  readonly snaps: readonly number[];
  /** How near a snap point the landing's start snaps to it, px (default `SNAP_DISTANCE`). */
  readonly snapDistance?: number;
  /**
   * The grain of a start that snaps to nothing, px: a multiple of `step`, clamped to `[from, to]` (default 1, whole
   * pixels; 0: wherever the pointer puts it). Give the step the spot's commit uses, so the frame, the release's `at`
   * and the commit agree.
   */
  readonly step?: number;
}
/** The grain of a sliding spot's free start, px, when it names none: whole pixels. */
const SLIDE_STEP = 1;
/** How near a sliding spot's snap point its landing snaps to it, px. */
export const SNAP_DISTANCE = 8;
/**
 * A place guide's mark, in the layout as drawn: a line between two items that touch, a box over free room the item
 * lands in, a hatch over the part of a neighbor that gives way where the room is shorter than the item.
 */
export interface LandingMark {
  /** Stable while its neighbors stay; absent, the guide is keyed by its lane and place in the list. */
  readonly id?: string;
  readonly kind: "line" | "box" | "hatch";
  readonly rect: Rect;
}
export interface LandingLane {
  readonly id: string;
  readonly rect: Rect;
  readonly axis: "x" | "y";
  readonly spots: readonly LandingSpot[];
  readonly refused: readonly { readonly along: readonly [number, number] }[];
  /** Its guides' marks; absent, its spots' landings are the guides. */
  readonly marks?: readonly LandingMark[];
  /**
   * Its marks while it is the lane the pointer picks (held, pending or approached), where they differ from `marks`: a
   * prediction of its marks once entered that owns a corner `marks` gives up (docking's `lanes()` gives it for an empty
   * lane). Shown in place of `marks` then, clipped to this lane's `rect` (a mark is drawn inside its lane), and under
   * `"all"` every lane in `corners` is cut where it overlaps what is drawn of it, if that covers the lane's marks across
   * their whole thickness; else that lane keeps the corner.
   */
  readonly entry?: readonly LandingMark[];
  /**
   * The lanes whose marks `entry` overlaps: while this lane is the one the pointer picks (or the nearest within reach)
   * each is cut where its marks overlap this lane's drawn mark, only where that mark covers them across their whole
   * thickness; otherwise the named lane keeps the corner.
   */
  readonly corners?: readonly string[];
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
  /** The held item's size. */
  readonly item: { readonly width: number; readonly height: number };
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

export interface LandingOptions {
  readonly regions: LandingRegions;
  /** The regions with `spot` held (its room open): the fixed-point check and the stretches while held. Cached per id. */
  readonly regionsFor?: (spot: string) => LandingRegions | null;
  /** The float's landing for a pointer over the document, or null where the item doesn't float. */
  readonly floatLanding?: (point: Point) => Rect | null;
  /** The item's own place at the lift: its lane and spot (the drag starts there, the room open). */
  readonly home?: { readonly lane: string; readonly spot: string };
  /** Where the item was lifted (the press), in the regions' space; default the first point `update` gets. */
  readonly lift?: Point;
  /**
   * Where the pointer holds the item, from its top left corner as it is now, px (the press's, as `lanes()` takes it).
   * Over a sliding spot the landing's start is the pointer less this, along the item's own length (its longer side; a
   * landing of another length at the same share of it); across it, and in a lane across its length, the middle.
   * Default: the middle of `regions.item`.
   */
  readonly grab?: Point;
  readonly margins?: Partial<LandingMargins>;
  readonly gates?: Partial<LandingGates>;
  readonly approach?: Partial<LandingApproach>;
  readonly placeGuides?: PlaceGuides;
}

export type { LandingRegion };

/** A guide: a mark of a lane, where to draw it now (a spot's landing is a box). */
export interface LandingGuide {
  /** Stable while its neighbors stay: the mark's id, else `<lane>/<spot id>` for a spot's landing. Key a drawing by it. */
  readonly id: string;
  readonly lane: string;
  /** A line, a box, or a hatch over a neighbor that gives way (draw it over that item, in the guides' color). */
  readonly kind: "line" | "box" | "hatch";
  readonly rect: Rect;
}

export interface LandingFrame {
  readonly region: LandingRegion;
  /** The lane held (also over its refused stretch), or null. */
  readonly lane: string | null;
  /** The spot held, or null. */
  readonly spot: string | null;
  /** Where a release now lands: the spot's landing, or the float's; null where it lands nowhere (the item goes home). */
  readonly landing: Rect | null;
  /** The room is open: a spot is held in a lane, no Shift. */
  readonly room: boolean;
  readonly guides: readonly LandingGuide[];
  /** Shift held: the region is open space wherever it was a lane or open space. */
  readonly shift: boolean;
  /**
   * The lane the pointer is inside but hasn't entered (its gate not passed yet: a fast pass, or the moment before a slow
   * step), else absent. A host shows no "Can't go here" while it is set, though a release now lands nowhere: the place
   * under the pointer is a lane's, not a refused one.
   */
  readonly pending?: string;
}

/**
 * What a release lands: a spot (`home` when it is the item's own place), the float at `rect`, or nothing. On a sliding
 * spot, `at` is where the landing starts along the lane, as the frame shows it (read once, at the release: a snap
 * point, else on the spot's `step`), and `home` holds only where that is the item's own place.
 */
export type LandingRelease =
  | { readonly kind: "spot"; readonly lane: string; readonly spot: string; readonly home: boolean; readonly at?: number }
  | { readonly kind: "float"; readonly rect: Rect }
  | null;

export interface LandingModel {
  update(point: Point, time: number, keys?: DragKeys): LandingFrame;
  /**
   * What a release at `point` and `time` lands: the same answer as the last frame's `landing`. A point that differs
   * from the last `update`'s is that update's sample first (with `keys`, else the last keys), so a last jump counts.
   */
  release(point: Point, time: number, keys?: DragKeys): LandingRelease;
  /**
   * The regions changed (a resize, a store change, a scroll): spots map by id; a lost one goes to its lane's nearest.
   * Pass the `regionsFor` that answers for the new state; without one, the old one stays (it must then read live state).
   */
  setRegions(regions: LandingRegions, regionsFor?: (spot: string) => LandingRegions | null): void;
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
  const guidesLevel: PlaceGuides = options.placeGuides ?? "off";
  let base = options.regions;
  let regionsFor = options.regionsFor;
  const cache = new Map<string, LandingRegions | null>();
  /** The regions with `spot` held: the host's, cached for this lift until `setRegions`. */
  const heldRegions = (spot: string | null): LandingRegions => {
    if (!spot || !regionsFor) return base;
    if (!cache.has(spot)) cache.set(spot, regionsFor(spot));
    return cache.get(spot) ?? base;
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
  /**
   * The hand's speed (`createHandSpeed`): the one estimate every gate that asks "fast or slow" reads. A step over a gap
   * reads slow up to what `stepSpeed` covers in 8 ms (3 px by default).
   */
  const hand = createHandSpeed({ gap: Math.min(HAND_SPEED.gap, gates.pause), slowStep: gates.stepSpeed * 8 });
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
  let frame: LandingFrame = { region: previous, lane: laneId, spot: spotId, landing: null, room: !!spotId, guides: [], shift: false };
  /** The spot the last frame lands on (in its own regions) and its lane's axis, or null. */
  let landedOn: { readonly spot: LandingSpot; readonly axis: "x" | "y" } | null = null;

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

  /**
   * Where `spot` lands for a pointer at `p` in `lane`: its landing, or on a sliding spot that landing moved along the lane
   * to the pointer less the grab, clamped to its range and snapped to the nearest snap point within its snap distance.
   */
  function landingAt(lane: LandingLane, spot: LandingSpot, p: Point, item: { readonly width: number; readonly height: number }): Rect {
    const s = spot.slide;
    if (!s) return spot.landing;
    const ax = lane.axis;
    // The grab's share along the item's own length (its longer side); across it, or a lane across its length, the middle.
    const long: "x" | "y" = item.width >= item.height ? "x" : "y";
    const size = long === "x" ? item.width : item.height;
    const g = options.grab ? (long === "x" ? options.grab.x : options.grab.y) : size / 2;
    const share = ax === long && size > 0 && Number.isFinite(g) ? Math.min(1, Math.max(0, g / size)) : 0.5;
    const length = ax === "x" ? spot.landing.width : spot.landing.height;
    const lo = Math.min(s.from, s.to);
    const hi = Math.max(s.from, s.to);
    const free = Math.min(hi, Math.max(lo, alongOf(lane, p) - share * length));
    const reach = s.snapDistance ?? SNAP_DISTANCE;
    let at = free;
    let best = Infinity;
    for (const q of s.snaps) {
      const d = Math.abs(q - free);
      if (d <= reach && d < best) {
        best = d;
        at = q;
      }
    }
    // Snapped to nothing: the spot's grain (`LandingSlide.step`), the same rounding its commit applies.
    const step = s.step ?? SLIDE_STEP;
    if (best === Infinity && step > 0) at = Math.min(hi, Math.max(lo, Math.round(free / step) * step));
    return ax === "x" ? { ...spot.landing, x: at } : { ...spot.landing, y: at };
  }

  /** Along a held lane: the spot after hysteresis, the step gate and the fixed-point check. */
  function along(lane: LandingLane, p: Point, step: number): LandingSpot | null {
    const regions = heldRegions(spotId);
    const held = laneIn(regions, lane.id) ?? lane;
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
    if (reflows && step > gates.stepSpeed && distanceTo(now.landing, p) <= gates.trail) return now;
    // The fixed point: in the candidate's own regions (its room open), the pointer still picks it.
    if (regionsFor && reflows) {
      const theirs = heldRegions(cand.id);
      const lane2 = laneIn(theirs, lane.id);
      if (lane2 && pick(lane2, alongOf(lane2, p))?.id !== cand.id) return now;
    }
    return cand;
  }

  function guidesFor(p: Point, region: LandingRegion, shift: boolean, pending: string | null, landing: Rect | null): LandingGuide[] {
    if (guidesLevel === "off" || shift) return [];
    const regions = heldRegions(spotId);
    /**
     * A lane's guides: its `marks` as they are, or while it is the lane the pointer picks (`near`) its `entry` inside its
     * rect; else a box per spot landing. What a lane returns is never clipped to its hit rect (a held layout draws its
     * marks outside it: placement keeps the hit rect as seen), but for that entry.
     */
    const all = (l: LandingLane, near = false): LandingGuide[] => {
      if (near && l.entry) return view(l, true);
      return l.marks ? l.marks.map((m, i) => ({ id: m.id ?? `${l.id}#${i}`, lane: l.id, kind: m.kind, rect: m.rect })) : view(l);
    };
    /**
     * A lane's marks as they are drawn, inside its rect (a box to the piece inside, a line kept whole or not at all, as
     * placement clips a lane's marks): the view the corner decision below compares and cuts, for the owner and for the
     * lanes it names alike. Never what a lane returns, but for a handed lane (cut from this) and the Near lane's entry.
     */
    function view(l: LandingLane, near = false): LandingGuide[] {
      const marks = near && l.entry ? l.entry : l.marks;
      if (!marks) return l.spots.map((s) => ({ id: `${l.id}/${s.id}`, lane: l.id, kind: "box" as const, rect: s.landing }));
      const box = l.rect;
      return marks.flatMap((m, i): LandingGuide[] => {
        const left = Math.max(m.rect.x, box.x);
        const top = Math.max(m.rect.y, box.y);
        const width = Math.min(m.rect.x + m.rect.width, box.x + box.width) - left;
        const height = Math.min(m.rect.y + m.rect.height, box.y + box.height) - top;
        const kept = width > m.rect.width - 1e-6 && height > m.rect.height - 1e-6;
        if (!kept && (m.kind === "line" || width <= 1e-6 || height <= 1e-6)) return [];
        return [{ id: m.id ?? `${l.id}#${i}`, lane: l.id, kind: m.kind, rect: kept ? m.rect : { x: left, y: top, width, height } }];
      });
    }
    const area = (a: Rect, c: Rect): boolean => Math.min(a.x + a.width, c.x + c.width) - Math.max(a.x, c.x) > 1e-6 && Math.min(a.y + a.height, c.y + c.height) - Math.max(a.y, c.y) > 1e-6;
    /** A guide's rect as it is drawn: a line thinner than `LINE_THICKNESS` is that thick, centered on its place. */
    const drawn = (g: LandingGuide): Rect => {
      const r = g.rect;
      const vertical = r.width <= r.height;
      const own = vertical ? r.width : r.height;
      if (g.kind !== "line" || own >= LINE_THICKNESS) return r;
      const d = (LINE_THICKNESS - own) / 2;
      return vertical ? { x: r.x - d, y: r.y, width: LINE_THICKNESS, height: r.height } : { x: r.x, y: r.y - d, width: r.width, height: LINE_THICKNESS };
    };
    /**
     * `gs` less the rects `cs`, by `guideRects`' interval subtraction; a guide they don't overlap stays as it is. With
     * `thick` a guide meets a rect by its drawn rect (a joint line is drawn 2 px thick: over a rect that took the corner
     * it is cut, not left drawn on it).
     */
    const less = (gs: readonly LandingGuide[], cs: readonly Rect[], thick = false): LandingGuide[] => {
      if (cs.length === 0) return [...gs];
      const clear = cs.map((rect) => ({ rect, clearance: 0 }));
      return gs.flatMap((g) => (cs.some((c) => area(thick ? drawn(g) : g.rect, c)) ? guideRects([g], { inside: g.rect, inset: 0, clear, minLength: 0, minThickness: 0 }) : [g]));
    };
    const near = nearLane(p, region, pending, regions);
    // The Near lane's guide less the held toolbar at the landing it takes there (held: the frame's landing) or would
    // take (pending or approached: the spot the pointer picks along it, a sliding spot's start from the grab), never
    // its floating rect: so the guide before entry is the mark after it, and a host passes no held rect.
    const wouldLand = (l: LandingLane): Rect | null => {
      if (l.id === laneId) return region === "lane" ? landing : null;
      const s = pick(l, alongOf(l, p));
      return s ? landingAt(l, s, p, regions.item) : null;
    };
    const nearGuides = (l: LandingLane): LandingGuide[] => {
      // (A lane with no marks shows its spots' landings: those are the guide, nothing to cut.)
      const at = l.marks || l.entry ? wouldLand(l) : null;
      if (!at) return all(l, true);
      // A box part this cut leaves `MIN_BOX_LENGTH` (8 px) or less along the lane (the bar's padding before a landing at
      // its clamp) is no room and is not drawn; a part the cut didn't touch is kept at any length, as `guideRects` keeps
      // one. (Left in, a host's `guideRects` would inset the stub to a few px, find it longer across the lane than along,
      // and keep it as a box across the lane, untrimmed and unthinned.)
      const longEnough = (g: LandingGuide): boolean => g.kind !== "box" || (l.axis === "x" ? g.rect.width : g.rect.height) > MIN_BOX_LENGTH;
      const whole = all(l, true);
      return less(whole, [at]).filter((g) => longEnough(g) || whole.some((w) => w.id === g.id && w.rect === g.rect));
    };
    if (guidesLevel === "near") return near ? nearGuides(near) : [];
    // "all": every lane's. The lane the pointer picks shows its marks once entered (`entry`). The corner two lanes share
    // goes to the Near lane, else to the lane nearest the pointer within `reach`, for the corner only (it isn't made
    // Near, pending or enterable): the lanes the owner names in `corners` are cut where they overlap what it draws, if
    // that covers their marks across their whole thickness, else they keep the corner. With neither, each lane's
    // `marks` (where two lanes would overlap, one already gave the corner up: the bar keeps it).
    const owns = (l: LandingLane | null | undefined): l is LandingLane => !!l && !!l.entry && !!l.corners?.length;
    let owner: LandingLane | null = owns(near) ? near : null;
    if (!owner && !near) {
      let d = approach.reach;
      for (const l of regions.lanes) {
        const dl = distanceTo(l.rect, p);
        if (owns(l) && dl <= d) {
          owner = l;
          d = dl;
        }
      }
    }
    // Where the corner goes is decided here, once, on marks as they will be drawn (`view`, `drawn`), the owner's and the
    // named lanes' alike; what a lane returns is never replaced by that view but where the corner is cut from it. The
    // owner shows its mark once entered less the landing it would take there, whether it is Near or only the corner's
    // owner by reach: the lane the pointer approaches shows what entry draws, with no jump at entry. A lane it names
    // hands the corner over only where that mark covers the lane's marks across their whole thickness; the lane is then
    // cut by exactly that mark. Else it keeps the corner and the owner's mark gives the overlap up (a lane that stops
    // short of the bar's band, or reaches only part of it, takes nothing it can't draw). Either way the named lane
    // leaves out the landing the held toolbar takes (or would take), as the owner's guide does: the stub the landing
    // leaves outside it stays the lane's.
    const ownerMarks = owner ? nearGuides(owner) : [];
    const cutBy = ownerMarks.map(drawn);
    const takes = (l: LandingLane): boolean => {
      const across = (r: Rect): readonly [number, number] => (l.axis === "x" ? [r.y, r.y + r.height] : [r.x, r.x + r.width]);
      return view(l).every((g) => {
        const mine = drawn(g);
        return cutBy.every((c) => !area(mine, c) || (across(c)[0] <= across(mine)[0] + 1e-6 && across(c)[1] >= across(mine)[1] - 1e-6));
      });
    };
    const named = owner ? owner.corners!.map((id) => regions.lanes.find((x) => x.id === id)).filter((x): x is LandingLane => !!x) : [];
    const handed = new Set(named.filter(takes).map((x) => x.id));
    const kept = named.filter((x) => !handed.has(x.id)).flatMap((x) => view(x).map(drawn));
    const at = owner && (owner.marks || owner.entry) ? wouldLand(owner) : null;
    /**
     * `gs` less the rect `r`, in two dimensions: a box keeps the pieces around it; a line it touches is shortened along
     * its length to the parts outside it, as `guideRects` shortens one (not drawn only where `r` covers all its length).
     */
    const without = (gs: readonly LandingGuide[], r: Rect | null): LandingGuide[] =>
      gs.flatMap((g) => {
        if (!r || !area(drawn(g), r)) return [g];
        const a = g.rect;
        if (g.kind === "line") {
          const vertical = a.width <= a.height;
          const from = vertical ? a.y : a.x;
          const to = from + (vertical ? a.height : a.width);
          const c0 = vertical ? r.y : r.x;
          const c1 = c0 + (vertical ? r.height : r.width);
          const spans: [number, number][] = [];
          if (c0 > from + 1e-6) spans.push([from, Math.min(to, c0)]);
          if (c1 < to - 1e-6) spans.push([Math.max(from, c1), to]);
          return spans.map(([s, e], k) => ({ ...g, id: k ? `${g.id}~l${k}` : g.id, rect: vertical ? { x: a.x, y: s, width: a.width, height: e - s } : { x: s, y: a.y, width: e - s, height: a.height } }));
        }
        const x0 = Math.max(a.x, r.x);
        const x1 = Math.min(a.x + a.width, r.x + r.width);
        const pieces: Rect[] = [];
        if (r.x > a.x) pieces.push({ x: a.x, y: a.y, width: r.x - a.x, height: a.height });
        if (r.x + r.width < a.x + a.width) pieces.push({ x: r.x + r.width, y: a.y, width: a.x + a.width - r.x - r.width, height: a.height });
        if (r.y > a.y) pieces.push({ x: x0, y: a.y, width: x1 - x0, height: r.y - a.y });
        if (r.y + r.height < a.y + a.height) pieces.push({ x: x0, y: r.y + r.height, width: x1 - x0, height: a.y + a.height - r.y - r.height });
        return pieces.map((rect, k) => ({ ...g, id: k ? `${g.id}~l${k}` : g.id, rect }));
      });
    return regions.lanes.flatMap((l) => {
      if (owner && l.id === owner.id) return less(ownerMarks, kept, true);
      if (near && l.id === near.id) return nearGuides(l);
      if (!named.some((x) => x.id === l.id)) return all(l);
      return without(handed.has(l.id) ? less(view(l), cutBy, true) : all(l), at);
    });
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
    const p = ontoStage(heldRegions(spotId).stage, raw, margins.edge) ?? raw;
    // The step: the pointer's speed as it moved (a fling past the edge isn't still) since the last point that differed,
    // px/ms. A repeated point (a host updating per frame, or a gap between sparse samples) keeps the last step until the
    // pointer has stayed put for `rest` ms after a slow step or on the stage's edge, else for `pause` ms; only then is it
    // still. A hand moving fast with samples far apart is never still between them.
    let step = 0;
    if (moved && (raw.x !== moved.raw.x || raw.y !== moved.raw.y)) {
      const before = moved.t;
      step = Math.hypot(raw.x - moved.raw.x, raw.y - moved.raw.y) / Math.max(1, t - moved.t);
      moved = { raw, t };
      hand.push(raw, t);
      // The step that ends a rest (a gap of 40 ms or `pause`, the smaller) says nothing about how the hand moves now:
      // unknown, never a slow step (a fling out of a rest docks nowhere on its first frame), unless it is no longer than
      // the step `stepSpeed` makes in 8 ms, px (a hand creeping a pixel at a time, which is slow).
      step = hand.step;
      lastStep = step;
      // A fling (the hand reading faster than `slideSpeed`) unsettles it; it is slow again from the last sample before it
      // reads slow (at most `stepSpeed`). A step the hand's speed can't read yet (the first after a rest) is neither.
      const sp = hand.speed;
      if (Number.isFinite(sp) && sp > gates.slideSpeed) {
        flung = true;
        slowFrom = null;
      } else if (!Number.isFinite(sp) || sp > gates.stepSpeed) slowFrom = null;
      else slowFrom ??= before;
    } else if (moved) {
      const stage = heldRegions(spotId).stage;
      const onEdge = p.x <= stage.x || p.y <= stage.y || p.x >= stage.x + stage.width || p.y >= stage.y + stage.height;
      const since = t - moved.t;
      step = since >= gates.pause || (since >= gates.rest && (lastStep <= gates.stepSpeed || onEdge)) ? 0 : lastStep;
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
    const edgeStage = heldRegions(spotId).stage;
    const settled = !flung || p.x <= edgeStage.x || p.y <= edgeStage.y || p.x >= edgeStage.x + edgeStage.width || p.y >= edgeStage.y + edgeStage.height;
    const from = last?.p ?? null;
    // The pointer as it moved: a fling off the stage's edge moves across a lane there though its clamped point doesn't.
    const fromRaw = last?.raw ?? null;
    last = { p, raw, t };
    const shift = !!keys?.shift;
    const regions = heldRegions(spotId);
    // The path inside each lane: the part along the lane of slow steps from a point inside it to another (the step that
    // enters doesn't count, nor a fast one), so a crossing at `stepSpeed` or faster never enters by path at any angle.
    // From a held lane, a touching lane counts the path along it and across it while the hand reads steady and no
    // faster than `slideSpeed` (`hand`): a brisk slide along it (across it at most a third as far as along) is no
    // crossing. (The slow path counts a step at most `stepSpeed`, as the hand's speed reads it: a jittered fling never.)
    const slow = Number.isFinite(hand.speed) ? hand.speed <= gates.stepSpeed : step <= gates.stepSpeed;
    for (const l of regions.lanes) {
      const was = from && strictlyIn(l.rect, from);
      const go = was ? Math.abs(alongOf(l, p) - alongOf(l, from)) : 0;
      const over = was && fromRaw ? Math.abs(acrossOf(l, raw) - acrossOf(l, fromRaw)) : 0;
      const inL = strictlyIn(l.rect, p);
      pathIn.set(l.id, inL ? (pathIn.get(l.id) ?? 0) + (slow ? go : 0) : 0);
      const s = slide.get(l.id);
      // Only a steady hand no faster than `slideSpeed` adds to the count: a fling (or a hand gathering speed out of a rest
      // or a hesitation, or one the speed can't read yet) adds nothing and resets nothing. So a fling never counts, even
      // where its timestamps jitter, while a steady slide whose timestamps jitter keeps its count.
      const counts = hand.steady && hand.speed <= gates.slideSpeed;
      slide.set(l.id, !inL ? { along: 0, across: 0 } : counts ? { along: (s?.along ?? 0) + go, across: (s?.across ?? 0) + over } : (s ?? { along: 0, across: 0 }));
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
      // The zone is a held state, like a held lane: the drag starts in it, leaves it past `lift` of the lift point and
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
    previous = region;
    lastPending = pending;
    const shown: LandingRegion = shift && (region === "lane" || region === "open") ? "open" : region;
    const r2 = heldRegions(spotId);
    const heldLane = laneIn(r2, laneId);
    const spot = spotIn(heldLane, spotId);
    landedOn = shown === "lane" && spot && heldLane ? { spot, axis: heldLane.axis } : null;
    // A sliding spot's landing follows the pointer; any other spot's is its own.
    const landing = shown === "lane" ? (spot && heldLane ? landingAt(heldLane, spot, p, r2.item) : null) : shown === "open" ? (options.floatLanding?.(p) ?? null) : null;
    frame = {
      region: shown,
      lane: laneId,
      spot: shown === "lane" ? spotId : null,
      landing,
      room: shown === "lane" && !!spot,
      guides: guidesFor(p, shown, shift, pending && shown !== "lane" ? pending : null, landing),
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
      if (frame.region === "lane" && frame.lane && frame.spot) {
        const ownSpot = !!options.home && options.home.spot === frame.spot && options.home.lane === frame.lane;
        // A sliding spot: where its landing starts, read once here (so a wobble never stores a jitter), exactly as the
        // frame shows it (a snap point, else on the spot's grain). It is home only at the item's own place: the home
        // spot's own landing.
        const on = landedOn;
        if (on?.spot.slide && frame.landing) {
          const start = (r: Rect): number => (on.axis === "x" ? r.x : r.y);
          const at = start(frame.landing);
          return { kind: "spot", lane: frame.lane, spot: frame.spot, home: ownSpot && Math.abs(at - start(on.spot.landing)) < 1e-6, at };
        }
        return { kind: "spot", lane: frame.lane, spot: frame.spot, home: ownSpot };
      }
      if (frame.region === "open" && frame.landing) return { kind: "float", rect: frame.landing };
      return null;
    },
    setRegions(regions: LandingRegions, nextRegionsFor?: (spot: string) => LandingRegions | null): void {
      base = regions;
      if (nextRegionsFor) regionsFor = nextRegionsFor;
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
