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
 *   between the neighbouring gaps (split halfway between their insertion lines; over an open item's body only a
 *   `hitBand` around the line), across the larger of the edge's thickness before and after the drop (a compact edge's
 *   reaching `RAIL_REACH` further inward), the first and last reaching `endReach` px past the edge's ends. Other edges'
 *   rects, as they are now and with the item lifted, trim it: one across from the edge at its end along the edge, one
 *   beside it at its side. It is cut clear of every fixed item that doesn't grow and of the chrome rects (a gap whose
 *   line lies inside one has no target); a growing fixed item (a title) is not cut out, so a pointer over it picks the
 *   nearest gap. `marker` is the insertion line after the drop, across the edge; `slot` the item's rect after the drop.
 *   A horizontal bar (top or bottom, not compact) has a hit per zone by thirds: its left third is the leading (start)
 *   zone's, the middle the center zone's, the right the trailing (end) zone's, each split among its own gaps (their
 *   lines taken inside the third). A title bar (a bar with a fixed item that grows) is a constrained host: a gap there
 *   is a target only when the item lands in its first form, nothing in the bar changes form for it, and the title keeps
 *   its natural width.
 * - `strip:<edge>:<zone>` (2): an empty edge (a bar, a side edge, a compact rail) that accepts the kind: its strip in
 *   thirds along the edge, one target per zone that takes the kind (`Edge.zoneAccepts`; the other thirds are
 *   refusals), the item docking aligned there (leading, centred, trailing; top, middle, bottom). The strip is
 *   `Edge.strip` px (default 24) deep along its side, inside the content and clear of overlay edges, so never over a
 *   docked edge or a panel's body (a compact rail's strip alone stays at the window edge, its own place); a gap hit that
 *   spans it trims its ends, and under 1 px left it has no target. Home covers all of the dragged item's own rect: a strip (a `rail:` strip
 *   too) keeps only what lies outside it. `after` shows the edge holding the item.
 * - `float:<id>` (3, free): when `floatKinds` lists the kind. The hit covers the whole plane; the landing is the float
 *   with the pointer holding it at `grab` (default its middle), in the stage and clear of the docked items, the bars
 *   and the chrome. Its orient: `options.floatOrient`, else its float's, else the item's (`floatOrientOf`). Its size:
 *   `options.floatSize`, else its float's size, else `floatSizeOf` (the item's `floatSize`, else its form's natural
 *   size along that orient, else the default).
 * - `column:<side>:<ring>` (2): a new column on each column line of a side whose `scene.columns[side]` takes the kind
 *   (outside the outermost open column, between two, inside the innermost; on a side with none, at the content's
 *   edge), `COLUMN_REACH` px each way, only where the new column shows open.
 * - `rail:<side>:<ring>` (1): docking folded into a side's rail (its rail and its template take the kind), before each
 *   folded column's segments and after the last, or a strip `RAIL_EDGE` px deep where the rail lands (flush after its
 *   outside toolbar bars, `isOutsideSideBar`, else at the window's side less the inset) when no rail shows.
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
import { formMain } from "../stack/model";
import { floatAt, lift, moveTo, sideRings, use, type ColumnPlace, type RailPlace } from "./changes";
import { DEFAULT_HIT_BAND, DEFAULT_STRIP, ZONES, axisOf, floatOrientOf, floatSizeOf, formsOf, isOutsideSideBar, zoneOf, zoneTakes, zonesTaking, type Edge, type Orient, type Scene, type SceneLayout, type Zone } from "./model";
import { solve } from "./solve";

const ZONE_ORDER: Record<Zone, number> = { start: 0, center: 1, end: 2 };

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
  /** The float's orient for the float target (default: its float's, else the item's `floatOrientOf`). */
  readonly floatOrient?: Orient;
  /** As `solve`'s: edge or item ids solved without `previous`, in every `after` too. */
  readonly fresh?: readonly string[];
}

const EPS = 1e-6;
/** A zone that covers any pointer the page can see. */
export const PLANE: Rect = rect(-1e9, -1e9, 2e9, 2e9);

const area = (r: Rect): number => Math.max(0, r.width) * Math.max(0, r.height);
const overlaps = (a: Rect, b: Rect): boolean => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > EPS && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > EPS;
const contains = (r: Rect, p: Point): boolean => p.x >= r.x - EPS && p.x <= r.x + r.width + EPS && p.y >= r.y - EPS && p.y <= r.y + r.height + EPS;

/** How far a compact rail's gap hits reach inward past the rail, px. */
const RAIL_REACH = 24;

/** `hit` with every blocker cut out: for each blocker it overlaps, the largest of the four parts beside it. Null when nothing is left. */
export function cutAway(hit: Rect, blockers: readonly Rect[]): Rect | null {
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
    ].filter((p) => area(p) > EPS);
    if (parts.length === 0) return null;
    h = parts.reduce((a, p) => (area(p) > area(a) ? p : a));
  }
  return area(h) > EPS ? h : null;
}

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

/** The least a gap keeps along its edge where home takes its place: this much, or all its slice when shorter (px). */
const GAP_KEEP = 16;

/**
 * Home is offered only over the item's own place: its hit is the item's rect and half a band (`DEFAULT_HIT_BAND / 2`)
 * each way along the edge, across the full thickness of its gaps' hits, wherever the home gaps' slices were. Home never
 * removes a gap: every other gap hit on that edge it would cover keeps at least `GAP_KEEP` px of its slice (or all of
 * it, when shorter), at home's end, or for one inside the item's own rect at its own place (beside the item's centre,
 * which home always keeps), and home gives that up. The rest of the home gaps' slices goes to the gap beside it in the
 * same zone (each extended to meet it, never over another gap); a stretch with no such neighbour has no target (a
 * pointer there shows nothing, and a release goes home), and home never grows back over it.
 */
