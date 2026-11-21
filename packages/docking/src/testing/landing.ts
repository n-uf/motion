/**
 * The landing rows: the landing model's properties as conformance rows, played on any host that drags with a landing
 * model (`@n-uf/motion/drag`'s `createLandingModel` over `dockDrag()`). Docking never imports motion: the model comes in
 * as an input, the way the pick rule does (`createLandingHost({ landing: createLandingModel })`).
 *
 * A row is plain data: a state, the item dragged, a pointer path at a speed (its first point the press, on the item),
 * a rest at its end, and what must hold on every frame while the pointer moves, on the last frame, and in the layout
 * after the release. A host plays the path at its own frame rate (it must call the model once more after the pointer
 * stops, as every frame does) and reports each frame.
 *
 * Every row runs on every host that drags with a landing model.
 */
import { rect, type Point, type Rect } from "@n-uf/placement";
import { dockDrag, type DockHeld } from "../drag";
import { lanes, type DockLane, type DockLaneOptions, type DockRegions, type DockSpot } from "../lanes";
import type { DockEdge, DockState, DockItem, DockLayout } from "../index";
import { solve } from "../solve";
import { dockedIn, layoutIssues } from "./run";
import type { CaseRequires, LayoutExpect } from "./types";
import { form } from "./world";

/**
 * The hand rule's floor, px: while a lane holds, the landing lies at least this near the pointer, however close the
 * adjacent landings are (`handBound`).
 */
export const HAND_TRAIL = 48;
/** The floor on the single frame before a hop (the next frame holds another spot of the same lane), px. */
export const HAND_TRAIL_BEFORE_HOP = 56;
/** The margin a landing model keeps past a boundary between two spots before it hops, px: the spot margin. */
export const HAND_MARGIN = 6;

/**
 * The hand rule's bound, px: `max(floor, g / 2 + 6)`, the floor 48 (`HAND_TRAIL`), 56 on the frame before a hop
 * (`HAND_TRAIL_BEFORE_HOP`). `g` is the gap along the lane between the facing edges of the two adjacent landings the
 * pointer lies between (a sliding spot's landing taken at the end of its range that faces the next spot); 0 where the
 * pointer lies over a landing. `lanes()` cuts between two adjacent spots halfway between their landings, and a spot
 * changes 6 px (`HAND_MARGIN`) past the cut, so the landing is never further from the pointer than half the gap plus the
 * margin. Over a docked item much longer than the held one no landing lies inside it: `g` is about the item's length
 * less the held one's, plus a gutter.
 */
export function handBound(gap: number, beforeHop = false): number {
  return Math.max(beforeHop ? HAND_TRAIL_BEFORE_HOP : HAND_TRAIL, gap / 2 + HAND_MARGIN);
}

/**
 * How near a lane's rect the pointer is in open space for a Near guide of that lane to show, px: the landing model's
 * default `approach.reach`, the entry margin (`LANDING_MARGINS.exit`). A host that sets a larger `approach.reach` does not
 * play the rows that check `nearGuides`.
 */
export const NEAR_REACH = 12;

/** A hand faster than this, px/ms, may leave a hop that reflows the window for later (the landing model's `gates.stepSpeed`, 0.375 px/ms). */
export const HAND_FAST = 0.375;

export type LandingRegionName = "lane" | "open" | "refused" | "nowhere";

/** A landing model, as much of it as a host plays (`@n-uf/motion/drag`'s `createLandingModel` gives one). */
export interface LandingModelLike {
  update(
    point: Point,
    time: number,
    keys?: { readonly shift?: boolean },
  ): {
    readonly region: LandingRegionName;
    readonly lane: string | null;
    readonly spot: string | null;
    /** The state a release lands now (`DockHeld`), or null. */
    readonly state: DockHeld | null;
    readonly landing: Rect | null;
    readonly room: boolean;
    /** The lanes whose guides show, each with the state its guide stands for (`DockDrag.guides` draws them). */
    readonly guides: readonly { readonly lane: string; readonly state: DockHeld | null }[];
    readonly pending?: string;
  };
  /** What a release at `point` and `time` lands (the last update's point: what its frame showed): a state, or null. */
  release(point: Point, time: number): (DockHeld & { readonly home?: boolean }) | null;
}
/** What makes a landing model: `createLandingModel`, as an input. */
export type LandingRule = (options: {
  readonly regions: DockRegions;
  readonly landingOf: (state: DockHeld) => Rect | null;
  readonly spotsOf: (spot: string) => readonly DockSpot[] | null;
  readonly home?: { readonly lane: string; readonly spot: string };
  readonly placeGuides?: "off" | "near" | "all";
}) => LandingModelLike;

/** A place guide a frame shows: its lane, line, box or hatch, and where. */
export interface LandingCaseGuide {
  readonly id: string;
  readonly lane: string;
  readonly kind: "line" | "box" | "hatch";
  readonly rect: Rect;
}

/** One frame a host reports: the pointer, whether it is still moving along the path, and the model's answer. */
export interface LandingCaseFrame {
  readonly t: number;
  readonly point: Point;
  readonly moving: boolean;
  readonly region: LandingRegionName;
  readonly lane: string | null;
  readonly spot: string | null;
  readonly landing: Rect | null;
  readonly room: boolean;
  /** The place guides shown ("near"), when the host reports them. */
  readonly guides?: readonly LandingCaseGuide[];
  /** The lane the pointer is inside but hasn't entered yet (the landing model's `pending`), when the host reports it. */
  readonly pending?: string;
}

