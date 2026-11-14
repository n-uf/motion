/**
 * `targets(scene, dragged, { previous, endReach, floatSize })`: every drop target for one dragged item, in the shape
 * `@n-uf/motion/drag` takes (`id`, `priority`, `hit`, `slot?`, `free?`). Each target's `after(point, grab)` is the scene
 * a release there commits and its layout, `solve(after.scene, { previous })`: the host draws every item from that layout
 * during the preview (C22), so the preview is the result by construction.
 *
 * - `gap:<edge>:<zone>:<at>` (priority 2): for every edge whose `accepts` lists the dragged item's kind (deny by
 *   default, C25), a target before the `at`-th item of each zone (start, center, end) and at each zone's end, so an
 *   empty center or end zone can be opened. Only where the item fits (C29): after the drop it isn't in the » menu, the
 *   edge doesn't overflow, nothing in the edge is newly `too-wide`, every fixed item of the edge keeps its form and its
 *   place (a growing one may give up its spare length), and its slot covers no chrome. The hit is the edge's stretch
 *   between the neighbouring gaps (split halfway between their insertion lines), across the larger of the edge's
 *   thickness before and after the drop, the first and last reaching `endReach` px past the edge's ends; it is cut
 *   clear of the edge's fixed items and the chrome rects (a gap whose line lies inside one has no target). `marker`
 *   is the insertion line after the drop, across the edge; `slot` the item's rect after the drop.
 * - `strip:<edge>` (2): an empty edge that accepts the kind: a strip `Edge.strip` px (default 24) deep along its side,
 *   inside the content. `after` shows the edge holding the item.
 * - `float:<id>` (3, free): when `floatKinds` lists the kind. The hit covers the whole plane; the landing is the float
 *   with the pointer holding it at `grab` (default its middle), in the stage and clear of the docked items, the bars
 *   and the chrome. Its size: `options.floatSize`, else its float's size, else the item's `floatSize`, else the default.
 * - `column:<side>:<ring>` (2): a new column on each column line of a side whose `scene.columns[side]` takes the kind
 *   (outside the outermost open column, between two, inside the innermost; on a side with none, at the content's
 *   edge), `COLUMN_REACH` px each way, only where the new column shows open.
 * - `rail:<side>:<ring>` (1): docking folded into a side's rail (its rail and its template take the kind), before each
 *   folded column's segments and after the last, or a strip `RAIL_EDGE` px deep at the side's outer edge when no rail
 *   shows.
 * - `none:<i>` (1): over each `scene.blocked` rect. It takes the pointer, and a release there commits nothing.
 * - `home:<id>` (1): over a docked item's own rect (or its » entry); a floating item has none, so a move inside its own
 *   rect is a float move. A release there commits nothing. A gap, column line or rail drop that
 *   would put the item back where it is (the gap beside it, its own column's line, its own side's rail) keeps its id but
 *   is a home too: place `home`, no slot, nothing committed.
 *
 * `stops(scene, id)` orders the same targets (no home, no none) for "Move to ›" and the arrow keys.
 *
 * A dropped item counts as just used (`use`). An unknown, fixed or closed item has no targets.
 */
import { rect, type Point, type Rect, type Size } from "../geometry";
import type { Target } from "../targets/target";
import { floatAt, lift, moveTo, use, type ColumnPlace, type RailPlace } from "./changes";
import { DEFAULT_FLOAT_SIZE, DEFAULT_HIT_BAND, DEFAULT_STRIP, ZONES, axisOf, formsOf, zoneOf, type Edge, type Scene, type SceneLayout, type Zone } from "./model";
import { solve } from "./solve";

export type ScenePlace =
  | { readonly kind: "gap"; readonly edge: string; readonly zone: Zone; readonly at: number }
  | ColumnPlace
  | RailPlace
  | { readonly kind: "float" }
  | { readonly kind: "home" }
  | { readonly kind: "none" };

export interface SceneAfter {
  readonly scene: Scene;
  readonly layout: SceneLayout;
}

