/**
 * The hit half of a tiling drag: which place the pointer is over. `tilingDrag(...).hit(basis)` builds it once per drag,
 * at the lift, from one layout that never changes during the drag: `"lift"` (the tree at the lift, the subject's slot
 * open) for a host that draws only marks over it, `"base"` (the subject released, the gap closed) for a host that draws
 * the landed layout of the held place. Nothing is measured or laid out anew per frame.
 *
 * - **Targets**, in `@n-uf/motion/drag`'s target shape: one body target per pane the basis draws (not the subject's own
 *   slot, not a still pane), its places the five regions of `paneRegion` (the center swaps, a side goes beside); one
 *   target per part the adapter declares on that pane (`TilingTree.parts`: a title bar, a tab strip), its place a join,
 *   a slot under the pointer giving the index; and home, the subject's lift rect, which wins over everything beneath it.
 *   On the subject's full-edge neighbour along an axis (the same bounds across it, nothing between), the bands along
 *   that axis are the swap's too: a side there would only reorder the two panes. Its bands across stay sides.
 * - **Places**: a place exists when `after(place).refusal` is null. A refused zone holds nothing and falls to the target
 *   beneath it (a refused part to the pane's body), never sideways. A place whose `after` equals the lift is home.
 * - **One hold rule, two measures**: the held place keeps its zone until the pointer is `edge` px past that zone's edge
 *   (home included); inside one pane it also keeps until the pointer is `travel` px from where the place was taken.
 *   Any change of place takes the point anew. Both measures are at most `share` of the held zone's extent per axis.
 * - **The reader**: `read(frame, point)` turns a drag intent's frame into `{ held, refused, mark }`: the held place (home
 *   included, null when nothing is held outside home), the refused place under the pointer when nothing is held, and, on
 *   the lift basis, the mark: a region of the lift layout (the target's half for a side, its outline for a swap or a
 *   join, and for a swap the wash in the open slot), never an `after` rect.
 *
 * See docs/placement.md, Entry: tiling.
 */
import type { Point, Rect } from "../geometry";
import type { Side } from "../side";
import type { Target } from "../target";
import type { TilingAfter, TilingHeld, TilingLaidOut, TilingTree } from "./drag";
import { paneCenter, paneRegion, paneRegionShapes, type PaneRegion, type PaneRegionOptions } from "./regions";

/** Which layout a drag hit-tests, fixed at the lift: the lift (a host that draws marks) or the base (a host that draws the landed layout). */
export type TilingBasis = "lift" | "base";

/**
 * A part of a pane that takes a join, as the adapter declares it on the pane's rect (`TilingTree.parts`): a title bar,
 * a tab strip. `slots`, when given, are rects within it; the slot under the pointer gives the join's index: slot `i`
 * stands before the `i`-th member of the pane's stack in the tree the part was declared on (the pane itself when it
 * is alone). Over the part but no slot, the join has no index (the adapter's default: last).
 */
export interface TilingPart {
  readonly key: string;
  readonly rect: Rect;
  readonly slots?: readonly Rect[];
}

/** A hit target, in `@n-uf/motion/drag`'s target shape. */
export interface TilingHitTarget<K> extends Target {
  /** The pane the basis draws under it (for home, the subject's own). */
  readonly pane: K;
  /** The pane its places name (`at`), as the base draws it. */
  readonly at: K;
  /** The part's key, on a part's target. */
  readonly part?: string;
  /** Home's target: the subject's lift rect. */
  readonly home?: true;
}

/** The hit's options. */
export interface TilingHitOptions<K> {
  /** The pane regions (center share, floor, pixel ratio); `hysteresis` is not read: the hold rule is the hit's own. */
  readonly regions?: PaneRegionOptions;
  /** A pane's key in target and place ids; default `String`. Keys must be unique across panes. */
  readonly key?: (pane: K) => string;
  /** The edge measure, px (default 6). */
  readonly edge?: number;
  /** The travel measure inside one pane, px (default 24). */
  readonly travel?: number;
  /** The most either measure is of the held zone's extent, per axis (default 0.25). */
  readonly share?: number;
}

