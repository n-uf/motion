/**
 * The dock's verbs over an edge's dividers: `dividers`, `resizeBetween`, `resetBetween` and `resetLengths`. Each is the
 * `@n-uf/placement/stack` verb of the same name run on the edge's stack, with the result written back to the items'
 * `DockItem.length`. A divider trades length between the two neighboring open growing items of one edge (a panel, a
 * collapsed item between two open ones giving one divider across it); nothing else in the state moves.
 *
 * The layout is the one `solve` returned for this very `state` object; a verb given none, one that was made for another
 * state (another stage size, an item moved) or one that was stored and read back, solves the state itself. Pure: a state in, a state out (the same object when nothing changed).
 */
import { rect, type Rect } from "@n-uf/placement";
import { dividers as stackDividers, resetBetween as stackReset, resizeBetween as stackResize, type StackFit, type StackInput } from "@n-uf/placement/stack";
import { axisOf } from "./helpers";
import type { DockItem, DockLayout, DockState } from "./model";
import { solve, stateOf } from "./solve";
import { inputOf } from "./solve/edge";

/** One divider of an edge, in stage px: between the open growing items `before` and `after` (ids). */
export interface DockDivider {
  /** The edge it lies in. */
  readonly edge: string;
  readonly before: string;
  readonly after: string;
  /**
   * The strip the divider sits on, stage px: it starts where the last item drawn before `after` ends (the far edge of
   * the last collapsed item between the two, or of `before`) and is as thick as the gap to `after` (0 with no gap).
   * A host draws its grab zone around it.
   */
  readonly rect: Rect;
  /** How far it may move each way along the edge, px (`min` ≤ 0 ≤ `max`): where either end reaches its least. */
  readonly range: { readonly min: number; readonly max: number };
}

/**
 * `layout` when `solve` made it from this very `state` object, else the state solved: a layout made for another state
 * (the stage was another size, an item moved), or one stored and read back, is never used.
 */
const laid = (state: DockState, layout: DockLayout | undefined): DockLayout =>
  layout && stateOf(layout) === state && Object.values(layout.edges).every((e) => inputOf(e.stack) !== undefined) ? layout : solve(state);

/** One divider per pair of neighboring open growing items in each edge, edge by edge. A collapsed item has none of its own. */
export function dividers(state: DockState, layout?: DockLayout): DockDivider[] {
  const lay = laid(state, layout);
  const out: DockDivider[] = [];
  for (const [edge, e] of Object.entries(lay.edges)) {
    const input = inputOf(e.stack);
    if (!input) continue;
    for (const d of stackDividers(input, e.stack)) out.push({ edge, before: d.before, after: d.after, rect: rect(e.rect.x + d.rect.x, e.rect.y + d.rect.y, d.rect.width, d.rect.height), range: d.range });
  }
  return out;
}

/** `state` with the lengths `run` wrote on the edge both items are in; the same object when it wrote none. */
function over(state: DockState, layout: DockLayout | undefined, before: string, after: string, run: (input: StackInput, fit: StackFit) => StackInput): DockState {
  const lay = laid(state, layout);
  const edge = lay.items[before]?.edge;
  const e = edge !== undefined && lay.items[after]?.edge === edge ? lay.edges[edge] : undefined;
  const input = e && inputOf(e.stack);
  if (!e || !input) return state;
  const next = run(input, e.stack);
  if (next === input) return state;
  const was = new Map(input.items.map((it) => [it.id, it.length]));
  const items: Record<string, DockItem> = { ...state.items };
  for (const it of next.items) if (it.length !== was.get(it.id) && items[it.id]) items[it.id] = { ...items[it.id]!, length: it.length };
  return { ...state, items };
}

/**
 * Move the divider between the open growing items `before` and `after` of one edge by `delta` px along it: `before` gets
 * longer by `delta` and `after` shorter (a negative `delta` the other way), the edge's total unchanged and nothing else
 * moving. Neither goes under its least (`DockDivider.range`). The same state when nothing changes (not neighbors, an
 * unknown or floating item, a `delta` that isn't a number, or one clamped to 0). The first move writes the length every
 * open growing item of the edge is drawn at, so nothing else shifts.
 */
export function resizeBetween(state: DockState, before: string, after: string, delta: number, options: { readonly layout?: DockLayout } = {}): DockState {
  return over(state, options.layout, before, after, (input, fit) => stackResize(input, before, after, delta, { previous: fit }));
}

/**
 * Give the two items of a divider back the split they would be drawn at if both asked for their natural, their combined
 * length kept and nothing else moving: the double-click action. The same state when they are at that split already.
 */
export function resetBetween(state: DockState, before: string, after: string, options: { readonly layout?: DockLayout } = {}): DockState {
  return over(state, options.layout, before, after, (input, fit) => stackReset(input, before, after, { previous: fit }));
}

/**
 * `state` with every asked length of edge `edgeId`'s axis deleted, back to the split an edge with none has. An item's
 * length for the other axis stays. The same state when no item of the edge had one, or the edge is unknown.
 */
export function resetLengths(state: DockState, edgeId: string): DockState {
  const edge = state.edges.find((e) => e.id === edgeId);
  if (!edge) return state;
  const axis = axisOf(edge.side);
  let items: Record<string, DockItem> | undefined;
  for (const id of edge.items) {
    const it = state.items[id];
    if (it?.length?.[axis] === undefined) continue;
    const { [axis]: _dropped, ...rest } = it.length;
    const { length: _length, ...bare } = it;
    items ??= { ...state.items };
    items[id] = Object.keys(rest).length > 0 ? { ...bare, length: rest } : bare;
  }
  return items ? { ...state, items } : state;
}