export interface SceneTarget extends Target {
  /** The item dragged. */
  readonly item: string;
  readonly place: ScenePlace;
  /** Gaps and strips: the line where the item's leading edge lands, zero thick, across the edge after the drop. */
  readonly marker?: Rect;
  /** The scene a release here commits and its layout. Only a float's depends on the pointer. */
  after(point: Point, grab?: Point): SceneAfter;
}

export interface SceneTargetOptions {
  /** The layout before the drag: every `after` is solved with it, as the drop will be. */
  readonly previous?: SceneLayout;
  /** How far the first and last gaps of an edge reach past its ends, px (default 0). */
  readonly endReach?: number;
  /** The float's size for the float target. */
  readonly floatSize?: Size;
}

const EPS = 1e-6;
/** A zone that covers any pointer the page can see. */
export const PLANE: Rect = rect(-1e9, -1e9, 2e9, 2e9);

const area = (r: Rect): number => Math.max(0, r.width) * Math.max(0, r.height);
const overlaps = (a: Rect, b: Rect): boolean => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > EPS && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > EPS;
const contains = (r: Rect, p: Point): boolean => p.x >= r.x - EPS && p.x <= r.x + r.width + EPS && p.y >= r.y - EPS && p.y <= r.y + r.height + EPS;

/**
 * `hit` with every blocker cut out: for each blocker it overlaps, the largest of the four parts beside the blocker that
 * still holds `keep`. Null when `keep` is inside a blocker or nothing is left.
 */
export function cutClear(hit: Rect, blockers: readonly Rect[], keep: Point): Rect | null {
  let h = hit;
  for (const b of blockers) {
    if (!overlaps(h, b)) continue;
    const right = h.x + h.width;
    const bottom = h.y + h.height;
    const parts = [
      rect(h.x, h.y, Math.min(right, b.x) - h.x, h.height),
      rect(Math.max(h.x, b.x + b.width), h.y, right - Math.max(h.x, b.x + b.width), h.height),
      rect(h.x, h.y, h.width, Math.min(bottom, b.y) - h.y),
      rect(h.x, Math.max(h.y, b.y + b.height), h.width, bottom - Math.max(h.y, b.y + b.height)),
    ].filter((p) => area(p) > EPS && contains(p, keep));
    if (parts.length === 0) return null;
    h = parts.reduce((a, p) => (area(p) > area(a) ? p : a));
  }
  return area(h) > EPS ? h : null;
}

