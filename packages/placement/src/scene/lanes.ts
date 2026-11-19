/**
 * Lanes: the geometry of a docking drag for a landing model (`@n-uf/motion/drag`'s `createLandingModel`).
 *
 * A lane is one edge that takes the held item (a bar, a rail, a column) or a virtual one (a new column's line, a
 * declared rail). Its spots are the places a drop there lands, in order along it: before, between and after its items,
 * and, on a bar, spots at a fixed pitch over the free stretches between items (`SPOT_PITCH`), so a toolbar lands close
 * to the hand. Each spot has a stretch of the lane that picks it. Between two spots that share a neighbor (the item `Y`
 * in `X|Y` and `Y|Z`), the boundary is that item's middle as drawn (in the held spot's own layout with `options.spot`,
 * so a column takes a panel by halves of what is seen); between two others, halfway between their landings. Cuts are
 * kept inside the lane and in order. The spots come from the same generation and filter as `targets()`, so a spot's
 * landing is exactly what its drop commits. Spot ids are keyed by the lane, zone and neighboring items, so they survive
 * the window resizing and most items opening or moving; virtual lanes are keyed by the column they lie beside, not
 * their ring. Remembered per scene and options; a call with `spot` reworks only the held lane's stretches.
 */
import { EPS, clamp, rect, type Rect, type Size } from "../geometry";
import { moveTo, type DockPlace } from "./changes";
import { axisOf, chromeFor, floatRegion } from "./helpers";
import type { Scene, SceneLayout, Zone } from "./model";
import { solve } from "./solve";
import { targetsAndRefusals } from "./targets";
import type { SceneRefusal, SceneTarget, SceneTargetOptions } from "./targets/model";

/** The pitch of the spots over a bar's free stretches, px: a quarter of a typical toolbar's length (158 px in the lab). */
export const SPOT_PITCH = 40;

/** One place a drop in a lane lands. */
export interface LaneSpot {
  /**
   * Stable across solves: `<lane>/<zone>/<item before or ^>|<item after or $>`; an empty edge's `<lane>/<zone>`; a
   * pitched spot `…@<pitches from its neighbor>`; a virtual lane's `<lane>/line` or `<lane>/end`.
   */
  readonly id: string;
  /** Its stretch of the lane, along the lane's axis, inside the lane's range. */
  readonly along: readonly [number, number];
  /** Where the item lands (its rect after the drop). */
  readonly landing: Rect;
  /** The drop: its place and `after()` (the layout after it, the room). */
  readonly target: SceneTarget;
  /** The item's own place (a release there changes nothing). */
  readonly home?: true;
  /** A spot at a pitch over a free stretch (`SceneItem.space`). */
  readonly pitched?: true;
}

/** A stretch of a lane that takes no drop of the item. */
export interface LaneRefusal {
  readonly along: readonly [number, number];
  readonly reason: SceneRefusal["reason"];
}

export interface Lane {
  /** The edge's id, or a virtual lane's: `column:<side>:<the column it lies outside, or $>`, `rail:<side>`. */
  readonly id: string;
  readonly rect: Rect;
  /** The axis its spots run along. */
  readonly axis: "x" | "y";
  readonly spots: readonly LaneSpot[];
  readonly refused: readonly LaneRefusal[];
}

/** Everything a landing model reads for one drag. */
export interface Regions {
  readonly lanes: readonly Lane[];
  /** Refused places outside every lane ("Can't go here"). */
  readonly refused: readonly Rect[];
  /** The content: the open space is it less `blocked`. */
  readonly content: Rect;
  /** What the open space excludes: drawn edges, docked items, the chrome, a drawn declared rail. */
  readonly blocked: readonly Rect[];
  readonly stage: Rect;
  /** Where a float of the item may lie: the stage less the inset at its left and right (`heldRect`'s region). */
  readonly floatRegion: Rect;
  /** The held item's size as it is now. */
  readonly item: Size;
  /** The float target (its `after(point, grab)` is the float landing), or null where the item doesn't float. */
  readonly float: SceneTarget | null;
}

