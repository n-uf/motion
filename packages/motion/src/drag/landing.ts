import type { Point, Rect } from "../shapes";
import type { DragKeys } from "./intent";
import type { PlaceGuides } from "./preview";

/**
 * The landing model: where a docking drag's item lands, as state rather than a per-frame guess. A host gives it the
 * drag's regions (from `@n-uf/placement/scene`'s `lanes()`: plain data, the shapes below) and each pointer sample; it
 * says the region the pointer is in, the lane and spot held, where the item lands, whether the room is open, and the
 * place guides. Every change comes from where the pointer is and how it moved (margins, a path length, a step size),
 * never from waiting.
 *
 * - **A lane holds** while the pointer is inside its rect grown by `exit`, whatever lies under it. Inside, over a spot's
 *   stretch it is at that spot; over a refused stretch of the lane, refused ("Can't go here"), unless the stretch is
 *   shorter than the item, which then counts as the neighboring spot's.
 * - **Entering a lane** needs one of two gates: `path` px of pointer path inside it, or a still step (at most `still`)
 *   once `depth` px inside. A fly-through of a thin bar or rail meets neither, so its room never opens.
 * - **Along a lane** the spot changes once the pointer is `spot` px past the boundary and its step is at most `step`. A
 *   fast step keeps the last spot; the next slow one goes straight to the spot under the pointer. With `regionsFor`, a
 *   change is kept only if, in the new spot's own regions (its room open), the pointer still lies in that spot's
 *   stretch: the room shifting the boundary never bounces the spot.
 * - **Outside every lane:** a refused place, refused; open space (`"open"`: the content less what blocks it, the page),
 *   the float at its landing; outside the stage, nowhere; else (docked content that takes nothing and refuses nothing)
 *   refused.
 * - **Shift** turns a lane or open space into open space (the float), and hides the guides.
 * - Steps are measured per sample normalized to 125 Hz, so the gates read the same at any input rate.
 */

/** A place a drop in a lane lands: its stretch of the lane and its landing rect. Ids are stable across solves. */
export interface LandingSpot {
  readonly id: string;
  readonly along: readonly [number, number];
  readonly landing: Rect;
}
export interface LandingLane {
  readonly id: string;
  readonly rect: Rect;
  readonly axis: "x" | "y";
  readonly spots: readonly LandingSpot[];
  readonly refused: readonly { readonly along: readonly [number, number] }[];
}
/** A drag's regions (`lanes()` gives them). */
export interface LandingRegions {
  readonly lanes: readonly LandingLane[];
  readonly refused: readonly Rect[];
  readonly content: Rect;
  readonly blocked: readonly Rect[];
  readonly stage: Rect;
  /** The held item's size: a refused stretch shorter than it along the lane counts as the neighboring spot's. */
  readonly item: { readonly width: number; readonly height: number };
}

export interface LandingMargins {
  /** Past a held lane's rect before it lets go, px. */
  readonly exit: number;
  /** Past a spot boundary before the spot changes, px. */
  readonly spot: number;
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

export const LANDING_MARGINS: LandingMargins = { exit: 12, spot: 6 };
/** A touch: wider margins, the finger's jitter. */
export const LANDING_TOUCH_MARGINS: LandingMargins = { exit: 16, spot: 8 };
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

/** A guide: a spot of a lane, where to draw it now. */
export interface LandingGuide {
  readonly lane: string;
  readonly spot: string;
  readonly landing: Rect;
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
/** How deep `p` lies inside `r` (0 on its edge or outside). */
const depthIn = (r: Rect, p: Point): number => Math.max(0, Math.min(p.x - r.x, r.x + r.width - p.x, p.y - r.y, r.y + r.height - p.y));
const distanceTo = (r: Rect, p: Point): number => Math.hypot(Math.max(r.x - p.x, 0, p.x - (r.x + r.width)), Math.max(r.y - p.y, 0, p.y - (r.y + r.height)));
const alongOf = (lane: LandingLane, p: Point): number => (lane.axis === "x" ? p.x : p.y);
const itemLength = (regions: LandingRegions, lane: LandingLane): number => (lane.axis === "x" ? regions.item.width : regions.item.height);

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
  let last: { p: Point; t: number } | null = null;
  /** Path inside each lane since the pointer last entered its rect. */
  const pathIn = new Map<string, number>();
  let approached: string | null = null;
  let previous: LandingRegion = laneId ? "lane" : "open";
  let frame: LandingFrame = { region: previous, lane: laneId, spot: spotId, landing: null, room: !!spotId, guides: [], shift: false };

