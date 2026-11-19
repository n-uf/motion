import type { Point, Rect } from "../shapes";
import type { DragKeys } from "./intent";
import type { PlaceGuides } from "./preview";

/**
 * The landing model: where a docking drag's item lands, as state rather than a per-frame guess. A host gives it the
 * drag's regions (from `@n-uf/placement/scene`'s `lanes()`: plain data, the shapes below) and each pointer sample; it
 * says the region the pointer is in, the lane and spot held, where the item lands, whether the room is open, and the
 * place guides. Every change comes from where the pointer is and how it moved (margins, a path length, a step size):
 * the model has no waits of its own.
 *
 * - **The stage's edge** is the easiest place to dock: a pointer past the stage by up to `edge` px counts as on its
 *   edge, so it lies deep inside a lane drawn against that edge; beyond, it is nowhere.
 * - **A lane holds** while the pointer is inside its rect grown by `exit`, whatever lies under it. Inside, over a spot's
 *   stretch it is at that spot; over a refused stretch of the lane, refused ("Can't go here"). (Placement's `lanes()`
 *   joins a refused stretch shorter than the item to its spots.)
 * - **Entering a lane** needs one of two gates: `path` px of pointer path inside it, or a still step (at most `still`)
 *   once `depth` px inside, the depth counted only from the lane's sides that face into the stage (on the edge it is
 *   deep). A fly-through of a thin bar or rail meets neither, so its room never opens. From a held lane into one that
 *   touches it, the pointer `spot` px past the held lane's rect, the new lane is taken at once: lane to lane never passes
 *   through the float.
 * - **Along a lane** the spot changes once the pointer is `spot` px past the boundary; where the change moves another
 *   item (the two spots' `others` keys differ), only on a step of at most `step`. A fast step then keeps the last spot; the
 *   next slow one goes straight to the spot under the pointer. A change that moves only the held item follows the hand
 *   at any speed. With `regionsFor`, a change is kept only if, in the new spot's own regions (its room open), the
 *   pointer still lies in that spot's stretch: the room shifting the boundary never bounces the spot.
 * - **Outside every lane:** a refused place, refused; open space (`"open"`: the content less what blocks it, the page),
 *   the float at its landing; outside the stage (past `edge`), nowhere; else (docked content that takes nothing and
 *   refuses nothing) refused.
 * - **Shift** turns a lane or open space into open space (the float), and hides the guides.
 * - **Guides** are the lane's `marks` (lines between items, a box per free stretch, in the layout as drawn), else its
 *   spots' landings: the held lane's; else the approached lane's (the nearest within `reach`); over a refused place the
 *   nearest lane's at any distance, so the lane behind a refused column shows its guides.
 * - Steps are measured per sample normalized to 125 Hz, so the gates read the same at any input rate.
 *
 * **The host's part:** one `update` per pointer sample, and one more, a rest update with the same point, when the
 * pointer has not moved for two sample intervals (about 25–30 ms): a pointer that stops sends no samples, and the still
 * gate needs a step of zero. That is the only wait, the host's, and it is a sample interval, not a delay.
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
}
/** A place guide's mark: a line between two items, a box over a free stretch, in the layout as drawn. */
export interface LandingMark {
  readonly kind: "line" | "box";
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
  /** Past a spot boundary before the spot changes, px; past a held lane into one that touches it before that one holds. */
  readonly spot: number;
  /** Past the stage that still counts as on its edge, px; beyond, nowhere. */
  readonly edge: number;
}
export interface LandingGates {
  /** Pointer path inside a lane that enters it, px. */
  readonly path: number;
  /** Depth inside a lane where a still step enters it, px. */
  readonly depth: number;
  /** A still step, px per 8 ms. */
  readonly still: number;
  /** The largest step that changes the spot along a lane, px per 8 ms. */
  readonly step: number;
}
/** The approach for near guides: the nearest lane within `reach`, kept until another is `nearer` closer or past `keep`. */
export interface LandingApproach {
  readonly reach: number;
  readonly keep: number;
  readonly nearer: number;
}

export const LANDING_MARGINS: LandingMargins = { exit: 12, spot: 6, edge: 48 };
/** A touch: wider margins, the finger's jitter. */
export const LANDING_TOUCH_MARGINS: LandingMargins = { exit: 16, spot: 8, edge: 48 };
export const LANDING_GATES: LandingGates = { path: 40, depth: 8, still: 1.5, step: 3 };
export const LANDING_APPROACH: LandingApproach = { reach: 80, keep: 96, nearer: 16 };

export interface LandingOptions {
  readonly regions: LandingRegions;
  /** The regions with `spot` held (its room open): the fixed-point check and the stretches while held. Cached per id. */
  readonly regionsFor?: (spot: string) => LandingRegions | null;
  /** The float's landing for a pointer over the document, or null where the item doesn't float. */
  readonly floatLanding?: (point: Point) => Rect | null;
  /** The item's own place at the lift: its lane and spot (the drag starts there, the room open). */
  readonly home?: { readonly lane: string; readonly spot: string };
  readonly margins?: Partial<LandingMargins>;
  readonly gates?: Partial<LandingGates>;
  readonly approach?: Partial<LandingApproach>;
  readonly placeGuides?: PlaceGuides;
}

