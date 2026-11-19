/**
 * Lanes: the geometry of a docking drag for a landing model (`@n-uf/motion/drag`'s `createLandingModel`).
 *
 * A lane is one edge that takes the held item (a bar, a rail, a column) or a virtual one (a new column's line). Its
 * spots are the places a drop there lands, in order along it: before, between and after its items, and, on a bar,
 * spots at a fixed pitch over the free stretches between items (`SPOT_PITCH`), so a toolbar lands close to the hand.
 * Each spot has a stretch of the lane that picks it: boundaries at the middle of the items between two spots as drawn,
 * else halfway between their landings. The spots come from the same generation and filter as `targets()`, so a spot's
 * landing is exactly what its drop commits. Spot ids are keyed by the lane, zone and neighboring items, so they survive
 * items opening, moving or resizing. Additive: nothing else reads it.
 */
import { EPS, rect, type Rect, type Size } from "../geometry";
import { moveTo, type DockPlace } from "./changes";
import { axisOf } from "./helpers";
import type { Scene, SceneLayout, Zone } from "./model";
import { solve } from "./solve";
import { refusals, targets } from "./targets";
import type { SceneRefusal, SceneTarget, SceneTargetOptions } from "./targets/model";

/** The pitch of the spots over a bar's free stretches, px: a quarter of a typical toolbar's length (158 px in the lab). */
export const SPOT_PITCH = 40;

/** One place a drop in a lane lands. */
export interface LaneSpot {
  /** Stable across solves: `<lane>/<zone>/<item before or ^>|<item after or $>`, with `@<n>` for a pitched spot. */
  readonly id: string;
  /** Its stretch of the lane, along the lane's axis. */
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
  /** The edge's id, or a virtual lane's (`column:<side>:<ring>`, `rail:<side>`). */
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
  /** The content: the document region is it less `blocked`. */
  readonly content: Rect;
  /** What the document region excludes: drawn edges and docked items. */
  readonly blocked: readonly Rect[];
  readonly stage: Rect;
  /** The held item's size as it is now. */
  readonly item: Size;
  /** The float target (its `after(point, grab)` is the float landing), or null where the item doesn't float. */
  readonly float: SceneTarget | null;
}

export interface LaneOptions extends SceneTargetOptions {
  /** The pitch of a bar's free-stretch spots, px (default `SPOT_PITCH`; 0 or less: none). */
  readonly pitch?: number;
  /** The spot held now: its stretches are drawn in its own layout (the room open). Default: the layout as seen. */
  readonly spot?: string;
}

const mid = (r: Rect, axis: "x" | "y"): number => (axis === "x" ? r.x + r.width / 2 : r.y + r.height / 2);
const lo = (r: Rect, axis: "x" | "y"): number => (axis === "x" ? r.x : r.y);
const len = (r: Rect, axis: "x" | "y"): number => (axis === "x" ? r.width : r.height);
const hull = (a: Rect, b: Rect): Rect => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return rect(x, y, Math.max(a.x + a.width, b.x + b.width) - x, Math.max(a.y + a.height, b.y + b.height) - y);
};
const nonNeg = (v: number | undefined): number => (Number.isFinite(v) && v! > 0 ? v! : 0);

/** The items drawn on `edge` in `l`, other than `dragged`, in order along `axis`. */
function onEdge(l: SceneLayout, edge: string, dragged: string, axis: "x" | "y"): { id: string; r: Rect; zone: Zone | undefined; fixed: boolean }[] {
  return Object.entries(l.items)
    .filter(([id, it]) => id !== dragged && it.edge === edge && !it.inMenu && !it.floating && it.rect.width > EPS && it.rect.height > EPS)
    .map(([id, it]) => ({ id, r: it.rect, zone: it.zone, fixed: !!it.fixed }))
    .sort((a, b) => lo(a.r, axis) - lo(b.r, axis));
}

