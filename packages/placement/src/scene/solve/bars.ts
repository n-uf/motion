/**
 * The cut of one edge laid by itself (the full and `between` bars, and every overlay edge): its stack along the area's
 * length, drawn at the area's side as thick as the stack, the area less that thickness after it.
 */
import { rect, type Rect } from "../../geometry";
import { axisOf, type Edge } from "../model";
import { emit, type Draft } from "./draft";
import { solveEdge } from "./edge";

/** Lays `edge` at its side of `area`; returns what is left of `area` (all of it when `cut` is false). */
export function cutEdge(d: Draft, edge: Edge, area: Rect, cut: boolean): Rect {
  const column = axisOf(edge.side) === "column";
  const length = column ? area.height : area.width;
  const room = Math.max(0, column ? area.width : area.height);
  const solved = solveEdge(d.scene, edge, d.owned.get(edge)!, length, room, d.prevEdge(edge));
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
