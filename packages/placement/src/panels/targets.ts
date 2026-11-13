/**
 * The drop targets for dragging a panel, in the shape @n-uf/motion/drag takes (`{ id, priority, hit, slot?, free? }`),
 * worked out from the state with the panel lifted out:
 *
 * - `column:<side>:<i>` (priority 2): a band across the line between two columns (or a side's edge): a new column
 *   there, as wide as the panel's own width.
 * - `into:<side>:<i>` (2): a column's area: the panel stacks at its bottom.
 * - `rail:<side>` (1): the side's rail, or its outer edge: the panel docks folded.
 * - `float` (3, free): anywhere; it floats where it is let go, kept in the view as the float option says.
 * - `band:<edge>:<i>` (2), for each edge with a band (`options.bands`): the slots between a band's panels and at both
 *   ends (the band's area split at its panels' middles). `band:<edge>` (2): an empty enabled edge, a strip `2 × bar`
 *   tall along it inside the pages' area.
 *
 * A place the panel may not take (its def's `sides` and `floats`, and `allows`) is no target, and neither is its own
 * place (a drop there changes nothing). Targets carry a structured `place`, never words: the consumer names them.
 */
import { rect, type Point, type Rect, type Size } from "../geometry";
import type { Target } from "../targets/target";
import { layoutPanels, type PanelsLayout } from "./layout";
import { DEFAULT_PANELS_OPTIONS, EDGES, SIDES, defOf, dock, dockBand, float, floatSize, liftPanel, ownWidth, samePlaces, toPage, whereIs, type Edge, type PanelDef, type PanelsOptions, type PanelsState, type Side } from "./model";

/** Where a drop puts a panel. `index` is a column (or band panel) index in the state with the panel lifted out. */
export type PanelPlace =
  | { readonly kind: "column"; readonly side: Side; readonly index: number }
  | { readonly kind: "into"; readonly side: Side; readonly index: number }
  | { readonly kind: "rail"; readonly side: Side }
  | { readonly kind: "band"; readonly edge: Edge; readonly index: number }
  | { readonly kind: "float" };

export interface PanelTarget extends Target {
  /** The panel dragged. */
  readonly panel: string;
  readonly place: PanelPlace;
  /** Its rank in reading order (left to right across the stage, floating last). */
  readonly order: number;
  /** The state a drop here makes, with the pointer at `p` holding the panel at `grab` from its top-left corner. */
  readonly make: (p: Point, grab: Point) => PanelsState;
}

export interface PanelTargetInput {
  readonly defs: readonly PanelDef[];
  /** The state as it is, the panel still in its place. */
  readonly state: PanelsState;
  readonly id: string;
  readonly stage: Size;
  readonly options?: Partial<PanelsOptions>;
  /** Places the panel may go beyond its def's rules (default: all of them). */
  readonly allows?: (id: string, place: PanelPlace) => boolean;
}

/** How far a column band reaches on each side of its line, px; how wide a side's edge takes a rail drop when it has no rail. */
export const COLUMN_REACH = 22;
export const RAIL_EDGE = 10;

/**
 * A place's rank in reading order: the left side outer to inner, the right side inner to outer, then the top band and
 * the bottom band left to right, floating last.
 */
export function placeRank(place: PanelPlace): number {
  switch (place.kind) {
    case "float":
      return 3000;
    case "band":
      return (place.edge === "top" ? 2000 : 2500) + Math.min(place.index, 499);
    case "rail":
      return place.side === "left" ? 0 : 1999;
    case "column":
      return place.side === "left" ? 1 + 2 * place.index : 1998 - 2 * place.index;
    case "into":
      return place.side === "left" ? 2 + 2 * place.index : 1997 - 2 * place.index;
  }
}

/** Where a panel is now, as a place (a float, a column of its own, or stacked in one); null when placed nowhere. */
export function homePlace(state: PanelsState, id: string): PanelPlace | null {
  const w = whereIs(state, id);
  if (w.kind === "float") return { kind: "float" };
  if (w.kind === "none") return null;
  if (w.kind === "band") return { kind: "band", edge: w.edge, index: w.index };
  return state.sides[w.side][w.index]!.panels.length === 1 ? { kind: "column", side: w.side, index: w.index } : { kind: "into", side: w.side, index: w.index };
}

const cut = (x0: number, x1: number, lo: number, hi: number): [number, number] => [Math.max(x0, lo), Math.min(x1, hi)];

