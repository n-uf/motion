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
 * - **Entering a lane** needs one of two gates: `path` px of slow pointer path along it inside it (steps of at most
 *   `step`), or a still step (at most `still`) once `depth` px inside, the depth counted only from the lane's sides that
 *   face into the stage (on the edge it is deep). A fly-through of a thin bar or rail at any angle meets neither, so its
 *   room never opens. Inside a lane that touches the held one, past the held lane's exit margin, the held lane holds
 *   until that lane's gate passes or the pointer has slid `path` px along it at any speed (across it at most a third as
 *   far): lane to lane never passes through the float, and never opens a crossed lane's room.
 * - **Along a lane** the spot changes once the pointer is `spot` px past the boundary; where the change moves another
 *   item (the two spots' `others` keys differ), on a step of at most `step`, or once the held landing trails the
 *   pointer by more than `trail`: the item chases only as far as it must. A change that moves only the held item
 *   follows the hand at any speed. With `regionsFor`, a reflowing change is kept only if, in the new spot's own regions
 *   (its room open), the pointer still lies in that spot's stretch: the room shifting the boundary never bounces it.
 * - **Outside every lane:** a refused place, refused; open space (`"open"`: the content less what blocks it, the page),
 *   the float at its landing; outside the stage (past `edge`), nowhere; else (docked content that takes nothing and
 *   refuses nothing) refused.
 * - **Shift** turns a lane or open space into open space (the float), and hides the guides.
 * - **Guides** are the lane's `marks` (lines between items, a box per free stretch, in the layout as drawn), else its
 *   spots' landings: the held lane's; else the approached lane's (the nearest within `reach`); over a refused place the
 *   nearest lane's at any distance, so the lane behind a refused column shows its guides.
 * - Steps are measured between points that differ, normalized to 125 Hz, so the gates read the same at any input rate.
 *   A repeated point keeps the last step; it is still only once the pointer has stayed put for `rest` ms.
 *
 * **The host's part:** call `update` whenever you like: per pointer sample, per animation frame, or both. Call it at
 * least once more after the pointer stops (every frame does), so it can become still, and again with the same point
 * when a key changes. Give `setRegions` the `regionsFor` that answers for the new state.
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
  /** Stable while its neighbors stay; absent, the guide is keyed by its lane and place in the list. */
  readonly id?: string;
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
  /** Past a spot boundary before the spot changes, px. */
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
  /**
   * The largest step that changes the spot along a lane where the change reflows the window, px per 8 ms; it also
   * bounds the steps the path gate counts (a fast crossing never enters).
   */
  readonly step: number;
  /** How far the held landing may trail the pointer before a fast reflowing change is taken anyway, px. */
  readonly trail: number;
  /**
   * The time a pointer has to stay put before it counts as still, ms, where its last step was already slow (at most
   * `step`) or it is on the stage's edge (a fling there is taken at once); repeated points before it aren't still.
   */
  readonly rest: number;
  /** The time a pointer that last moved fast has to stay put before it counts as still, ms: longer than sample gaps. */
  readonly pause: number;
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
export const LANDING_GATES: LandingGates = { path: 40, depth: 8, still: 1.5, step: 3, trail: 40, rest: 22, pause: 60 };
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
  /** Stable while its neighbors stay: the mark's id, else `<lane>/<spot id>` for a spot's landing. Key a drawing by it. */
  readonly id: string;
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
  let lastStep = 0;
  /** Path inside each lane since the pointer last entered its rect. */
  const pathIn = new Map<string, number>();
  /** The path along and across each lane at any speed since the pointer entered it (a touching lane's takeover). */
  const slide = new Map<string, { along: number; across: number }>();
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
    // Where the boundary already lies far from the held landing (a long neighbor to pass), the margin shrinks, down to 2
    // px, so the hop comes before the landing trails the pointer by more than `trail` on that account.
    const lo0 = held.axis === "x" ? now.landing.x : now.landing.y;
    const hi0 = lo0 + (held.axis === "x" ? now.landing.width : now.landing.height);
    // Room for a sample's step past the margin too (one more margin's worth).
    const marginAt = (boundary: number): number => Math.min(margins.spot, Math.max(2, gates.trail - margins.spot - Math.max(0, lo0 - boundary, boundary - hi0)));
    const past = a < now.along[0] - marginAt(now.along[0]) || a > now.along[1] + marginAt(now.along[1]);
    const reflows = now.others === undefined || now.others !== cand.others;
    if (!past) return now;
    // A fast reflowing change waits for a slow step, unless the held landing already trails the pointer by `trail`: the
    // item chases only as far as it must, so a fast hand across docked items never leaves it far behind.
    if (reflows && step > gates.step && distanceTo(now.landing, p) <= gates.trail) return now;
    // The fixed point: in the candidate's own regions (its room open), the pointer still picks it.
    if (regionsFor && reflows) {
      const theirs = heldRegions(cand.id);
      const lane2 = laneIn(theirs, lane.id);
      if (lane2 && pick(lane2, alongOf(lane2, p))?.id !== cand.id) return now;
    }
    return cand;
  }

  function guidesFor(p: Point, region: LandingRegion, shift: boolean): LandingGuide[] {
    if (guidesLevel === "off" || shift) return [];
    const regions = heldRegions(spotId);
    const all = (l: LandingLane): LandingGuide[] =>
      l.marks
        ? l.marks.map((m, i) => ({ id: m.id ?? `${l.id}#${i}`, lane: l.id, kind: m.kind, rect: m.rect }))
        : l.spots.map((s) => ({ id: `${l.id}/${s.id}`, lane: l.id, kind: "box" as const, rect: s.landing }));
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
    // The step: the pointer as it moved (a fling past the edge isn't still) since the last point that differed,
    // normalized to 125 Hz (8 ms). A repeated point (a host updating per frame, or a gap between sparse samples) keeps
    // the last step until the pointer has stayed put for `rest` ms after a slow step or on the stage's edge, else for
    // `pause` ms; only then is it still. A hand moving fast with samples far apart is never still between them.
    let step = 0;
    if (moved && (raw.x !== moved.raw.x || raw.y !== moved.raw.y)) {
      step = (Math.hypot(raw.x - moved.raw.x, raw.y - moved.raw.y) * 8) / Math.max(1, t - moved.t);
      moved = { raw, t };
      lastStep = step;
    } else if (moved) {
      const stage = heldRegions(spotId).stage;
      const onEdge = p.x <= stage.x || p.y <= stage.y || p.x >= stage.x + stage.width || p.y >= stage.y + stage.height;
      const since = t - moved.t;
      step = since >= gates.pause || (since >= gates.rest && (lastStep <= gates.step || onEdge)) ? 0 : lastStep;
    } else {
      // The first point: how the pointer moves is unknown, never still (a lift over a lane's band doesn't enter it).
      moved = { raw, t };
      step = lastStep = Infinity;
    }
    const from = last?.p ?? null;
    // The pointer as it moved: a fling off the stage's edge moves across a lane there though its clamped point doesn't.
    const fromRaw = last?.raw ?? null;
    last = { p, raw, t };
    const shift = !!keys?.shift;
    const regions = heldRegions(spotId);
    // The path inside each lane: the part along the lane of slow steps from a point inside it to another (the step that
    // enters doesn't count, nor a fast one), so a crossing at `step` speed or faster never enters by path at any angle.
    // From a held lane, a touching lane counts the path along it and across it at any speed: a fast slide along it
    // (across it at most a third as far as along) is no crossing.
    const slow = step <= gates.step;
    for (const l of regions.lanes) {
      const was = from && strictlyIn(l.rect, from);
      const go = was ? Math.abs(alongOf(l, p) - alongOf(l, from)) : 0;
      const over = was && fromRaw ? Math.abs(acrossOf(l, raw) - acrossOf(l, fromRaw)) : 0;
      const inL = strictlyIn(l.rect, p);
      pathIn.set(l.id, inL ? (pathIn.get(l.id) ?? 0) + (slow ? go : 0) : 0);
      const s = slide.get(l.id);
      slide.set(l.id, inL ? { along: (s?.along ?? 0) + go, across: (s?.across ?? 0) + over } : { along: 0, across: 0 });
    }

    let region: LandingRegion;
    if (!inside(regions.stage, p)) {
      // Outside the stage: nowhere, and the lane is let go.
      region = "nowhere";
      laneId = spotId = null;
    } else {
      const held = laneIn(regions, laneId);
      const gate = (l: LandingLane): boolean => (pathIn.get(l.id) ?? 0) >= gates.path || (depthIn(l.rect, p, regions.stage) >= gates.depth && step <= gates.still);
      // Lane to lane: inside a lane touching the held one, past the held lane's exit margin (inside it the held lane holds,
      // P1), the held lane still holds until that lane's gate passes, then that lane takes it. Never the float between
      // them, never a fly-through's room.
      const touching = held ? regions.lanes.find((l) => l.id !== held.id && strictlyIn(l.rect, p) && touches(l.rect, held.rect) && !inside(held.rect, p, margins.exit)) : undefined;
      const sl = touching ? slide.get(touching.id) : undefined;
      const slid = !!sl && sl.along >= gates.path && sl.across * 3 <= sl.along;
      const next = touching && (gate(touching) || slid) ? touching : undefined;
      if (held && !next && (touching || inside(held.rect, p, margins.exit))) {
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
            if (gate(l) && (!entered || deep > depthIn(entered.rect, p, regions.stage))) entered = l;
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
      pathIn.clear();
      slide.clear();
      last = moved = null;
      lastStep = 0;
    },
    get frame(): LandingFrame {
      return frame;
    },
  };
}
