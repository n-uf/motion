/**
 * The one id scheme of the DockState's targets and refusals: every id `targets`, `refusals` and `stops` give is built here,
 * and a host reads one back with `parseTargetId` instead of splitting strings.
 *
 * | Id | What it names | Priority |
 * |---|---|---|
 * | `gap:<edge>:<zone>:<at>` | a slot before the `at`-th item of an edge's zone | 2 |
 * | `strip:<edge>:<zone>` | a zone's one slot on an edge with no members at all | 2 |
 * | `column:<side>:<ring>` | a new column on a side's column line | 2 |
 * | `rail:<side>:<ring>` | docking folded into a side's rail | 1 |
 * | `side:<side>` | a fixed anchor's edge moved to the other side of its axis (`DockEdge.moves: "side"`) | 2 |
 * | `home:<item>` | the item's own place (a release there puts it back) | 1 |
 * | `float:<item>` | floating anywhere | 3 |
 * | `none:<i>` | the `i`-th `blocked` rect | 1 |
 * | `refuse:<edge>:<zone>[:<n>]` | a refusal; `:<n>` from a zone's second refused tile on, by where it lies | — |
 *
 * An edge id may hold `:` (the zone and the numbers are read from the right). The virtual edges a refusal can name are
 * `column:<side>` (a side's column lines) and `rail:<side>` (its rail): `virtualEdgeId`.
 */
import type { DockState, Side, Zone } from "../model";

type ColumnSide = Extract<Side, "left" | "right">;

/** A `DropPlace`, as much of it as an id reads (this module imports no more of the state, so `solve` may use it). */
type PlaceLike =
  | { readonly kind: "gap"; readonly edge: string; readonly zone: Zone; readonly at: number }
  | { readonly kind: "column" | "rail"; readonly side: ColumnSide; readonly ring: number }
  | { readonly kind: "side"; readonly side: Side }
  | { readonly kind: "float" | "home" | "none" };

/** A target or refusal id, read. */
export type TargetIdParts =
  | { readonly kind: "gap"; readonly edge: string; readonly zone: Zone; readonly at: number }
  | { readonly kind: "strip"; readonly edge: string; readonly zone: Zone }
  | { readonly kind: "column" | "rail"; readonly side: ColumnSide; readonly ring: number }
  | { readonly kind: "side"; readonly side: Side }
  | { readonly kind: "home" | "float"; readonly item: string }
  | { readonly kind: "none"; readonly index: number }
  | { readonly kind: "refuse"; readonly edge: string; readonly zone: Zone; readonly n: number };

/** The id of the target or refusal `parts` names. */
export function targetId(parts: TargetIdParts): string {
  switch (parts.kind) {
    case "gap":
      return `gap:${parts.edge}:${parts.zone}:${parts.at}`;
    case "strip":
      return `strip:${parts.edge}:${parts.zone}`;
    case "column":
    case "rail":
      return `${parts.kind}:${parts.side}:${parts.ring}`;
    case "side":
      return `side:${parts.side}`;
    case "home":
    case "float":
      return `${parts.kind}:${parts.item}`;
    case "none":
      return `none:${parts.index}`;
    case "refuse":
      return parts.n === 0 ? `refuse:${parts.edge}:${parts.zone}` : `refuse:${parts.edge}:${parts.zone}:${parts.n}`;
  }
}

const ZONE = "(start|center|end)";
const INT = "(-?\\d+)";
const GAP = new RegExp(`^gap:(.+):${ZONE}:${INT}$`);
const STRIP = new RegExp(`^strip:(.+):${ZONE}$`);
const LINE = new RegExp(`^(column|rail):(left|right):${INT}$`);
const SIDE = /^side:(left|right|top|bottom)$/;
const ITEM = /^(home|float):(.+)$/;
const NONE = new RegExp(`^none:${INT}$`);
const REFUSE = new RegExp(`^refuse:(.+):${ZONE}(?::${INT})?$`);

/** What `id` names, or null when it is no id of the scheme. `targetId(parseTargetId(id)!) === id` for every id it reads. */
export function parseTargetId(id: string): TargetIdParts | null {
  let m: RegExpExecArray | null;
  if ((m = GAP.exec(id))) return { kind: "gap", edge: m[1]!, zone: m[2] as Zone, at: Number(m[3]) };
  if ((m = STRIP.exec(id))) return { kind: "strip", edge: m[1]!, zone: m[2] as Zone };
  if ((m = LINE.exec(id))) return { kind: m[1] as "column" | "rail", side: m[2] as ColumnSide, ring: Number(m[3]) };
  if ((m = SIDE.exec(id))) return { kind: "side", side: m[1] as Side };
  if ((m = ITEM.exec(id))) return { kind: m[1] as "home" | "float", item: m[2]! };
  if ((m = NONE.exec(id))) return { kind: "none", index: Number(m[1]) };
  if ((m = REFUSE.exec(id))) return { kind: "refuse", edge: m[1]!, zone: m[2] as Zone, n: m[3] === undefined ? 0 : Number(m[3]) };
  return null;
}

/** The id of a side's virtual edge: its column lines (`column:<side>`) or its rail (`rail:<side>`), as a refusal names it. */
export const virtualEdgeId = (kind: "column" | "rail", side: ColumnSide): string => `${kind}:${side}`;

/** The edge ids that name a side's virtual edges: no real edge may take one. */
const RESERVED_EDGE_IDS = new Set((["column", "rail"] as const).flatMap((k) => (["left", "right"] as const).map((s) => virtualEdgeId(k, s))));
export const isReservedEdgeId = (id: string): boolean => RESERVED_EDGE_IDS.has(id);

/** Throws when a real edge of `state` takes a virtual edge's id (`column:<side>`, `rail:<side>`); `solve`, `targets` and `readDockState` check it. */
export function checkEdgeIds(state: DockState): void {
  for (const e of state.edges) {
    if (isReservedEdgeId(e.id)) throw new Error(`docking: the edge id "${e.id}" is reserved for a side's virtual edge (column:<side>, rail:<side>); name the edge otherwise`);
  }
}

/**
 * The id `targets` gives the target at `place` for `item`, or null for a place with no fixed id (`none`). A gap's id is
 * its `gap:` one; on an edge with no members its slot is `strip:<edge>:<zone>`.
 */
export function placeTargetId(place: PlaceLike, item: string): string | null {
  switch (place.kind) {
    case "gap":
      return targetId(place);
    case "column":
    case "rail":
      return targetId(place);
    case "side":
      return targetId({ kind: "side", side: place.side });
    case "float":
    case "home":
      return targetId({ kind: place.kind, item });
    default:
      return null;
  }
}
