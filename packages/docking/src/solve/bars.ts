/**
 * The cut of one edge laid by itself (the full and `between` bars, and every overlay edge): its stack along the area's
 * length, drawn at the area's side as thick as the stack, the area less that thickness after it. A bar that gave way by
 * height (`bar-giveway`) is solved at its cap.
 */
import type { Rect } from "@n-uf/placement";
import { cutEdges } from "@n-uf/placement/stack";
import { axisOf } from "../helpers";
import type { DockEdge } from "../model";
import { emit, type Draft } from "./draft";
import { solveEdge } from "./edge";

/** Lays `edge` at its side of `area`; returns what is left of `area` (all of it when `cut` is false). */
export function cutEdge(d: Draft, edge: DockEdge, area: Rect, cut: boolean): Rect {
  const column = axisOf(edge.side) === "column";
  const length = column ? area.height : area.width;
  const room = Math.max(0, column ? area.width : area.height);
  // Height give-way's cap, when it shrank or folded this bar.
  const cap = d.caps.get(edge.id);
  const solvedAs = cap === undefined ? edge : { ...edge, cross: { ...edge.cross, max: Math.min(edge.cross.max, cap) } };
  const solved = solveEdge(d.state, solvedAs, d.owned.get(edge)!, length, room, d.prevEdge(edge));
  // The edge is one band of the general cut (`cutEdges`), as thick as its stack: none while it lays out nothing.
  const band = cutEdges(area, [{ id: edge.id, side: edge.side, size: solved.stack.items.length === 0 ? 0 : solved.stack.cross }]);
  emit(d, edge, band.bands[edge.id]!, solved);
  return cut ? band.rest : area;
}