export interface LaneOptions extends SceneTargetOptions {
  /** The pitch of a bar's free-stretch spots, px (default `SPOT_PITCH`; 0 or less: none). */
  readonly pitch?: number;
  /** The spot held now: its lane's stretches are drawn in its own layout (the room open). Default: the layout as seen. */
  readonly spot?: string;
}

type Axis = "x" | "y";
const mid = (r: Rect, axis: Axis): number => (axis === "x" ? r.x + r.width / 2 : r.y + r.height / 2);
const lo = (r: Rect, axis: Axis): number => (axis === "x" ? r.x : r.y);
const len = (r: Rect, axis: Axis): number => (axis === "x" ? r.width : r.height);
const hull = (a: Rect, b: Rect): Rect => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return rect(x, y, Math.max(a.x + a.width, b.x + b.width) - x, Math.max(a.y + a.height, b.y + b.height) - y);
};
const nonNeg = (v: number | undefined): number => (Number.isFinite(v) && v! > 0 ? v! : 0);
const sameRect = (a: Rect, b: Rect): boolean => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.width - b.width), Math.abs(a.height - b.height)) < 0.5;
const ORIGIN = { x: 0, y: 0 };

/** The items drawn on `edge` in `l`, other than `dragged`, in order along `axis`. */
function onEdge(l: SceneLayout, edge: string, dragged: string, axis: Axis): { id: string; r: Rect; zone: Zone | undefined }[] {
  return Object.entries(l.items)
    .filter(([id, it]) => id !== dragged && it.edge === edge && !it.inMenu && !it.floating && it.rect.width > EPS && it.rect.height > EPS)
    .map(([id, it]) => ({ id, r: it.rect, zone: it.zone }))
    .sort((a, b) => lo(a.r, axis) - lo(b.r, axis));
}

/** The items either side of the dragged item on `edge` in `after`: `^` and `$` at the ends. */
function neighbors(after: SceneLayout, edge: string, dragged: string, axis: Axis): { before: string; next: string } {
  const me = after.items[dragged];
  const others = onEdge(after, edge, dragged, axis);
  const at = me ? mid(me.rect, axis) : 0;
  return { before: [...others].reverse().find((o) => mid(o.r, axis) < at)?.id ?? "^", next: others.find((o) => mid(o.r, axis) >= at)?.id ?? "$" };
}

/** A spot of a lane before its stretch is known. */
interface Raw {
  readonly lane: string;
  readonly edge: string | null;
  readonly axis: Axis;
  readonly id: string;
  readonly before: string;
  readonly next: string;
  readonly landing: Rect;
  readonly layout: SceneLayout;
  readonly target: SceneTarget;
  readonly hit: Rect;
  readonly home?: true;
  readonly pitched?: true;
}

/** What one scene, item and options give, before any spot is held. */
interface Base {
  readonly raws: ReadonlyMap<string, readonly Raw[]>;
  readonly lanes: readonly Lane[];
  readonly seen: SceneLayout;
  readonly refusals: readonly SceneRefusal[];
  readonly regions: Omit<Regions, "lanes">;
}

const memo = new WeakMap<Scene, Map<string, Base>>();
const previousIds = new WeakMap<SceneLayout, number>();
let nextPrevious = 1;
/** The options as a key: by value, `previous` by identity. */
function keyOf(dragged: string, o: LaneOptions): string {
  const { previous, spot: _spot, ...rest } = o;
  let p = 0;
  if (previous) {
    if (!previousIds.has(previous)) previousIds.set(previous, nextPrevious++);
    p = previousIds.get(previous)!;
  }
  return `${dragged}\u0000${p}\u0000${JSON.stringify(rest)}`;
}

/**
 * The lanes and regions of a drag of `dragged`: every lane that takes it with its spots and stretches, the refused
 * places outside lanes, the content and what blocks it, the stage, the float region, the item's size and the float
 * target. Remembered per scene and options (`previous` by identity); with `spot`, only the held lane's stretches are
 * worked out again, in that spot's own layout.
 */
