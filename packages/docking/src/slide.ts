/**
 * The sliding range: one place's landings over the free room between two neighbors on a bar or a toolbar rail. The one
 * model both drop paths read: `lanes()` slides a spot over it (its stretch cut from the range's first and last
 * landings) and `targets()` cuts its tiles from the same two landings, so a pointer over free room picks the same place
 * whichever a host reads.
 *
 * - The room (`slideRoom`): from flush after the neighbor before it (a growing one at its natural length: its slack is
 *   spare room, it gives way) to flush before the neighbor after it, read in the layout of the dock with no space in the
 *   zone a dock there takes first (start after a start item or the edge's start, else end), the neighbors in the forms
 *   that drop leaves them in. Where that dock pushes a neighbor on a side with no zone of its own (`givesWay`'s
 *   "moves"), that end as the lift leaves it. As the lift leaves it where no such dock lands between the two.
 * - A landing (`slideLand`): a dock keeping the space that puts the item's start at `x0`, in the zone nearer the edge's
 *   middle first, kept where it lands there (within 1 px) between the same two neighbors, every fixed item kept.
 * - The range (`slideRange`): the landings at the room's start, every `sample` px after it and the last start that fits
 *   (`rangeTries`); its ends are the first and the last of them that land.
 */
import { EPS, rect, type Axis, type Rect } from "@n-uf/placement";
import { itemSteps } from "@n-uf/placement/stack";
import { len, lo, rangeTries, zoneIn } from "./aim";
import { markUsed, moveTo, type DockPlace } from "./changes";
import type { DockEdge, DockItemLayout, DockLayout, DockState, SolveOptions, Zone } from "./model";
import { solveLanded } from "./targets/edges";
import type { DropResult } from "./targets/model";

const mid = (r: Rect, axis: Axis): number => lo(r, axis) + len(r, axis) / 2;
const nonNeg = (v: number | undefined): number => (Number.isFinite(v) && v! > 0 ? v! : 0);

/** The items drawn on `edge` in `l`, other than `dragged`, in order along `axis`. */
export function onEdge(l: DockLayout, edge: string, dragged: string, axis: Axis): { id: string; r: Rect; zone: Zone | undefined }[] {
  return Object.entries(l.items)
    .filter(([id, it]) => id !== dragged && it.edge === edge && !it.inMenu && !it.floating && it.rect.width > EPS && it.rect.height > EPS)
    .map(([id, it]) => ({ id, r: it.rect, zone: it.zone }))
    .sort((a, b) => lo(a.r, axis) - lo(b.r, axis));
}

/** The items either side of the dragged item on `edge` in `after`: `^` and `$` at the ends. */
export function neighbors(after: DockLayout, edge: string, dragged: string, axis: Axis): { before: string; next: string } {
  const me = after.items[dragged];
  const others = onEdge(after, edge, dragged, axis);
  const at = me ? mid(me.rect, axis) : 0;
  return { before: [...others].reverse().find((o) => mid(o.r, axis) < at)?.id ?? "^", next: others.find((o) => mid(o.r, axis) >= at)?.id ?? "$" };
}

/**
 * How a neighbor gives way to a drop beside a room, or null where it doesn't: when the item lands, the neighbor
 * `"leaves"` the lane (into the menu, a float), `"steps"` down to a shorter form than it has `now`, or `"moves"` away
 * from the room (its end left of where it was, for the neighbor `before` the room; its start right of it, for the one
 * after; by more than half a pixel). `extent` is its extent along the lane as read (a growing item at its natural
 * length). The one rule the marks (a striped end at each neighbor that gives way) and the room a drop makes read.
 */
export function givesWay(
  now: DockItemLayout | undefined,
  after: DockItemLayout | undefined,
  lane: string,
  side: "before" | "after",
  extent: (r: Rect) => [number, number],
): "leaves" | "steps" | "moves" | null {
  if (!now) return null;
  if (!after || after.inMenu || after.floating || after.edge !== lane) return "leaves";
  const [p0, p1] = extent(now.rect);
  const [q0, q1] = extent(after.rect);
  if (after.form !== now.form && q1 - q0 < p1 - p0 - 0.5) return "steps";
  return (side === "before" ? p1 - q1 : q0 - p0) > 0.5 ? "moves" : null;
}

/** A growing item's length in `r` past its natural one (a title filling the bar): spare room a dock beside it can take. */
export function slackOf(state: DockState, id: string, axis: Axis, r: Rect): number {
  const main = state.items[id]?.forms[axis === "x" ? "row" : "column"]?.[0]?.main;
  return main?.grows ? Math.max(0, len(r, axis) - main.natural) : 0;
}

