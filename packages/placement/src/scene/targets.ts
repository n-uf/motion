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
 * - `none:<i>` (1): over each `scene.blocked` rect. It takes the pointer, and a release there commits nothing.
 * - `home:<id>` (1): over the item's own rect. A release there commits nothing.
 *
 * A dropped item counts as just used (`use`). An unknown, fixed or closed item has no targets.
 */
import { rect, type Point, type Rect, type Size } from "../geometry";
import type { Target } from "../targets/target";
import { floatAt, lift, moveTo, use } from "./changes";
import { DEFAULT_FLOAT_SIZE, DEFAULT_STRIP, ZONES, axisOf, zoneOf, type Edge, type Scene, type SceneLayout, type Zone } from "./model";
import { solve } from "./solve";

export type ScenePlace =
  | { readonly kind: "gap"; readonly edge: string; readonly zone: Zone; readonly at: number }
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
  // No hit covers a fixed item or chrome: fixed items of every edge (an end reach may run into the next bar), where they
  // are drawn now and where they are with the item lifted out.
  const fixedRects = (l: SceneLayout): Rect[] => Object.values(l.items).filter((it) => it.fixed).map((it) => it.rect);
  const blockers = [...fixedRects(now), ...fixedRects(base), ...chrome];
  const out: SceneTarget[] = [];

  for (const edge of scene.edges) {
    if (!edge.accepts.includes(item.kind)) continue;
    out.push(...edgeTargets(scene, rest, base, edge, dragged, reach, blockers, chrome, settle));
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

  const own = now.items[dragged];
  if (own) out.push({ id: `home:${dragged}`, priority: 1, hit: own.rect, item: dragged, place: { kind: "home" }, after: () => ({ scene, layout: now }) });
  return out;
}

/** One edge's gap or strip targets. `rest` is the scene with the dragged item lifted out and `base` its layout. */
function edgeTargets(scene: Scene, rest: Scene, base: SceneLayout, edge: Edge, dragged: string, reach: number, blockers: readonly Rect[], chrome: readonly Rect[], settle: (s: Scene) => SceneAfter): SceneTarget[] {
  const el = base.edges[edge.id];
  if (!el) return [];
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
  const sorted = gaps.map((g, i) => ({ ...g, i })).sort((a, b) => a.line - b.line || a.i - b.i);
  const out: SceneTarget[] = [];
  sorted.forEach((g, i) => {
    const from = i === 0 ? main0 - reach : (sorted[i - 1]!.line + g.line) / 2;
    const to = i === sorted.length - 1 ? main0 + length + reach : (g.line + sorted[i + 1]!.line) / 2;
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