export function targets(scene: Scene, dragged: string, options: SceneTargetOptions = {}): SceneTarget[] {
  const item = Object.hasOwn(scene.items, dragged) ? scene.items[dragged] : undefined;
  if (!item || item.fixed || item.closed) return [];
  const prev = options.previous ? { previous: options.previous } : {};
  const settle = (s: Scene): SceneAfter => ({ scene: s, layout: solve(s, prev) });
  const now = solve(scene, prev);
  const rest = lift(scene, dragged);
  const base = solve(rest, prev);
  const reach = Math.max(0, Number.isFinite(options.endReach) ? options.endReach! : 0);
  const chrome = scene.chrome ?? [];
  // No hit covers a fixed item's drawn rect, nor chrome: fixed items of every edge (an end reach may run into the next
  // bar), where they are drawn now and where they are with the item lifted out. A growing title drawn over its bar's
  // spare room covers it all: the pointer reaches only the gaps outside it (a drop's `after` may still shrink it).
  const fixedRects = (l: SceneLayout): Rect[] => Object.values(l.items).filter((it) => it.fixed).map((it) => it.rect);
  const blockers = [...fixedRects(now), ...fixedRects(base), ...chrome];
  const out: SceneTarget[] = [];

  const docked: SceneTarget[] = [];
  for (const edge of rest.edges) {
    if (!edge.accepts.includes(item.kind)) continue;
    docked.push(...edgeTargets(scene, rest, base, edge, dragged, reach, blockers, chrome, settle));
  }
  for (const side of ["left", "right"] as const) {
    if (scene.columns?.[side]?.accepts.includes(item.kind)) docked.push(...columnTargets(scene, rest, base, side, dragged, blockers, settle));
    if (scene.columns?.[side]?.accepts.includes(item.kind) && scene.rails?.[side]?.accepts.includes(item.kind)) docked.push(...railTargets(scene, rest, base, side, dragged, blockers, settle));
  }
  // A drop that puts the item back where it is (the gap beside it, its own column's line, its own rail) is its home: it
  // commits nothing and shows no slot.
  const here = placeKey(scene, dragged);
  const ownRail = now.items[dragged]?.rail;
  // C29 across the whole scene: a drop may not add an `overflow` or `too-wide` note to any edge, change any fixed item's
  // form, or squeeze one under its `main.min`, anywhere; nor land on chrome.
  const noteKey = (n: SceneLayout["notes"][number]): string | null => ("edge" in n && (n.code === "overflow" || n.code === "too-wide") ? `${n.edge}:${n.code}:${"id" in n ? n.id : ""}` : null);
  const hadNotes = new Set(base.notes.map(noteKey).filter((k): k is string => k !== null));
  const sound = (after: SceneLayout): boolean => {
    if (after.notes.some((n) => { const k = noteKey(n); return k !== null && !hadNotes.has(k); })) return false;
    for (const [id, b] of Object.entries(base.items)) {
      if (!b.fixed) continue;
      const a = after.items[id];
      const e = a?.edge ? after.edges[a.edge] : undefined;
      if (!a || !e || a.form !== b.form || a.formKind !== b.formKind) return false;
      const f = formsOf(scene.items[id]!, axisOf(e.side))[a.form];
      const len = axisOf(e.side) === "column" ? a.rect.height : a.rect.width;
      if (f && len < f.main.min - 0.5) return false;
    }
    const me = after.items[dragged];
    return !me || !chrome.some((c) => overlaps(me.rect, c));
  };
  for (const t of docked) {
    const p = t.place;
    const own = (p.kind === "rail" && p.side === ownRail) || placeKey(t.after({ x: 0, y: 0 }).scene, dragged) === here;
    if (own) out.push({ id: t.id, priority: t.priority, hit: t.hit, item: dragged, place: { kind: "home" }, after: () => ({ scene, layout: now }) });
    else if (sound(t.after({ x: 0, y: 0 }).layout)) out.push(t);
  }

  if (scene.floatKinds.includes(item.kind)) {
    const was = scene.floats.find((f) => f.id === dragged);
    const size = options.floatSize ?? (was ? { width: was.rect.width, height: was.rect.height } : (item.floatSize ?? DEFAULT_FLOAT_SIZE));
    out.push({
      id: `float:${dragged}`,
      priority: 3,
      free: true,
      hit: PLANE,
      item: dragged,
      place: { kind: "float" },
      after(point, grab) {
        const g = grab ?? { x: size.width / 2, y: size.height / 2 };
        const raw = rect(point.x - g.x, point.y - g.y, size.width, size.height);
        const first = solve(use(floatAt(scene, dragged, raw), dragged), prev);
        const at = first.items[dragged]?.rect ?? raw;
        return settle(use(floatAt(scene, dragged, rect(at.x, at.y, size.width, size.height)), dragged));
      },
    });
  }

  (scene.blocked ?? []).forEach((b, i) => {
    out.push({ id: `none:${i}`, priority: 1, hit: rect(b.x, b.y, b.width, b.height), item: dragged, place: { kind: "none" }, after: () => ({ scene, layout: now }) });
  });

  // A docked item's own place is its home. A floating item has none: a move inside its own rect is a float move.
  const own = now.items[dragged];
  if (own && !own.floating) out.push({ id: `home:${dragged}`, priority: 1, hit: own.rect, item: dragged, place: { kind: "home" }, after: () => ({ scene, layout: now }) });
  return out;
}

/** Where things are, without ages or the ids of dynamic columns: two scenes with one key place every item alike. */
function placeKey(s: Scene, id: string): string {
  const it = Object.hasOwn(s.items, id) ? s.items[id] : undefined;
  return JSON.stringify({
    edges: s.edges.map((e) => JSON.stringify([e.side, e.ring, e.column === true ? "" : e.id, e.items, e.size ?? null])).sort(),
    floats: s.floats.map((f) => [f.id, f.rect, f.anchor ?? null, f.orient ?? null]),
    from: it?.from ?? 0,
    align: it?.align ?? "start",
  });
}