export interface LandingCase {
  /** Generic and stable. */
  readonly id: string;
  readonly title: string;
  readonly expect: string;
  readonly state: DockState;
  readonly item: string;
  /** The pointer path, stage px; the first point is the press on the item. */
  readonly path: readonly Point[];
  /** px/ms. */
  readonly speed: number;
  /** The pointer rests at the path's end this long before the release, ms. */
  readonly rest?: number;
  /** On every frame while the pointer moves. */
  readonly moving?: {
    /** The lane held on every frame (and never anything else). */
    readonly lane?: string;
    /** Lanes never held. */
    readonly notLanes?: readonly string[];
    /** DockRegions never shown. */
    readonly notRegions?: readonly LandingRegionName[];
    /** Whenever a lane is held, the landing lies within this many px of the pointer. */
    readonly trail?: number;
    /**
     * On the single frame before a hop (the next frame holds another spot of the same lane), this bound instead of
     * `trail`. Absent: `trail` on every frame.
     */
    readonly trailBeforeHop?: number;
    /**
     * The hand rule: whenever a lane holds, the landing is the nearest landing in its lane to the pointer (up to twice
     * the 6 px margin the model keeps past a boundary before it hops: the held landing may be that much farther than
     * the one it will hop to), and lies within `handBound` of the pointer: `max(48, g / 2 + 6)` px, the 48 being 56
     * on the frame before a hop, where `g` is the gap along the lane between the facing edges of the two adjacent
     * landings the pointer lies between. The spots are those `lanes()` gives for the row's state in the held spot's
     * layout (a sliding spot's landings span its range). Landings that overlap or touch the held one (no more than
     * half a pixel apart) are its place, not compared with it. In a lane `lanes()` doesn't give, the floor holds
     * (`handBound(0)`), and the issue names the lane.
     */
    readonly hand?: true;
    /**
     * The landing lies no further from the pointer, at worst, than when the same path is played at `slow` px/ms, plus
     * `by` px: a fast hand trails no more than a slow one does, plus what it may trail.
     */
    readonly trailOverSlow?: { readonly slow: number; readonly by: number };
    /** Places where no guide lies (nothing lands there): a guide touching one of these rects fails. */
    readonly noGuideIn?: readonly Rect[];
    /**
     * The Near guides' rule (`nearGuideIssues`): on every frame that shows a guide of lane L, one of these holds. (a) L
     * holds the pointer: a release lands in L, or, on L's own refused stretch, the frame's region is refused with L as
     * its lane. (b) L is pending (the frame's `pending`): a release floats or goes home. (c) The pointer is in open
     * space within `NEAR_REACH` of L's rect: a release floats. So no Near guide ever shows over a refused place outside
     * L. A host that doesn't report guides isn't checked.
     */
    readonly nearGuides?: true;
    /**
     * The lane whose guides show changes between two lanes at most this many times along the path (frames that show no
     * guide are skipped): at a corner between two lanes the guides never flicker from one to the other.
     */
    readonly guideSwitches?: number;
  };
  /** On the last frame before the release. */
  readonly end?: { readonly region: LandingRegionName; readonly lane?: string | null; readonly spot?: string; /** The lane pending on the last frame (`null`: none). */ readonly pending?: string | null; /** Where the last frame's landing lies (any of x, y, width, height, within half a pixel). */ readonly landing?: Partial<Rect> };
  /** The layout after the release. */
  readonly layout?: LayoutExpect;
  /**
   * After the release the item lies where it lay at the press, in the host's own layout: on the same edge, among the
   * same items in the same order, at the same rect (within 0.5 px). Checked against the play's `before` (the host's
   * layout at the press), else the row's state as solved: a host whose geometry differs from the row's (its own gaps)
   * passes `before`, and no pixel value of the row's window is asserted.
   */
  readonly home?: true;
  readonly requires?: CaseRequires;
}

/** What a host reports for one row: its frames, the layout after the release and, optionally, the layout at the press. */
export interface LandingPlay {
  readonly frames: readonly LandingCaseFrame[];
  readonly layout: DockLayout;
  /** The host's layout at the press (what a row's `home` compares with). Absent: the row's state as solved. */
  readonly before?: DockLayout;
  /** The `stretchPositions` the host asked `lanes()` for (what a row's `hand` reads the spots with). Absent: the library's default. */
  readonly stretchPositions?: DockLaneOptions["stretchPositions"];
}

/** What a host gives the landing runner: one call plays a row's drag and reports its frames and the layout after. */
export interface LandingCaseHost {
  play(row: LandingCase): LandingPlay | Promise<LandingPlay>;
}

export interface LandingCaseResult {
  readonly id: string;
  readonly ok: boolean;
  readonly failures: readonly string[];
  /** Why the row didn't run, or null. */
  readonly skipped: string | null;
}

const gapTo = (r: Rect, p: Point): number => Math.hypot(Math.max(r.x - p.x, 0, p.x - (r.x + r.width)), Math.max(r.y - p.y, 0, p.y - (r.y + r.height)));

/** `a` lies in `b` or on its edge (a zero-thick line on it counts). */
const touches = (a: Rect, b: Rect): boolean => a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height;

const lo = (r: Rect, axis: "x" | "y"): number => (axis === "x" ? r.x : r.y);
const len = (r: Rect, axis: "x" | "y"): number => (axis === "x" ? r.width : r.height);
/** How far `p` is from the stretch `[a, b]`, 0 inside it. */
const outside = (a: number, b: number, p: number): number => Math.max(a - p, 0, p - b);

/**
 * What the hand rule reads for a row: the lane's spots in the layout of the spot a frame holds, and the docked items
 * (the held one lifted) a pointer may be over. Both computed once per row and per spot.
 */
function handRule(row: LandingCase, before: DockLayout | undefined, stretchPositions: DockLaneOptions["stretchPositions"]) {
  const previous = before ?? solve(row.state);
  const own = previous.items[row.item];
  const press = row.path[0]!;
  const options: DockLaneOptions = { previous, ...(own ? { grab: { x: press.x - own.rect.x, y: press.y - own.rect.y } } : {}), ...(stretchPositions ? { stretchPositions } : {}) };
  const bySpot = new Map<string, DockRegions>();
  /** The lanes with `spot` held (its room open), or as seen (`""`). */
  const regionsOf = (spot: string): DockRegions => {
    let r = bySpot.get(spot);
    if (!r) bySpot.set(spot, (r = lanes(row.state, row.item, spot ? { ...options, spot } : options)));
    return r;
  };
  return {
    /**
     * The grab's share along the lane, as the landing model takes it: of the item's longer side along the lane when it
     * lies along it, else the middle (a sliding landing starts at the pointer less the share of its own length).
     */
    share(axis: "x" | "y"): number {
      if (!own) return 0.5;
      const long: "x" | "y" = own.rect.width >= own.rect.height ? "x" : "y";
      const size = len(own.rect, long);
      const g = long === "x" ? press.x - own.rect.x : press.y - own.rect.y;
      return axis === long && size > 0 && Number.isFinite(g) ? Math.min(1, Math.max(0, g / size)) : 0.5;
    },
    /** The lane `lane` as drawn with `spot` held; as seen when the lane has no such spot (another host's ids). */
    laneOf(lane: string, spot: string): DockLane | undefined {
      const held = regionsOf(spot).lanes.find((l) => l.id === lane);
      return held?.spots.some((s) => s.id === spot) ? held : regionsOf("").lanes.find((l) => l.id === lane);
    },
    /**
     * `g`, px: the gap along the lane between the facing edges of the two adjacent landings the pointer `p` lies between
     * (a sliding spot's landings span its range); 0 where the pointer lies over a landing, or outside all of them.
     */
    gapAt(lane: DockLane, p: number): number {
      const spans = lane.spots
        .map((s): [number, number] => {
          const w = len(s.landing, lane.axis);
          return s.slide ? [Math.min(s.slide.from, s.slide.to), Math.max(s.slide.from, s.slide.to) + w] : [lo(s.landing, lane.axis), lo(s.landing, lane.axis) + w];
        })
        .sort((x: [number, number], y: [number, number]) => x[0] - y[0]);
      let end = -Infinity;
      for (const [a, b] of spans) {
        if (Number.isFinite(end) && end < p && p < a) return a - end;
        end = Math.max(end, b);
      }
      return 0;
    },
  };
}