/** The targets for dragging `input.id`, in reading order. */
export function panelTargets(input: PanelTargetInput): PanelTarget[] {
  const { defs, state, id, stage } = input;
  const opt: PanelsOptions = { ...DEFAULT_PANELS_OPTIONS, ...input.options };
  const def = defOf(defs, id);
  const s0 = liftPanel(state, id);
  const l0 = layoutPanels(defs, s0, stage, opt);
  const width = ownWidth(defs, state, id);
  const W = stage.width;
  const H = stage.height;
  const R = COLUMN_REACH;
  const out: PanelTarget[] = [];
  const idOf = (place: PanelPlace): string => {
    switch (place.kind) {
      case "float":
        return "float";
      case "rail":
        return `rail:${place.side}`;
      case "band":
        return s0.bands?.[place.edge] ? `band:${place.edge}:${place.index}` : `band:${place.edge}`;
      default:
        return `${place.kind}:${place.side}:${place.index}`;
    }
  };
  const add = (place: PanelPlace, priority: 1 | 2 | 3, hit: Rect, make: PanelTarget["make"], free = false): void => {
    if (hit.width <= 0 || hit.height <= 0) return;
    if (input.allows && !input.allows(id, place)) return;
    // Its own place: a drop there changes nothing, so it is no target (the drag's home covers it).
    // Widths compare as laid out: a stored width past the column's limits is the same place as the limit.
    if (place.kind !== "float" && samePlaces(make({ x: 0, y: 0 }, { x: 0, y: 0 }), state, defs)) return;
    out.push({ id: idOf(place), priority, hit, panel: id, place, order: placeRank(place), make, ...(free ? { free: true } : {}) });
  };

  // The columns' height: what the full-span bands leave (the whole stage without them).
  const fullTop = l0.bands.top?.span === "full" ? l0.bands.top.rect : null;
  const fullBot = l0.bands.bottom?.span === "full" ? l0.bands.bottom.rect : null;
  const top = fullTop ? fullTop.y + fullTop.height : 0;
  const CH = Math.max(0, (fullBot ? fullBot.y : H) - top);

  for (const side of SIDES) {
    if (def?.sides && !def.sides.includes(side)) continue;
    const left = side === "left";
    const rail = l0.rails[side];
    const edge = rail ? rail.rect.width : RAIL_EDGE;
    // The rail (or the bare edge): dock folded, as the outermost column.
    const railHit = rail ? rail.rect : left ? rect(0, top, RAIL_EDGE, CH) : rect(W - RAIL_EDGE, top, RAIL_EDGE, CH);
    add({ kind: "rail", side }, 1, railHit, () => {
      const s = dock(state, id, side, 0, { width });
      return { ...s, folded: [...s.folded.filter((x) => x !== id), id] };
    });
    // The lines between the open columns, outer to inner, and each column's area.
    const open = l0.columns.filter((c) => c.side === side && c.folded === null);
    const lo = left ? edge : 0;
    const hi = left ? W : W - edge;
    const band = (x: number, outer: boolean, i: number): void => {
      // The outermost line reaches inward only: outward is the rail's.
      const [a, b] = outer ? (left ? cut(x, x + 2 * R, lo, hi) : cut(x - 2 * R, x, lo, hi)) : cut(x - R, x + R, lo, hi);
      add({ kind: "column", side, index: i }, 2, rect(a, top, b - a, CH), () => dock(state, id, side, i, { width }));
    };
    if (open.length === 0) band(left ? l0.pages.x : l0.pages.x + l0.pages.width, true, s0.sides[side].length);
    open.forEach((c, k) => {
      band(left ? c.rect.x : c.rect.x + c.rect.width, k === 0, c.index);
      add({ kind: "into", side, index: c.index }, 2, c.rect, () => dock(state, id, side, c.index, { into: true }));
    });
    const last = open.at(-1);
    if (last) band(left ? last.rect.x + last.rect.width : last.rect.x, false, last.index + 1);
  }

  // The bands: a slot between each two panels and at both ends, the band's area split at its panels' middles; an
  // empty enabled edge, a strip along it inside the pages.
  for (const e of EDGES) {
    if (!opt.bands[e] || (def?.sides && !def.sides.includes(e))) continue;
    const pb = l0.bands[e];
    const list = s0.bands?.[e]?.panels ?? [];
    const make = (i: number) => () => dockBand(state, id, e, i, defs);
    if (!pb) {
      const p = l0.pages;
      const h = Math.min(2 * opt.bar, p.height);
      add({ kind: "band", edge: e, index: list.length }, 2, rect(p.x, e === "top" ? p.y : p.y + p.height - h, p.width, h), make(list.length));
      continue;
    }
    const m = pb.panels.length;
    const share = pb.rect.width / m;
    for (let k = 0; k <= m; k++) {
      const i = k < m ? list.indexOf(pb.panels[k]!) : list.length;
      const a = pb.rect.x + Math.max(0, k - 0.5) * share;
      const b = pb.rect.x + Math.min(m, k + 0.5) * share;
      add({ kind: "band", edge: e, index: i }, 2, rect(a, pb.rect.y, b - a, pb.rect.height), make(i));
    }
  }

  if (def?.floats !== false) {
    const was = state.floats.find((f) => f.id === id);
    const size = was ? { width: was.rect.width, height: was.rect.height } : floatSize(def).natural;
    const pinned = !!was?.pinned;
    add(
      { kind: "float" },
      3,
      rect(0, 0, W, H),
      (p, grab) => {
        // Let go at p (view space); stored where it shows once the float option has had its say.
        const at = rect(p.x - grab.x, p.y - grab.y, size.width, size.height);
        const s = float(state, id, pinned ? at : toPage(at, opt.view), pinned);
        const laid = layoutPanels(defs, s, stage, opt).items.get(id)!.rect;
        // A folded float shows as a bar: it moves to where the bar shows and keeps its full size for unfolding.
        const shown = s.folded.includes(id) ? { ...laid, width: at.width, height: at.height } : laid;
        return float(state, id, pinned ? shown : toPage(shown, opt.view), pinned);
      },
      true,
    );
  }
  return out.sort((a, b) => a.order - b.order);
}

