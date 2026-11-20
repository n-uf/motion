/**
 * Bars by height: while the content is shorter than `contentMin.height` (overlay bars counted), the top and bottom bars
 * with `giveWay` shrink across toward their minimum, then fold (their items step to the next form that fits across), in
 * give-way order (`giveWayOrder`: unkept before kept, the oldest newest use first, the outer first). It answers with a
 * cap per bar, which `solve` lays the state out again under (`cutEdge` solves each bar at its cap), and the notes.
 * Stateless: room coming back undoes it in reverse.
 */
import { EPS } from "@n-uf/placement";
import { formCrossMin, formSetsCross } from "@n-uf/placement/stack";
import { formsOf } from "../helpers";
import type { DockEdge, DockState, DockLayout, DockNote } from "../model";
import { cutOrder, finite, giveWayOrder, isSide, px, type GiveWayRank } from "./order";

/** How far under a bar's thinnest open form a fold's cap lies, so every such form steps down. */
const UNDER = 0.5;

/** The content's height less the overlay bars over it. */
function roomOf(state: DockState, l: DockLayout): number {
  const bars = state.edges.filter((e) => e.mode === "overlay" && !isSide(e)).reduce((s, e) => s + (l.edges[e.id]?.cross ?? 0), 0);
  return l.content.height - bars;
}

/** The items a bar draws that set its size across, with their forms' least size across. */
function settersOf(state: DockState, l: DockLayout, edge: DockEdge): number[] {
  return (l.edges[edge.id]?.items ?? []).flatMap((id) => {
    const at = l.items[id];
    const item = state.items[id];
    if (!at || !item || at.inMenu) return [];
    const f = formsOf(item, "row")[at.form];
    return f && formSetsCross(f) ? [formCrossMin(f)] : [];
  });
}

/**
 * The caps and notes of height give-way for `state`, from its first layout `first`; `lay` lays it out under caps. Null
 * when nothing gives way.
 */
export function barGiveWay(
  state: DockState,
  first: DockLayout,
  lay: (caps: ReadonlyMap<string, number>) => DockLayout,
): { caps: Map<string, number>; notes: DockNote[] } | null {
  if (!state.contentMin) return null;
  const minH = px(state.contentMin.height);
  const shortOf = (l: DockLayout): number => minH - roomOf(state, l);
  if (shortOf(first) <= EPS) return null;
  const rankOf = (edge: DockEdge): GiveWayRank => {
    const items = (first.edges[edge.id]?.items ?? []).filter((id) => state.items[id] !== undefined);
    return {
      edge,
      kept: items.some((id) => state.items[id]!.kept === true),
      age: Math.max(-Infinity, ...items.map((id) => finite(state.items[id]!.used, 0))),
    };
  };
  const bars = cutOrder(state.edges)
    .filter((e) => !isSide(e) && e.giveWay === true && (first.edges[e.id]?.cross ?? 0) > EPS)
    .map(rankOf)
    .sort(giveWayOrder)
    .map((r) => r.edge);
  if (bars.length === 0) return null;
  /** Fold caps, by edge id: under the bar's thinnest open form, so its items step down. */
  const folds = new Map<string, number>();
  /** The shrink caps, with `folds` folded, from the layout `l` they make: each bar toward its minimum, in order. */
  const shrinkFrom = (l: DockLayout): { caps: Map<string, number>; notes: DockNote[]; left: number } => {
    const caps = new Map(folds);
    const notes: DockNote[] = [];
    let left = shortOf(l);
    for (const e of bars) {
      if (left <= EPS) break;
      if (folds.has(e.id)) continue;
      const cross = l.edges[e.id]?.cross ?? 0;
      const min = Math.max(px(e.cross.min), ...settersOf(state, l, e));
      const cut = Math.min(left, cross - min);
      if (cut <= EPS) continue;
      caps.set(e.id, cross - cut);
      notes.push({ code: "bar-shrunk", edge: e.id, from: cross, to: cross - cut });
      left -= cut;
    }
    return { caps, notes, left };
  };
  let base = first;
  let way = shrinkFrom(base);
  // Still short with every bar at its minimum: fold the bars, one at a time in the same order, each fold re-weighing
  // the shrinks of the rest, until the content fits.
  for (const e of bars) {
    if (way.left <= EPS) break;
    const setters = settersOf(state, first, e);
    if (setters.length === 0) continue;
    folds.set(e.id, Math.min(...setters) - UNDER);
    const l = lay(folds);
    if ((l.edges[e.id]?.cross ?? 0) >= (base.edges[e.id]?.cross ?? 0) - EPS) {
      // Nothing of it could step down: it keeps its size.
      folds.delete(e.id);
      continue;
    }
    base = l;
    way = shrinkFrom(base);
  }
  if (way.caps.size === 0) return null;
  return { caps: way.caps, notes: [...way.notes, ...[...folds.keys()].map((edge): DockNote => ({ code: "bar-folded", edge }))] };
}