/** The furthest the landing gets from the pointer while a lane holds it and the pointer moves. */
const worstTrail = (frames: readonly LandingCaseFrame[]): number => Math.max(0, ...frames.filter((f) => f.moving && f.region === "lane" && f.landing).map((f) => gapTo(f.landing!, f.point)));

/** Where `item` lies in `after` against where it lay in `before`: its edge, its order there and its rect. */
function homeIssues(item: string, before: DockLayout, after: DockLayout): string[] {
  const a = before.items[item];
  const b = after.items[item];
  if (!a) return [`${item} is not in the layout at the press`];
  if (!b) return [`${item} is not in the layout after the release`];
  const out: string[] = [];
  const where = (it: typeof a): string => (it.floating ? "floating" : it.inMenu ? `in ${it.edge ?? "no"} menu` : (it.edge ?? "nowhere"));
  if (where(a) !== where(b)) out.push(`${item} ends ${where(b)}, not where it was (${where(a)})`);
  else if (a.edge && dockedIn(before, a.edge).join(",") !== dockedIn(after, a.edge).join(","))
    out.push(`${a.edge} holds ${dockedIn(after, a.edge).join(", ")}, not ${dockedIn(before, a.edge).join(", ")} as at the press`);
  const r0 = a.rect;
  const r1 = b.rect;
  if (Math.max(Math.abs(r0.x - r1.x), Math.abs(r0.y - r1.y), Math.abs(r0.width - r1.width), Math.abs(r0.height - r1.height)) > 0.5)
    out.push(`${item} is at ${Math.round(r1.x)},${Math.round(r1.y)} ${Math.round(r1.width)}x${Math.round(r1.height)}, not where it was (${Math.round(r0.x)},${Math.round(r0.y)} ${Math.round(r0.width)}x${Math.round(r0.height)})`);
  return out;
}

/**
 * The Near guides' rule over `frames` (`LandingCase.moving.nearGuides`): on every frame that shows a guide of lane L,
 * (a) L holds the pointer (the frame's lane is L, in its lane or on its own refused stretch), or (b) L is pending, or
 * (c) the pointer is in open space within `NEAR_REACH` of L's rect (as `lanes()` gives it for the row's state). Anything
 * else is a guide for a place the pointer cannot enter: over a refused place outside L, or in open space further off.
 * The frames of a host that doesn't report guides show none, so nothing is checked. Exported so a sweep of paths can
 * check them all with it.
 */
export function nearGuideIssues(row: LandingCase, frames: readonly LandingCaseFrame[], before?: DockLayout, stretchPositions?: DockLaneOptions["stretchPositions"]): string[] {
  const out: string[] = [];
  let seen: DockRegions | undefined;
  /** A lane's rect as seen (the model reads it so over open space, where no spot is held). */
  const rectOf = (lane: string): Rect | undefined => {
    if (!seen) {
      const previous = before ?? solve(row.state);
      const own = previous.items[row.item];
      const press = row.path[0]!;
      seen = lanes(row.state, row.item, { previous, ...(own ? { grab: { x: press.x - own.rect.x, y: press.y - own.rect.y } } : {}), ...(stretchPositions ? { stretchPositions } : {}) });
    }
    return seen.lanes.find((l) => l.id === lane)?.rect;
  };
  for (const f of frames) {
    if (!f.guides || f.guides.length === 0) continue;
    for (const lane of new Set(f.guides.map((g) => g.lane))) {
      const holds = f.lane === lane && (f.region === "lane" || f.region === "refused");
      const r = f.region === "open" && !holds && f.pending !== lane ? rectOf(lane) : undefined;
      if (holds || f.pending === lane || (r && gapTo(r, f.point) <= NEAR_REACH + 0.5)) continue;
      out.push(`at ${Math.round(f.point.x)},${Math.round(f.point.y)}: a Near guide of ${lane} over ${f.region}${f.lane ? ` in ${f.lane}` : ""}, where the pointer neither holds ${lane}, nor is pending in it, nor is in open space within ${NEAR_REACH} px of it`);
      break;
    }
    if (out.length >= 4) break;
  }
  return out;
}

/** How many times the lane whose guides show changes between two lanes along `frames`, the frames showing none skipped. */
function guideSwitches(frames: readonly LandingCaseFrame[]): number {
  let n = 0;
  let was: string | undefined;
  for (const f of frames) {
    if (!f.moving || !f.guides || f.guides.length === 0) continue;
    const now = [...new Set(f.guides.map((g) => g.lane))].sort().join("+");
    if (was !== undefined && now !== was) n++;
    was = now;
  }
  return n;
}

/**
 * What differs between a row and what its host played. `before` is the host's layout at the press (a row's `home`
 * compares with it); absent, the row's state as solved.
 */