/** One bar or toolbar rail as its sliding ranges read it. */
export interface SlideEdge {
  readonly state: DockState;
  readonly dragged: string;
  readonly e: DockEdge;
  readonly axis: Axis;
  /** The layout as seen with the held item lifted: what a drop is compared with. */
  readonly base: DockLayout;
  /** The edge's rect where a layout draws none. */
  readonly drawn: Rect;
  /** The edge's middle along `axis`: a landing left of it docks in the start zone first, right of it the end zone. */
  readonly middle: number;
  /** Fixed items (a title, window controls) as drawn: they keep their place, so a dock that would move one is none. */
  readonly fixed: readonly { readonly id: string; readonly r: Rect }[];
  readonly prev: SolveOptions;
}

/** The free room between two neighbors: `[a, b]` along the edge, the item's length there and the zones a dock takes. */
export interface SlideRoom {
  readonly before: string | undefined;
  readonly after: string | undefined;
  readonly a: number;
  readonly b: number;
  /** The held item's length on a drop here (the form the drop leaves it in). */
  readonly w: number;
  readonly zones: readonly Zone[];
  /** The index a dock in `zone` takes: the items of that zone before the room. */
  readonly atOf: (zone: Zone) => number;
  /** The space a dock in `zone` keeps to put the item's start at `x0`. */
  readonly spaceAt: (zone: Zone, x0: number) => number;
}

/** `[a, b]` between `before` and `after` as they lie in `l`: flush after the one, flush before the other. */
function endsIn(se: SlideEdge, l: DockLayout, before: string | undefined, after: string | undefined): { a: number; b: number } | null {
  const { e, axis } = se;
  const at = (id: string): Rect | null => {
    const it = l.items[id];
    return it && it.edge === e.id && !it.inMenu && !it.floating ? it.rect : null;
  };
  const rb = before ? at(before) : undefined;
  const ra = after ? at(after) : undefined;
  if (rb === null || ra === null) return null;
  const el = l.edges[e.id]?.rect ?? se.drawn;
  const gap = nonNeg(e.gap);
  return {
    a: before && rb ? lo(rb, axis) + len(rb, axis) - slackOf(se.state, before, axis, rb) + gap : lo(el, axis) + nonNeg(e.pad?.start),
    // (Not before a growing item: a dock there keeps no space, the item it precedes takes all that is spare.)
    b: ra ? lo(ra, axis) - gap : lo(el, axis) + len(el, axis) - nonNeg(e.pad?.end),
  };
}

/**
 * The room a drop between `before` and `after` makes (either undefined at the edge's end), `preceding` the edge's items
 * before it in order. `w`: the item's length where no dock there lands between the two (else its length as that dock
 * lands it); without it, no room there. Null where neither the dock nor the lift lays the two out on the edge.
 */
export function slideRoom(se: SlideEdge, before: string | undefined, after: string | undefined, preceding: readonly string[], w?: number): SlideRoom | null {
  const { state, dragged, e, axis } = se;
  const zoneOf = (id: string): Zone => zoneIn(se.base, id);
  const zones: Zone[] = [...(!before || zoneOf(before) === "start" ? ["start" as const] : []), ...(!after || zoneOf(after) === "end" ? ["end" as const] : [])];
  const atOf = (zone: Zone): number => preceding.filter((id) => zoneOf(id) === zone).length;
  // The dock with no space in the first zone that takes one, laid out (a dropped item counts as just used, as every
  // drop does: the room is the one its commit makes), where it lands between the two.
  const probe = ((): { a: number; b: number; w: number; layout: DockLayout } | null => {
    const zone = zones[0];
    if (!zone) return null;
    const moved = moveTo(state, dragged, { edge: e.id, zone, at: atOf(zone), space: 0 });
    if (moved === state) return null;
    const l = solveLanded(markUsed(moved, dragged), dragged, se.prev);
    const landed = l.items[dragged];
    if (!landed || landed.inMenu || landed.edge !== e.id) return null;
    const n = neighbors(l, e.id, dragged, axis);
    if (n.before !== (before ?? "^") || n.next !== (after ?? "$")) return null;
    const r = endsIn(se, l, before, after);
    return r && { ...r, w: len(landed.rect, axis), layout: l };
  })();
  const seen = endsIn(se, se.base, before, after);
  const width = probe?.w ?? w;
  if ((!probe && !seen) || width === undefined) return null;
  const pushed = (id: string | undefined, side: "before" | "after"): boolean =>
    !!id && !!probe && givesWay(se.base.items[id], probe.layout.items[id], e.id, side, (r) => [lo(r, axis), lo(r, axis) + len(r, axis) - slackOf(state, id, axis, r)]) === "moves";
  const a = probe && (zones.includes("start") || !pushed(before, "before")) ? probe.a : (seen ?? probe)!.a;
  const b = probe && (zones.includes("end") || !pushed(after, "after")) ? probe.b : (seen ?? probe)!.b;
  return { before, after, a, b, w: width, zones, atOf, spaceAt: (zone, x0) => (zone === "start" ? x0 - a : b - (x0 + width)) };
}

