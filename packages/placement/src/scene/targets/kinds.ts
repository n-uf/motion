/** The edge kinds and their data (`EDGE_KINDS`): the only place target generation tells edges apart. */
import { COLUMN_REACH } from "../../geometry";
import { isSideBar, zoneTakes } from "../helpers";
import { DEFAULT_HIT_BAND, type Edge, type Scene } from "../model";

/** How far a compact rail's hits reach inward past the rail, px. */
const RAIL_REACH = 24;

/**
 * The edge kinds and their data, the only place target generation tells them apart, the virtual edges (the column
 * lines across a side, the stops down its rail) among them.
 * - `zoneExtent`: `thirds` where items keep their length and the zones only align them, `solved` where items fill the
 *   edge (each zone's extent is the span the solver gives it), `whole` for an edge of one zone.
 * - `opens`: through which zones an empty edge opens: `any` zone that takes the kind, or only its `start` zone.
 * - `inward`: how far hits reach inward past the edge's thickness (overreach, below).
 * - Space ownership, one ordering: **owned > virtual > overreach**. A drawn edge owns its current rect; an empty edge
 *   owns only `place` px of its strip, at the boundary where it would appear (the side's rail likewise, where it lies
 *   or would lie, `railPlaces`). Owned rects rank in the order `solve` lays edges out (`layKeys`, `pushes`): an edge
 *   laid first, whose filling pushes the other, wins; between edges laid independently a drawn rect wins over an empty
 *   edge's band. `layer` orders the owned tiles where they meet. The virtual edges (the column lines) come next and get
 *   only space no edge owns. `overreach` orders the parts of tiles past their owned rect (the depth after a drop, an
 *   empty strip past its band, a compact rail's inward reach), which yield to the virtual edges and to every other
 *   edge's owned rect.
 * - `phase`: the laying phase it ranks in (`LayKey.phase`), for the kinds `solve` doesn't lay itself: the rail and a
 *   column line rank among the sides (phase 2), where the rail or a new column would be laid; null for the edges
 *   `solve` lays (their phase is `layKeys`'s).
 * - `priority`: its targets' priority. `reach`: how far a slot's tile reaches each way from its line, px.
 * - `virtual`: an edge that owns nothing (the column lines). Its refused stretches take only what every other tile
 *   leaves.
 */
export const EDGE_KINDS = {
  bar: { zoneExtent: "thirds", opens: "any", inward: 0, place: DEFAULT_HIT_BAND / 2, phase: null, layer: 10, overreach: 30, priority: 2, reach: Infinity, virtual: false },
  sideBar: { zoneExtent: "thirds", opens: "any", inward: 0, place: DEFAULT_HIT_BAND / 2, phase: null, layer: 11, overreach: 31, priority: 2, reach: Infinity, virtual: false },
  column: { zoneExtent: "solved", opens: "start", inward: 0, place: DEFAULT_HIT_BAND / 2, phase: null, layer: 12, overreach: 32, priority: 2, reach: Infinity, virtual: false },
  barBetween: { zoneExtent: "thirds", opens: "any", inward: 0, place: DEFAULT_HIT_BAND / 2, phase: null, layer: 13, overreach: 33, priority: 2, reach: Infinity, virtual: false },
  rail: { zoneExtent: "thirds", opens: "any", inward: RAIL_REACH, place: DEFAULT_HIT_BAND / 2, phase: null, layer: 14, overreach: 34, priority: 2, reach: Infinity, virtual: false },
  railStop: { zoneExtent: "whole", opens: "any", inward: 0, place: DEFAULT_HIT_BAND / 2, phase: 2, layer: 9, overreach: 39, priority: 1, reach: Infinity, virtual: false },
  columnLine: { zoneExtent: "whole", opens: "any", inward: 0, place: DEFAULT_HIT_BAND / 2, phase: 2, layer: 21, overreach: 41, priority: 2, reach: COLUMN_REACH, virtual: true },
} as const satisfies Record<
  string,
  {
    readonly zoneExtent: "thirds" | "solved" | "whole";
    readonly opens: "any" | "start";
    readonly inward: number;
    readonly place: number;
    readonly layer: number;
    readonly phase: number | null;
    readonly overreach: number;
    readonly priority: 1 | 2;
    readonly reach: number;
    readonly virtual: boolean;
  }
>;
export type EdgeKind = keyof typeof EDGE_KINDS;

/** Which of `EDGE_KINDS` an edge is. */
export function edgeKindOf(scene: Scene, e: Edge): EdgeKind {
  if (e.compact) return "rail";
  if (e.side === "top" || e.side === "bottom") return e.span === "between" ? "barBetween" : "bar";
  return isSideBar(scene, e) ? "sideBar" : "column";
}

/**
 * Whether an empty `edge` opens to `kind`: an edge opens only through its start zone, so a kind never makes a column of
 * its own where the start zone takes another kind (a group never makes a column of one toolbar: a tray column's tray is
 * its end zone). Edges whose zones only align (bars, rails, side bars) open through any zone that takes the kind.
 */
export const opensEmpty = (scene: Scene, edge: Edge, kind: string): boolean => EDGE_KINDS[edgeKindOf(scene, edge)].opens === "any" || zoneTakes(edge, "start", kind);