export function landingIssues(row: LandingCase, frames: readonly LandingCaseFrame[], layout: DockLayout, before?: DockLayout, stretchPositions?: DockLaneOptions["stretchPositions"]): string[] {
  const out: string[] = [];
  const m = row.moving;
  if (frames.length === 0) return ["no frames"];
  const hand = m?.hand ? handRule(row, before, stretchPositions) : undefined;
  if (m)
    for (const [i, f] of frames.entries()) {
      if (!f.moving) continue;
      const at = `at ${Math.round(f.point.x)},${Math.round(f.point.y)}`;
      const next = frames[i + 1];
      const beforeHop = !!next && next.region === "lane" && f.region === "lane" && next.lane === f.lane && next.spot !== f.spot;
      const bound = beforeHop && m.trailBeforeHop !== undefined ? m.trailBeforeHop : m.trail;
      if (m.lane !== undefined && (f.region !== "lane" || f.lane !== m.lane)) out.push(`${at}: ${f.region}${f.lane ? ` in ${f.lane}` : ""}, not the lane ${m.lane}`);
      if (m.notLanes && f.lane && m.notLanes.includes(f.lane)) out.push(`${at}: held ${f.lane}`);
      if (m.notRegions && m.notRegions.includes(f.region)) out.push(`${at}: ${f.region}`);
      for (const g of m.noGuideIn ? (f.guides ?? []) : []) if (m.noGuideIn!.some((r) => touches(g.rect, r))) out.push(`${at}: the guide ${g.id} where nothing lands`);
      if (bound !== undefined && f.region === "lane" && f.landing && gapTo(f.landing, f.point) > bound + 0.5) out.push(`${at}: the landing ${Math.round(gapTo(f.landing, f.point))} px from the pointer (at most ${bound}${beforeHop ? ", the frame before a hop" : ""})`);
      if (hand && f.region === "lane" && f.lane && f.spot && f.landing) {
        const lane = hand.laneOf(f.lane, f.spot);
        if (lane) {
          const p = lane.axis === "x" ? f.point.x : f.point.y;
          const l = f.landing;
          const gap = hand.gapAt(lane, p);
          const limit = handBound(gap, beforeHop);
          const d = gapTo(l, f.point);
          if (d > limit + 0.5) out.push(`${at}: the landing ${Math.round(d)} px from the pointer (at most ${Number(limit.toFixed(1))}${beforeHop ? ", the frame before a hop" : ""}${gap > 0 ? `, between landings ${Math.round(gap)} px apart` : ""})`);
          // The nearest landing of the lane: every other spot's, a sliding one where the hand holds it. A landing that
          // overlaps or touches the held one (no more than half a pixel apart) is the same place: overlapping ones
          // (spots a pitch apart) are cut at the grab, touching ones where they meet, so in either the pointer may lie
          // up to the grab inside the other. A hand faster than the model's `step` may leave a hop that reflows the
          // window for later. Neither the same place nor such a frame is compared.
          const prev = frames[i - 1];
          const quick = !!prev && Math.hypot(f.point.x - prev.point.x, f.point.y - prev.point.y) / Math.max(f.t - prev.t, 1e-6) > HAND_FAST;
          if (!quick) {
            const a = lo(l, lane.axis);
            const w0 = len(l, lane.axis);
            const here = outside(a, a + w0, p);
            let worst: { by: number; id: string; there: number } | undefined;
            for (const s of lane.spots) {
              const w = len(s.landing, lane.axis);
              const start = s.slide ? Math.min(Math.max(p - hand.share(lane.axis) * w, Math.min(s.slide.from, s.slide.to)), Math.max(s.slide.from, s.slide.to)) : lo(s.landing, lane.axis);
              if (Math.min(a + w0, start + w) - Math.max(a, start) > -0.5) continue;
              const there = outside(start, start + w, p);
              if (here - there > 2 * HAND_MARGIN + 0.5 && (!worst || here - there > worst.by)) worst = { by: here - there, id: s.id, there };
            }
            if (worst) out.push(`${at}: the landing ${Math.round(here)} px from the pointer along ${f.lane}, not the nearest landing (${worst.id}, ${Math.round(worst.there)} px)`);
          }
        } else {
          // A lane `lanes()` doesn't give for the row (another host's ids): no gap is known, so the floor holds.
          const limit = handBound(0, beforeHop);
          const d = gapTo(f.landing, f.point);
          if (d > limit + 0.5) out.push(`${at}: the landing ${Math.round(d)} px from the pointer (at most ${limit}${beforeHop ? ", the frame before a hop" : ""}; the lane ${f.lane} is not one lanes() gives)`);
        }
      }
      if (out.length >= 4) break;
    }
  if (m?.nearGuides) out.push(...nearGuideIssues(row, frames, before, stretchPositions));
  if (m?.guideSwitches !== undefined) {
    const n = guideSwitches(frames);
    if (n > m.guideSwitches) out.push(`the guides switch lane ${n} times along the path (at most ${m.guideSwitches})`);
  }
  const last = frames.at(-1)!;
  if (row.end) {
    if (last.region !== row.end.region) out.push(`the last frame is ${last.region}, not ${row.end.region}`);
    if (row.end.pending !== undefined && (last.pending ?? null) !== row.end.pending) out.push(`the last frame has ${last.pending ?? "no lane"} pending, not ${row.end.pending ?? "no lane"}`);
    if (row.end.landing) {
      if (!last.landing) out.push("the last frame lands nowhere");
      else for (const k of ["x", "y", "width", "height"] as const) if (row.end.landing[k] !== undefined && Math.abs(last.landing[k] - row.end.landing[k]!) > 0.5) out.push(`the last frame's landing ${k} is ${Math.round(last.landing[k])}, not ${row.end.landing[k]}`);
    }
    if (row.end.lane !== undefined && last.lane !== row.end.lane) out.push(`the last frame holds ${last.lane ?? "no lane"}, not ${row.end.lane ?? "no lane"}`);
    if (row.end.spot !== undefined && last.spot !== row.end.spot) out.push(`the last frame's spot is ${last.spot ?? "none"}, not ${row.end.spot}`);
  }
  if (row.layout) out.push(...layoutIssues(row.layout, layout));
  if (row.home) out.push(...homeIssues(row.item, before ?? solve(row.state), layout));
  return out;
}

/**
 * Plays every row on `host` and says what differs; a row that throws fails.
 */
