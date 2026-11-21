/**
 * One layout for a drag's held frame and its commit: `dockDrag(state, dragged, options)` gives the drag's hit-testing
 * data (`regions`, as seen) and `after(held)`, THE layout of a state of the drag. A held frame draws every item, the
 * landing and every guide from `after(held)`, and a release commits exactly `after(held).state`.
 *
 * - **A state** (`DockHeld`) is where a release now lands: a lane's spot with the pointer (`point`; a sliding spot lands
 *   where the hand holds it, the one sliding rule `LaneSlide` states), or the float at the pointer. No state (`null`) is
 *   rest: the drag lands nowhere (home, refused, nowhere), and the layout is the window as seen, the held item drawn
 *   nowhere.
 * - **`after(held)`**: the state a release commits and its layout (`solve` with the drag's `previous`, as the commit
 *   solves it), the held item's rect there (`landing`, null at rest), every lane's marks in that one layout (`marks`),
 *   and for a spot the held lane's spots with their stretches in that layout (`spots`: a panel column by halves of what
 *   it draws, the hit data along a held lane). Remembered per state.
 * - **`guides(frame)`**: the place guides of a landing frame, each lane's from the state it names (rule B): a lane's guide
 *   is drawn in the layout on screen (`frame.state`'s), less the landing the pointer would take there; only a lane that
 *   isn't drawn on screen takes the layout that creates it (its would-land state's). Under "all", the Near lane's marks
 *   win where they meet another lane's: the others are cut there.
 *
 * The shapes fit `@n-uf/motion/drag`'s landing model as they are (`regions`, `landingOf`, `spotsOf`; the frame's
 * `state` and `guides`), though neither package imports the other.
 */
import { EPS, type Point, type Rect } from "@n-uf/placement";
import type { DockState } from "./model";
import { baseOf, marksIn, marksLess, rawSpot, spotsIn, type DockLaneOptions, type DockMark, type DockRegions, type DockSpot, type LaneMarks } from "./lanes";
import type { DockDrop, DropResult } from "./targets/model";

/** A state of a drag: where a release now lands. `null` is rest (it lands nowhere). */
export type DockHeld =
  | {
      readonly kind: "spot";
      /** The spot's id (`DockSpot.id`). */
      readonly spot: string;
      /** The pointer, in the regions' space: where a sliding spot's landing starts (`LaneSlide`); a fixed spot ignores it. */
      readonly point: Point;
      /** The spot's lane, when the caller knows it (the spot id names it). */
      readonly lane?: string;
    }
  | {
      readonly kind: "float";
      /** The pointer: the float lands where it holds the item (`DockDrop.after(point, grab)`). */
      readonly point: Point;
    };

/** A lane's mark in one layout, with its lane. */
export interface DockLaneMark extends DockMark {
  readonly lane: string;
}

/** THE layout of a state of a drag: what a release commits, and what its held frame draws. */
export interface DockAfter extends DropResult {
  /** The held item's rect in `layout`, or null at rest (and where a float can't land). */
  readonly landing: Rect | null;
  /** Every lane's marks in `layout`: no two lanes' overlap, none covers an item drawn there or the landing. */
  readonly marks: readonly DockLaneMark[];
  /** A spot's: its lane's spots with their stretches cut in `layout` (along a held lane, the spot ranges as drawn). */
  readonly spots?: readonly DockSpot[];
}

/** A place guide as a frame draws it: a lane's mark in the layout its guide stands for. */
export type DockGuide = DockLaneMark;

/** What `guides` reads of a landing frame: the state on screen, and each lane shown with the state its guide stands for. */
export interface DockGuideFrame {
  readonly state: DockHeld | null;
  readonly guides: readonly { readonly lane: string; readonly state: DockHeld | null }[];
}

/** A drag of one item: its hit-testing data as seen, and the one layout of each of its states. */
export interface DockDrag {
  /** Hit-testing only: lanes (hit rect, spots' stretches, refused stretches), refused places, blocked, content, as seen. */
  readonly regions: DockRegions;
  /** THE layout of `held` (rest for null): its state, layout, landing, marks and, for a spot, its lane's spots. */
  after(held: DockHeld | null): DockAfter;
  /** `after(held).landing`: the one rect a landing model reads (its trail gate, its frame's landing). */
  landingOf(held: DockHeld): Rect | null;
  /** `after({ spot }).spots` of a spot: its lane's spots with their stretches in the spot's layout, or null. */
  spotsOf(spot: string): readonly DockSpot[] | null;
  /** The guides of a frame: each lane's marks from the state it names, the Near lane's winning where they meet. */
  guides(frame: DockGuideFrame): DockGuide[];
}

/** A box piece a cut at the landing leaves this short or shorter along its lane is no room: not drawn, px. */
const MIN_PIECE = 8;
const ORIGIN = { x: 0, y: 0 };

/**
 * The drag of `dragged` in `state`: `lanes()`'s regions as seen, and `after(held)`, THE layout of each state. The
 * options are `lanes()`'s (`previous` is the committed layout at the lift, the one every solve and the commit read;
 * `grab` the press's), less `spot`. The work at the lift is remembered per state and options, as `lanes()`'s is; each
 * state's layout is remembered by the drag.
 */