function homeOnlyOverItsPlace(out: SceneTarget[], now: SceneLayout): void {
  const dragged = out[0]?.item;
  const mine = dragged !== undefined ? now.items[dragged] : undefined;
  const side = mine?.edge ? now.edges[mine.edge]?.side : undefined;
  if (!mine || !side) return;
  const column = side === "left" || side === "right";
  const r = mine.rect;
  const band = DEFAULT_HIT_BAND / 2;
  const edgeOf = (t: SceneTarget): string | undefined => (t.id.startsWith("gap:") ? t.id.split(":")[1] : undefined);
  const zoneOfId = (t: SceneTarget): string | undefined => (t.id.startsWith("gap:") ? t.id.split(":")[2] : undefined);
  const span = (x: SceneTarget): [number, number] => (column ? [x.hit.y, x.hit.y + x.hit.height] : [x.hit.x, x.hit.x + x.hit.width]);
  const cross = (x: SceneTarget): [number, number] => (column ? [x.hit.x, x.hit.x + x.hit.width] : [x.hit.y, x.hit.y + x.hit.height]);
  const make = (x: SceneTarget, from: number, to: number, c?: [number, number]): SceneTarget => {
    const [c0, c1] = c ?? cross(x);
    return { ...x, hit: column ? rect(c0, from, c1 - c0, to - from) : rect(from, c0, to - from, c1 - c0) };
  };
  const homes = out.filter((t) => t.place.kind === "home" && edgeOf(t) === mine.edge);
  const mid = column ? r.y + r.height / 2 : r.x + r.width / 2;
  let h0 = (column ? r.y : r.x) - band;
  let h1 = (column ? r.y + r.height : r.x + r.width) + band;
  const c0 = Math.min(...homes.map((h) => cross(h)[0]));
  const c1 = Math.max(...homes.map((h) => cross(h)[1]));
  const first = homes[0];
  // One home target, where the first home gap was in the list (none when no gap beside the item is its home: the
  // `home:<id>` target over its rect is, and the gaps are still kept clear of the item's centre).
  for (const h of homes.slice(1)) out.splice(out.indexOf(h), 1);
  const at = first ? out.indexOf(first) : -1;
  if (first) out.splice(at, 1);
  // Every other gap on the edge that home would cover keeps a slice of its own, and home gives it up.
  for (let i = 0; i < out.length; i++) {
    const x = out[i]!;
    if (x.place.kind !== "gap" || edgeOf(x) !== mine.edge) continue;
    const [s0, s1] = span(x);
    if (s1 <= h0 + EPS || s0 >= h1 - EPS) continue;
    const keep = Math.min(GAP_KEEP, s1 - s0);
    if (s0 < h0) {
      // Across home's start: it keeps what lies before home, and at least `keep`.
      const e = Math.min(s1, Math.max(h0, s0 + keep));
      out[i] = make(x, s0, e);
      h0 = Math.max(h0, e);
    } else if (s1 > h1) {
      const b = Math.max(s0, Math.min(h1, s1 - keep));
      out[i] = make(x, b, s1);
      h1 = Math.min(h1, b);
    } else {
      // Inside home: a slice at its own place, never over the item's centre.
      // At its own line (where its marker says the item would land), within its slice.
      const line = x.marker ? (column ? x.marker.y : x.marker.x) : (s0 + s1) / 2;
      let a = Math.min(Math.max(line - keep / 2, s0), s1 - keep);
      // Over the centre: moved just beside it, on the side its slice mostly lies.
      if (a <= mid + 1 && a + keep >= mid - 1) a = (s0 + s1) / 2 < mid ? mid - 1 - keep : mid + 1;
      out[i] = make(x, a, a + keep);
      if (a + keep <= mid + EPS) h0 = Math.max(h0, a + keep);
      else h1 = Math.min(h1, a);
    }
  }
  // What each home slice gives up goes to its same-zone neighbour that meets it there (never over another gap), else
  // to nothing.
  const others = (x: SceneTarget) => out.filter((y) => y !== x && y.place.kind === "gap" && edgeOf(y) === mine.edge).map(span);
  for (const h of homes) {
    const [a0, a1] = span(h);
    const near = out.filter((x) => x.place.kind === "gap" && edgeOf(x) === mine.edge && zoneOfId(x) === zoneOfId(h));
    const before = near.find((x) => Math.abs(span(x)[1] - a0) < 1);
    const after = near.find((x) => Math.abs(span(x)[0] - a1) < 1);
    if (before && a0 < h0 - EPS) {
      const stop = Math.min(a1, h0, ...others(before).filter(([b]) => b >= span(before)[1] - EPS).map(([b]) => b));
      if (stop > span(before)[1]) out[out.indexOf(before)] = make(before, span(before)[0], stop);
    }
    if (after && a1 > h1 + EPS) {
      const stop = Math.max(a0, h1, ...others(after).filter(([, e]) => e <= span(after)[0] + EPS).map(([, e]) => e));
      if (stop < span(after)[0]) out[out.indexOf(after)] = make(after, stop, span(after)[1]);
    }
  }
  if (first && h1 - h0 > EPS) out.splice(Math.min(at, out.length), 0, make(first, h0, h1, [c0, c1]));
}

