/**
 * One layout for a drag's held frame and its commit: `dockDrag(state, dragged, options)` gives the drag's hit-testing
 * data (`regions`, as seen) and `after(held)`, THE layout of a held place of the drag. While its room is open, a held frame
 * draws every item, the landing and every guide from `after(held)` (docs/docking.md, "What a held frame draws"), and a
 * release commits exactly `after(held).state`.
 *
 * - **A held place** (`DockHeld`) is where a release now lands: a lane's spot with the pointer (`point`; a sliding spot
 *   lands where the hand holds it, the one sliding rule `LaneSlide` states), or the float at the pointer. No held place
 *   (`null`) is rest: the drag lands nowhere (home, refused, nowhere), and the layout is the window as seen, the held item
 *   drawn nowhere.
 * - **`after(held)`**: the dock state a release commits and its layout (`solve` with the drag's `previous`, as the commit
 *   solves it), the held item's rect there (`landing`, null at rest), every lane's marks in that one layout (`marks`),
 *   and for a spot the held lane's spots with their stretches in that layout (`spots`: a panel column by halves of what
 *   it draws, the hit data along a held lane). Remembered per held place.
 * - **`shown(frame)`**: the layout a landing frame draws: `after(frame.held).layout` while `frame.room` is open, else
 *   the window at rest.
 * - **`guides(frame)`**: the place guides of a landing frame, each lane's from the held place it names (rule B): a lane's
 *   guide is drawn in the layout on screen (`shown(frame)`), less the landing the pointer would take there; only a lane
 *   that isn't drawn on screen takes the layout that creates it (its would-land held place's for the Near lane, its one
 *   spot's for any other), and gives up where it meets a lane drawn on screen (between two such, the bar keeps the
 *   corner). Under "all", the Near lane's marks win where they meet another lane's: the others are cut there.
 *
 * The shapes fit `@n-uf/motion/drag`'s landing model as they are (`regions`, `landingOf`, `spotsOf`; the frame's
 * `held` and `guides`), though neither package imports the other.
 */
import { EPS, type Point, type Rect } from "@n-uf/placement";
import type { DockLayout, DockState } from "./model";
import { baseOf, drawnIn, marksIn, marksLess, rawSpot, spotsIn, type DockLaneOptions, type DockMark, type DockRegions, type DockSpot, type LaneMarks } from "./lanes";
import type { DockDrop, DropResult } from "./targets/model";