/** A spot's stable id: its lane, zone, and the items either side of the dragged item in `after`. */
function spotId(lane: string, zone: Zone | undefined, after: SceneLayout, edge: string, dragged: string, axis: "x" | "y"): string {
  const me = after.items[dragged];
  const others = onEdge(after, edge, dragged, axis);
  const at = me ? mid(me.rect, axis) : 0;
  const before = [...others].reverse().find((o) => mid(o.r, axis) < at)?.id ?? "^";
  const next = others.find((o) => mid(o.r, axis) >= at)?.id ?? "$";
  return `${lane}/${zone ?? "start"}/${before}|${next}`;
}

/**
 * The lanes and regions of a drag of `dragged`: every lane that takes it with its spots and stretches, the refused
 * places outside lanes, the content and what blocks it, the stage, the item's size and the float target.
 */
export function lanes(scene: Scene, dragged: string, options: LaneOptions = {}): Regions {
  const seen = solve(scene, options.previous ? { previous: options.previous } : {});
  const ts = targets(scene, dragged, options);
  const rs = refusals(scene, dragged, options);
  const own = seen.items[dragged];
  const ownEdge = own && !own.floating && !own.inMenu ? own.edge : undefined;
  const pitch = options.pitch === undefined ? SPOT_PITCH : options.pitch;

  // The spots of each lane, from the targets: a gap (an edge's), the item's own place (its edge's), a new column's line
  // or a rail (virtual lanes, one spot each).
  type Raw = { lane: string; edge: string | null; zone: Zone | undefined; target: SceneTarget; home?: true; pitched?: true; id?: string };
  const raw: Raw[] = [];
  for (const t of ts) {
    if (t.free) continue;
    const p = t.place;
    if (p.kind === "gap") raw.push({ lane: p.edge, edge: p.edge, zone: p.zone, target: t });
    else if (p.kind === "home" && ownEdge) raw.push({ lane: ownEdge, edge: ownEdge, zone: own?.zone, target: t, home: true });
    else if (p.kind === "column") raw.push({ lane: `column:${p.side}:${p.ring}`, edge: null, zone: undefined, target: t });
    else if (p.kind === "rail") raw.push({ lane: `rail:${p.side}`, edge: null, zone: undefined, target: t });
  }
  const landingOf = (r: Raw): Rect | null =>
    r.home ? (own?.rect ?? null) : (r.target.after({ x: 0, y: 0 }, { x: 0, y: 0 }).layout.items[dragged]?.rect ?? r.target.slot ?? null);

  // A bar's free stretches: spots at `pitch` between the items, each a dock with `space` (`SceneItem.space`).
  if (pitch > 0) raw.push(...pitchedSpots(scene, dragged, options, seen, raw, pitch));

  const byLane = new Map<string, Raw[]>();
  for (const r of raw) byLane.set(r.lane, [...(byLane.get(r.lane) ?? []), r]);

  const build = (layoutFor: (r: Raw) => SceneLayout | null): Lane[] => {
    const out: Lane[] = [];
    for (const [id, rs0] of byLane) {
      const first = rs0[0]!;
      const edge = first.edge ? scene.edges.find((e) => e.id === first.edge) : undefined;
      const axis: "x" | "y" = edge ? (axisOf(edge.side) === "column" ? "y" : "x") : first.lane.startsWith("column:") || first.lane.startsWith("rail:") ? "y" : "x";
      const landed = rs0.map((r) => ({ r, landing: landingOf(r) })).filter((x): x is { r: Raw; landing: Rect } => !!x.landing);
      if (landed.length === 0) continue;
      // The lane's rect: the edge as drawn, else (an empty edge, a virtual lane) the band its drops are drawn at.
      const drawn = first.edge ? seen.edges[first.edge] : undefined;
      const band = landed.map((x) => x.landing).reduce(hull);
      let laneRect: Rect;
      if (drawn && drawn.cross > EPS) laneRect = drawn.rect;
      else if (drawn) laneRect = axis === "x" ? rect(drawn.rect.x, band.y, drawn.rect.width, band.height) : rect(band.x, drawn.rect.y, band.width, drawn.rect.height);
      else laneRect = landed.map((x) => x.r.target.hit).reduce(hull, band);
      // Spots in order; one landing is one spot (the item's own place where it is one of them).
      const same = (a: Rect, b: Rect): boolean => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.width - b.width), Math.abs(a.height - b.height)) < 0.5;
      const sorted = [...landed].sort((a, b) => mid(a.landing, axis) - mid(b.landing, axis) || (a.r.home ? -1 : b.r.home ? 1 : 0));
      const unique = sorted.filter((x, i) => !sorted.slice(0, i).some((y) => same(y.landing, x.landing)));
      // Boundaries: the middle of an item drawn between two spots (the held layout's), else halfway between landings.
      const drawnNow = layoutFor(first) ?? seen;
      const between = first.edge ? onEdge(drawnNow, first.edge, dragged, axis) : [];
      const start = lo(laneRect, axis);
      const end = start + len(laneRect, axis);
      const cuts: number[] = [];
      for (let i = 0; i + 1 < unique.length; i++) {
        const a = mid(unique[i]!.landing, axis);
        const b = mid(unique[i + 1]!.landing, axis);
        const item = between.find((o) => mid(o.r, axis) > a + EPS && mid(o.r, axis) < b - EPS);
        cuts.push(item ? mid(item.r, axis) : (a + b) / 2);
      }
      const spots: LaneSpot[] = unique.map((x, i) => {
        const after = x.r.home ? seen : x.r.target.after({ x: 0, y: 0 }, { x: 0, y: 0 }).layout;
        const sid = x.r.id ?? (first.edge ? spotId(id, x.r.zone, after, first.edge, dragged, axis) : `${id}/${x.r.target.id}`);
        return {
          id: sid,
          along: [i === 0 ? start : cuts[i - 1]!, i === unique.length - 1 ? end : cuts[i]!] as const,
          landing: x.landing,
          target: x.r.target,
          ...(x.r.home ? { home: true as const } : {}),
          ...(x.r.pitched ? { pitched: true as const } : {}),
        };
      });
      const refused: LaneRefusal[] = first.edge
        ? rs.filter((f) => f.edge === first.edge).flatMap((f) => (f.hits ?? [f.hit]).map((h) => ({ along: [lo(h, axis), lo(h, axis) + len(h, axis)] as const, reason: f.reason })))
        : [];
      out.push({ id, rect: laneRect, axis, spots, refused });
    }
    return out;
  };

  let laneList = build(() => null);
  // The spot held now: stretches in its own layout (its room open), the ids unchanged.
  if (options.spot) {
    const held = laneList.flatMap((l) => l.spots).find((s) => s.id === options.spot);
    if (held && !held.home) {
      const layout = held.target.after({ x: 0, y: 0 }, { x: 0, y: 0 }).layout;
      const heldLane = laneList.find((l) => l.spots.includes(held))!.id;
      laneList = build((r) => (r.lane === heldLane ? layout : null));
    }
  }

  const onLanes = new Set(laneList.map((l) => l.id));
  const blocked = [
    ...Object.values(seen.edges).filter((e) => e.cross > EPS).map((e) => e.rect),
    ...Object.entries(seen.items).filter(([id, it]) => id !== dragged && !it.floating && !it.inMenu).map(([, it]) => it.rect),
  ];
  return {
    lanes: laneList,
    refused: rs.filter((f) => !onLanes.has(f.edge)).flatMap((f) => f.hits ?? [f.hit]),
    content: seen.content,
    blocked,
    stage: scene.stage,
    item: own ? { width: own.rect.width, height: own.rect.height } : { width: 0, height: 0 },
    float: ts.find((t) => t.free) ?? null,
  };
}