export type LandingRegion = "lane" | "open" | "refused" | "nowhere";

/** A guide: a mark of a lane, where to draw it now (a spot's landing is a box). */
export interface LandingGuide {
  readonly lane: string;
  readonly kind: "line" | "box";
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
}

/** What a release lands: a spot (`home` when it is the item's own place), the float at `rect`, or nothing. */
export type LandingRelease = { readonly kind: "spot"; readonly lane: string; readonly spot: string; readonly home: boolean } | { readonly kind: "float"; readonly rect: Rect } | null;

export interface LandingModel {
  update(point: Point, time: number, keys?: DragKeys): LandingFrame;
  /** What a release lands, by the last frame: the same answer as its `landing`. */
  release(): LandingRelease;
  /** The regions changed (a resize, a store change, a scroll): spots map by id; a lost one goes to its lane's nearest. */
  setRegions(regions: LandingRegions): void;
  /** The view moved under the pointer: the gates start again, the lane is let go. */
  hide(): void;
  readonly frame: LandingFrame;
}

const inside = (r: Rect, p: Point, grow = 0): boolean => p.x >= r.x - grow && p.x <= r.x + r.width + grow && p.y >= r.y - grow && p.y <= r.y + r.height + grow;
const strictlyIn = (r: Rect, p: Point): boolean => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
/**
 * How deep `p` lies inside `r` (0 on its edge or outside), counted only from the sides of `r` that face into `stage`: a
 * side on the stage's edge is open, as deep as the pointer can go.
 */