/** The hold rule's defaults: 6 px past the edge, 24 px of travel inside one pane, each at most a quarter of the zone. */
export const TILING_HIT_DEFAULTS: { readonly edge: number; readonly travel: number; readonly share: number } = { edge: 6, travel: 24, share: 0.25 };

/** What the hold rule keeps: the held place's id, and the point where it was taken. */
export interface TilingHold {
  readonly place: string;
  readonly at: Point;
}

/** The part of a drag intent's frame the reader reads. */
export interface TilingHitFrame<T> {
  readonly shown: T | null;
}

/**
 * A lift-basis mark: a region of the lift layout. A side: the target pane's half on that side, as drawn. A swap: the
 * target's outline, and the wash in the open slot (home; none when the release leaves no slot). A join: the target's
 * outline, and its slot when the join has an index.
 */
export type TilingMark<K> =
  | { readonly kind: "side"; readonly at: K; readonly side: Side; readonly rect: Rect }
  | { readonly kind: "swap"; readonly at: K; readonly rect: Rect; readonly wash: Rect | null }
  | { readonly kind: "join"; readonly at: K; readonly rect: Rect; readonly slot: Rect | null };

/** What a frame reads off the hit. */
export interface TilingHitRead<K> {
  /** The held place, home included; null when nothing is held outside home. */
  readonly held: TilingHeld<K> | null;
  /** The refused place under the pointer, when nothing is held (nothing is drawn for it). */
  readonly refused: TilingHeld<K> | null;
  /** The lift basis's mark for the held place; null on the base basis, at home, and with nothing held. */
  readonly mark: TilingMark<K> | null;
}

/**
 * The options a `@n-uf/motion/drag` intent takes to read the hit: no home of its own (home is a place of the hit, held
 * by the one rule; the intent's own home test would cut it at the plain edge), no time-based gate or hold, and a band as
 * wide as the edge measure so the intent keeps every target the hit still holds. The hit decides; the intent shows it.
 */
export interface TilingHitIntent<K> {
  readonly home: Rect;
  readonly tuning: {
    readonly aimSpeed: number;
    readonly dwell: number;
    readonly switchHold: number;
    readonly roomAfter: number;
    readonly band: number;
    readonly bandShare: number;
    readonly breakthrough: number;
    readonly gapGrace: number;
  };
  readonly placeOf: (target: TilingHitTarget<K>, point: Point, previous: string | null) => string | null;
}

/** A drag's hit: built once at the lift, its targets and zones fixed for the drag. */
export interface TilingHit<T, K> {
  readonly basis: TilingBasis;
  /** The layout it hit-tests: the drag's lift or base. */
  readonly laid: TilingLaidOut<T, K>;
  /** Home: the subject's lift rect, or null when the release leaves no slot. */
  readonly home: Rect | null;
  /** Every target, fixed for the drag. */
  readonly targets: readonly TilingHitTarget<K>[];
  /** The options for a drag intent (`createDragIntent({ ...hit.intent })`). */
  readonly intent: TilingHitIntent<K>;
  /** The zone map: the place at `point` with nothing held (`"home"` for home), or null. Pure. */
  zone(point: Point): string | null;
  /** The hold rule: what is held at `point` after `state`. Pure. */
  hold(state: TilingHold | null, point: Point): TilingHold | null;
  /** A place id read back (hosts never parse ids). */
  place(id: string): TilingHeld<K> | null;
  /** The intent's `placeOf`: the held place at `point` when it is on `target`, else null. Steps the drag's one hold. */
  placeOf(target: TilingHitTarget<K>, point: Point, previous?: string | null): string | null;
  /** The intent's frame at `point`, read: the held place, the refused one, and the lift basis's mark. */
  read(frame: TilingHitFrame<TilingHitTarget<K>>, point: Point): TilingHitRead<K>;
  /** What a frame draws: the lift on the lift basis; on the base basis `after(held)`, the lift at home, the base with nothing held. */
  drawn(read: TilingHitRead<K>): TilingLaidOut<T, K>;
  /** What a release commits: `after(held)`, else home's. */
  release(read: TilingHitRead<K>): TilingAfter<T, K>;
}