/**
 * Spots at `pitch` over a bar's free stretches: between the items as seen with the held item lifted, a start-zone dock
 * keeping `space` before it where the stretch follows a start item (or the bar's start), an end-zone dock keeping
 * `space` after it where it precedes an end item (or the bar's end). Kept only where the drop lands where it was aimed
 * (within 1 px) and not on another spot's landing.
 */
function pitchedSpots(
  scene: Scene,
  dragged: string,
  options: LaneOptions,
  seen: SceneLayout,
  raw: readonly { lane: string; edge: string | null; zone: Zone | undefined; target: SceneTarget }[],
  pitch: number,
): { lane: string; edge: string; zone: Zone; target: SceneTarget; pitched: true; id: string }[] {
  const out: { lane: string; edge: string; zone: Zone; target: SceneTarget; pitched: true; id: string }[] = [];
  const item = scene.items[dragged];
  if (!item) return out;
  for (const e of scene.edges) {
    if (e.side !== "top" && e.side !== "bottom") continue;
    const mine = raw.filter((r) => r.edge === e.id);
    if (mine.length === 0) continue;
    const drawn = seen.edges[e.id];
    if (!drawn || drawn.cross <= EPS) continue;
    // The held item's length here: a landing on this bar.
    const sample = mine.map((r) => r.target.after({ x: 0, y: 0 }, { x: 0, y: 0 }).layout.items[dragged]?.rect).find((r): r is Rect => !!r);
    if (!sample) continue;
    const w = sample.width;
    const gap = nonNeg(e.gap);
    const padStart = nonNeg(e.pad?.start);
    const padEnd = nonNeg(e.pad?.end);
    const others = onEdge(seen, e.id, dragged, "x");
    const barStart = drawn.rect.x + padStart;
    const barEnd = drawn.rect.x + drawn.rect.width - padEnd;
    const middle = drawn.rect.x + drawn.rect.width / 2;
    const zoneOfItem = (o: (typeof others)[number]): Zone => o.zone ?? "start";
    const taken = mine.map((r) => r.target.after({ x: 0, y: 0 }, { x: 0, y: 0 }).layout.items[dragged]?.rect).filter((r): r is Rect => !!r);
    for (let i = 0; i <= others.length; i++) {
      const left = others[i - 1];
      const right = others[i];
      const a = left ? left.r.x + left.r.width + gap : barStart;
      const b = right ? right.r.x - gap : barEnd;
      if (b - a < w + pitch) continue;
      for (let x0 = a + pitch; x0 + w <= b - pitch + EPS; x0 += pitch) {
        const toStart = x0 + w / 2 < middle;
        // A start dock follows a start item or the bar's start; an end dock precedes an end item or the bar's end.
        if (toStart && left && zoneOfItem(left) !== "start") continue;
        if (!toStart && right && zoneOfItem(right) !== "end") continue;
        const zone: Zone = toStart ? "start" : "end";
        const at = others.filter((o) => zoneOfItem(o) === zone && o.r.x < x0).length;
        const space = toStart ? x0 - a : b - (x0 + w);
        const place: DockPlace = { edge: e.id, zone, at, space };
        const next = moveTo(scene, dragged, place);
        if (next === scene) continue;
        const layout = solve(next, options.previous ? { previous: options.previous } : {});
        const landed = layout.items[dragged];
        if (!landed || landed.inMenu || landed.edge !== e.id || Math.abs(landed.rect.x - x0) > 1) continue;
        if (taken.some((r) => Math.abs(r.x - landed.rect.x) < pitch / 2)) continue;
        taken.push(landed.rect);
        const result = { scene: next, layout };
        const target: SceneTarget = { id: `pitch:${e.id}:${zone}:${at}:${Math.round(space)}`, priority: 2, hit: landed.rect, slot: landed.rect, item: dragged, place: { kind: "gap", edge: e.id, zone, at }, after: () => result };
        // Keyed by its neighbors and how many pitches it keeps from the one it is spaced from: stable while they stay.
        out.push({ lane: e.id, edge: e.id, zone, target, pitched: true, id: `${spotId(e.id, zone, layout, e.id, dragged, "x")}@${Math.round(space / pitch)}` });
      }
    }
  }
  return out;
}
