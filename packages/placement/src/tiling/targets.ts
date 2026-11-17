/**
 * Drop targets for tiling, in the root `Target` shape (what `@n-uf/motion/drag` takes). Both kinds come from one
 * helper: a pane target (`pane:<id>`, its hit the pane, the place in it its drop region) for the split tree, and an
 * insertion target (`at:<index>`, its hit and slot the dragged pane's rect with it inserted there) for an order layout.
 */
import type { Rect } from "../geometry";
import type { Target } from "../target";
import type { OrderLayout, TileOptions } from "./order";

/** A split tree's target: drop on pane `pane` (the region under the pointer says how). */
export interface PaneTarget<K> extends Target {
  readonly pane: K;
}

/** An order layout's target: insert the dragged pane at `index`; `layout` is every pane's rect with it there. */
export interface OrderTarget<K> extends Target {
  readonly index: number;
  readonly layout: ReadonlyMap<K, Rect>;
}

/** The one shape both kinds share: a slot-sized drop with no precedence over any other. */
const tilingTarget = (id: string, hit: Rect, slot?: Rect): Target => ({ id, priority: 2, hit, ...(slot ? { slot } : {}) });

/** One target per pane of `layout` (`except` left out: the dragged pane, when it is still laid out). */
export function paneTargets<K>(layout: ReadonlyMap<K, Rect>, except?: K): PaneTarget<K>[] {
  return [...layout].filter(([k]) => k !== except).map(([pane, r]) => ({ ...tilingTarget(`pane:${String(pane)}`, r), pane }));
}

/**
 * One target per index `dragged` could be inserted at among `panes` (which don't hold it), laid out by `arrange` in
 * `area`. Each target's hit and slot is `dragged`'s rect with it there, so the targets cover the area as the layout
 * does.
 */
export function orderTargets<K>(arrange: OrderLayout, panes: readonly K[], dragged: K, area: Rect, options?: TileOptions): OrderTarget<K>[] {
  return Array.from({ length: panes.length + 1 }, (_, index) => {
    const layout = arrange([...panes.slice(0, index), dragged, ...panes.slice(index)], area, options);
    const slot = layout.get(dragged)!;
    return { ...tilingTarget(`at:${index}`, slot, slot), index, layout };
  });
}