/** What `tilingDrag` hands its hit. @internal */
export interface TilingHitContext<T, K> {
  readonly ops: TilingTree<T, K>;
  readonly lift: TilingLaidOut<T, K>;
  readonly base: TilingLaidOut<T, K>;
  readonly home: Rect | null;
  /** The subject's key: the pane, or the stack's active member. */
  readonly subjectKey: K;
  readonly inSubject: (pane: K) => boolean;
  readonly still?: (pane: K) => boolean;
  readonly after: (held: TilingHeld<K>) => TilingAfter<T, K>;
}

/** A zone's convex piece, its extent, and the zones above it (a pointer deep inside one of them has left it). */
interface Piece {
  readonly poly: readonly Point[];
  readonly box: Rect;
  readonly cuts: () => readonly Rect[];
}

interface Place<K> {
  readonly id: string;
  readonly held: TilingHeld<K>;
  /** The pane it lies on; null for home. */
  readonly pane: PaneHit<K> | null;
  readonly pieces: Piece[];
  readonly owners: Set<string>;
  readonly slot: Rect | null;
}

interface PartHit<K> {
  readonly target: TilingHitTarget<K>;
  readonly place: Place<K>;
  readonly slots: readonly { readonly rect: Rect; readonly place: Place<K> }[];
}

interface PaneHit<K> {
  readonly body: TilingHitTarget<K>;
  readonly parts: readonly PartHit<K>[];
  readonly regions: Readonly<Record<PaneRegion, Place<K>>>;
  /** A full-edge neighbour's map in its place: the swap rectangle, then the two side strips. Empty otherwise. */
  readonly zones: readonly { readonly rect: Rect; readonly place: Place<K> }[];
}

const HOME: TilingHeld<never> = { kind: "home" };
const SIDES: readonly Side[] = ["top", "right", "bottom", "left"];
/** No home for the intent: a rect no point is in. */
const NO_HOME: Rect = { x: -Infinity, y: -Infinity, width: 0, height: 0 };

const inside = (r: Rect, p: Point): boolean => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
const rectPoly = (r: Rect): Point[] => [
  { x: r.x, y: r.y },
  { x: r.x + r.width, y: r.y },
  { x: r.x + r.width, y: r.y + r.height },
  { x: r.x, y: r.y + r.height },
];
function boxOf(poly: readonly Point[]): Rect {
  const xs = poly.map((p) => p.x);
  const ys = poly.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
}
/** Whether `p` lies in the convex polygon `poly` (edges included). */
function inConvex(poly: readonly Point[], p: Point): boolean {
  let pos = false;
  let neg = false;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    if (cross > 1e-9) pos = true;
    else if (cross < -1e-9) neg = true;
    if (pos && neg) return false;
  }
  return true;
}
const segDist = (p: Point, a: Point, b: Point): number => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};
/** Whether `p` lies within `ex` px left and right and `ey` px above and below of the convex polygon `poly`. */
function nearPoly(poly: readonly Point[], p: Point, ex: number, ey: number): boolean {
  if (inConvex(poly, p)) return true;
  const sx = ex > 0 ? 1 / ex : 1e9;
  const sy = ey > 0 ? 1 / ey : 1e9;
  const q = { x: p.x * sx, y: p.y * sy };
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    if (segDist(q, { x: a.x * sx, y: a.y * sy }, { x: b.x * sx, y: b.y * sy }) <= 1) return true;
  }
  return false;
}
const sameRect = (a: Rect, b: Rect, e = 1e-3): boolean => Math.abs(a.x - b.x) <= e && Math.abs(a.y - b.y) <= e && Math.abs(a.width - b.width) <= e && Math.abs(a.height - b.height) <= e;
const half = (r: Rect, side: Side): Rect =>
  side === "left"
    ? { x: r.x, y: r.y, width: r.width / 2, height: r.height }
    : side === "right"
      ? { x: r.x + r.width / 2, y: r.y, width: r.width / 2, height: r.height }
      : side === "top"
        ? { x: r.x, y: r.y, width: r.width, height: r.height / 2 }
        : { x: r.x, y: r.y + r.height / 2, width: r.width, height: r.height / 2 };