/** How far a column line's hit reaches on each side of the line, px; how deep a side's edge takes a rail drop when it has no rail. */
export const COLUMN_REACH = 22;
export const RAIL_EDGE = 10;

/** The open dynamic columns of a side in `base`, outer first, with their ring in `rest`. */
function openColumns(rest: Scene, base: SceneLayout, side: "left" | "right"): { edge: Edge; r: Rect }[] {
  return rest.edges
    .filter((e) => e.side === side && e.column === true)
    .map((edge) => ({ edge, l: base.edges[edge.id] }))
    .filter((x) => x.l && !x.l.folded && !x.l.rides && x.l.cross > 0)
    .sort((a, b) => a.edge.ring - b.edge.ring)
    .map((x) => ({ edge: x.edge, r: x.l!.rect }));
}

/** The side's columns' stretch down the stage: the open columns', else the content's. */
function sideSpan(base: SceneLayout, side: "left" | "right"): { y: number; height: number } {
  const own = Object.values(base.edges).filter((e) => e.side === side && e.rect.height > 0);
  const r = own[0]?.rect ?? base.content;
  return { y: r.y, height: r.height };
}

/**
 * `column:<side>:<ring>` (priority 2): a new column on every column line of a side (outside its outermost open column,
 * between two, inside the innermost; on a side with none, at the content's edge), when `scene.columns[side]` takes the
 * kind. The hit is `COLUMN_REACH` px on each side of the line, down the columns' stretch. Only where the new column
 * shows open.
 */
function columnTargets(scene: Scene, rest: Scene, base: SceneLayout, side: "left" | "right", dragged: string, blockers: readonly Rect[], settle: (s: Scene) => SceneAfter): SceneTarget[] {
  const cols = openColumns(rest, base, side);
  const span = sideSpan(base, side);
  const mine = rest.edges.filter((e) => e.side === side);
  const inner = mine.length === 0 ? 0 : Math.max(...mine.map((e) => e.ring)) + 1;
  const lines: { x: number; ring: number }[] = [];
  const outerX = (r: Rect): number => (side === "left" ? r.x : r.x + r.width);
  const innerX = (r: Rect): number => (side === "left" ? r.x + r.width : r.x);
  cols.forEach((c) => lines.push({ x: outerX(c.r), ring: c.edge.ring }));
  if (cols.length > 0) lines.push({ x: innerX(cols[cols.length - 1]!.r), ring: cols[cols.length - 1]!.edge.ring + 1 });
  else lines.push({ x: side === "left" ? base.content.x : base.content.x + base.content.width, ring: inner });
  const out: SceneTarget[] = [];
  for (const line of lines) {
    const place: ColumnPlace = { kind: "column", side, ring: line.ring };
    const result = settle(use(moveTo(scene, dragged, place), dragged));
    const me = result.layout.items[dragged];
    const el = me?.edge ? result.layout.edges[me.edge] : undefined;
    if (!me || !el || me.inMenu || el.folded || el.rides || result.scene === scene) continue;
    const keep = { x: line.x, y: span.y + span.height / 2 };
    const hit = cutClear(rect(line.x - COLUMN_REACH, span.y, 2 * COLUMN_REACH, span.height), blockers, keep);
    if (!hit) continue;
    out.push({ id: `column:${side}:${line.ring}`, priority: 2, hit, slot: me.rect, marker: rect(line.x, span.y, 0, span.height), item: dragged, place, after: () => result });
  }
  return out;
}

/**
 * `rail:<side>:<ring>` (priority 1): docking folded into the side's rail, when its rail and its column template take the
 * kind: before each folded column's segments and after the last (the rail split halfway between them), or, with no
 * rail shown, a strip `RAIL_EDGE` px deep at the side's outer edge. The drop makes a column at that ring with the item
 * folded by hand, so it lands as a segment.
 */