/** A target's drop, laid out: where the panel lands. */
export interface PanelDrop {
  readonly target: string;
  readonly place: PanelPlace;
  /** Same key, same place (a float's key carries where it lands). */
  readonly key: string;
  readonly state: PanelsState;
  readonly layout: PanelsLayout;
  /** Where the panel lands (its rail segment when it docks folded). */
  readonly slot: Rect;
  /** It lands in a rail. */
  readonly hidden: boolean;
  /** It floats where it is let go: no room is made for it. */
  readonly free: boolean;
}

/** The drop on `target` with the pointer at `p` holding the panel at `grab`, laid out. */
export function panelDrop(input: PanelTargetInput, target: PanelTarget, p: Point, grab: Point): PanelDrop {
  const opt: PanelsOptions = { ...DEFAULT_PANELS_OPTIONS, ...input.options };
  const state = target.make(p, grab);
  const layout = layoutPanels(input.defs, state, input.stage, opt);
  const placed = layout.items.get(input.id)!;
  const key = target.free ? `float:${Math.round(placed.rect.x)},${Math.round(placed.rect.y)}` : target.id;
  return { target: target.id, place: target.place, key, state, layout, slot: placed.rect, hidden: placed.hidden, free: !!target.free };
}

// --- keyboard stops ------------------------------------------------------------------------------------------------

export interface PanelStop {
  /** The target's id ("home" for the panel's own place). */
  readonly id: string;
  readonly place: PanelPlace;
  /** The state a move here makes (the current one for home). */
  readonly state: PanelsState;
  readonly home: boolean;
}

export interface PanelStopsOptions {
  /** The panel's own place (`homePlace`) and the state as it is: a stop of its own in its reading-order position. */
  readonly home?: { readonly place: PanelPlace; readonly state: PanelsState };
  /** Floating as a stop at the end (default: left out); `at` and `grab` as for a drop (default: the stage's middle, the corner). */
  readonly floats?: boolean | { readonly at: Point; readonly grab?: Point };
}

/** The panel's places in reading order, for the arrow keys and a "Move to" menu (`keyboardStops` calls this). */
export function panelStops(targets: readonly PanelTarget[], options: PanelStopsOptions = {}): PanelStop[] {
  const stops: (PanelStop & { order: number })[] = [];
  for (const t of targets) {
    if (t.place.kind === "float") {
      if (!options.floats) continue;
      const at = options.floats === true ? { x: t.hit.x + t.hit.width / 2, y: t.hit.y + t.hit.height / 2 } : options.floats.at;
      const grab = options.floats === true ? { x: 0, y: 0 } : (options.floats.grab ?? { x: 0, y: 0 });
      stops.push({ id: t.id, place: t.place, state: t.make(at, grab), home: false, order: t.order });
      continue;
    }
    stops.push({ id: t.id, place: t.place, state: t.make({ x: 0, y: 0 }, { x: 0, y: 0 }), home: false, order: t.order });
  }
  const h = options.home;
  // A float's home sits with the floats: last, after any float stop.
  if (h) stops.push({ id: "home", place: h.place, state: h.state, home: true, order: placeRank(h.place) + (h.place.kind === "float" ? 1 : 0.5) });
  return stops.sort((a, b) => a.order - b.order).map(({ order: _order, ...s }) => s);
}