export function lanes(scene: Scene, dragged: string, options: LaneOptions = {}): Regions {
  const key = keyOf(dragged, options);
  let perScene = memo.get(scene);
  if (!perScene) memo.set(scene, (perScene = new Map()));
  let base = perScene.get(key);
  if (!base) perScene.set(key, (base = build(scene, dragged, options)));
  if (!options.spot) return { ...base.regions, lanes: base.lanes };
  // The held spot: its lane's stretches in its own layout; the other lanes as seen.
  const found = [...base.raws].find(([, rs]) => rs.some((r) => r.id === options.spot));
  if (!found) return { ...base.regions, lanes: base.lanes };
  const [heldLane, list] = found;
  const held = list.find((r) => r.id === options.spot)!;
  const lane = laneFrom(heldLane, list, held.layout, base.seen, dragged, base.refusals);
  return { ...base.regions, lanes: base.lanes.map((l) => (l.id === heldLane && lane ? lane : l)) };
}

function build(scene: Scene, dragged: string, options: LaneOptions): Base {
  const seen = solve(scene, options.previous ? { previous: options.previous } : {});
  const { targets: ts, refusals: rs } = targetsAndRefusals(scene, dragged, options);
  const own = seen.items[dragged];
  const ownEdge = own && !own.floating && !own.inMenu ? own.edge : undefined;
  const pitch = options.pitch === undefined ? SPOT_PITCH : options.pitch;
  const raws: Raw[] = [];
  const axisOfEdge = (id: string): Axis => {
    const e = scene.edges.find((x) => x.id === id);
    return e && axisOf(e.side) === "column" ? "y" : "x";
  };
  // A virtual lane is keyed by the column it lies outside (or `$`, the side's inner end), not by its ring.
  const columnKey = (side: string, ring: number): string => scene.edges.find((e) => e.side === side && e.column === true && e.ring === ring)?.id ?? "$";
  for (const t of ts) {
    if (t.free) continue;
    const p = t.place;
    if (p.kind === "gap" || (p.kind === "home" && ownEdge)) {
      const edge = p.kind === "gap" ? p.edge : ownEdge!;
      const axis = axisOfEdge(edge);
      const layout = p.kind === "home" ? seen : t.after(ORIGIN, ORIGIN).layout;
      const landing = p.kind === "home" ? own!.rect : layout.items[dragged]?.rect;
      if (!landing) continue;
      const zone = p.kind === "gap" ? p.zone : (own?.zone ?? "start");
      const n = neighbors(layout, edge, dragged, axis);
      const id = n.before === "^" && n.next === "$" ? `${edge}/${zone}` : `${edge}/${zone}/${n.before}|${n.next}`;
      raws.push({ lane: edge, edge, axis, id, ...n, landing, layout, target: t, hit: t.hit, ...(p.kind === "home" ? { home: true as const } : {}) });
    } else if (p.kind === "column" || p.kind === "rail") {
      const layout = t.after(ORIGIN, ORIGIN).layout;
      const landing = layout.items[dragged]?.rect;
      if (!landing) continue;
      const lane = p.kind === "column" ? `column:${p.side}:${columnKey(p.side, p.ring)}` : `rail:${p.side}`;
      raws.push({ lane, edge: null, axis: "y", id: `${lane}/${p.kind === "rail" ? "end" : "line"}`, before: "^", next: "$", landing, layout, target: t, hit: t.hit });
    }
  }
  // A bar's free stretches: spots at `pitch`, each a dock keeping `space` (`SceneItem.space`).
  if (pitch > 0) raws.push(...pitchedSpots(scene, dragged, options, seen, raws, pitch));
  const byLane = new Map<string, Raw[]>();
  for (const r of raws) byLane.set(r.lane, [...(byLane.get(r.lane) ?? []), r]);
  const laneList = [...byLane].map(([id, list]) => laneFrom(id, list, seen, seen, dragged, rs)).filter((l): l is Lane => !!l);
  const onLanes = new Set(laneList.map((l) => l.id));
  const rails = Object.values(seen.rails).flatMap((r) => (r && r.rect.width > EPS && r.rect.height > EPS ? [r.rect] : []));
  const blocked = [
    ...Object.values(seen.edges).filter((e) => e.cross > EPS).map((e) => e.rect),
    ...Object.entries(seen.items).filter(([id, it]) => id !== dragged && !it.floating && !it.inMenu).map(([, it]) => it.rect),
    ...chromeFor(scene, "targets"),
    ...rails,
  ];
  return {
    raws: byLane,
    lanes: laneList,
    seen,
    refusals: rs,
    regions: {
      refused: rs.filter((f) => !onLanes.has(f.edge)).flatMap((f) => f.hits ?? [f.hit]),
      content: seen.content,
      blocked,
      stage: scene.stage,
      floatRegion: floatRegion(scene, dragged),
      item: own ? { width: own.rect.width, height: own.rect.height } : { width: 0, height: 0 },
      float: ts.find((t) => t.free) ?? null,
    },
  };
}

