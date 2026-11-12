/**
 * Tiling slots: every place a lifted tile could land, each with the layout it makes. A split tree offers each leaf's
 * two halves (the new tile first or second); an order offers each index.
 */
import type { Rect } from "../geometry";
import { layoutTree, leafIds, splitLeaf, type Tree } from "../tiling";
import type { Target } from "./target";

export interface TilingSlot<K> extends Target {
  /** Where the tile lands, and every tile's rect once it has. */
  readonly slot: Rect;
  readonly layout: Map<K, Rect>;
}

export interface TreeSlot<K> extends TilingSlot<K> {
  readonly tree: Tree<K>;
}

export interface OrderSlot<K> extends TilingSlot<K> {
  readonly order: K[];
}

/** The slots for tile `id` in `tree` (laid out in `area`): beside each leaf, first ("<leaf>:a") or second ("<leaf>:b"). */
export function treeSlots<K>(tree: Tree<K> | null, id: K, area: Rect, gap: number): TreeSlot<K>[] {
  if (!tree) {
    const t: Tree<K> = { leaf: id };
    return [{ id: "root", priority: 2, hit: area, slot: area, layout: layoutTree(t, area, gap), tree: t }];
  }
  return leafIds(tree).flatMap((target) =>
    [true, false].map((first) => {
      const t = splitLeaf(tree, target, id, first);
      const layout = layoutTree(t, area, gap);
      const slot = layout.get(id)!;
      return { id: `${String(target)}:${first ? "a" : "b"}`, priority: 2 as const, hit: slot, slot, layout, tree: t };
    }),
  );
}

/** The slots for tile `id` in `order` (laid out by `layout`): at each index, "0" before all to "n" after all. */
export function orderSlots<K>(order: readonly K[], id: K, layout: (ids: readonly K[]) => Map<K, Rect>): OrderSlot<K>[] {
  return Array.from({ length: order.length + 1 }, (_, i) => {
    const ids = [...order.slice(0, i), id, ...order.slice(i)];
    const map = layout(ids);
    const slot = map.get(id)!;
    return { id: String(i), priority: 2 as const, hit: slot, slot, layout: map, order: ids };
  });
}