/** The dock `place` on `se`'s edge, if it lands the item's start at `x0` (within 1 px) with every fixed item kept. */
export function landsAt(se: SlideEdge, place: DockPlace, x0: number): { next: DockState; layout: DockLayout } | null {
  const { state, dragged, axis } = se;
  const moved = moveTo(state, dragged, place);
  if (moved === state) return null;
  // A dropped item counts as just used, as every target's drop does (`markUsed`): one model on both paths.
  const next = markUsed(moved, dragged);
  const layout = solveLanded(next, dragged, se.prev);
  const landed = layout.items[dragged];
  if (!landed || landed.inMenu || landed.edge !== se.e.id || Math.abs(lo(landed.rect, axis) - x0) > 1) return null;
  // A fixed item that takes steps (`stepping`) may step for the dock; one that goes into the » has no place to keep.
  const kept = (f: SlideEdge["fixed"][number]): boolean => {
    const it = layout.items[f.id];
    if (it?.inMenu && itemSteps(state.items[f.id]!)) return true;
    return !!it && Math.abs(lo(it.rect, axis) - lo(f.r, axis)) <= 1;
  };
  if (!se.fixed.every(kept)) return null;
  return { next, layout };
}

/** A landing of a sliding range: the dock that puts the item's start at a point, and what it commits. */
export interface SlideLanding {
  readonly place: DockPlace;
  readonly result: DropResult;
}

/** The dock that lands the item's start at `x0` in `room`, in the zone nearer the edge's middle first, or null. */
export function slideLand(se: SlideEdge, room: SlideRoom, x0: number): SlideLanding | null {
  const near: Zone = x0 + room.w / 2 < se.middle ? "start" : "end";
  for (const zone of [near, near === "start" ? ("end" as const) : ("start" as const)]) {
    if (!room.zones.includes(zone)) continue;
    const space = room.spaceAt(zone, x0);
    if (space < -EPS) continue;
    const place: DockPlace = { edge: se.e.id, zone, at: room.atOf(zone), space: Math.max(0, space) };
    const hit = landsAt(se, place, x0);
    if (hit) return { place, result: { state: hit.next, layout: hit.layout } };
  }
  return null;
}

/** A sliding range: its first and last landing starts, the item at either, and its landings by start. */
export interface SlideRange {
  readonly from: number;
  readonly to: number;
  readonly first: Rect;
  readonly last: Rect;
  /** The item at start `x0`, as the range lays it. */
  readonly at: (x0: number) => Rect;
  /** The landing at `from`. */
  readonly start: SlideLanding;
  /** The dock that lands the item's start at `x0`, or null (each start solved once). */
  readonly land: (x0: number) => SlideLanding | null;
  /** The landing at the sampled start nearest `x0` that lands (the earlier of two as near). */
  readonly nearest: (x0: number) => SlideLanding;
}

/** The sliding range over `room`, sampled every `sample` px (`rangeTries`), or null where no sampled start lands. */
export function slideRange(se: SlideEdge, room: SlideRoom, sample: number): SlideRange | null {
  const memo = new Map<number, SlideLanding | null>();
  const land = (x0: number): SlideLanding | null => {
    if (!memo.has(x0)) memo.set(x0, slideLand(se, room, x0));
    return memo.get(x0)!;
  };
  const tries = rangeTries(room.a, room.b, room.w, sample);
  const from = tries.find((x0) => !!land(x0));
  if (from === undefined) return null;
  const to = [...tries].reverse().find((x0) => x0 <= from || !!land(x0))!;
  const start = land(from)!;
  const shape = start.result.layout.items[se.dragged]!.rect;
  const at = (x0: number): Rect => (se.axis === "x" ? rect(x0, shape.y, room.w, shape.height) : rect(shape.x, x0, shape.width, room.w));
  const nearest = (x0: number): SlideLanding => {
    const order = tries.map((t, i) => ({ t, i })).sort((p, q) => Math.abs(p.t - x0) - Math.abs(q.t - x0) || p.i - q.i);
    return land(order.find(({ t }) => !!land(t))!.t)!;
  };
  return { from, to, first: at(from), last: at(to), at, start, land, nearest };
}