/** One lane from its spots: its rect, the spots in order with their stretches in `drawn`, its refused stretches. */
function laneFrom(id: string, list: readonly Raw[], drawn: SceneLayout, seen: SceneLayout, dragged: string, rs: readonly SceneRefusal[]): Lane | null {
  if (list.length === 0) return null;
  const first = list[0]!;
  const axis = first.axis;
  // The lane's rect: the edge as drawn, else (an empty edge, a virtual lane) the band its drops are drawn at.
  const edgeLayout = first.edge ? seen.edges[first.edge] : undefined;
  const band = list.map((r) => r.landing).reduce(hull);
  let laneRect: Rect;
  if (edgeLayout && edgeLayout.cross > EPS) laneRect = edgeLayout.rect;
  else if (edgeLayout) laneRect = axis === "x" ? rect(edgeLayout.rect.x, band.y, edgeLayout.rect.width, band.height) : rect(band.x, edgeLayout.rect.y, band.width, edgeLayout.rect.height);
  else laneRect = list.map((r) => r.hit).reduce(hull, band);
  // In order; one landing is one spot (the item's own place where it is one of them); one id is one spot.
  const sorted = [...list].sort((a, b) => mid(a.landing, axis) - mid(b.landing, axis) || (a.home ? -1 : b.home ? 1 : 0));
  const unique = sorted.filter((x, i) => !sorted.slice(0, i).some((y) => sameRect(y.landing, x.landing) || y.id === x.id));
  const start = lo(laneRect, axis);
  const end = start + len(laneRect, axis);
  // A cut between two spots sharing a neighbor is that item's middle in `drawn`; else halfway between landings. Kept
  // inside the lane and in order.
  const drawnItems = first.edge ? new Map(onEdge(drawn, first.edge, dragged, axis).map((o) => [o.id, o.r])) : new Map<string, Rect>();
  const cuts: number[] = [];
  for (let i = 0; i + 1 < unique.length; i++) {
    const a = unique[i]!;
    const b = unique[i + 1]!;
    const shared = a.next === b.before && a.next !== "$" ? drawnItems.get(a.next) : undefined;
    const raw = shared ? mid(shared, axis) : (mid(a.landing, axis) + mid(b.landing, axis)) / 2;
    cuts.push(clamp(Math.max(raw, cuts[i - 1] ?? start), start, end));
  }
  const spots: LaneSpot[] = unique.map((x, i) => ({
    id: x.id,
    along: [i === 0 ? start : cuts[i - 1]!, i === unique.length - 1 ? end : cuts[i]!] as const,
    landing: x.landing,
    target: x.target,
    ...(x.home ? { home: true as const } : {}),
    ...(x.pitched ? { pitched: true as const } : {}),
  }));
  const refused: LaneRefusal[] = first.edge
    ? rs.filter((f) => f.edge === first.edge).flatMap((f) => (f.hits ?? [f.hit]).map((h) => ({ along: [clamp(lo(h, axis), start, end), clamp(lo(h, axis) + len(h, axis), start, end)] as const, reason: f.reason })))
    : [];
  return { id, rect: laneRect, axis, spots, refused };
}

