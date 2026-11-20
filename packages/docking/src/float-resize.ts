/**
 * `fitResize(state, id, rect, moving)`: the rect a float takes when the user drags some of its edges, clamped in one
 * pass (no iteration) and with the limits that bound it. Hosts call it on every pointer move for the preview; the
 * state change `resizeFloat(state, id, rect, moving)` commits the same rect, so the preview is the commit.
 *
 * It is not `fitFloat`: that one moves a float (never resizes it) to a clear place; this one resizes it with the edges
 * not dragged kept put, and stops a dragged edge before anything `fitFloat` would move it off, so `solve` lays the
 * result exactly where it is asked.
 */
import type { Rect } from "@n-uf/placement";
import { axisOf, keepClearFor, floatOrientOf, floatRegion, floatShape, formsOf } from "./helpers";
import type { DockState, DockLayout } from "./model";
import { solve } from "./solve";
import { floatFloor, placeFloat } from "./solve/floats";

/** The edges of a float a resize drags; the others stay put. Left beats right, top beats bottom, when both are set. */
export interface ResizeEdges {
  readonly left?: boolean;
  readonly right?: boolean;
  readonly top?: boolean;
  readonly bottom?: boolean;
}

/**
 * Why a resized float isn't the rect asked for: `"min"` its least size (`floatMin`, else its open form's minimums),
 * `"max"` its `floatMax`, `"region"` the region floats lie in (the stage less the inset at its left and right, its full
 * height), `"docked"` what floats are kept clear of (a bar, a docked item, the chrome).
 */
export type ResizeLimit = "min" | "max" | "region" | "docked";

export interface FloatResize {
  /** The float's rect: what `resizeFloat` stores and `solve` draws. */
  readonly rect: Rect;
  /** The limits that bound it, in this order: min, max, region, docked. Empty when it is the rect asked for. */
  readonly limits: readonly ResizeLimit[];
}

const LIMITS: readonly ResizeLimit[] = ["min", "max", "region", "docked"];
const EPS = 0.5;
/** How far `fitFloat` reads two rects as touching rather than overlapping (its own tolerance). */
const TOUCH = 1e-3;
const fin = (v: number | undefined, d: number): number => (Number.isFinite(v) ? v! : d);

/** What `solve` keeps floats clear of, as laid out now: docked items (» entries included), bars and their » menus, the chrome. */
function floatObstacles(state: DockState, l: DockLayout, id: string): Rect[] {
  const out: Rect[] = [];
  for (const [k, p] of Object.entries(l.items)) if (k !== id && !p.floating) out.push(p.rect);
  for (const e of Object.values(l.edges)) {
    if (axisOf(e.side) === "row" && e.cross > 0) out.push(e.rect);
    if (e.menu) out.push(e.menu.rect);
  }
  for (const c of keepClearFor(state, "floats")) out.push(c);
  return out.filter((r) => r.width > 0 && r.height > 0);
}

/**
 * Where the dragged edge of `drawn` along `axis` stops: the nearest obstacle beyond it on that side that lies across
 * `span` (the float's extent on the other axis). An obstacle the float already overlaps (it covers the edge: no clear
 * place existed at the float's size) keeps the edge where it is drawn: growing would cover it more.
 */
function obstacleStop(drawn: Rect | undefined, obstacles: readonly Rect[], axis: "x" | "y", drag: "start" | "end" | null, span: readonly [number, number]): number {
  const none = drag === "start" ? -Infinity : Infinity;
  if (!drawn || !drag) return none;
  const lo = (r: Rect): number => (axis === "x" ? r.x : r.y);
  const len = (r: Rect): number => (axis === "x" ? r.width : r.height);
  const across = (r: Rect): [number, number] => (axis === "x" ? [r.y, r.y + r.height] : [r.x, r.x + r.width]);
  let at = none;
  for (const o of obstacles) {
    const [c0, c1] = across(o);
    // Across, as tight as `fitFloat` tells touching from covering: an obstacle a fraction of a px across it still stops it.
    if (c0 >= span[1] - TOUCH || c1 <= span[0] + TOUCH) continue;
    const begin = lo(o);
    const finish = begin + len(o);
    const edge = drag === "start" ? lo(drawn) : lo(drawn) + len(drawn);
    if (drag === "start") {
      if (finish <= edge + EPS) at = Math.max(at, finish);
      // Straddling the edge: the float already covers it (no clear place at its size), and growing past the edge would
      // cover it more, so the edge stays where it is drawn.
      else if (begin < edge - TOUCH) at = edge;
    } else {
      if (begin >= edge - EPS) at = Math.min(at, begin);
      else if (finish > edge + TOUCH) at = edge;
    }
  }
  // It stops growth only: never inside where the edge is drawn now (an obstacle it touches within a fraction of a px).
  return drag === "start" ? Math.min(at, lo(drawn)) : Math.max(at, lo(drawn) + len(drawn));
}

