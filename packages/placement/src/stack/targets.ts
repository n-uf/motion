/**
 * The drop targets for dragging an item into a stack, in the shape @n-uf/motion/drag takes. `stackTargets(input,
 * dragged)` takes the stack without the dragged item and gives one target for every gap: before each item and after
 * the last (so an empty stack has one).
 *
 * - `id` `gap:<k>`, priority 2, `place` `{ kind: "gap", at: k }`.
 * - `hit`: the gap's zone along the axis, the stack split at its items' middles (an item in the menu has no place of
 *   its own: the gaps next to it split the stretch where the stack's drawn items end), across the stack's current size.
 * - `fit`: the full `fitStack` of the stack with the dragged item inserted at k, and `input` the stack that was
 *   solved. The preview is `slot`, the dragged item's rect in `fit`: exactly the rect it gets after the drop, because
 *   the drop is that same solve. `marker` is the line where its leading edge lands: a rect with no thickness across
 *   the stack's cross size (the app draws it with one).
 *
 * The dragged item counts as just used: it is newer than every item in the stack, so the others give way before it.
 * A group lands in the form that fits; a panel that would set a wider column makes room by that solve too.
 */
import { rect, type Rect } from "../geometry";
import type { Target } from "../targets/target";
import { fitStack } from "./layout";
import { withItem, type StackFit, type StackInput, type StackItem } from "./model";

export type StackPlace = { readonly kind: "gap"; readonly at: number };

export interface StackTarget extends Target {
  readonly priority: 2;
  /** The item dragged. */
  readonly item: string;
  readonly place: StackPlace;
  /** The line where the dragged item's leading edge lands. */
  readonly marker: Rect;
  /** The stack with the dragged item inserted: what a drop here makes. */
  readonly input: StackInput;
  /** Its fit: the preview and the drop are both its rect for the dragged item. */
  readonly fit: StackFit;
}

/** The gap boundaries along the axis: `b[0]` is the start, `b[k]` the middle of item k - 1, `b[n + 1]` the length. */
function bounds(input: StackInput, fit: StackFit): number[] {
  const column = input.axis === "column";
  const start = (r: Rect): number => (column ? r.y : r.x);
  const size = (r: Rect): number => (column ? r.height : r.width);
  const b = [0];
  // Where the drawn items have ended so far: an item in the menu sits there.
  let end = 0;
  for (const p of fit.items) {
    if (p.kind === "menu") {
      b.push(end);
      continue;
    }
    b.push(start(p.rect) + size(p.rect) / 2);
    end = start(p.rect) + size(p.rect);
  }
  b.push(fit.length);
  // Monotone, whatever the sizes did (a stack that overflows).
  for (let i = 1; i < b.length; i++) b[i] = Math.min(Math.max(b[i]!, b[i - 1]!), fit.length);
  return b;
}

export function stackTargets(input: StackInput, dragged: StackItem): StackTarget[] {
  const base = fitStack(input);
  const b = bounds(input, base);
  const column = input.axis === "column";
  const newest = input.items.reduce((m, it) => Math.max(m, it.used), dragged.used) + 1;
  const item: StackItem = { ...dragged, used: newest };
  const out: StackTarget[] = [];
  for (let k = 0; k <= input.items.length; k++) {
    const solved = withItem(input, item, k);
    const fit = fitStack(solved);
    const slot = fit.items[k]!.rect;
    const from = b[k]!;
    const to = b[k + 1]!;
    out.push({
      id: `gap:${k}`,
      priority: 2,
      item: dragged.id,
      place: { kind: "gap", at: k },
      hit: column ? rect(0, from, base.cross, to - from) : rect(from, 0, to - from, base.cross),
      slot,
      marker: column ? rect(slot.x, slot.y, slot.width, 0) : rect(slot.x, slot.y, 0, slot.height),
      input: solved,
      fit,
    });
  }
  return out;
}
