/**
 * The cut of one edge laid by itself (the full and `between` bars, and every overlay edge): its stack along the area's
 * length, drawn at the area's side as thick as the stack, the area less that thickness after it.
 *
 * Height give-way: while the content is shorter than `contentMin.height` (overlay bars counted), the top and bottom bars
 * with `giveWay` shrink across toward their minimum, then fold (their items step to the next form that fits across), in
 * give-way order: unkept before kept, the oldest newest use first, the outer first. It answers with a cap per bar, which
 * the next pass cuts each bar under, and the notes. Stateless: room coming back undoes it in reverse.
 */
import { EPS, rect, type Rect } from "../../geometry";
import { formCrossMin, formSetsCross } from "../../stack";
import { axisOf, formsOf } from "../helpers";
import type { Edge, Scene, SceneLayout, SceneNote } from "../model";
import { emit, type Draft } from "./draft";
import { solveEdge } from "./edge";
import { cutOrder, finite, isSide, px } from "./order";

/** Lays `edge` at its side of `area`; returns what is left of `area` (all of it when `cut` is false). */
export function cutEdge(d: Draft, edge: Edge, area: Rect, cut: boolean): Rect {
  const column = axisOf(edge.side) === "column";
  const length = column ? area.height : area.width;
  const room = Math.max(0, column ? area.width : area.height);
  // Height give-way's cap, when it shrank or folded this bar.
  const cap = d.caps.get(edge.id);
  const solvedAs = cap === undefined ? edge : { ...edge, cross: { ...edge.cross, max: Math.min(edge.cross.max, cap) } };
  const solved = solveEdge(d.scene, solvedAs, d.owned.get(edge)!, length, room, d.prevEdge(edge));
  const thick = solved.stack.items.length === 0 ? 0 : Math.min(solved.stack.cross, room);
  const r =
    edge.side === "top"
      ? rect(area.x, area.y, area.width, thick)
      : edge.side === "bottom"
        ? rect(area.x, area.y + area.height - thick, area.width, thick)
        : edge.side === "left"
          ? rect(area.x, area.y, thick, area.height)
          : rect(area.x + area.width - thick, area.y, thick, area.height);
  emit(d, edge, r, solved);
  if (!cut) return area;
  return edge.side === "top"
    ? rect(area.x, area.y + thick, area.width, area.height - thick)
    : edge.side === "bottom"
      ? rect(area.x, area.y, area.width, area.height - thick)
      : edge.side === "left"
        ? rect(area.x + thick, area.y, area.width - thick, area.height)
        : rect(area.x, area.y, area.width - thick, area.height);
}

/** How far under a bar's thinnest open form a fold's cap lies, so every such form steps down. */
const UNDER = 0.5;

/** The content's height less the overlay bars over it. */
function roomOf(scene: Scene, l: SceneLayout): number {
  const bars = scene.edges.filter((e) => e.mode === "overlay" && !isSide(e)).reduce((s, e) => s + (l.edges[e.id]?.cross ?? 0), 0);
  return l.content.height - bars;
}

/** The items a bar draws that set its size across, with their forms' least size across. */
function settersOf(scene: Scene, l: SceneLayout, edge: Edge): number[] {
  return (l.edges[edge.id]?.items ?? []).flatMap((id) => {
    const at = l.items[id];
    const item = scene.items[id];
    if (!at || !item || at.inMenu) return [];
    const f = formsOf(item, "row")[at.form];
    return f && formSetsCross(f) ? [formCrossMin(f)] : [];
  });
}

/**
 * The caps and notes of height give-way for `scene`, from its first layout `first`; `lay` lays it out under caps. Null
 * when nothing gives way.
 */
export function heightGiveWay(
  scene: Scene,
  first: SceneLayout,
  lay: (caps: ReadonlyMap<string, number>) => SceneLayout,
): { caps: Map<string, number>; notes: SceneNote[] } | null {
  if (!scene.contentMin) return null;
  const minH = px(scene.contentMin.height);
  const shortOf = (l: SceneLayout): number => minH - roomOf(scene, l);
  if (shortOf(first) <= EPS) return null;
  const items = (e: Edge): string[] => (first.edges[e.id]?.items ?? []).filter((id) => scene.items[id] !== undefined);
  const kept = (e: Edge): boolean => items(e).some((id) => scene.items[id]!.kept === true);
  const age = (e: Edge): number => Math.max(-Infinity, ...items(e).map((id) => finite(scene.items[id]!.used, 0)));
  const bars = cutOrder(scene.edges)
    .filter((e) => !isSide(e) && e.giveWay === true && (first.edges[e.id]?.cross ?? 0) > EPS)
    .sort((a, b) => Number(kept(a)) - Number(kept(b)) || age(a) - age(b) || finite(a.ring, 0) - finite(b.ring, 0));
  if (bars.length === 0) return null;
  /** Fold caps, by edge id: under the bar's thinnest open form, so its items step down. */
  const folds = new Map<string, number>();
  /** The shrink caps, with `folds` folded, from the layout `l` they make: each bar toward its minimum, in order. */
  const shrinkFrom = (l: SceneLayout): { caps: Map<string, number>; notes: SceneNote[]; left: number } => {
    const caps = new Map(folds);
    const notes: SceneNote[] = [];
    let left = shortOf(l);
    for (const e of bars) {
      if (left <= EPS) break;
      if (folds.has(e.id)) continue;
      const cross = l.edges[e.id]?.cross ?? 0;
      const min = Math.max(px(e.cross.min), ...settersOf(scene, l, e));
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
    const setters = settersOf(scene, first, e);
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
  return { caps: way.caps, notes: [...way.notes, ...[...folds.keys()].map((edge): SceneNote => ({ code: "bar-folded", edge }))] };
}