/** One axis: `[start, length]` asked; the bounds; which edge is dragged. The limits that bind go into `hit`. */
function fitAxis(start: number, length: number, b: { min: number; max: number; lo: number; hi: number; stop: number }, drag: "start" | "end" | null, hit: Set<ResizeLimit>): [number, number] {
  const { min, lo, hi, stop } = b;
  const max = Math.max(min, b.max);
  const raw = fin(length, min);
  // A floor larger than the region: the floor, at the region's start (as `solve` lays it).
  if (min >= hi - lo) {
    hit.add("region");
    return [lo, min];
  }
  // The bound a dragged edge reaches first, with every limit that sits there.
  const bind = (cands: [number, ResizeLimit][], pick: (a: number, b: number) => number): [number, ResizeLimit[]] => {
    const at = cands.reduce((m, [v]) => pick(m, v), cands[0]![0]);
    return [at, cands.filter(([v]) => Math.abs(v - at) <= EPS).map(([, k]) => k)];
  };
  if (drag === "start") {
    // The end is kept (moved into the region only when it lies outside it).
    const asked = fin(start, lo) + raw;
    const end = Math.min(hi, Math.max(lo + min, asked));
    if (Math.abs(end - asked) > EPS) hit.add("region");
    const [down, why] = bind([[end - max, "max"], [lo, "region"], [stop, "docked"]], Math.max);
    let from = end - raw;
    if (from > end - min) {
      from = end - min;
      hit.add("min");
    } else if (from < down - TOUCH) {
      // What floats are kept clear of beats the minimum (`solve` keeps a float asked smaller at its size).
      from = why.includes("docked") ? Math.min(down, end) : Math.min(down, end - min);
      for (const k of from === down ? why : (["min"] as ResizeLimit[])) hit.add(k);
    }
    return [from, end - from];
  }
  // The start is kept (moved into the region only when it lies outside it); an axis not dragged keeps its start too.
  const asked = fin(start, lo);
  const a = Math.max(lo, Math.min(hi - min, asked));
  if (Math.abs(a - asked) > EPS) hit.add("region");
  const [up, why] = bind([[a + max, "max"], [hi, "region"], [stop, "docked"]], Math.min);
  let to = a + raw;
  if (to < a + min) {
    to = a + min;
    hit.add("min");
  } else if (to > up + TOUCH) {
    to = why.includes("docked") ? Math.max(up, a) : Math.max(up, a + min);
    for (const k of to === up ? why : (["min"] as ResizeLimit[])) hit.add(k);
  }
  return [a, to - a];
}

/**
 * The rect float `id` takes for a resize: `rect` is the rect asked for in stage px (the float as drawn, with the
 * `moving` edges where the pointer put them). In one pass: the edges not moving stay put; the size is at least the
 * item's `floatMin` (else its open form's minimums, which only stop a shrink below the size drawn now, as `solve` lays
 * it) and at most its `floatMax`; the float stays in the region floats lie in; every growing edge (a moving one, or the
 * end of an axis not moving) stops at what floats are kept clear of, as drawn now (across first, over its height now;
 * then along, over its new width), and such a stop beats the minimum. The rect is then laid by the one clamp `solve`
 * lays floats with, so `solve(resize(...))` draws exactly this rect. A float that already covers something (no clear
 * place at its size) may move to a clear place once a resize opens one; the preview is still the commit, and
 * `"docked"` says so. Such a float never grows over what it covers: a dragged edge that lies inside an obstacle stays
 * where it is drawn (`"docked"`), so a resize never covers more than the float did. `limits` says which of these bound it.
 *
 * Null for anything but a float drawn at its first form when that form grows (a panel's card): a toolbar group's size
 * comes from its forms, and so does a folded float's bar. Pure: it solves the state once, for what is drawn now.
 */
export function fitResize(state: DockState, id: string, rect: Rect, moving: ResizeEdges): FloatResize | null {
  const f = state.floats.find((x) => x.id === id);
  const item = Object.hasOwn(state.items, id) ? state.items[id] : undefined;
  if (!f || !item || item.fixed) return null;
  const fo = f.orient ?? floatOrientOf(item);
  const form = formsOf(item, fo)[0];
  if (floatShape(item, f).form !== 0 || (form && !form.main.grows)) return null;
  const l = solve(state);
  const drawn = l.items[id]?.rect;
  if (!drawn) return null;
  // `solve`'s floor: `floatMin` as given, else the form's minimums, which only stop a shrink below the size drawn now.
  const min = floatFloor(item, form, fo, drawn);
  const max = { width: fin(item.floatMax?.width, Infinity), height: fin(item.floatMax?.height, Infinity) };
  const region = floatRegion(state);
  const dragX = moving.left ? "start" : moving.right ? "end" : null;
  const dragY = moving.top ? "start" : moving.bottom ? "end" : null;
  const obstacles = floatObstacles(state, l, id);
  const hit = new Set<ResizeLimit>();
  // Every growing edge stops at what floats are kept clear of: a dragged one, and the end of an axis not dragged.
  const [x, width] = fitAxis(rect.x, rect.width, { min: min.width, max: max.width, lo: region.x, hi: region.x + region.width, stop: obstacleStop(drawn, obstacles, "x", dragX ?? "end", [drawn.y, drawn.y + drawn.height]) }, dragX, hit);
  const [y, height] = fitAxis(rect.y, rect.height, { min: min.height, max: max.height, lo: region.y, hi: region.y + region.height, stop: obstacleStop(drawn, obstacles, "y", dragY ?? "end", [x, x + width]) }, dragY, hit);
  // The one clamp `solve` lays floats with: what it gives is what the commit draws.
  const { anchor: _a, ...plain } = f;
  const placed = placeFloat(item, { ...plain, rect: { x, y, width, height } }, region, obstacles, l.content, state.stage).fit.rect;
  if (Math.abs(placed.x - x) > EPS || Math.abs(placed.y - y) > EPS) hit.add("docked");
  if (Math.abs(placed.width - width) > EPS || Math.abs(placed.height - height) > EPS) hit.add("min");
  return { rect: placed, limits: LIMITS.filter((k) => hit.has(k)) };
}