export async function runLandingCases(rows: readonly LandingCase[], host: LandingCaseHost): Promise<LandingCaseResult[]> {
  const out: LandingCaseResult[] = [];
  for (const row of rows) {
    try {
      const played = await host.play(row);
      const { frames, layout, before } = played;
      const issues = landingIssues(row, frames, layout, before, played.stretchPositions);
      const over = row.moving?.trailOverSlow;
      if (over) {
        // The same path played slowly: how far the landing gets from the pointer at worst there.
        const slow = await host.play({ ...row, speed: over.slow });
        const fast = worstTrail(frames);
        const bound = worstTrail(slow.frames) + over.by;
        if (fast > bound + 0.5) issues.push(`the landing trails the pointer by ${Math.round(fast)} px, more than a slow hand's ${Math.round(bound - over.by)} px plus ${over.by}`);
      }
      const failures = issues.map((l) => `${row.id}: ${l}`);
      out.push({ id: row.id, ok: failures.length === 0, failures, skipped: null });
    } catch (e) {
      out.push({ id: row.id, ok: false, failures: [`${row.id}: ${e instanceof Error ? e.message : String(e)}`], skipped: null });
    }
  }
  return out;
}

// --- the reference host ------------------------------------------------------------------------------------------------

/** One sample interval of the reference host, ms (125 Hz). */
const SAMPLE = 8;

/**
 * The in-memory reference host for landing rows: `lanes()` over the state as solved, the landing model `landing` makes
 * (`createLandingModel`), a frame every 8 ms along the path (and on through the rest, the same point again), and a
 * release that commits the spot's or the float's `after(...).state`.
 */
export function createLandingHost(o: { readonly landing: LandingRule; readonly stretchPositions?: DockLaneOptions["stretchPositions"] }): LandingCaseHost {
  return {
    play(row) {
      const s = row.state;
      const previous = solve(s);
      const own = previous.items[row.item];
      if (!own) throw new Error(`no item ${row.item}`);
      const press = row.path[0]!;
      const grab = { x: press.x - own.rect.x, y: press.y - own.rect.y };
      // `stretchPositions` left out, the library's default.
      const laneOptions: DockLaneOptions = { previous, grab, ...(o.stretchPositions ? { stretchPositions: o.stretchPositions } : {}) };
      const drag = dockDrag(s, row.item, laneOptions);
      const regions = drag.regions;
      const home = regions.lanes.flatMap((l) => l.spots.filter((x) => x.home).map((x) => ({ lane: l.id, spot: x.id })))[0];
      const model = o.landing({ regions, landingOf: drag.landingOf, spotsOf: drag.spotsOf, ...(home ? { home } : {}), placeGuides: "near" });
      const frames: LandingCaseFrame[] = [];
      const play = (p: Point, t: number, moving: boolean): void => {
        const f = model.update(p, t);
        const guides: LandingCaseGuide[] = drag.guides(f).map((g) => ({ id: g.id, lane: g.lane, kind: g.kind, rect: g.rect }));
        frames.push({ t, point: p, moving, region: f.region, lane: f.lane, spot: f.spot, landing: f.landing, room: f.room, guides, ...(f.pending ? { pending: f.pending } : {}) });
      };
      let t = 0;
      let at = press;
      for (let i = 1; i < row.path.length; i++) {
        const a = row.path[i - 1]!;
        const b = row.path[i]!;
        const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / row.speed / SAMPLE));
        for (let k = 1; k <= n; k++) play((at = { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n }), (t += SAMPLE), true);
      }
      for (let r = SAMPLE; r <= (row.rest ?? 0); r += SAMPLE) play(at, (t += SAMPLE), false);
      const out = model.release(at, t);
      // The release commits its state's layout (`after`); home commits nothing.
      const next = out && !(out.kind === "spot" && out.home) ? drag.after(out).state : s;
      return { frames, layout: solve(next, { previous }), before: previous, ...(o.stretchPositions ? { stretchPositions: o.stretchPositions } : {}) };
    },
  };
}

// --- the rows ------------------------------------------------------------------------------------------------------------

const group = (id: string, used: number): DockItem => ({
  id,
  kind: "group",
  used,
  forms: { row: [form("row", 180, 200, 28), form("icons", 84, 84, 28), form("menu", 0, 0, 0)], column: [form("icons", 84, 84, 28), form("menu", 0, 0, 0)] },
});
const bar = (id: string, side: "top" | "bottom", ring: number, items: string[]): DockEdge => ({ id, side, ring, accepts: ["group"], items, cross: { min: 36, max: 36, rail: 36 }, gap: 4, pad: { start: 8, end: 8 } });

/**
 * A 1080×640 window: a top bar (y 0–36) with `top` in it, a bottom bar (y 604–640) with `bottom`, and a toolbar rail at
 * the left (x 0–30, from y 36) with tools and zoom.
 */
function landingWindow(top: string[] = ["a"], bottom: string[] = []): DockState {
  const ids = ["tools", "zoom", ...top, ...bottom];
  return {
    stage: rect(0, 0, 1080, 640),
    edges: [bar("top", "top", 0, top), bar("bottom", "bottom", 0, bottom), { id: "rail-left", side: "left", ring: 0, accepts: ["group"], items: ["tools", "zoom"], cross: { min: 30, max: 30, rail: 30 }, compact: true }],
    items: Object.fromEntries(ids.map((id, i) => [id, group(id, i + 1)])),
    floats: [],
    floatKinds: ["group"],
  };
}
/**
 * A 1080×640 window: a bottom bar (y 604–640) with `bottom` in it, a panel column at the left (Pages, 260 px wide) that
 * takes toolbars nowhere, and an empty toolbar rail at the left (not drawn; 30 px once a toolbar lands in it) whose drop
 * strip lies over the column's outer 30 px. The rest of the window (x past 260) is open space.
 */
function railBesideColumn(bottom: string[] = ["a"]): DockState {
  const pages: DockItem = { id: "pages", kind: "panel", used: 9, forms: { column: [form("open", 120, 240, 240, { grows: true, crossMin: 180 }), form("header", 28, 28, 240, { crossMin: 60 }), form("rail", 28, 28, 30), form("menu", 0, 0, 0)], row: [form("header", 120, 160, 28), form("menu", 0, 0, 0)] } };
  return {
    stage: rect(0, 0, 1080, 640),
    edges: [
      bar("bottom", "bottom", 0, bottom),
      { id: "rail-left", side: "left", ring: 0, accepts: ["group"], items: [], cross: { min: 30, max: 30, rail: 30 }, compact: true, zones: ["start"] },
      { id: "left-0", side: "left", ring: 1, column: true, accepts: ["panel"], items: ["pages"], cross: { min: 200, max: 480, rail: 32 }, gap: 12, hitBand: "middle" },
    ],
    items: { ...Object.fromEntries(bottom.map((id, i) => [id, group(id, i + 1)])), pages },
    floats: [],
    floatKinds: ["group"],
  };
}
/**
 * A 1080×640 window: an empty top bar (not drawn; 36 px once a toolbar lands in it), an empty toolbar rail at the left
 * (not drawn; 30 px), whose bands overlap at the top-left corner, and a bottom bar (y 604–640) with `bottom` in it.
 */