/** The hit of a drag on `basis`. @internal Built by `TilingDrag.hit`. */
export function createTilingHit<T, K>(ctx: TilingHitContext<T, K>, basis: TilingBasis, options: TilingHitOptions<K> = {}): TilingHit<T, K> {
  const { ops, lift, base, home, after } = ctx;
  const key = options.key ?? String;
  const edge = Math.max(0, options.edge ?? TILING_HIT_DEFAULTS.edge);
  const travel = Math.max(0, options.travel ?? TILING_HIT_DEFAULTS.travel);
  const share = Math.max(0, options.share ?? TILING_HIT_DEFAULTS.share);
  const regionOptions: PaneRegionOptions = { ...options.regions, hysteresis: 0 };
  const laid = basis === "lift" ? lift : base;
  const stackOf = (t: T, k: K) => ops.stackOf?.(t, k) ?? null;
  const drawnAs = (t: T, k: K): K => stackOf(t, k)?.active ?? k;
  const subjectDrawn = drawnAs(lift.tree, ctx.subjectKey);

  /** The pane the base draws for `pane` of the basis: itself, or (the subject's own stack, on the lift) its stack's drawn member. */
  const atOf = (pane: K): K | null => {
    if (base.layout.has(pane)) return pane;
    const members = stackOf(laid.tree, pane)?.members ?? [];
    for (const m of members) {
      if (ctx.inSubject(m)) continue;
      const d = drawnAs(base.tree, m);
      if (base.layout.has(d)) return d;
    }
    return null;
  };

  // Every place, by id; each zone of it is a piece.
  const byId = new Map<string, Place<K>>();
  const homePlace: Place<K> = { id: "home", held: HOME, pane: null, pieces: home ? [{ poly: rectPoly(home), box: home, cuts: () => [] }] : [], owners: new Set(["home"]), slot: null };
  byId.set("home", homePlace);
  const placeFor = (id: string, held: TilingHeld<K>, pane: PaneHit<K>, owner: string, piece: Piece, slot: Rect | null = null): Place<K> => {
    let p = byId.get(id);
    if (!p) byId.set(id, (p = { id, held, pane, pieces: [], owners: new Set(), slot }));
    p.pieces.push(piece);
    p.owners.add(owner);
    return p;
  };

  // Liveness and home-likeness, once per place.
  const liveMemo = new Map<string, boolean>();
  const live = (p: Place<K>): boolean => {
    if (p === homePlace) return true;
    let v = liveMemo.get(p.id);
    if (v === undefined) liveMemo.set(p.id, (v = after(p.held).refusal === null));
    return v;
  };
  const sameStacks = (a: T, k: K): boolean => {
    const x = stackOf(a, k);
    const y = stackOf(lift.tree, k);
    if (!x || !y) return !x && !y;
    return x.active === y.active && x.members.length === y.members.length && x.members.every((m, i) => m === y.members[i]);
  };
  const homeMemo = new Map<string, boolean>();
  /** A live place whose release gives the lift back: it is home. */
  const homeLike = (p: Place<K>): boolean => {
    if (p === homePlace) return true;
    let v = homeMemo.get(p.id);
    if (v === undefined) {
      v = false;
      if (live(p)) {
        const a = after(p.held);
        v = a.tree === lift.tree || (a.layout.size === lift.layout.size && [...a.layout].every(([k, r]) => {
          const l = lift.layout.get(k);
          return !!l && sameRect(l, r) && sameStacks(a.tree, k);
        }));
      }
      homeMemo.set(p.id, v);
    }
    return v;
  };

  /**
   * The axis along which the pane `k` (drawn at the lift) is the subject's full-edge neighbour, or null: the two lift
   * rects have the same bounds across that axis (the edge they share is the whole edge of each) and no other pane
   * lies between them. Only when the release leaves a slot (home).
   */
  const neighbourAxis = (k: K): "x" | "y" | null => {
    const s = home;
    const r = lift.layout.get(k);
    if (!s || !r) return null;
    const same = (a: number, b: number): boolean => Math.abs(a - b) <= 0.5;
    const clear = (gap: Rect): boolean =>
      [...lift.layout].every(([q, b]) => q === k || q === subjectDrawn || Math.max(0, Math.min(b.x + b.width, gap.x + gap.width) - Math.max(b.x, gap.x)) * Math.max(0, Math.min(b.y + b.height, gap.y + gap.height) - Math.max(b.y, gap.y)) <= 0.5);
    if (same(r.x, s.x) && same(r.width, s.width)) {
      const y0 = Math.min(s.y + s.height, r.y + r.height);
      const y1 = Math.max(s.y, r.y);
      if (y1 >= y0 - 0.5 && clear({ x: s.x, y: y0, width: s.width, height: Math.max(0, y1 - y0) })) return "y";
    }
    if (same(r.y, s.y) && same(r.height, s.height)) {
      const x0 = Math.min(s.x + s.width, r.x + r.width);
      const x1 = Math.max(s.x, r.x);
      if (x1 >= x0 - 0.5 && clear({ x: x0, y: s.y, width: Math.max(0, x1 - x0), height: s.height })) return "x";
    }
    return null;
  };

  // The targets and their places, built once.
  const targets: TilingHitTarget<K>[] = [];
  const panes: PaneHit<K>[] = [];
  if (home) targets.push({ id: "home", priority: 1, hit: { ...home }, pane: subjectDrawn, at: subjectDrawn, home: true });
  for (const [pane, rect] of laid.layout) {
    if (basis === "lift" && home && pane === subjectDrawn) continue;
    const at = atOf(pane);
    if (at === null || ctx.still?.(at)) continue;
    const k = key(at);
    const body: TilingHitTarget<K> = { id: `pane:${key(pane)}`, priority: 2, hit: { ...rect }, pane, at };
    const parts: PartHit<K>[] = [];
    const regions = {} as Record<PaneRegion, Place<K>>;
    const zones: { rect: Rect; place: Place<K> }[] = [];
    const ph: PaneHit<K> = { body, parts, regions, zones };
    const members = stackOf(laid.tree, pane)?.members ?? [pane];
    const indexOf = (i: number): number | undefined => (i < members.length ? members.slice(0, i).filter((m) => !ctx.inSubject(m)).length : undefined);
    const seen = new Set<string>();
    for (const part of ops.parts?.(laid.tree, pane, rect) ?? []) {
      let pid = `part:${key(pane)}:${part.key}`;
      for (let n = 2; seen.has(pid); n++) pid = `part:${key(pane)}:${part.key}#${n}`;
      seen.add(pid);
      const target: TilingHitTarget<K> = { id: pid, priority: 1, hit: { ...part.rect }, pane, at, part: part.key };
      targets.push(target);
      const slotRects = part.slots ?? [];
      const slots = slotRects.map((s, i) => {
        const index = indexOf(i);
        const held: TilingHeld<K> = index === undefined ? { kind: "join", at } : { kind: "join", at, index };
        const place = placeFor(`join:${k}:${index ?? ""}`, held, ph, pid, { poly: rectPoly(s), box: s, cuts: () => (home ? [home] : []) }, s);
        return { rect: s, place };
      });
      const whole = placeFor(`join:${k}:`, { kind: "join", at }, ph, pid, {
        poly: rectPoly(part.rect),
        box: part.rect,
        cuts: () => [...(home ? [home] : []), ...slots.filter((s) => live(s.place)).map((s) => s.rect)],
      });
      parts.push({ target, place: whole, slots });
    }
    const shapes = paneRegionShapes(rect, regionOptions);
    const above = (): readonly Rect[] => [
      ...(home ? [home] : []),
      ...parts.flatMap((p) => (live(p.place) ? [p.target.hit] : p.slots.filter((s) => live(s.place)).map((s) => s.rect))),
    ];
    // The subject's full-edge neighbour along an axis: a side along that axis would only reorder the two panes, which
    // is the swap. Its map is one swap rectangle over its whole extent along the axis, between two side strips across.
    const axis = neighbourAxis(lift.layout.has(pane) ? pane : at);
    if (axis) {
      const c = paneCenter(rect, regionOptions);
      const strips: [Side, Rect][] =
        axis === "y"
          ? [
              ["left", { x: rect.x, y: rect.y, width: c.left, height: rect.height }],
              ["right", { x: rect.x + c.right, y: rect.y, width: rect.width - c.right, height: rect.height }],
            ]
          : [
              ["top", { x: rect.x, y: rect.y, width: rect.width, height: c.top }],
              ["bottom", { x: rect.x, y: rect.y + c.bottom, width: rect.width, height: rect.height - c.bottom }],
            ];
      const swapRect: Rect =
        axis === "y"
          ? { x: rect.x + c.left, y: rect.y, width: c.right - c.left, height: rect.height }
          : { x: rect.x, y: rect.y + c.top, width: rect.width, height: c.bottom - c.top };
      zones.push({ rect: swapRect, place: placeFor(`swap:${k}`, { kind: "swap", at }, ph, body.id, { poly: rectPoly(swapRect), box: swapRect, cuts: above }) });
      for (const [side, r] of strips) {
        zones.push({ rect: r, place: placeFor(`beside:${side}:${k}`, { kind: "beside", at, side }, ph, body.id, { poly: rectPoly(r), box: r, cuts: above }) });
      }
    } else {
      for (const region of ["center", ...SIDES] as const) {
        const held: TilingHeld<K> = region === "center" ? { kind: "swap", at } : { kind: "beside", at, side: region };
        const id = region === "center" ? `swap:${k}` : `beside:${region}:${k}`;
        regions[region] = placeFor(id, held, ph, body.id, { poly: shapes[region], box: boxOf(shapes[region]), cuts: above });
      }
    }
    targets.push(body);
    panes.push(ph);
  }
  Object.freeze(targets);

  /** The topmost live place at `p` (no hold, home-likeness not applied), and the refused place it fell through. */
  const rawAt = (p: Point): { readonly place: Place<K> | null; readonly refused: Place<K> | null } => {
    if (home && inside(home, p)) return { place: homePlace, refused: null };
    const pane = panes.find((ph) => inside(ph.body.hit, p));
    if (!pane) return { place: null, refused: null };
    let refused: Place<K> | null = null;
    for (const part of pane.parts) {
      if (!inside(part.target.hit, p)) continue;
      const slot = part.slots.find((s) => inside(s.rect, p));
      if (slot) {
        if (live(slot.place)) return { place: slot.place, refused: null };
        refused ??= slot.place;
      }
      if (live(part.place)) return { place: part.place, refused: null };
      refused ??= part.place;
    }
    const place = pane.zones.length > 0 ? (pane.zones.find((z) => inside(z.rect, p)) ?? pane.zones[0]!).place : pane.regions[paneRegion(pane.body.hit, p, null, regionOptions)];
    return live(place) ? { place, refused: null } : { place: null, refused: refused ?? place };
  };
  const effective = (p: Place<K> | null): Place<K> | null => (p && homeLike(p) ? homePlace : p);
  const zone = (p: Point): string | null => effective(rawAt(p).place)?.id ?? null;

  let homeLikeAll: Place<K>[] | null = null;
  /** Every zone of home: its rect, and every place that gives the lift back. */
  const homePieces = (): Piece[] => {
    homeLikeAll ??= [...byId.values()].filter((p) => p !== homePlace && homeLike(p));
    return [...homePlace.pieces, ...homeLikeAll.flatMap((p) => p.pieces)];
  };
  const capped = (px: number, extent: number): number => Math.min(px, share * extent);
  /** The edge measure: `p` is within `edge` px (capped) past one of the place's zones, and not deep inside a zone above it. */
  const near = (place: Place<K>, p: Point): boolean =>
    (place === homePlace ? homePieces() : place.pieces).some((piece) => {
      const ex = capped(edge, piece.box.width);
      const ey = capped(edge, piece.box.height);
      if (!nearPoly(piece.poly, p, ex, ey)) return false;
      return !piece.cuts().some((r) => p.x > r.x + ex && p.x < r.x + r.width - ex && p.y > r.y + ey && p.y < r.y + r.height - ey);
    });
  /** The travel measure: inside the held place's pane (not over home), within `travel` px (capped) of where it was taken. */
  const keepsByTravel = (place: Place<K>, from: Point, p: Point): boolean => {
    if (!place.pane || !inside(place.pane.body.hit, p) || (home && inside(home, p))) return false;
    const box = boxOf(place.pieces.flatMap((piece) => rectPoly(piece.box)));
    const rx = capped(travel, box.width);
    const ry = capped(travel, box.height);
    if (rx <= 0 || ry <= 0) return false;
    return ((p.x - from.x) / rx) ** 2 + ((p.y - from.y) / ry) ** 2 < 1;
  };
  const hold = (state: TilingHold | null, p: Point): TilingHold | null => {
    const now = effective(rawAt(p).place);
    if (state) {
      if (now && now.id === state.place) return state;
      const held = byId.get(state.place);
      if (held && (near(held, p) || keepsByTravel(held, state.at, p))) return state;
    }
    return now ? { place: now.id, at: { x: p.x, y: p.y } } : null;
  };

  // The drag's one hold, stepped once per point.
  let state: TilingHold | null = null;
  let last: Point | null = null;
  const current = (p: Point): TilingHold | null => {
    if (!last || last.x !== p.x || last.y !== p.y) {
      state = hold(state, p);
      last = { x: p.x, y: p.y };
    }
    return state;
  };
  const placeOf = (target: TilingHitTarget<K>, p: Point): string | null => {
    const s = current(p);
    return s && byId.get(s.place)?.owners.has(target.id) ? s.place : null;
  };
  const markOf = (place: Place<K>): TilingMark<K> | null => {
    const r = place.pane?.body.hit;
    const h = place.held;
    if (!r || h.kind === "home") return null;
    if (h.kind === "beside") return { kind: "side", at: h.at, side: h.side, rect: half(r, h.side) };
    if (h.kind === "swap") return { kind: "swap", at: h.at, rect: { ...r }, wash: home ? { ...home } : null };
    return { kind: "join", at: h.at, rect: { ...r }, slot: place.slot ? { ...place.slot } : null };
  };
  const read = (frame: TilingHitFrame<TilingHitTarget<K>>, p: Point): TilingHitRead<K> => {
    const s = current(p);
    const place = s ? (byId.get(s.place) ?? null) : null;
    const shown = place && place !== homePlace && frame.shown && place.owners.has(frame.shown.id) ? place : null;
    const held: TilingHeld<K> | null = place === homePlace ? HOME : (shown?.held ?? null);
    const refused = held ? null : (rawAt(p).refused?.held ?? null);
    return { held, refused, mark: basis === "lift" && shown ? markOf(shown) : null };
  };

  return {
    basis,
    laid,
    home: home ? { ...home } : null,
    targets,
    intent: {
      home: NO_HOME,
      tuning: { aimSpeed: Infinity, dwell: 0, switchHold: 0, roomAfter: 0, band: edge, bandShare: 1, breakthrough: 0, gapGrace: 0 },
      placeOf: (t, p) => placeOf(t, p),
    },
    zone,
    hold,
    place: (id) => byId.get(id)?.held ?? null,
    placeOf: (t, p) => placeOf(t, p),
    read,
    drawn: (r) => (basis === "lift" ? lift : r.held === null ? base : r.held.kind === "home" ? lift : after(r.held)),
    release: (r) => after(r.held ?? HOME),
  };
}