/** A held place of a drag: where a release now lands (`@n-uf/motion/drag`'s `LandingHeld` fits it). `null` is rest (it lands nowhere). */
export type DockHeld =
  | {
      readonly kind: "spot";
      /** The spot's id (`DockSpot.id`). */
      readonly spot: string;
      /** The pointer, in the regions' space: where a sliding spot's landing starts (`LaneSlide`); a fixed spot ignores it. */
      readonly point: Point;
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

/** THE layout of a held place of a drag: what a release commits, and what its held frame draws while its room is open. */
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

/** One lane a frame shows guides for, with the held place its guide stands for (`@n-uf/motion/drag`'s `LandingGuideRef`). */
export interface DockGuideRef {
  readonly lane: string;
  readonly held: DockHeld | null;
}

/** What `guides` reads of a landing frame: the held place on screen, whether its room is open, and each lane shown with the held place its guide stands for. */
export interface DockGuideFrame {
  readonly held: DockHeld | null;
  /**
   * The room is open (`@n-uf/motion/drag`'s `LandingFrame.room`, a boolean): the host draws the window as `held` lays it
   * out. A host that draws the window at rest while a spot is held (a mode that never makes room) passes false.
   */
  readonly room: boolean;
  readonly guides: readonly DockGuideRef[];
}

/** A drag of one item: its hit-testing data as seen, and the one layout of each of its held places. */
export interface DockDrag {
  /** Hit-testing only: lanes (hit rect, spots' stretches, refused stretches), refused places, blocked, content, as seen. */
  readonly regions: DockRegions;
  /** THE layout of `held` (rest for null): the dock state it commits, its layout, landing, marks and, for a spot, its lane's spots. */
  after(held: DockHeld | null): DockAfter;
  /** `after(held).landing`: the one rect a landing model reads (its trail gate, its frame's landing). */
  landingOf(held: DockHeld): Rect | null;
  /** `after({ spot }).spots` of a spot: its lane's spots with their stretches in the spot's layout, or null. */
  spotsOf(spot: string): readonly DockSpot[] | null;
  /**
   * The layout a frame draws, the one every guide of the frame is cut in: `after(frame.held).layout` while
   * `frame.room` is open, else the window at rest (what the host draws at rest). Only a spot held in a lane has a room
   * (`LandingFrame.room`: a docked item's gap opens as the item lands there); a float has none: its gap closes on
   * release (decision 0003's float exception), so the window stays at rest and `after(float)` is only what a release
   * commits. A null held place is rest. A host that draws no room for a spot (a mode that never makes one) passes room false.
   */
  shown(frame: Pick<DockGuideFrame, "held" | "room">): DockLayout;
  /** The guides of a frame, cut in `shown(frame)`: each lane's marks from the held place it names, the Near lane's winning where they meet. */
  guides(frame: DockGuideFrame): DockGuide[];
}

/** A box piece a cut at the landing leaves this short or shorter along its lane is no room: not drawn, px. */
const MIN_PIECE = 8;
const ORIGIN = { x: 0, y: 0 };

/**
 * The drag of `dragged` in `state`: `lanes()`'s regions as seen, and `after(held)`, THE layout of each held place. The
 * options are `lanes()`'s (`previous` is the committed layout at the lift, the one every solve and the commit read;
 * `grab` the press's). The work at the lift is remembered per dock state and options, as `lanes()`'s is; each held place's layout
 * is remembered by the drag.
 */
export function dockDrag(state: DockState, dragged: string, options: DockLaneOptions = {}): DockDrag {
  const base = baseOf(state, dragged, options);
  const regions: DockRegions = { ...base.regions, lanes: base.lanes };
  const grab = options.grab;
  const byResult = new WeakMap<DropResult, DockAfter>();
  const fixed = new Map<string, DockAfter>();
  const axisOf = new Map(base.lanes.map((l) => [l.id, l.axis] as const));
  const flat = (ls: readonly LaneMarks[]): DockLaneMark[] => ls.flatMap((l) => l.marks.map((m) => ({ ...m, lane: l.lane })));
  // At rest: the window as seen, its lanes' marks as `lanes()` gives them (one layout, the held item drawn nowhere).
  const rest: DockAfter = { state, layout: base.seen, landing: null, marks: flat(base.lanes.map((l) => ({ lane: l.id, axis: l.axis, marks: l.marks }))) };
  /** One float frame remembered: a still pointer solves nothing. */
  let lastFloat: { x: number; y: number; after: DockAfter } | null = null;

  const of = (result: DropResult, spot: { lane: string; slide?: boolean } | null): DockAfter => {
    const known = byResult.get(result);
    if (known) return known;
    const it = result.layout.items[dragged];
    const landing = it && !it.inMenu && (spot ? !it.floating : it.floating) ? it.rect : null;
    const spots = spot ? spotsIn(base, spot.lane, result.layout, dragged) : null;
    const out: DockAfter = { ...result, landing, marks: flat(marksIn(base, state, dragged, result.layout, spot ? (spot.slide ? "slide" : "spot") : false, options.emptyLanes)), ...(spots ? { spots } : {}) };
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

  /**
   * An empty edge lane's marks in the layout that creates it: its one spot's drop (a sliding spot's at rest), where that
   * drop draws the lane, its room whole (the held item, landing elsewhere or nowhere, drawn nowhere on it; once the lane
   * is Near its would-land held place draws the landing). Null for a lane with more than one spot, a virtual lane, or one no
   * drop draws.
   */
  const createdMemo = new Map<string, DockLaneMark[] | null>();
  const created = (lane: string): DockLaneMark[] | null => {
    if (createdMemo.has(lane)) return createdMemo.get(lane)!;
    const l = base.lanes.find((x) => x.id === lane);
    // (`emptyLanes: "edge"` draws an empty lane as its thin strip on screen: nothing to create.)
    const raw = l && options.emptyLanes !== "edge" && l.spots.length === 1 && state.edges.some((e) => e.id === lane) ? rawSpot(base, l.spots[0]!.id) : null;
    // (Drawn there open, or folded into its side's rail.)
    const out = raw && drawnIn(raw.layout, lane) ? flat(marksIn(base, state, dragged, raw.layout, false, options.emptyLanes)).filter((m) => m.lane === lane) : null;
    createdMemo.set(lane, out && out.length > 0 ? out : null);
    return createdMemo.get(lane)!;
  };

  const landingOf = (held: DockHeld): Rect | null => after(held).landing;
  const spotsOf = (spot: string): readonly DockSpot[] | null => {
    const raw = rawSpot(base, spot);
    return raw && !raw.slide ? (after({ kind: "spot", spot, point: ORIGIN }).spots ?? null) : raw ? spotsIn(base, raw.lane, raw.layout, dragged) : null;
  };

  /**
   * What a frame draws, the one rule `shown` and `guides` read: `after(held)` while the room is open, else the window at
   * rest (a float's landing kept: the held copy lies there).
   */
  const screenOf = (frame: Pick<DockGuideFrame, "held" | "room">): DockAfter => {
    const held = after(frame.held);
    if (frame.room || held === rest) return held;
    return held.landing ? { ...rest, landing: held.landing } : rest;
  };
  const shownLayout = (frame: Pick<DockGuideFrame, "held" | "room">): DockLayout => screenOf(frame).layout;

  const guides = (frame: DockGuideFrame): DockGuide[] => {
    if (frame.guides.length === 0) return [];
    const held = after(frame.held);
    const screen = screenOf(frame);
    // The Near lane: the one shown with another held place than the screen's (a would-land held place), at most one.
    let near: { lane: string; marks: DockLaneMark[] } | null = null;
    const shown: { lane: string; marks: DockLaneMark[]; created?: true }[] = [];
    // Drawn on screen: open, or a column folded into its side's rail (its items the rail's segments).
    const drawnThere = (id: string): boolean => drawnIn(screen.layout, id);
    for (const g of frame.guides) {
      const mine = after(g.held);
      if (mine === held) {
        // Rule B: a lane the screen doesn't draw (an empty edge with no band there) is drawn in the layout that creates
        // it, its one spot's; every other lane in the screen's layout. A lane of no edge (a new column beside one) marks its
        // spots' landings, each in its own layout: it too is drawn as the layout that creates it, and gives way like one.
        // (A dynamic column the screen deletes, emptied by the lift, has no edge there: not drawn either.)
        const own = screen.marks.filter((m) => m.lane === g.lane);
        const edgeless = !state.edges.some((e) => e.id === g.lane);
        const made = edgeless ? own : !drawnThere(g.lane) ? created(g.lane) : null;
        shown.push(made ? { lane: g.lane, marks: made, created: true } : { lane: g.lane, marks: own });
        continue;
      }
      // Rule B: a lane drawn on screen is drawn there, less the landing the pointer would take in it; a lane the screen
      // doesn't draw is drawn in the layout that creates it.
      const onScreen = drawnThere(g.lane);
      const axis = axisOf.get(g.lane) ?? "x";
      // (A box part the landing leaves `MIN_PIECE` px or shorter is no room; a line goes only where the landing covers it.)
      const own = screen.marks.filter((m) => m.lane === g.lane);
      const marks = onScreen ? (mine.landing ? marksLess(own, axis, [mine.landing], { suffix: "~l", minBox: MIN_PIECE, lines: "covered" }) : own) : mine.marks.filter((m) => m.lane === g.lane);
      near = { lane: g.lane, marks };
      shown.push(near);
    }
    // A lane drawn in the layout that creates it gives way wherever the screen draws something: another lane's mark, a
    // drawn bar or toolbar rail (its items stay put when the lane opens; a column moves aside, so the guide may lie over
    // it), a side rail's segments (its folded columns' tabs), or the held landing. Between two such lanes the bar keeps
    // the corner (the bars first, each cut by the ones before).
    const drawnStays = [
      ...state.edges
        .filter((e) => (e.side === "top" || e.side === "bottom" || !!e.compact) && (screen.layout.edges[e.id]?.cross ?? 0) > EPS)
        .map((e) => screen.layout.edges[e.id]!.rect),
      ...Object.values(screen.layout.rails).flatMap((r) => r?.segments.filter((g) => g.id !== dragged).map((g) => g.rect) ?? []),
    ];
    // (The landing term is the only cut where a column the lift deletes is created in its own layout over a column
    // landing beside it: two columns on a side.)
    const onScreen = [...shown.filter((s) => !s.created && s !== near).flatMap((s) => s.marks.map((m) => m.rect)), ...drawnStays, ...(screen.landing ? [screen.landing] : [])];
    const axis = (id: string): "x" | "y" => axisOf.get(id) ?? "x";
    const made = shown.filter((s) => s.created).sort((a, b) => (axis(a.lane) === axis(b.lane) ? 0 : axis(a.lane) === "x" ? -1 : 1));
    const kept: Rect[] = [];
    for (const s of made) {
      s.marks = marksLess(s.marks, axis(s.lane), [...onScreen, ...kept]);
      kept.push(...s.marks.map((m) => m.rect));
    }
    if (!near) return shown.flatMap((s) => s.marks);
    // The Near lane's marks win where they meet another lane's: the others are cut there.
    const cut = near.marks.map((m) => m.rect);
    return shown.flatMap((s) => (s === near ? s.marks : marksLess(s.marks, axis(s.lane), cut)));
  };

  return { regions, after, landingOf, spotsOf, shown: shownLayout, guides };
}