function emptyCorner(bottom: string[] = ["b"]): DockState {
  return {
    stage: rect(0, 0, 1080, 640),
    edges: [bar("top", "top", 0, []), bar("bottom", "bottom", 0, bottom), { id: "rail-left", side: "left", ring: 0, accepts: ["group"], items: [], cross: { min: 30, max: 30, rail: 30 }, compact: true, zones: ["start"] }],
    items: Object.fromEntries(bottom.map((id, i) => [id, group(id, i + 1)])),
    floats: [],
    floatKinds: ["group"],
  };
}

export const LANDING_CASES: readonly LandingCase[] = [
  {
    id: "landing-rail-repro",
    title: "An item pulled up its rail stays in the rail",
    expect: "Zoom's grip pulled straight up its rail, 6 px every 40 ms, to 4 px above the rail's top: every frame holds the rail, and the release docks Zoom above Tools.",
    state: landingWindow(),
    item: "zoom",
    path: [
      { x: 15, y: 160 },
      { x: 15, y: 32 },
    ],
    speed: 0.15,
    rest: 40,
    moving: { lane: "rail-left" },
    end: { region: "lane", lane: "rail-left" },
    layout: { order: { "rail-left": ["zoom", "tools"] } },
  },
  {
    id: "landing-edge-fling",
    title: "A pointer flung past the window's edge and held there docks against it",
    expect: "A toolbar flung from the document at 3 px/ms to 10 px past the window's left edge and held there for 40 ms docks in the rail drawn against that edge.",
    state: landingWindow(),
    item: "a",
    path: [
      { x: 60, y: 18 },
      { x: 500, y: 300 },
      { x: -10, y: 400 },
    ],
    speed: 3,
    rest: 40,
    end: { region: "lane", lane: "rail-left" },
    layout: { items: { a: { edge: "rail-left" } } },
  },
  {
    id: "landing-past-edge",
    title: "More than 48 px past the window is nowhere",
    expect: "A toolbar taken 80 px past the window's left edge and held there lands nowhere: the release puts it back.",
    state: landingWindow(),
    item: "a",
    path: [
      { x: 60, y: 18 },
      { x: 500, y: 300 },
      { x: -80, y: 400 },
    ],
    speed: 1,
    rest: 80,
    end: { region: "nowhere", lane: null },
    layout: { items: { a: { edge: "top" } } },
  },
  {
    id: "landing-lift-over-a-band",
    title: "A lift over an empty bar's band doesn't enter the bar",
    expect: "A floating toolbar lying over the empty top bar's band, lifted there and moved away into the document at 1.5 px/ms: the lift itself is no still pointer, so the top bar never holds it.",
    state: { ...landingWindow([]), items: { ...landingWindow([]).items, a: group("a", 9) }, floats: [{ id: "a", rect: rect(480, 6, 200, 28) }] },
    item: "a",
    path: [
      { x: 500, y: 20 },
      { x: 504, y: 22 },
      { x: 600, y: 320 },
    ],
    speed: 1.5,
    moving: { notLanes: ["top"] },
    end: { region: "open", lane: null },
  },
  {
    id: "landing-blocked",
    title: "Over a blocked spot a release cancels",
    expect: "A toolbar taken from its bar to the middle of a blocked spot in the document (`DockState.blocked`) and held there: no float lands there, and the release puts it back in its bar.",
    state: { ...landingWindow(), blocked: [rect(400, 250, 160, 120)] },
    item: "a",
    path: [
      { x: 60, y: 18 },
      { x: 480, y: 310 },
    ],
    speed: 0.6,
    rest: 80,
    end: { region: "refused", lane: null },
    layout: { items: { a: { edge: "top" } } },
  },
  {
    id: "landing-guides-where-it-lands",
    title: "No guide beside chrome nothing lands next to",
    expect: "Zoom held in a top bar that starts with a fixed lead and ends with fixed controls (nothing lands before the one or after the other): no guide lies in the 8 px before the lead or after the controls.",
    state: (() => {
      const s = landingWindow(["lead", "a", "ctl"]);
      const fixed = (id: string, end: boolean): DockItem => ({ id, kind: "chrome", used: 0, fixed: true, ...(end ? { align: "end" as const } : {}), forms: { row: [form("row", 120, 120, 28)] } });
      return { ...s, items: { ...s.items, lead: fixed("lead", false), ctl: fixed("ctl", true) } };
    })(),
    item: "zoom",
    path: [
      { x: 15, y: 160 },
      { x: 15, y: 18 },
      { x: 600, y: 18 },
    ],
    speed: 0.3,
    rest: 80,
    moving: { noGuideIn: [rect(0, 2, 7, 32), rect(1073, 2, 7, 32)] },
    end: { region: "lane", lane: "top" },
  },
  {
    id: "landing-fast-pass",
    title: "A fast pass over a bar opens no room in it",
    expect: "A toolbar moved from the document down across the empty bottom bar and 40 px past the window at 1.5 px/ms: the bottom bar never holds the pointer while it moves.",
    state: landingWindow(),
    item: "a",
    path: [
      { x: 60, y: 18 },
      { x: 500, y: 300 },
      { x: 520, y: 680 },
    ],
    speed: 1.5,
    moving: { notLanes: ["bottom"] },
  },
  {
    id: "landing-lane-to-lane",
    title: "Rail to bar at the corner never passes through the float",
    expect: "Zoom moved up its rail into the top bar and along it at 0.6 px/ms, resting there 80 ms: no frame floats it, and it ends in the top bar.",
    state: landingWindow(),
    item: "zoom",
    path: [
      { x: 15, y: 160 },
      { x: 15, y: 18 },
      { x: 400, y: 18 },
    ],
    speed: 0.6,
    rest: 80,
    moving: { notRegions: ["open"] },
    end: { region: "lane", lane: "top" },
    layout: { items: { zoom: { edge: "top" } } },
  },
  {
    id: "landing-fast-along-bar",
    title: "A fast hand along a bar's free stretch keeps the item at the hand",
    expect: "A toolbar moved along its bar's free stretch at 1.2 px/ms: whenever the bar holds it, the landing lies within 40 px (the spot pitch) of the pointer.",
    state: landingWindow(),
    item: "a",
    path: [
      { x: 110, y: 18 },
      { x: 970, y: 18 },
    ],
    speed: 1.2,
    moving: { lane: "top", trail: 40 },
  },
  {
    id: "landing-back-home-bar",
    title: "A toolbar taken away by its end and brought back lands home",
    expect: "A toolbar pressed 12 px from its right end in its bar (the free stretch's spots lie that way), moved into the document and back to the press point at 0.6 px/ms, resting there 80 ms: it ends on its own place, not on a free-stretch spot beside it.",
    state: landingWindow(),
    item: "a",
    path: [
      { x: 196, y: 18 },
      { x: 500, y: 300 },
      { x: 196, y: 18 },
    ],
    speed: 0.6,
    rest: 80,
    end: { region: "lane", lane: "top" },
    home: true,
  },
  {
    id: "landing-back-home-rail",
    title: "A rail toolbar taken away by its bottom and brought back lands home",
    expect: "Zoom pressed 6 px above its bottom in its rail (the free stretch's spots lie below it), moved into the document and back to the press point at 0.6 px/ms, resting there 80 ms: it ends where it was, below Tools.",
    state: landingWindow(),
    item: "zoom",
    path: [
      { x: 15, y: 198 },
      { x: 500, y: 300 },
      { x: 15, y: 198 },
    ],
    speed: 0.6,
    rest: 80,
    end: { region: "lane", lane: "rail-left" },
    home: true,
  },
  {
    id: "landing-grip-past-long-neighbor",
    title: "A toolbar held by its grip and slid past a long neighbor stays at the hand",
    expect: "A toolbar pressed 6 px into its left end (its grip) in the bottom bar and slid right along it past a 200 px neighbor to the bar's far end at 0.15 px/ms: every frame holds the bar, and the landing stays at the hand (the hand rule: the nearest landing in the bar, within 48 px of the pointer, 56 on the frame before a hop, the landings either side of the neighbor close): the grab never moves a hop past the neighbor.",
    state: landingWindow(["a"], ["b", "c"]),
    item: "b",
    path: [
      { x: 14, y: 622 },
      { x: 1060, y: 622 },
    ],
    speed: 0.15,
    rest: 40,
    moving: { lane: "bottom", hand: true },
  },
  {
    id: "landing-grip-across-items",
    title: "A toolbar held by its grip and slid slowly across two neighbors stays at the hand",
    expect: "In a top bar of three 200 px toolbars, the first pressed 6 px into its left end (its grip) and slid right across the other two to the bar's end at 0.15 px/ms: every frame holds the bar, and the landing stays at the hand (the hand rule: the nearest landing in the bar, within 48 px of the pointer, 56 on the frame before a hop, the landings either side of a neighbor close).",
    state: landingWindow(["a", "b", "c"]),
    item: "a",
    path: [
      { x: 14, y: 18 },
      { x: 1060, y: 18 },
    ],
    speed: 0.15,
    rest: 40,
    moving: { lane: "top", hand: true },
  },
  {
    id: "landing-grip-up-the-rail",
    title: "A rail toolbar held by its grip and pulled slowly up past its neighbor stays at the hand",
    expect: "Zoom pressed 6 px below its top (its grip) in its rail and pulled straight up past Tools (158 px long there) to the rail's head at 0.15 px/ms: every frame holds the rail, and the landing stays at the hand (the hand rule: the nearest landing in the rail, within max(48, g / 2 + 6) px of the pointer, g the gap between the two landings the pointer lies between, the 48 being 56 on the frame before a hop).",
    state: (() => {
      const s = landingWindow();
      const tools = group("tools", 1);
      return { ...s, items: { ...s.items, tools: { ...tools, forms: { ...tools.forms, column: [form("icons", 158, 158, 28), form("menu", 0, 0, 0)] } } } };
    })(),
    item: "zoom",
    path: [
      { x: 15, y: 200 },
      { x: 15, y: 40 },
    ],
    speed: 0.15,
    rest: 40,
    moving: { lane: "rail-left", hand: true },
  },
  ...([0.15, 0.6] as const).map(
    (speed): LandingCase => ({
      id: `landing-room-up-past-placed-${speed === 0.15 ? "slow" : "fast"}`,
      title: `A rail toolbar held by its grip and pulled up past a long neighbor that keeps room stays at the hand (${speed} px/ms)`,
      expect: `Tools (158 px) keeps 100 px of room above it at the rail's head, and Zoom keeps 80 px below Tools. Zoom pressed by its grip and pulled straight up past Tools to the rail's head at ${speed} px/ms: every frame holds the rail, and the landing stays at the hand (the hand rule: the nearest landing in the rail, within max(48, g / 2 + 6) px of the pointer, g the gap between the two landings the pointer lies between, the 48 being 56 on the frame before a hop). Over the free room a drop consumes it; over Tools, Zoom takes Tools' place and Tools gives way, so the landings either side of Tools are never a whole Tools apart.`,
      state: (() => {
        const s = landingWindow();
        const tools = group("tools", 1);
        const zoom = group("zoom", 2);
        return { ...s, items: { ...s.items, tools: { ...tools, space: 100, forms: { ...tools.forms, column: [form("icons", 158, 158, 28), form("menu", 0, 0, 0)] } }, zoom: { ...zoom, space: 80 } } };
      })(),
      item: "zoom",
      path: [
        { x: 15, y: 380 },
        { x: 15, y: 40 },
      ],
      speed,
      rest: 40,
      moving: { lane: "rail-left", hand: true },
    }),
  ),
  {
    id: "landing-step-down-room",
    title: "A toolbar slid over room that a neighbor steps down to make stays at the hand",
    expect:
      "An 870 px bottom bar: Panels (362 px, 60 in its short form) at its start, Status (382 px) at its end, 109 px between them: 93 px of room for an item less the 8 px gap each side, shorter than Tools (130 px). Tools brought from the document onto the bar and slid right along it at 0.3 px/ms: a drop between them steps Panels down, and the room that makes (266 px past Tools' length) is one sliding stretch, so whenever the bar holds it the landing stays at the hand (the hand rule: the nearest landing in the bar, within max(48, g / 2 + 6) px of the pointer, g the gap between the two landings the pointer lies between, the 48 being 56 on the frame before a hop).",
    state: (() => {
      const row = (kind: "row" | "icons", w: number) => form(kind, w, w, 31);
      const g = (id: string, used: number, forms: DockItem["forms"], more: Partial<DockItem> = {}): DockItem => ({ id, kind: "group", used, forms, ...more });
      const icons = form("icons", 84, 84, 28);
      const menu = form("menu", 0, 0, 0);
      return {
        stage: rect(0, 0, 870, 660),
        edges: [{ id: "bottom", side: "bottom", ring: 0, accepts: ["group"], items: ["panels", "status"], cross: { min: 31, max: 31, rail: 31 }, gap: 8, pad: { start: 8, end: 8 }, menu: { main: 24 } }],
        items: {
          panels: g("panels", 1, { row: [row("row", 362.3), row("icons", 60), menu], column: [icons, menu] }),
          status: g("status", 100, { row: [row("row", 382.4)], column: [icons] }, { align: "end" }),
          tools: g("tools", 2, { row: [row("row", 130), row("icons", 60), menu], column: [form("icons", 107, 107, 36), menu] }),
        },
        floats: [{ id: "tools", rect: rect(529, 53, 36, 107) }],
        floatKinds: ["group"],
      };
    })(),
    item: "tools",
    path: [
      { x: 547, y: 106 },
      { x: 100, y: 645 },
      { x: 465, y: 645 },
    ],
    speed: 0.3,
    rest: 40,
    moving: { hand: true },
    end: { region: "lane", lane: "bottom" },
  },
  {
    id: "landing-across-items",
    title: "A fast hand across docked items trails no further than it must",
    expect: "Zoom moved up its rail and along a bar of three toolbars at 1.2 px/ms, both ways: no frame floats it, and its landing is never further from the pointer than when the same path is played at 0.05 px/ms, plus 40 px.",
    state: landingWindow(["a", "b", "c"]),
    item: "zoom",
    path: [
      { x: 15, y: 160 },
      { x: 15, y: 18 },
      { x: 1040, y: 18 },
      { x: 40, y: 18 },
    ],
    speed: 1.2,
    moving: { notRegions: ["open"], trailOverSlow: { slow: 0.05, by: 40 } },
  },
  {
    id: "landing-near-rail-glide",
    title: "A toolbar glided to an empty rail beside a panel column shows no guide until it can enter the rail",
    expect:
      "A toolbar lifted from the bottom bar and glided at 0.3 px/ms up and left over a panel column (it takes no toolbar) to the empty left rail's strip, resting there 40 ms: the rail's guide shows only once the pointer is in the strip, never over the column on the way (the Near guides' rule: a lane's guide shows where the pointer holds it, is pending in it, or is in open space within 12 px of it), the rail holds the pointer from its first slow step in the strip (the place under it is the column's, which takes nothing, and there is nothing else to mean there), and the toolbar takes the rail's icons form, in the rail's 30 px, as it lands.",
    state: railBesideColumn(),
    item: "a",
    path: [
      { x: 60, y: 622 },
      { x: 15, y: 320 },
    ],
    speed: 0.3,
    rest: 40,
    moving: { nearGuides: true, hand: true },
    end: { region: "lane", lane: "rail-left", landing: { x: 0, width: 30 } },
    layout: { items: { a: { edge: "rail-left", formKind: "icons" } }, order: { "rail-left": ["a"] } },
  },
  {
    id: "landing-near-rail-pending-release",
    title: "A release while the rail is pending floats nothing and goes home",
    expect:
      "The same toolbar glided at 0.6 px/ms (a fast hand: faster than the gate's 0.375 px/ms) into the rail's strip and released on arrival: the rail is pending (the pointer is inside it, its gate not passed), its guide shows (the Near guides' rule), the last frame lands nowhere (the place under it is the column's), and the release puts the toolbar back in the bottom bar.",
    state: railBesideColumn(),
    item: "a",
    path: [
      { x: 60, y: 622 },
      { x: 15, y: 320 },
    ],
    speed: 0.6,
    moving: { nearGuides: true },
    end: { region: "refused", lane: null, pending: "rail-left" },
    layout: { items: { a: { edge: "bottom" } } },
  },
  {
    id: "landing-near-corner-steady",
    title: "At a corner between two lanes the Near guides don't flicker",
    expect:
      "A toolbar lifted from the bottom bar, taken into the open space at the corner where the top bar meets the left rail (x 30, y 36) and moved back and forth across it at 0.3 px/ms, 8 px each way, between points where one lane is nearer then the other (both within 12 px): the guides go from the bottom bar's to one lane's once, and stay that lane's, never switching to the other and back (the kept lane gives way only to one 16 px nearer); the release there is in open space, a float.",
    state: landingWindow(["a"], ["b"]),
    item: "b",
    path: [
      { x: 60, y: 622 },
      { x: 100, y: 60 },
      // Back and forth three times: the top bar is nearer at the first point, the rail at the second.
      ...[0, 1, 2].flatMap(() => [
        { x: 40, y: 38 },
        { x: 32, y: 46 },
      ]),
      { x: 40, y: 38 },
    ],
    speed: 0.3,
    rest: 40,
    moving: { nearGuides: true, guideSwitches: 1 },
    end: { region: "open" },
    layout: { items: { b: { floating: true } } },
  },
  {
    id: "landing-near-pending-corner-steady",
    title: "Inside two lanes that overlap at a corner, the pending lane doesn't flicker",
    expect:
      "A toolbar lifted from the bottom bar and carried at 0.6 px/ms into the corner where the empty top bar's band and the empty left rail's overlap, then moved back and forth inside both, between (26, 21), deeper in the bar, and (20, 27), a pixel deeper in the rail: neither lane is entered (the hand never slows), the bar is pending from the first point inside both and stays pending (the other lane takes over only once it is deeper by the spot margin, 6 px), so the guides go from the bottom bar's to the top bar's once.",
    state: emptyCorner(),
    item: "b",
    path: [
      { x: 60, y: 622 },
      { x: 100, y: 100 },
      { x: 26, y: 21 },
      ...[0, 1, 2, 3].flatMap(() => [
        { x: 20, y: 27 },
        { x: 26, y: 21 },
      ]),
    ],
    speed: 0.6,
    moving: { nearGuides: true, guideSwitches: 1, notLanes: ["top", "rail-left"] },
  },
];