function railTargets(scene: Scene, rest: Scene, base: SceneLayout, side: "left" | "right", dragged: string, blockers: readonly Rect[], settle: (s: Scene) => SceneAfter): SceneTarget[] {
  const rail = base.rails[side];
  const mine = rest.edges.filter((e) => e.side === side).sort((a, b) => a.ring - b.ring);
  const ringOf = (id: string): number => rest.edges.find((e) => e.id === id)?.ring ?? 0;
  const stops: { y: number; ring: number }[] = [];
  let zone: Rect;
  if (rail && rail.segments.length > 0) {
    zone = rail.rect;
    const groups: { edge: string; y0: number; y1: number }[] = [];
    for (const s of rail.segments) {
      const g = groups[groups.length - 1];
      if (g && g.edge === s.edge) g.y1 = s.rect.y + s.rect.height;
      else groups.push({ edge: s.edge, y0: s.rect.y, y1: s.rect.y + s.rect.height });
    }
    for (const g of groups) stops.push({ y: g.y0, ring: ringOf(g.edge) });
    const last = groups[groups.length - 1]!;
    stops.push({ y: last.y1, ring: ringOf(last.edge) + 1 });
  } else {
    const span = sideSpan(base, side);
    const firstCol = mine.find((e) => e.column === true);
    const outer = Object.values(base.edges).filter((e) => e.side === side && e.rect.height > 0);
    const x = side === "left" ? Math.min(base.content.x, ...outer.map((e) => e.rect.x)) : Math.max(base.content.x + base.content.width, ...outer.map((e) => e.rect.x + e.rect.width));
    zone = rect(side === "left" ? x : x - RAIL_EDGE, span.y, RAIL_EDGE, span.height);
    stops.push({ y: span.y, ring: firstCol ? firstCol.ring : mine.length === 0 ? 0 : mine[mine.length - 1]!.ring + 1 });
  }
  const out: SceneTarget[] = [];
  stops.forEach((s, i) => {
    const from = i === 0 ? zone.y : (stops[i - 1]!.y + s.y) / 2;
    const to = i === stops.length - 1 ? zone.y + zone.height : (s.y + stops[i + 1]!.y) / 2;
    if (to - from <= EPS) return;
    const place: RailPlace = { kind: "rail", side, ring: s.ring };
    const result = settle(use(moveTo(scene, dragged, place), dragged));
    const me = result.layout.items[dragged];
    if (!me || me.rail !== side || result.scene === scene) return;
    const hit = cutClear(rect(zone.x, from, zone.width, to - from), blockers, { x: zone.x + zone.width / 2, y: Math.min(Math.max(s.y, from), to) });
    if (!hit) return;
    out.push({ id: `rail:${side}:${s.ring}`, priority: 1, hit, slot: me.rect, marker: rect(zone.x, me.rect.y, zone.width, 0), item: dragged, place, after: () => result });
  });
  return out;
}

const SIDE_RANK: Record<string, number> = { left: 0, top: 1, bottom: 2, right: 3 };

/**
 * `stops(scene, id, options?)`: the places for "Move to ›" and the arrow keys, in reading order, from the same targets
 * (`home` and `none` left out): the left side outer to inner, the top bars, the bottom bars, the right side inner to
 * outer, floating last. Each stop is a target, so its `after` is the move.
 */
export function stops(scene: Scene, dragged: string, options: SceneTargetOptions = {}): SceneTarget[] {
  const list = targets(scene, dragged, options).filter((t) => t.place.kind !== "home" && t.place.kind !== "none");
  const sideOf = (t: SceneTarget): string => {
    const p = t.place;
    if (p.kind === "float") return "float";
    if (p.kind === "column" || p.kind === "rail") return p.side;
    if (p.kind === "gap") return scene.edges.find((e) => e.id === p.edge)?.side ?? "float";
    return "float";
  };
  const key = (t: SceneTarget): [number, number, number] => {
    const side = sideOf(t);
    const r = t.slot ?? t.hit;
    const cx = r.x + r.width / 2;
    const cy = r.y + r.height / 2;
    const rank = side === "float" ? 4 : SIDE_RANK[side]!;
    return side === "left" ? [rank, cx, cy] : side === "right" ? [rank, -cx, cy] : [rank, cy * (side === "bottom" ? -1 : 1), cx];
  };
  return list
    .map((t, i) => ({ t, i, k: key(t) }))
    .sort((a, b) => a.k[0] - b.k[0] || a.k[1] - b.k[1] || a.k[2] - b.k[2] || a.i - b.i)
    .map((x) => x.t);
}