export function dockDrag(state: DockState, dragged: string, options: Omit<DockLaneOptions, "spot"> = {}): DockDrag {
  const base = baseOf(state, dragged, options);
  const regions: DockRegions = { ...base.regions, lanes: base.lanes };
  const grab = options.grab;
  const byResult = new WeakMap<DropResult, DockAfter>();
  const fixed = new Map<string, DockAfter>();
  const axisOf = new Map(base.lanes.map((l) => [l.id, l.axis] as const));
  const flat = (ls: readonly LaneMarks[]): DockLaneMark[] => ls.flatMap((l) => l.marks.map((m) => ({ ...m, lane: l.lane })));
  const rest: DockAfter = { state, layout: base.seen, landing: null, marks: flat(marksIn(base, state, dragged, base.seen, false, options.emptyLanes)) };
  /** One float frame remembered: a still pointer solves nothing. */
  let lastFloat: { x: number; y: number; after: DockAfter } | null = null;

  const of = (result: DropResult, spot: { lane: string } | null): DockAfter => {
    const known = byResult.get(result);
    if (known) return known;
    const it = result.layout.items[dragged];
    const landing = it && !it.inMenu && (spot ? !it.floating : it.floating) ? it.rect : null;
    const spots = spot ? spotsIn(base, spot.lane, result.layout, dragged) : null;
    const out: DockAfter = { ...result, landing, marks: flat(marksIn(base, state, dragged, result.layout, !!spot, options.emptyLanes)), ...(spots ? { spots } : {}) };
    byResult.set(result, out);
    return out;
  };

  const after = (held: DockHeld | null): DockAfter => {
    if (!held) return rest;
    if (held.kind === "float") {
      const float: DockDrop | null = base.regions.float;
      if (!float) return rest;
      if (lastFloat && lastFloat.x === held.point.x && lastFloat.y === held.point.y) return lastFloat.after;
      const a = of(float.after(held.point, grab), null);
      lastFloat = { x: held.point.x, y: held.point.y, after: a };
      return a;
    }
    const raw = rawSpot(base, held.spot);
    if (!raw) return rest;
    // A sliding spot commits where the hand holds it (its drops remembered per start); any other spot its one drop
    // (solved once, at the lift), remembered by its id.
    if (raw.slide) return of(raw.target.after(held.point, grab), raw);
    let a = fixed.get(held.spot);
    if (!a) fixed.set(held.spot, (a = of(raw.target.after(ORIGIN, ORIGIN), raw)));
    return a;
  };

  const landingOf = (held: DockHeld): Rect | null => after(held).landing;
  const spotsOf = (spot: string): readonly DockSpot[] | null => {
    const raw = rawSpot(base, spot);
    return raw && !raw.slide ? (after({ kind: "spot", spot, point: ORIGIN }).spots ?? null) : raw ? spotsIn(base, raw.lane, raw.layout, dragged) : null;
  };

  const guides = (frame: DockGuideFrame): DockGuide[] => {
    if (frame.guides.length === 0) return [];
    const screen = after(frame.state);
    // The Near lane: the one shown with another state than the screen's (a would-land state), at most one.
    let near: { lane: string; marks: DockLaneMark[] } | null = null;
    const shown: { lane: string; marks: DockLaneMark[] }[] = [];
    for (const g of frame.guides) {
      const mine = after(g.state);
      if (mine === screen) {
        shown.push({ lane: g.lane, marks: screen.marks.filter((m) => m.lane === g.lane) });
        continue;
      }
      // Rule B: a lane drawn on screen is drawn there, less the landing the pointer would take in it; a lane the screen
      // doesn't draw is drawn in the layout that creates it.
      const onScreen = (screen.layout.edges[g.lane]?.cross ?? 0) > EPS;
      const axis = axisOf.get(g.lane) ?? "x";
      const marks = onScreen ? less(screen.marks.filter((m) => m.lane === g.lane), mine.landing, axis) : mine.marks.filter((m) => m.lane === g.lane);
      near = { lane: g.lane, marks };
      shown.push(near);
    }
    if (!near) return shown.flatMap((s) => s.marks);
    // Under "all", the Near lane's marks win where they meet another lane's: the others are cut there.
    const cut = near.marks.map((m) => m.rect);
    return shown.flatMap((s) => (s === near ? s.marks : (marksLess(s.marks, axisOf.get(s.lane) ?? "x", cut) as DockLaneMark[])));
  };

  return { regions, after, landingOf, spotsOf, guides };
}

/**
 * `marks` less the rect `r` along `axis`: a box or hatch into the pieces either side (a box piece the cut leaves
 * `MIN_PIECE` px or shorter is dropped, a piece it didn't touch is kept at any length), a line kept unless `r` covers it.
 */
function less(marks: readonly DockLaneMark[], r: Rect | null, axis: "x" | "y"): DockLaneMark[] {
  if (!r) return [...marks];
  const lo = (x: Rect): number => (axis === "x" ? x.x : x.y);
  const hi = (x: Rect): number => (axis === "x" ? x.x + x.width : x.y + x.height);
  const meets = (a: Rect): boolean => a.x < r.x + r.width - EPS && r.x < a.x + a.width - EPS && a.y < r.y + r.height - EPS && r.y < a.y + a.height - EPS;
  return marks.flatMap((m): DockLaneMark[] => {
    if (!meets(m.rect)) return [m];
    if (m.kind === "line") return lo(r) <= lo(m.rect) + EPS && hi(r) >= hi(m.rect) - EPS ? [] : [m];
    const out: DockLaneMark[] = [];
    const put = (p: number, q: number, k: number): void => {
      if (q - p <= (m.kind === "box" ? MIN_PIECE : EPS)) return;
      out.push({ ...m, id: k ? `${m.id}~l${k}` : m.id, rect: axis === "x" ? { ...m.rect, x: p, width: q - p } : { ...m.rect, y: p, height: q - p } });
    };
    put(lo(m.rect), Math.min(hi(m.rect), lo(r)), 0);
    put(Math.max(lo(m.rect), hi(r)), hi(m.rect), out.length);
    return out;
  });
}
