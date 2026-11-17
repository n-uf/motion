import type { Rect, Size } from "../geometry";

/**
 * The minimum-size give-way: while a pane is laid out below its minimum, the newest pane (highest `age`) floats and
 * the rest are laid out again. Stops when every pane keeps its minimum or one pane is left. `layout` lays out the
 * kept panes; the result says which are kept (in their order) and which float (newest first).
 */
export function giveWay<K>(panes: readonly K[], layout: (kept: readonly K[]) => ReadonlyMap<K, Rect>, min: (pane: K) => Size, age: (pane: K) => number): { kept: K[]; floats: K[] } {
  let kept = [...panes];
  const floats: K[] = [];
  for (;;) {
    const res = layout(kept);
    const broken = [...res].some(([k, r]) => r.width < min(k).width - 0.5 || r.height < min(k).height - 0.5);
    if (!broken || kept.length <= 1) return { kept, floats };
    const newest = kept.reduce((a, b) => (age(b) > age(a) ? b : a));
    kept = kept.filter((k) => k !== newest);
    floats.push(newest);
  }
}