export function targets(scene: Scene, dragged: string, options: SceneTargetOptions = {}): SceneTarget[] {
  const item = Object.hasOwn(scene.items, dragged) ? scene.items[dragged] : undefined;
  if (!item || item.fixed || item.closed) return [];
  const prev = { ...(options.previous ? { previous: options.previous } : {}), ...(options.fresh ? { fresh: options.fresh } : {}) };
  const settle = (s: Scene): SceneAfter => ({ scene: s, layout: solve(s, prev) });
  const now = solve(scene, prev);
  const rest = lift(scene, dragged);
  const base = solve(rest, prev);
  const reach = Math.max(0, Number.isFinite(options.endReach) ? options.endReach! : 0);
  const chrome = scene.chrome ?? [];
  // No hit covers a non-growing fixed item (window controls, a readout) of any edge, where it is drawn now and with the
  // item lifted out, nor chrome. A growing fixed item (a title filling its bar) may lie under hits: the pointer over it
  // picks the nearest gap (just after it). The slot never covers any fixed item's reserved rect (`sound`), and a drop
  // shrinks a growing one toward its natural size (to its `min` if the room needs it).
  const grows = (l: SceneLayout, id: string): boolean => {
    const it = l.items[id]!;
    const e = it.edge ? l.edges[it.edge] : undefined;
    return !!e && !!formsOf(scene.items[id]!, axisOf(e.side))[it.form]?.main.grows;
  };
  const fixedRects = (l: SceneLayout): Rect[] => Object.entries(l.items).filter(([id, it]) => it.fixed && !grows(l, id)).map(([, it]) => it.rect);
  const blockers = [...fixedRects(now), ...fixedRects(base), ...chrome];
  const out: SceneTarget[] = [];

  const docked: SceneTarget[] = [];
  for (const edge of rest.edges) {
    if (!edge.accepts.includes(item.kind)) continue;
    docked.push(...edgeTargets(scene, rest, now, base, edge, dragged, reach, blockers, chrome, settle));
  }
  for (const side of ["left", "right"] as const) {
    // A new column only for kinds its template's start zone takes: a group never opens a panel column on its own.
    const template = scene.columns?.[side];
    if (!template || !zoneTakes(template, "start", item.kind)) continue;
    docked.push(...columnTargets(scene, rest, base, side, dragged, blockers, settle));
    if (scene.rails?.[side]?.accepts.includes(item.kind)) docked.push(...railTargets(scene, rest, base, side, dragged, blockers, settle));
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
      // Its least length: `main.min`, or a wrap form's rows at the edge's cross size.
      if (f && len < formMain(f, "min", e.cross) - 0.5) return false;
    }
    const me = after.items[dragged];
    if (!me) return true;
    // The slot never lies over chrome, nor over a fixed item's reserved (natural) rect after the drop.
    const fixedAfter = Object.entries(after.items).filter(([id, it]) => it.fixed && id !== dragged).map(([id]) => reservedRect(scene, after, id));
    return !chrome.some((c) => overlaps(me.rect, c)) && !fixedAfter.some((f) => overlaps(me.rect, f));
  };
  for (const t of docked) {
    const p = t.place;
    const own = (p.kind === "rail" && p.side === ownRail) || placeKey(t.after({ x: 0, y: 0 }).scene, dragged) === here;
    if (own) out.push({ id: t.id, priority: t.priority, hit: t.hit, item: dragged, place: { kind: "home" }, after: () => ({ scene, layout: now }) });
    else if (sound(t.after({ x: 0, y: 0 }).layout)) out.push(t);
  }
  homeOnlyOverItsPlace(out, now);
  // A compact rail's inward reach never covers another edge's gap (a column's tray, say): where it would, the hit keeps
  // only the rail's own thickness.
  const edgeOfGap = (t: SceneTarget): Edge | undefined => (t.place.kind === "gap" ? rest.edges.find((e) => e.id === (t.place as { edge: string }).edge) : undefined);
  const plainGapHits = out.filter((t) => t.id.startsWith("gap:") && !edgeOfGap(t)?.compact).map((t) => t.hit);
  for (let i = 0; i < out.length; i++) {
    const t = out[i]!;
    const e = edgeOfGap(t);
    if (!t.id.startsWith("gap:") || !e?.compact || !plainGapHits.some((h) => overlaps(h, t.hit))) continue;
    const h = t.hit;
    const core =
      e.side === "left"
        ? rect(h.x, h.y, h.width - RAIL_REACH, h.height)
        : e.side === "right"
          ? rect(h.x + RAIL_REACH, h.y, h.width - RAIL_REACH, h.height)
          : e.side === "top"
            ? rect(h.x, h.y, h.width, h.height - RAIL_REACH)
            : rect(h.x, h.y + RAIL_REACH, h.width, h.height - RAIL_REACH);
    out[i] = { ...t, hit: core };
  }
  // An empty edge's strip lies inside the content (a full-span bar's edge rect runs over the columns; its strip never
  // does), and never swallows a gap: a gap hit spanning it across trims its start or end (a bar's strip along the top
  // would otherwise cover the columns' first gaps); a gap across its middle is left to the smaller-hit tie-break, so a
  // strip with room is never cut down to a part. A strip with nothing left has no target.
  const gapHits = out.filter((t) => t.id.startsWith("gap:")).map((t) => t.hit);
  const c = base.content;
  for (let i = out.length - 1; i >= 0; i--) {
    const t = out[i]!;
    const e = edgeOfGap(t);
    if (!t.id.startsWith("strip:") || !e) continue;
    const vertical = e.side === "left" || e.side === "right";
    const x0 = Math.max(t.hit.x, c.x);
    const y0 = Math.max(t.hit.y, c.y);
    const x1 = Math.min(t.hit.x + t.hit.width, c.x + c.width);
    const y1 = Math.min(t.hit.y + t.hit.height, c.y + c.height);
    // Nor over an overlay edge lying on the content (where an empty bar runs under an overlay column).
    const docks = [...Object.entries(base.edges), ...Object.entries(now.edges).filter(([id]) => id !== now.items[dragged]?.edge)]
      .filter(([id, d]) => id !== e.id && area(d.rect) > EPS)
      .map(([, d]) => d.rect);
    // Nor over the dragged item's own place: home always covers all of the item's own rect. A strip there keeps only
    // what lies outside it (at home's end), never a slice through home; the strip of the item's own edge, which the
    // item alone fills, then means home anyway, and what is left of it under 1 px has no target (below).
    const mineNow = now.items[dragged];
    if (mineNow?.edge && !mineNow.floating) docks.push(mineNow.rect);
    // A compact rail's strip stays at the window edge, outside the columns it lies beyond (as a rail target's strip does
    // while no rail shows): that thin stretch along the window's side is the rail's own.
    const h = e.compact ? t.hit : x1 - x0 > EPS && y1 - y0 > EPS ? cutAway(rect(x0, y0, x1 - x0, y1 - y0), docks) : null;
    if (!h) {
      out.splice(i, 1);
      continue;
    }
    let [a0, a1] = vertical ? [h.y, h.y + h.height] : [h.x, h.x + h.width];
    for (const g of gapHits) {
      if (!overlaps(g, h)) continue;
      // Only a gap that spans the strip across trims it; a thinner one overlapping it wins by the tie-break.
      const spans = vertical ? g.x <= h.x + EPS && g.x + g.width >= h.x + h.width - EPS : g.y <= h.y + EPS && g.y + g.height >= h.y + h.height - EPS;
      if (!spans) continue;
      const [g0, g1] = vertical ? [g.y, g.y + g.height] : [g.x, g.x + g.width];
      if (g0 <= a0 + EPS && g1 > a0) a0 = Math.min(a1, g1);
      else if (g1 >= a1 - EPS && g0 < a1) a1 = Math.max(a0, g0);
    }
    // No sliver: a strip under 1 px along its edge has no target.
    if (a1 - a0 < 1) out.splice(i, 1);
    else {
      const hit = vertical ? rect(h.x, a0, h.width, a1 - a0) : rect(a0, h.y, a1 - a0, h.height);
      if (hit.x !== t.hit.x || hit.y !== t.hit.y || hit.width !== t.hit.width || hit.height !== t.hit.height) out[i] = { ...t, hit };
    }
  }
  // A rail's strip (no rail shown) never lies over the dragged item's own rect either: home covers all of it. Cut clear
  // of it, under 1 px across, it has no target.
  const mineHere = now.items[dragged];
  if (mineHere?.edge && !mineHere.floating) {
    for (let i = out.length - 1; i >= 0; i--) {
      const t = out[i]!;
      if (t.place.kind !== "rail" || !overlaps(t.hit, mineHere.rect)) continue;
      const h = cutAway(t.hit, [mineHere.rect]);
      if (!h || h.width < 1 || h.height < 1) out.splice(i, 1);
      else out[i] = { ...t, hit: h };
    }
  }

  if (scene.floatKinds.includes(item.kind)) {
    const was = scene.floats.find((f) => f.id === dragged);
    const fo: Orient = options.floatOrient ?? was?.orient ?? floatOrientOf(item);
    const size = options.floatSize ?? (was ? { width: was.rect.width, height: was.rect.height } : floatSizeOf(item, fo));
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
        const first = solve(use(floatAt(scene, dragged, raw, options.floatOrient), dragged), prev);
        const at = first.items[dragged]?.rect ?? raw;
        return settle(use(floatAt(scene, dragged, rect(at.x, at.y, size.width, size.height), options.floatOrient), dragged));
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

/**
 * What a fixed item reserves in `l`: its drawn rect, or for a form that grows only its natural length, placed by its
 * zone (from its start, from its end in the end zone, centred in the centre zone). No hit or slot ever lies there, so a
 * host that draws "no drop" areas reads them from here.
 */
export function reservedRect(scene: Scene, l: SceneLayout, id: string): Rect {
  const it = l.items[id]!;
  const e = it.edge ? l.edges[it.edge] : undefined;
  const f = e ? formsOf(scene.items[id]!, axisOf(e.side))[it.form] : undefined;
  if (!e || !f?.main.grows) return it.rect;
  const column = axisOf(e.side) === "column";
  const len = column ? it.rect.height : it.rect.width;
  const keep = Math.min(len, Math.max(0, Number.isFinite(f.main.natural) ? f.main.natural : len));
  const shift = it.zone === "end" ? len - keep : it.zone === "center" ? (len - keep) / 2 : 0;
  return column ? rect(it.rect.x, it.rect.y + shift, it.rect.width, keep) : rect(it.rect.x + shift, it.rect.y, keep, it.rect.height);
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
  // Rings as the side's edges lie (no ties): a static edge outer to the columns keeps its place, so no line offers a
  // ring outside it (`insertColumn` keeps a new column inside it).
  const rings = sideRings(rest.edges, side);
  const ringOf = (e: Edge): number => rings.get(e.id) ?? e.ring;
  const inner = rings.size;
  const lines: { x: number; ring: number }[] = [];
  const outerX = (r: Rect): number => (side === "left" ? r.x : r.x + r.width);
  const innerX = (r: Rect): number => (side === "left" ? r.x + r.width : r.x);
  cols.forEach((c) => lines.push({ x: outerX(c.r), ring: ringOf(c.edge) }));
  if (cols.length > 0) lines.push({ x: innerX(cols[cols.length - 1]!.r), ring: ringOf(cols[cols.length - 1]!.edge) + 1 });
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
 * rail shown, a strip `RAIL_EDGE` px deep where the rail lands (after the side's outside toolbar bars). The drop makes a column at that ring with the item
 * folded by hand, so it lands as a segment.
 */
function railTargets(scene: Scene, rest: Scene, base: SceneLayout, side: "left" | "right", dragged: string, blockers: readonly Rect[], settle: (s: Scene) => SceneAfter): SceneTarget[] {
  const rail = base.rails[side];
  // Rings as the side's edges lie (no ties), as `insertColumn` counts them.
  const rings = sideRings(rest.edges, side);
  const mine = rest.edges.filter((e) => e.side === side).sort((a, b) => (rings.get(a.id) ?? 0) - (rings.get(b.id) ?? 0));
  const ringOf = (id: string): number => rings.get(id) ?? 0;
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
    // Where `solve` lays the rail: flush after the side's bars outside the inset when it has any (they lie outermost),
    // else at the window's side less the inset.
    const bars = new Set(rest.edges.filter((e) => e.side === side && isOutsideSideBar(rest, e)).map((e) => e.id));
    const inner = Object.entries(base.edges)
      .filter(([id, e]) => bars.has(id) && e.rect.height > 0 && e.rect.width > 0)
      .map(([, e]) => (side === "left" ? e.rect.x + e.rect.width : e.rect.x));
    const pad = Number.isFinite(rest.inset?.[side]) ? Math.max(0, rest.inset![side]!) : 0;
    const x =
      inner.length > 0
        ? side === "left"
          ? Math.max(...inner)
          : Math.min(...inner)
        : side === "left"
          ? rest.stage.x + pad
          : rest.stage.x + rest.stage.width - pad;
    zone = rect(side === "left" ? x : x - RAIL_EDGE, span.y, RAIL_EDGE, span.height);
    stops.push({ y: span.y, ring: firstCol ? ringOf(firstCol.id) : mine.length });
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

/** Where a drop of the dragged item is refused: a host shows "no room here" at the pointer, with no slot anywhere. */
export interface SceneRefusal {
  /** `refuse:<edge>:<zone>`. */
  readonly id: string;
  readonly edge: string;
  readonly zone: Zone;
  /** Where the pointer means it; never over a target's hit. */
  readonly hit: Rect;
  /** `no-room`: the zone takes the kind, but no gap of it fits (a title bar at the title's natural width, say). `not-accepted`: the edge or zone doesn't take the kind. */
  readonly reason: "no-room" | "not-accepted";
}

/**
 * `refusals(scene, dragged, options?)`: the places a drop of `dragged` is refused, so a host can say so at the pointer
 * (a tint and "No room here") instead of showing a slot elsewhere. A bar's zone (its third, as `targets` picks zones)
 * that has no target is refused: `no-room` when the zone takes the kind, `not-accepted` when it or the bar doesn't; a
 * left or right edge that doesn't take the kind is refused as a whole (zone `start`). Each hit is cut clear of every
 * target's hit (the float target aside), so a pointer over one has no target there but the float. A release over a
 * refusal commits nothing: the item goes home.
 */
export function refusals(scene: Scene, dragged: string, options: SceneTargetOptions = {}): SceneRefusal[] {
  const item = Object.hasOwn(scene.items, dragged) ? scene.items[dragged] : undefined;
  if (!item || item.fixed || item.closed) return [];
  const prev = { ...(options.previous ? { previous: options.previous } : {}), ...(options.fresh ? { fresh: options.fresh } : {}) };
  const ts = targets(scene, dragged, options).filter((t) => !t.free);
  const base = solve(lift(scene, dragged), prev);
  const hits = ts.map((t) => t.hit);
  const out: SceneRefusal[] = [];
  const add = (edge: string, zone: Zone, hit: Rect, reason: SceneRefusal["reason"]): void => {
    const clear = cutAway(hit, hits);
    if (clear) out.push({ id: `refuse:${edge}:${zone}`, edge, zone, hit: clear, reason });
  };
  for (const e of scene.edges) {
    const le = base.edges[e.id];
    // An empty edge that takes the kind somewhere: each third of its strip with no strip target of its own is refused
    // (a zone that doesn't take the kind, or one with no room).
    if (le && !le.folded && !le.rides && !le.menu && le.stack.items.every((p) => p.kind === "menu")) {
      if (zonesTaking(e, item.kind).length === 0) continue;
      const parts = stripThirds(e, le.rect, base.content);
      if (!parts) continue;
      ZONES.forEach((zone, k) => {
        if (ts.some((t) => t.id === `strip:${e.id}:${zone}`)) return;
        add(e.id, zone, parts[k]!, zoneTakes(e, zone, item.kind) ? "no-room" : "not-accepted");
      });
      continue;
    }
    const r = le?.rect;
    if (!r || r.width <= EPS || r.height <= EPS) continue;
    const bar = (e.side === "top" || e.side === "bottom") && !e.compact;
    if (!bar) {
      if (!e.accepts.includes(item.kind)) add(e.id, "start", r, "not-accepted");
      continue;
    }
    ZONES.forEach((zone, k) => {
      const third = rect(r.x + (r.width * k) / 3, r.y, r.width / 3, r.height);
      const mine = ts.some((t) => (t.place.kind === "gap" || t.place.kind === "home") && t.id.startsWith(`gap:${e.id}:`) && overlaps(t.hit, third));
      if (mine) return;
      add(e.id, zone, third, zoneTakes(e, zone, item.kind) ? "no-room" : "not-accepted");
    });
  }
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

/**
 * An empty edge's strip in thirds along the edge (start, center, end): the strip `Edge.strip` px (default
 * {@link DEFAULT_STRIP}) deep inside the content along its side, cut along the edge to the content (a full bar runs over
 * the columns; a side edge lies between the bars), except a compact rail's, which keeps its own rect at the window
 * edge. Null when nothing of it is left.
 */
function stripThirds(edge: Edge, r: Rect, content: Rect): [Rect, Rect, Rect] | null {
  const depth = Math.max(0, Number.isFinite(edge.strip) ? edge.strip! : DEFAULT_STRIP);
  const hit =
    edge.side === "left"
      ? rect(r.x, r.y, depth, r.height)
      : edge.side === "right"
        ? rect(r.x + r.width - depth, r.y, depth, r.height)
        : edge.side === "top"
          ? rect(r.x, r.y, r.width, depth)
          : rect(r.x, r.y + r.height - depth, r.width, depth);
  const column = axisOf(edge.side) === "column";
  let [a0, a1] = column ? [hit.y, hit.y + hit.height] : [hit.x, hit.x + hit.width];
  if (!edge.compact) {
    a0 = Math.max(a0, column ? content.y : content.x);
    a1 = Math.min(a1, column ? content.y + content.height : content.x + content.width);
  }
  if (a1 - a0 <= EPS) return null;
  const w = (a1 - a0) / 3;
  const part = (k: number): Rect => (column ? rect(hit.x, a0 + k * w, hit.width, w) : rect(a0 + k * w, hit.y, w, hit.height));
  return [part(0), part(1), part(2)];
}

/** One edge's gap or strip targets. `rest` is the scene with the dragged item lifted out and `base` its layout. */
function edgeTargets(scene: Scene, rest: Scene, now: SceneLayout, base: SceneLayout, edge: Edge, dragged: string, reach: number, blockers: readonly Rect[], chrome: readonly Rect[], settle: (s: Scene) => SceneAfter): SceneTarget[] {
  const el = base.edges[edge.id];
  // A folded or riding column takes drops through its side's rail and column lines, not gaps.
  if (!el || el.folded || el.rides) return [];
  const column = axisOf(edge.side) === "column";
  const restEdge = rest.edges.find((e) => e.id === edge.id)!;
  const fixedIds = restEdge.items.filter((id) => rest.items[id]?.fixed && base.items[id]?.edge === edge.id);
  const tooWideBefore = new Set(base.notes.flatMap((n) => ("edge" in n && n.edge === edge.id && n.code === "too-wide" ? [n.id] : [])));
  // A bar's leading, center and trailing zones are picked by thirds of the bar (Revision 8).
  const thirds = !column && !edge.compact;
  const natural = (id: string, form: number): number => {
    const f = formsOf(scene.items[id]!, "row")[form];
    return f ? formMain(f, "natural", el.cross) : 0;
  };
  // A title bar: a bar with a fixed item that grows (the title).
  const titles = thirds ? fixedIds.filter((id) => !!formsOf(scene.items[id]!, "row")[base.items[id]!.form]?.main.grows) : [];
  const titled = titles.length > 0;

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
    if (titled) {
      // A title bar is a constrained host: the toolbar fits in its first form, nothing there gives way for it, and the
      // title keeps its natural width.
      if (me.form !== 0) return false;
      for (const id of restEdge.items) {
        const a = after.items[id];
        const b = base.items[id];
        if (!a || !b || b.edge !== edge.id) continue;
        if (titles.includes(id) ? a.rect.width < natural(id, a.form) - 0.5 : a.form !== b.form || !!a.inMenu !== !!b.inMenu) return false;
      }
    }
    return !chrome.some((c) => overlaps(me.rect, c));
  };
  const markerOf = (after: SceneLayout): Rect => {
    const slot = after.items[dragged]!.rect;
    const e = after.edges[edge.id]!;
    return column ? rect(e.rect.x, slot.y, e.cross, 0) : rect(slot.x, e.rect.y, 0, e.cross);
  };
  // Other edges' rects stop a gap's hit, with the item lifted and as they are now (a neighbour that moves once the item
  // is lifted keeps its panels clear of the hit too); the dragged item's own edge counts only as lifted (as it is now it
  // may lie where its neighbours move to). A compact rail's inward reach may lie over the columns of its own side (the
  // columns' gaps are cut out of it afterwards).
  const ownNow = now.items[dragged]?.edge;
  const otherOf = (edges: SceneLayout["edges"], skip?: string): Rect[] =>
    Object.entries(edges)
      .filter(([id, e]) => id !== edge.id && id !== skip && e.rect.width > EPS && e.rect.height > EPS && !(edge.compact && e.side === edge.side))
      .map(([, e]) => e.rect);
  const otherEdges = otherOf(base.edges);
  const nowEdges = otherOf(now.edges, ownNow);
  /**
   * `h` trimmed clear of each rect in `others`, never dropped. A rect across from the edge's own rect (a bar above a
   * column) trims the hit's end along the edge; one beside it (a neighbouring column) trims the hit's side across.
   * `besideOnly` (the edges as they are now, which the lift may have moved onto this edge's rect) trims only across.
   */
  const own = el.rect;
  const trimOff = (h: Rect, others: readonly Rect[], k: Point, besideOnly = false): Rect => {
    let [a0, a1] = column ? [h.y, h.y + h.height] : [h.x, h.x + h.width];
    let [c0, c1] = column ? [h.x, h.x + h.width] : [h.y, h.y + h.height];
    const km = column ? k.y : k.x;
    const kc = column ? k.x : k.y;
    const [w0, w1] = column ? [own.x, own.x + own.width] : [own.y, own.y + own.height];
    for (const o of others) {
      const [o0, o1] = column ? [o.y, o.y + o.height] : [o.x, o.x + o.width];
      const [p0, p1] = column ? [o.x, o.x + o.width] : [o.y, o.y + o.height];
      if (Math.min(a1, o1) - Math.max(a0, o0) <= EPS || Math.min(c1, p1) - Math.max(c0, p0) <= EPS) continue;
      const across = !besideOnly && Math.min(w1, p1) - Math.max(w0, p0) > EPS;
      if (!across) {
        if (p1 <= kc + EPS) c0 = Math.max(c0, p1);
        else if (p0 >= kc - EPS) c1 = Math.min(c1, p0);
      } else if (o1 <= km + EPS) a0 = Math.max(a0, o1);
      else if (o0 >= km - EPS) a1 = Math.min(a1, o0);
    }
    return column ? rect(c0, a0, Math.max(0, c1 - c0), Math.max(0, a1 - a0)) : rect(a0, c0, Math.max(0, a1 - a0), Math.max(0, c1 - c0));
  };
  const target = (id: string, place: Extract<ScenePlace, { kind: "gap" }>, hit: Rect, keep: Point, solved?: SceneAfter): SceneTarget | null => {
    const result = solved ?? settle(use(moveTo(scene, dragged, place), dragged));
    if (!fits(result.layout)) return null;
    // A gap's hit (its end reach included) never enters another edge's rect: a column's top gap stops at the bar above.
    // Along the edge only, from the keep point (inside the edge's own rect); a neighbour beside it trims the hit across.
    const clear = cutClear(id.startsWith("gap:") ? trimOff(trimOff(hit, otherEdges, keep), nowEdges, keep, true) : hit, blockers, keep);
    if (!clear) return null;
    return { id, priority: 2, hit: clear, slot: result.layout.items[dragged]!.rect, marker: markerOf(result.layout), item: dragged, place, after: () => result };
  };

  const drawn = base.edges[edge.id]!.stack.items.filter((p) => p.kind !== "menu").map((p) => p.id);
  if (drawn.length === 0 && !el.menu) {
    // An empty edge: its strip in thirds along the edge, one target per zone that takes the kind (the item docks
    // aligned there: leading, centred or trailing; top, middle or bottom of a side edge).
    const parts = stripThirds(edge, el.rect, base.content);
    if (!parts) return [];
    const out: SceneTarget[] = [];
    ZONES.forEach((zone, k) => {
      if (!zoneTakes(edge, zone, scene.items[dragged]!.kind)) return;
      const part = parts[k]!;
      const t = target(`strip:${edge.id}:${zone}`, { kind: "gap", edge: edge.id, zone, at: 0 }, part, { x: part.x + part.width / 2, y: part.y + part.height / 2 });
      if (t) out.push(t);
    });
    return out;
  }

  // Each gap's insertion line along the edge, in the layout without the dragged item.
  const main0 = column ? el.rect.y : el.rect.x;
  const length = column ? el.rect.height : el.rect.width;
  const at = (r: Rect): number => (column ? r.y : r.x);
  const len = (r: Rect): number => (column ? r.height : r.width);
  const pad = { start: Math.max(0, edge.pad?.start ?? 0), end: Math.max(0, edge.pad?.end ?? 0) };
  const menuLen = el.menu ? len(el.menu.rect) : 0;
  // What an item takes of the edge for its gaps' lines: its rect, or a growing fixed item's natural rect (a title's text),
  // so the length it grew by is free room the gaps after it reach into.
  const occupied = (id: string): Rect => (base.items[id]?.fixed ? reservedRect(scene, base, id) : base.items[id]!.rect);
  const drawnOf = (z: Zone): Rect[] => restEdge.items.filter((id) => zoneOf(rest.items[id]) === z && base.items[id]?.edge === edge.id && !base.items[id]!.inMenu).map(occupied);
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
  // Only the zones that take the dragged item's kind (`zoneAccepts`) offer gaps.
  for (const zone of zonesTaking(edge, scene.items[dragged]!.kind)) {
    const members = restEdge.items.filter((id) => zoneOf(rest.items[id]) === zone);
    for (let k = 0; k <= members.length; k++) {
      const next = members.slice(k).find((id) => base.items[id]?.edge === edge.id && !base.items[id]!.inMenu);
      const before = members
        .slice(0, k)
        .reverse()
        .find((id) => base.items[id]?.edge === edge.id && !base.items[id]!.inMenu);
      const line = next ? at(occupied(next)) : before ? at(occupied(before)) + len(occupied(before)) : empty[zone];
      gaps.push({ zone, at: k, line });
    }
  }
  // Gaps on one line are one place to the pointer: the first (in zone order) takes it. In a bar each zone has its third,
  // so only a zone's own gaps merge.
  const sorted = gaps
    .map((g, i) => ({ ...g, i }))
    .sort((a, b) => (thirds ? ZONE_ORDER[a.zone] - ZONE_ORDER[b.zone] : 0) || a.line - b.line || a.i - b.i)
    .filter((g, i, all) => i === 0 || (thirds && g.zone !== all[i - 1]!.zone) || Math.abs(g.line - all[i - 1]!.line) > EPS);
  const out: SceneTarget[] = [];
  // The gaps a drop may take: solved once each; the hits are split among these only, so a refused gap leaves no hole.
  const live = sorted
    .map((g) => {
      const place = { kind: "gap" as const, edge: edge.id, zone: g.zone, at: g.at };
      return { ...g, place, result: settle(use(moveTo(scene, dragged, place), dragged)) };
    })
    .filter((g) => fits(g.result.layout));
  // `hitBand`: the edge's whole length is split among its gaps, halfway between their insertion lines (free space and
  // short items such as toolbars belong to the nearest gap), except over a panel's body (an `open` form): a number is a
  // band that many px around each line there, so the middle of a panel is no gap. `"middle"` splits panels too.
  const bandOpt = edge.hitBand ?? DEFAULT_HIT_BAND;
  const band = bandOpt === "middle" ? Infinity : Math.max(0, Number.isFinite(bandOpt) ? bandOpt : DEFAULT_HIT_BAND);
  const bodies = Number.isFinite(band)
    ? Object.values(base.items)
        .filter((p) => p.edge === edge.id && p.formKind === "open")
        .map((p) => ({ a: at(p.rect), b: at(p.rect) + len(p.rect) }))
    : [];
  // A compact rail's hits reach a little way inward past its edge, so a pointer just inside the rail still catches it.
  const inward = edge.compact ? RAIL_REACH : 0;
  // The edge's solid items along it (fixed items that don't grow), as the lift leaves them.
  const solidSpans = fixedIds
    .filter((id) => !formsOf(scene.items[id]!, axisOf(edge.side))[base.items[id]!.form]?.main.grows)
    .map((id) => ({ a: at(base.items[id]!.rect), b: at(base.items[id]!.rect) + len(base.items[id]!.rect) }));
  live.forEach((g, i) => {
    let from = i === 0 ? -Infinity : (live[i - 1]!.line + g.line) / 2;
    let to = i === live.length - 1 ? Infinity : (g.line + live[i + 1]!.line) / 2;
    if (thirds) {
      // A bar: the zone's third, split among the zone's own gaps; the outer thirds reach past the bar's ends.
      const k = ZONE_ORDER[g.zone];
      const prev = live[i - 1]?.zone === g.zone ? live[i - 1] : undefined;
      const next = live[i + 1]?.zone === g.zone ? live[i + 1] : undefined;
      // The nearest gap to the pointer within the third. When the zone's lines run past its third (long toolbars, or a
      // center zone reaching into a side's third), they are spread proportionally inside it, so every gap of the zone
      // keeps a slice of its own.
      const a0 = main0 + (length * k) / 3;
      const b0 = main0 + (length * (k + 1)) / 3;
      const lines = live.filter((x) => x.zone === g.zone).map((x) => x.line);
      // The part of the third free of the edge's solid items (window controls, a readout): the lines are spread inside
      // it only, never over a blocker the hits are cut clear of.
      const first = Math.min(...lines);
      const last = Math.max(...lines);
      const a1 = Math.max(a0, ...solidSpans.filter((s) => s.b <= first + EPS).map((s) => s.b));
      const b1 = Math.min(b0, ...solidSpans.filter((s) => s.a >= last - EPS).map((s) => s.a));
      const [a, b] = b1 - a1 > EPS ? [a1, b1] : [a0, b0];
      const span0 = Math.min(a, ...lines);
      const span1 = Math.max(b, ...lines);
      const inThird = (x: number): number => (span1 - span0 > EPS ? a + ((x - span0) / (span1 - span0)) * (b - a) : x);
      const lo = k === 0 ? -Infinity : a0;
      const hi = k === 2 ? Infinity : b0;
      from = Math.max(lo, prev ? (inThird(prev.line) + inThird(g.line)) / 2 : lo);
      to = Math.min(hi, next ? (inThird(g.line) + inThird(next.line)) / 2 : hi);
    }
    // Over a panel's body, only `band / 2` from its edge.
    for (const p of bodies) {
      if (p.b <= g.line + EPS && p.b > from) from = Math.max(from, p.b - band / 2);
      if (p.a >= g.line - EPS && p.a < to) to = Math.min(to, p.a + band / 2);
    }
    // Only a hit that reaches the edge's end goes on past it, as far as `endReach` (a tray's gap at the foot never
    // covers the panels at the top).
    from = from <= main0 + pad.start + EPS ? main0 - reach : from;
    to = to >= main0 + length - pad.end - menuLen - EPS ? main0 + length + reach : to;
    from = Math.max(from, main0 - reach);
    to = Math.min(to, main0 + length + reach);
    if (to - from <= EPS) return;
    // Across: from the edge's outer side, the larger of its thickness now and after the drop, and a rail's inward reach.
    const thick = Math.max(el.cross, g.result.layout.edges[edge.id]?.cross ?? 0) + inward;
    const r = el.rect;
    const hit = column
      ? rect(edge.side === "left" ? r.x : r.x + r.width - (thick - inward) - inward, from, thick, to - from)
      : rect(from, edge.side === "top" ? r.y : r.y + r.height - (thick - inward) - inward, to - from, thick);
    const line = Math.min(Math.max(g.line, from), to);
    // The point a hit must keep: on the gap's line, across in the middle of the edge's own rect as it is now.
    const keep = column ? { x: r.x + r.width / 2, y: line } : { x: line, y: r.y + r.height / 2 };
    const t = target(`gap:${edge.id}:${g.zone}:${g.at}`, g.place, hit, keep, g.result);
    if (t) out.push(t);
  });
  return out;
}