function depthIn(r: Rect, p: Point, stage: Rect): number {
  if (!strictlyIn(r, p)) return 0;
  const on = (a: number, b: number): boolean => Math.abs(a - b) < 1;
  const sides = [
    on(r.x, stage.x) ? Infinity : p.x - r.x,
    on(r.x + r.width, stage.x + stage.width) ? Infinity : r.x + r.width - p.x,
    on(r.y, stage.y) ? Infinity : p.y - r.y,
    on(r.y + r.height, stage.y + stage.height) ? Infinity : r.y + r.height - p.y,
  ];
  return Math.max(0, Math.min(...sides));
}
const distanceTo = (r: Rect, p: Point): number => Math.hypot(Math.max(r.x - p.x, 0, p.x - (r.x + r.width)), Math.max(r.y - p.y, 0, p.y - (r.y + r.height)));
const alongOf = (lane: LandingLane, p: Point): number => (lane.axis === "x" ? p.x : p.y);
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
  const cache = new Map<string, LandingRegions | null>();
  /** The regions with `spot` held: the host's, cached for this lift until `setRegions`. */
  const heldRegions = (spot: string | null): LandingRegions => {
    if (!spot || !options.regionsFor) return base;
    if (!cache.has(spot)) cache.set(spot, options.regionsFor(spot));
    return cache.get(spot) ?? base;
  };

  let laneId: string | null = options.home?.lane ?? null;
  let spotId: string | null = options.home?.spot ?? null;
  let last: { p: Point; raw: Point; t: number } | null = null;
  /** Path inside each lane since the pointer last entered its rect. */
  const pathIn = new Map<string, number>();
  let approached: string | null = null;
  let previous: LandingRegion = laneId ? "lane" : "open";
  let frame: LandingFrame = { region: previous, lane: laneId, spot: spotId, landing: null, room: !!spotId, guides: [], shift: false };

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
    const regions = heldRegions(spotId);
    const held = laneIn(regions, lane.id) ?? lane;
    const a = alongOf(held, p);
    const now = spotIn(held, spotId);
    const cand = pick(held, a);
    if (!cand) return null;
    if (!now || cand.id === now.id) return cand;
    // Past the boundary by the margin; where the change moves another item, on a slow enough step. Else the last spot holds.
    const past = a < now.along[0] - margins.spot || a > now.along[1] + margins.spot;
    const reflows = now.others === undefined || now.others !== cand.others;
    if (!past || (reflows && step > gates.step)) return now;
    // The fixed point: in the candidate's own regions (its room open), the pointer still picks it.
    if (options.regionsFor && reflows) {
      const theirs = heldRegions(cand.id);
      const lane2 = laneIn(theirs, lane.id);
      if (lane2 && pick(lane2, alongOf(lane2, p))?.id !== cand.id) return now;
    }
    return cand;
  }

  function guidesFor(p: Point, region: LandingRegion, shift: boolean): LandingGuide[] {
    if (guidesLevel === "off" || shift) return [];
    const regions = heldRegions(spotId);
    const all = (l: LandingLane): LandingGuide[] => (l.marks ?? l.spots.map((s) => ({ kind: "box" as const, rect: s.landing }))).map((m) => ({ lane: l.id, kind: m.kind, rect: m.rect }));
    if (guidesLevel === "all") return regions.lanes.flatMap(all);
    if ((region === "lane" || region === "refused") && laneId) {
      approached = laneId;
      const l = laneIn(regions, laneId);
      return l ? all(l) : [];
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
    // Over a refused place: the nearest lane at any distance (the lane behind a refused column).
    if (region === "refused") {
      approached = best?.id ?? null;
      return best ? all(best) : [];
    }
    // The approached lane: the nearest within reach, kept until another is clearly nearer or it is past `keep`.
    const kept = laneIn(regions, approached);
    if (kept) {
      const d = distanceTo(kept.rect, p);
      if (d > approach.keep) approached = null;
      else if (best && best.id !== kept.id && bestD + approach.nearer < d) approached = bestD <= approach.reach ? best.id : null;
    } else approached = best && bestD <= approach.reach ? best.id : null;
    const l = laneIn(regions, approached);
    return l ? all(l) : [];
  }

  function update(raw: Point, t: number, keys?: DragKeys): LandingFrame {
    // Past the stage by up to `edge`: on its edge. Beyond: nowhere (kept as is).
    const p = ontoStage(heldRegions(spotId).stage, raw, margins.edge) ?? raw;
    const dist = last ? Math.hypot(p.x - last.p.x, p.y - last.p.y) : 0;
    // A step normalized to 125 Hz (8 ms between samples), of the pointer as it moved (a fling past the edge isn't still).
    const step = last ? (Math.hypot(raw.x - last.raw.x, raw.y - last.raw.y) * 8) / Math.max(1, t - last.t) : 0;
    const from = last?.p ?? null;
    last = { p, raw, t };
    const shift = !!keys?.shift;
    const regions = heldRegions(spotId);
    // The path inside each lane: steps from a point inside it to another (the step that enters doesn't count).
    for (const l of regions.lanes) pathIn.set(l.id, strictlyIn(l.rect, p) ? (pathIn.get(l.id) ?? 0) + (from && strictlyIn(l.rect, from) ? dist : 0) : 0);

    let region: LandingRegion;
    if (!inside(regions.stage, p)) {
      // Outside the stage: nowhere, and the lane is let go.
      region = "nowhere";
      laneId = spotId = null;
    } else {
      const held = laneIn(regions, laneId);
      // Lane to lane: a lane touching the held one, the pointer `spot` px past the held lane's rect, is taken at once.
      const next = held ? regions.lanes.find((l) => l.id !== held.id && strictlyIn(l.rect, p) && touches(l.rect, held.rect) && !inside(held.rect, p, margins.spot)) : undefined;
      if (held && !next && inside(held.rect, p, margins.exit)) {
        const s = along(held, p, step);
        spotId = s?.id ?? spotId;
        region = s ? "lane" : "refused";
        if (!s) spotId = null;
      } else {
        laneId = spotId = null;
        // Entering: a touching lane at once, else the path gate or the still gate; at a tie, the lane the pointer is
        // deeper in.
        let entered: LandingLane | null = next ?? null;
        if (!entered)
          for (const l of regions.lanes) {
            if (!strictlyIn(l.rect, p)) continue;
            const deep = depthIn(l.rect, p, regions.stage);
            const ok = (pathIn.get(l.id) ?? 0) >= gates.path || (deep >= gates.depth && step <= gates.still);
            if (ok && (!entered || deep > depthIn(entered.rect, p, regions.stage))) entered = l;
          }
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
    const shown: LandingRegion = shift && (region === "lane" || region === "open") ? "open" : region;
    const r2 = heldRegions(spotId);
    const spot = spotIn(laneIn(r2, laneId), spotId);
    const landing = shown === "lane" ? (spot?.landing ?? null) : shown === "open" ? (options.floatLanding?.(p) ?? null) : null;
    frame = {
      region: shown,
      lane: laneId,
      spot: shown === "lane" ? spotId : null,
      landing,
      room: shown === "lane" && !!spot,
      guides: guidesFor(p, shown, shift),
      shift,
    };
    return frame;
  }

  return {
    update,
    release(): LandingRelease {
      if (frame.region === "lane" && frame.lane && frame.spot) return { kind: "spot", lane: frame.lane, spot: frame.spot, home: !!options.home && options.home.spot === frame.spot && options.home.lane === frame.lane };
      if (frame.region === "open" && frame.landing) return { kind: "float", rect: frame.landing };
      return null;
    },
    setRegions(regions: LandingRegions): void {
      base = regions;
      cache.clear();
      const l = laneIn(base, laneId);
      if (laneId && !l) laneId = spotId = null;
      else if (l && spotId && !spotIn(l, spotId) && last) spotId = pick(l, alongOf(l, last.p))?.id ?? null;
    },
    hide(): void {
      laneId = spotId = null;
      approached = null;
      pathIn.clear();
      last = null;
    },
    get frame(): LandingFrame {
      return frame;
    },
  };
}