/**
 * Spots at `pitch` over a bar's free stretches: between the items as seen (an empty bar: its whole length less its
 * padding), a start-zone dock keeping `space` before it where the stretch follows a start item (or the bar's start), an
 * end-zone dock keeping `space` after it where it precedes an end item (or the bar's end). Kept only where the drop
 * lands where it was aimed (within 1 px) and not on another spot's landing. A stretch too short for the item, or next to
 * a center item, has none.
 */
function pitchedSpots(scene: Scene, dragged: string, options: LaneOptions, seen: SceneLayout, raws: readonly Raw[], pitch: number): Raw[] {
  const out: Raw[] = [];
  if (!scene.items[dragged]) return out;
  const prev = options.previous ? { previous: options.previous } : {};
  for (const e of scene.edges) {
    if (e.side !== "top" && e.side !== "bottom") continue;
    const mine = raws.filter((r) => r.edge === e.id);
    const drawn = seen.edges[e.id];
    if (mine.length === 0 || !drawn) continue;
    // The held item's length here: a landing on this bar.
    const w = mine[0]!.landing.width;
    const gap = nonNeg(e.gap);
    const others = onEdge(seen, e.id, dragged, "x");
    const barStart = drawn.rect.x + nonNeg(e.pad?.start);
    const barEnd = drawn.rect.x + drawn.rect.width - nonNeg(e.pad?.end);
    const middle = drawn.rect.x + drawn.rect.width / 2;
    const zoneOf = (o: (typeof others)[number]): Zone => o.zone ?? "start";
    const taken = mine.map((r) => r.landing);
    for (let i = 0; i <= others.length; i++) {
      const left = others[i - 1];
      const right = others[i];
      const a = left ? left.r.x + left.r.width + gap : barStart;
      const b = right ? right.r.x - gap : barEnd;
      if (b - a < w + pitch) continue;
      for (let x0 = a + pitch; x0 + w <= b - pitch + EPS; x0 += pitch) {
        const toStart = x0 + w / 2 < middle;
        // A start dock follows a start item or the bar's start; an end dock precedes an end item or the bar's end.
        if (toStart && left && zoneOf(left) !== "start") continue;
        if (!toStart && right && zoneOf(right) !== "end") continue;
        const zone: Zone = toStart ? "start" : "end";
        const at = others.filter((o) => zoneOf(o) === zone && o.r.x < x0).length;
        const space = toStart ? x0 - a : b - (x0 + w);
        const place: DockPlace = { edge: e.id, zone, at, space };
        const next = moveTo(scene, dragged, place);
        if (next === scene) continue;
        const layout = solve(next, prev);
        const landed = layout.items[dragged];
        if (!landed || landed.inMenu || landed.edge !== e.id || Math.abs(landed.rect.x - x0) > 1) continue;
        if (taken.some((r) => Math.abs(r.x - landed.rect.x) < pitch / 2)) continue;
        taken.push(landed.rect);
        const result = { scene: next, layout };
        const target: SceneTarget = { id: `pitch:${e.id}:${zone}:${at}:${Math.round(space)}`, priority: 2, hit: landed.rect, slot: landed.rect, item: dragged, place: { kind: "gap", edge: e.id, zone, at }, after: () => result };
        const n = neighbors(layout, e.id, dragged, "x");
        // Keyed by its neighbors and how many pitches it keeps from the one it is spaced from: stable while they stay.
        const id = `${e.id}/${zone}/${n.before}|${n.next}@${Math.round(space / pitch)}`;
        out.push({ lane: e.id, edge: e.id, axis: "x", id, ...n, landing: landed.rect, layout, target, hit: landed.rect, pitched: true });
      }
    }
  }
  return out;
}
