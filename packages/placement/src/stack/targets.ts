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
 * item with no forms has no targets, nor has a `fixed` one (it is never dragged). A fixed item in the stack has no slot
 * inside it: the gaps before and after it stay, but the hit of a gap ends where the fixed item starts and the next one
 * begins where it ends, so no hit overlaps it. Nor has one the stack doesn't accept (`input.accepts`); `options.allows` leaves out
 * single gaps.
 */
import { rect, type Rect } from "../geometry";
import type { Target } from "../target";
import { fitStack } from "./layout";
import { formMain, withItem, type FitOptions, type PlacedStackItem, type StackFit, type StackInput, type StackItem } from "./model";

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
  /**
   * Whether a gap takes the dragged item (default: every gap does). Called with the dragged item and the gap's `at`
   * (`place.at`: the gap before the k-th item of the input with the dragged one lifted out). A gap it refuses has no
   * target; the others keep their ids, places and hits. The stack's own `accepts` is asked first, for the whole stack.
   */
  readonly allows?: (dragged: StackItem, at: number) => boolean;
  /**
   * Offer a gap only where the dragged item fits beside the others (default false: every gap is offered, the dragged item
   * landing in the » menu or the stack overflowing if need be). With it a gap has no target when its fit puts the dragged
   * item into the menu, has an `overflow` note, has a `too-wide` note that the stack without the dragged item didn't have,
   * or squeezes a `fixed` item: it is in another form, shorter along the stack than its form's `main.min`, or narrower
   * across than before the drop. A fixed item may shrink down to its `main.min` to make room, so the room for the others
   * is the length less the fixed items' minimum sizes. The gaps left keep their ids, hits and fits. With no room anywhere
   * the result is `[]`.
   */
  readonly onlyFits?: boolean;
}

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

/**
 * Where each gap's zone runs along the axis: gap k from `from[k]` to `to[k]`. The stack is split at its items' middles,
 * so gap k reaches from the middle of item k - 1 to the middle of item k; `from[0]` is `reach` before the start, `to[n]`
 * `reach` past the length. A fixed item has no middle to split at: the gap before it ends where it starts and the gap
 * after it begins where it ends, so its own area is in no gap's zone.
 */
function bounds(input: StackInput, fit: StackFit, reach: number): { from: number[]; to: number[] } {
  const column = input.axis === "column";
  const start = (r: Rect): number => (column ? r.y : r.x);
  const size = (r: Rect): number => (column ? r.height : r.width);
  const placed = new Map(fit.items.map((p) => [p.id, p]));
  // from[0], to[0], from[1], to[1], …, from[n], to[n], in the order along the stack.
  const c = [0];
  // Where the drawn items have ended so far: an item in the menu (or with no forms) sits there.
  let end = 0;
  let cap = fit.length;
  for (const it of input.items) {
    const p = placed.get(it.id);
    if (!p || p.kind === "menu") {
      c.push(end, end);
      continue;
    }
    const s = start(p.rect);
    const mid = s + size(p.rect) / 2;
    c.push(it.fixed ? s : mid, it.fixed ? s + size(p.rect) : mid);
    end = s + size(p.rect);
    // A fixed item that runs past the stack (an overflowing one) keeps its own area out of the zones.
    if (it.fixed) cap = Math.max(cap, end);
  }
  c.push(fit.length);
  // Monotone, whatever the sizes did (a stack that overflows).
  for (let i = 1; i < c.length; i++) c[i] = Math.min(Math.max(c[i]!, c[i - 1]!), cap);
  // The first and last gaps reach past the stack's ends (the last never starts before a fixed item ends).
  c[0] = 0 - reach;
  c[c.length - 1] = Math.max(fit.length + reach, c[c.length - 2]!);
  const from: number[] = [];
  const to: number[] = [];
  for (let k = 0; k <= input.items.length; k++) {
    from.push(c[2 * k]!);
    to.push(c[2 * k + 1]!);
  }
  return { from, to };
}

/**
 * Whether a drop's fit leaves room for the dragged item: it isn't in the » menu, the stack doesn't `overflow`, no item
 * is `too-wide` that wasn't before (the dragged one, or one the drop made too wide), and no fixed item is squeezed: it
 * keeps its form, is drawn at least as long along the stack as its form's `main.min` and at least as wide across as before
 * the drop. A fixed item may shrink down to its `main.min` to make room (a title that grows gives back what it took).
 */
function fitsBeside(
  base: StackFit,
  fit: StackFit,
  dragged: PlacedStackItem,
  fixed: ReadonlyMap<string, StackItem>,
  axis: StackInput["axis"],
  tooWideBefore: ReadonlySet<string>,
): boolean {
  if (dragged.kind === "menu") return false;
  for (const n of fit.notes) {
    if (n.code === "overflow") return false;
    if (n.code === "too-wide" && !tooWideBefore.has(n.id)) return false;
  }
  const main = (r: Rect): number => (axis === "column" ? r.height : r.width);
  const across = (r: Rect): number => (axis === "column" ? r.width : r.height);
  const was = new Map(base.items.map((p) => [p.id, p]));
  for (const p of fit.items) {
    const item = fixed.get(p.id);
    const q = was.get(p.id);
    if (!item || !q || p.kind === "menu" || q.kind === "menu") continue;
    if (p.form !== q.form) return false;
    // Its least length: `main.min`, or a wrap form's rows at the stack's cross size.
    if (main(p.rect) < formMain(item.forms[p.form]!, "min", fit.cross) - 1e-6) return false;
    if (across(p.rect) < across(q.rect) - 1e-6) return false;
  }
  return true;
}

export function stackTargets(input: StackInput, dragged: StackItem, options: StackTargetOptions = {}): StackTarget[] {
  if (dragged.forms.length === 0) return [];
  if (dragged.fixed) return [];
  if (input.accepts && !input.accepts(dragged)) return [];
  const rest: StackInput = { ...input, items: input.items.filter((it) => it.id !== dragged.id) };
  const fitOptions: FitOptions = options.previous ? { previous: options.previous } : {};
  const base = fitStack(rest, fitOptions);
  const reach = Math.max(0, Number.isFinite(options.endReach) ? options.endReach! : 0);
  const b = bounds(rest, base, reach);
  const column = rest.axis === "column";
  const fixedItems = new Map(rest.items.filter((it) => it.fixed).map((it) => [it.id, it]));
  const tooWideBefore = new Set(base.notes.flatMap((n) => (n.code === "too-wide" ? [n.id] : [])));
  const newest = rest.items.reduce((m, it) => Math.max(m, it.used), dragged.used) + 1;
  const item: StackItem = { ...dragged, used: newest };
  const out: StackTarget[] = [];
  for (let k = 0; k <= rest.items.length; k++) {
    if (options.allows && !options.allows(dragged, k)) continue;
    const solved = withItem(rest, item, k);
    const fit = fitStack(solved, fitOptions);
    const placed = fit.items.find((p) => p.id === dragged.id)!;
    const slot = placed.rect;
    if (options.onlyFits && !fitsBeside(base, fit, placed, fixedItems, rest.axis, tooWideBefore)) continue;
    const from = b.from[k]!;
    const to = b.to[k]!;
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