/** One edge's gap or strip targets. `rest` is the scene with the dragged item lifted out and `base` its layout. */
function edgeTargets(scene: Scene, rest: Scene, base: SceneLayout, edge: Edge, dragged: string, reach: number, blockers: readonly Rect[], chrome: readonly Rect[], settle: (s: Scene) => SceneAfter): SceneTarget[] {
  const el = base.edges[edge.id];
  // A folded or riding column takes drops through its side's rail and column lines, not gaps.
  if (!el || el.folded || el.rides) return [];
  const column = axisOf(edge.side) === "column";
  const restEdge = rest.edges.find((e) => e.id === edge.id)!;
  const fixedIds = restEdge.items.filter((id) => rest.items[id]?.fixed && base.items[id]?.edge === edge.id);
  const tooWideBefore = new Set(base.notes.flatMap((n) => ("edge" in n && n.edge === edge.id && n.code === "too-wide" ? [n.id] : [])));

  /** Whether a drop's layout leaves room for the item in this edge (C29). */
  const fits = (after: SceneLayout): boolean => {
    const me = after.items[dragged];
    if (!me || me.edge !== edge.id || me.inMenu) return false;
    for (const n of after.notes) {
      if (!("edge" in n) || n.edge !== edge.id) continue;
      if (n.code === "overflow") return false;
      if (n.code === "too-wide" && !tooWideBefore.has(n.id)) return false;
    }
    for (const id of fixedIds) {
      const a = after.items[id];
      const b = base.items[id]!;
      if (!a || a.form !== b.form || a.formKind !== b.formKind || Math.abs(a.rect.x - b.rect.x) > 0.5 || Math.abs(a.rect.y - b.rect.y) > 0.5) return false;
    }
    return !chrome.some((c) => overlaps(me.rect, c));
  };
  const markerOf = (after: SceneLayout): Rect => {
    const slot = after.items[dragged]!.rect;
    const e = after.edges[edge.id]!;
    return column ? rect(e.rect.x, slot.y, e.cross, 0) : rect(slot.x, e.rect.y, 0, e.cross);
  };
  const target = (id: string, place: Extract<ScenePlace, { kind: "gap" }>, hit: Rect, keep: Point, solved?: SceneAfter): SceneTarget | null => {
    const result = solved ?? settle(use(moveTo(scene, dragged, place), dragged));
    if (!fits(result.layout)) return null;
    const clear = cutClear(hit, blockers, keep);
    if (!clear) return null;
    return { id, priority: 2, hit: clear, slot: result.layout.items[dragged]!.rect, marker: markerOf(result.layout), item: dragged, place, after: () => result };
  };

  const drawn = base.edges[edge.id]!.stack.items.filter((p) => p.kind !== "menu").map((p) => p.id);
  if (drawn.length === 0 && !el.menu) {
    // An empty edge: one strip inside the content along its side.
    const depth = Math.max(0, Number.isFinite(edge.strip) ? edge.strip! : DEFAULT_STRIP);
    const r = el.rect;
    const hit =
      edge.side === "left"
        ? rect(r.x, r.y, depth, r.height)
        : edge.side === "right"
          ? rect(r.x + r.width - depth, r.y, depth, r.height)
          : edge.side === "top"
            ? rect(r.x, r.y, r.width, depth)
            : rect(r.x, r.y + r.height - depth, r.width, depth);
    const keep = { x: hit.x + hit.width / 2, y: hit.y + hit.height / 2 };
    const t = target(`strip:${edge.id}`, { kind: "gap", edge: edge.id, zone: "start", at: 0 }, hit, keep);
    return t ? [t] : [];
  }

  // Each gap's insertion line along the edge, in the layout without the dragged item.
  const main0 = column ? el.rect.y : el.rect.x;
  const length = column ? el.rect.height : el.rect.width;
  const at = (r: Rect): number => (column ? r.y : r.x);
  const len = (r: Rect): number => (column ? r.height : r.width);
  const pad = { start: Math.max(0, edge.pad?.start ?? 0), end: Math.max(0, edge.pad?.end ?? 0) };
  const menuLen = el.menu ? len(el.menu.rect) : 0;
  const drawnOf = (z: Zone): Rect[] => restEdge.items.filter((id) => zoneOf(rest.items[id]) === z && base.items[id]?.edge === edge.id && !base.items[id]!.inMenu).map((id) => base.items[id]!.rect);
  const startEnd = ((): number => {
    const s = drawnOf("start");
    return s.length ? at(s[s.length - 1]!) + len(s[s.length - 1]!) : main0 + pad.start;
  })();
  const endStart = ((): number => {
    const e = drawnOf("end");
    return e.length ? at(e[0]!) : main0 + length - pad.end - menuLen;
  })();
  const empty: Record<Zone, number> = { start: main0 + pad.start, center: Math.min(Math.max(main0 + length / 2, startEnd), Math.max(startEnd, endStart)), end: main0 + length - pad.end - menuLen };
  const gaps: { zone: Zone; at: number; line: number }[] = [];
  for (const zone of ZONES) {
    const members = restEdge.items.filter((id) => zoneOf(rest.items[id]) === zone);
    for (let k = 0; k <= members.length; k++) {
      const next = members.slice(k).find((id) => base.items[id]?.edge === edge.id && !base.items[id]!.inMenu);
      const before = members
        .slice(0, k)
        .reverse()
        .find((id) => base.items[id]?.edge === edge.id && !base.items[id]!.inMenu);
      const line = next ? at(base.items[next]!.rect) : before ? at(base.items[before]!.rect) + len(base.items[before]!.rect) : empty[zone];
      gaps.push({ zone, at: k, line });
    }
  }
  // Gaps on one line are one place to the pointer: the first (in zone order) takes it.
  const sorted = gaps
    .map((g, i) => ({ ...g, i }))
    .sort((a, b) => a.line - b.line || a.i - b.i)
    .filter((g, i, all) => i === 0 || Math.abs(g.line - all[i - 1]!.line) > EPS);
  const out: SceneTarget[] = [];
  // `hitBand`: "middle" splits the edge halfway between the insertion lines (an item's halves belong to its gaps); a
  // number is a band that many px around each line, so the middle of an item is no gap. Columns default to a band.
  const bandOpt = edge.hitBand ?? (column ? DEFAULT_HIT_BAND : "middle");
  const band = bandOpt === "middle" ? Infinity : Math.max(0, Number.isFinite(bandOpt) ? bandOpt : DEFAULT_HIT_BAND);
  sorted.forEach((g, i) => {
    const lo = i === 0 ? -Infinity : (sorted[i - 1]!.line + g.line) / 2;
    const hi = i === sorted.length - 1 ? Infinity : (g.line + sorted[i + 1]!.line) / 2;
    // Never into a neighbour's band; the first and last reach `endReach` past the edge's ends.
    let from = Math.max(lo, g.line - band / 2);
    let to = Math.min(hi, g.line + band / 2);
    if (i === 0) from = Math.min(from, main0 - reach);
    if (i === sorted.length - 1) to = Math.max(to, main0 + length + reach);
    // Past the edge's ends only as far as `endReach`.
    from = Math.max(from, main0 - reach);
    to = Math.min(to, main0 + length + reach);
    if (to - from <= EPS) return;
    const place = { kind: "gap" as const, edge: edge.id, zone: g.zone, at: g.at };
    // Across: from the edge's outer side, the larger of its thickness now and after the drop (known after the solve).
    const result = settle(use(moveTo(scene, dragged, place), dragged));
    const thick = Math.max(el.cross, result.layout.edges[edge.id]?.cross ?? 0);
    const r = el.rect;
    const hit = column
      ? rect(edge.side === "left" ? r.x : r.x + r.width - thick, from, thick, to - from)
      : rect(from, edge.side === "top" ? r.y : r.y + r.height - thick, to - from, thick);
    const line = Math.min(Math.max(g.line, from), to);
    const keep = column ? { x: hit.x + hit.width / 2, y: line } : { x: line, y: hit.y + hit.height / 2 };
    const t = target(`gap:${edge.id}:${g.zone}:${g.at}`, place, hit, keep, result);
    if (t) out.push(t);
  });
  return out;
}
