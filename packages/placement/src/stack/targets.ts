/**
 * The drop targets for dragging an item into a stack, in the shape @n-uf/motion/drag takes. `stackTargets(input,
 * dragged)` gives one target for every gap of the stack without the dragged item (an item of the input with its id
 * is lifted out first, so a reorder within a stack works): before each item and after the last, so an empty stack has
 * one. An item with no forms has no place of its own, but its gaps count.
 *
 * - `id` `gap:<k>`, priority 2, `place` `{ kind: "gap", at: k }` (k counts the input's items, the dragged one lifted
 *   out, including any with no forms; it is not an index into `fit.items`, which leaves those out: look the dragged
 *   item up there by its id, as `slot` already does).
 * - `hit`: the gap's zone along the axis, the stack split at its items' middles, so it covers the gap and the padding
 *   between its neighbours; the first and the last reach `options.endReach` px past the stack's ends (an item in the menu has no place of
 *   its own: the gaps next to it split the stretch where the stack's drawn items end; with every item in the menu only
 *   the last gap, "at the end", has any length, and the others are a point at the start). Across, it is the larger of
 *   the stack's current size and the size the drop gives it, so the pointer over the preview is over the target.
 * - `fit`: the full `fitStack` of the stack with the dragged item inserted at k, and `input` the stack that was
 *   solved. The preview is `slot`, the dragged item's rect in `fit`: exactly the rect it gets after the drop, because
 *   the drop is that same solve. `marker` is the line where its leading edge lands: a rect with no thickness across
 *   the stack's cross size (the app draws it with one).
 *
 * The dragged item counts as just used: it is newer than every item in the stack, so the others give way before it.
 * A group lands in the form that fits; a panel that would set a wider column makes room by that solve too. A dragged
 * item with no forms has no targets.
 */
import { rect, type Rect } from "../geometry";
import type { Target } from "../targets/target";
import { fitStack } from "./layout";
import { withItem, type FitOptions, type StackFit, type StackInput, type StackItem } from "./model";

export interface StackTargetOptions {
  /**
   * How far the first gap's hit reaches before the stack's start and the last gap's past its end, px (default 0), so a
   * pointer just outside the bar still drops at an end. The marker and the preview don't move.
   */
  readonly endReach?: number;
  /**
   * The stack's fit before the drag, as `fitStack`'s `previous`: the preview of every gap keeps the other items' forms while
   * they still fit, so it is the fit the drop makes when the app solves with the same `previous`.
   */
  readonly previous?: StackFit;
}

export type StackPlace ={ readonly kind: "gap"; readonly at: number };

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

/**
 * The gap boundaries along the axis: `b[0]` is `reach` before the start, `b[k]` the middle of item k - 1, `b[n + 1]`
 * `reach` past the length.
 */
function bounds(input: StackInput, fit: StackFit, reach: number): number[] {
  const column = input.axis === "column";
  const start = (r: Rect): number => (column ? r.y : r.x);
  const size = (r: Rect): number => (column ? r.height : r.width);
  const placed = new Map(fit.items.map((p) => [p.id, p]));
  const b = [0];
  // Where the drawn items have ended so far: an item in the menu (or with no forms) sits there.
  let end = 0;
  for (const it of input.items) {
    const p = placed.get(it.id);
    if (!p || p.kind === "menu") {
      b.push(end);
      continue;
    }
    b.push(start(p.rect) + size(p.rect) / 2);
    end = start(p.rect) + size(p.rect);
  }
  b.push(fit.length);
  // Monotone, whatever the sizes did (a stack that overflows).
  for (let i = 1; i < b.length; i++) b[i] = Math.min(Math.max(b[i]!, b[i - 1]!), fit.length);
  // The first and last gaps reach past the stack's ends.
  b[0] = 0 - reach;
  b[b.length - 1] = fit.length + reach;
  return b;
}

export function stackTargets(input: StackInput, dragged: StackItem, options: StackTargetOptions = {}): StackTarget[] {
  if (dragged.forms.length === 0) return [];
  const rest: StackInput = { ...input, items: input.items.filter((it) => it.id !== dragged.id) };
  const fitOptions: FitOptions = options.previous ? { previous: options.previous } : {};
  const base = fitStack(rest, fitOptions);
  const reach = Math.max(0, Number.isFinite(options.endReach) ? options.endReach! : 0);
  const b = bounds(rest, base, reach);
  const column = rest.axis === "column";
  const newest = rest.items.reduce((m, it) => Math.max(m, it.used), dragged.used) + 1;
  const item: StackItem = { ...dragged, used: newest };
  const out: StackTarget[] = [];
  for (let k = 0; k <= rest.items.length; k++) {
    const solved = withItem(rest, item, k);
    const fit = fitStack(solved, fitOptions);
    const slot = fit.items.find((p) => p.id === dragged.id)!.rect;
    const from = b[k]!;
    const to = b[k + 1]!;
    const across = Math.max(base.cross, fit.cross);
    out.push({
      id: `gap:${k}`,
      priority: 2,
      item: dragged.id,
      place: { kind: "gap", at: k },
      hit: column ? rect(0, from, across, to - from) : rect(from, 0, to - from, across),
      slot,
      // The line spans the stack's cross size (the drop's fit: the bar's height, the column's width).
      marker: column ? rect(0, slot.y, fit.cross, 0) : rect(slot.x, 0, 0, fit.cross),
      input: solved,
      fit,
    });
  }
  return out;
}