  const laneIn = (regions: LandingRegions, id: string | null): LandingLane | undefined => (id ? regions.lanes.find((l) => l.id === id) : undefined);
  const spotIn = (lane: LandingLane | undefined, id: string | null): LandingSpot | undefined => (lane && id ? lane.spots.find((s) => s.id === id) : undefined);

  /**
   * The spot a point along `lane` picks: the spot whose stretch holds it, or null over a refused stretch at least the
   * item's length; a shorter refused stretch counts as the nearest spot's.
   */
  function pick(regions: LandingRegions, lane: LandingLane, a: number): LandingSpot | null {
    const refused = lane.refused.find((r) => a >= r.along[0] && a <= r.along[1]);
    if (refused && refused.along[1] - refused.along[0] >= itemLength(regions, lane)) return null;
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
    const cand = pick(regions, held, a);
    if (!cand) return null;
    if (!now || cand.id === now.id) return cand;
    // Past the boundary by the margin, and a slow enough step; else the last spot holds.
    const past = a < now.along[0] - margins.spot || a > now.along[1] + margins.spot;
    if (!past || step > gates.step) return now;
    // The fixed point: in the candidate's own regions (its room open), the pointer still picks it.
    if (options.regionsFor) {
      const theirs = heldRegions(cand.id);
      const lane2 = laneIn(theirs, lane.id);
      if (lane2 && pick(theirs, lane2, alongOf(lane2, p))?.id !== cand.id) return now;
    }
    return cand;
  }

  function guidesFor(p: Point, region: LandingRegion, shift: boolean): LandingGuide[] {
    if (guidesLevel === "off" || shift) return [];
    const regions = heldRegions(spotId);
    const all = (l: LandingLane): LandingGuide[] => l.spots.map((s) => ({ lane: l.id, spot: s.id, landing: s.landing }));
    if (guidesLevel === "all") return regions.lanes.flatMap(all);
    if (region === "lane" && laneId) {
      approached = laneId;
      const l = laneIn(regions, laneId);
      return l ? all(l) : [];
    }
    // The approached lane: the nearest within reach, kept until another is clearly nearer or it is past `keep`.
    let best: LandingLane | null = null;
    let bestD = Infinity;
    for (const l of regions.lanes) {
      const d = distanceTo(l.rect, p);
      if (d < bestD) {
        best = l;
        bestD = d;
      }
    }
    const kept = laneIn(regions, approached);
    if (kept) {
      const d = distanceTo(kept.rect, p);
      if (d > approach.keep) approached = null;
      else if (best && best.id !== kept.id && bestD + approach.nearer < d) approached = bestD <= approach.reach ? best.id : null;
    } else approached = best && bestD <= approach.reach ? best.id : null;
    const l = laneIn(regions, approached);
    return l ? all(l) : [];
  }

  function update(p: Point, t: number, keys?: DragKeys): LandingFrame {
    const dist = last ? Math.hypot(p.x - last.p.x, p.y - last.p.y) : 0;
    // A step normalized to 125 Hz (8 ms between samples).
    const step = last ? (dist * 8) / Math.max(1, t - last.t) : 0;
    const from = last?.p ?? null;
    last = { p, t };
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
      if (held && inside(held.rect, p, margins.exit)) {
        const s = along(held, p, step);
        spotId = s?.id ?? spotId;
        region = s ? "lane" : "refused";
        if (!s) spotId = null;
      } else {
        laneId = spotId = null;
        // Entering: the path gate or the still gate; at a tie, the lane the pointer is deeper in.
        let entered: LandingLane | null = null;
        for (const l of regions.lanes) {
          if (!strictlyIn(l.rect, p)) continue;
          const ok = (pathIn.get(l.id) ?? 0) >= gates.path || (depthIn(l.rect, p) >= gates.depth && step <= gates.still);
          if (ok && (!entered || depthIn(l.rect, p) > depthIn(entered.rect, p))) entered = l;
        }
        if (entered) {
          laneId = entered.id;
          const s = pick(regions, entered, alongOf(entered, p));
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
      else if (l && spotId && !spotIn(l, spotId) && last) spotId = pick(base, l, alongOf(l, last.p))?.id ?? null;
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
