/**
 * `stackGaps(input, item)`: one edge's drop places for `item`, fit only. Every gap of the stack without the item (an
 * item of the input with its id is lifted out first, so a reorder within the stack works) is one entry, in order: before
 * each item and after the last, so an empty stack has one. A gap where the item fits beside the others gives the stack
 * after the drop (`input`) and its fit (`fit`), with the item's rect there (`slot`): the drop is that same solve. A gap
 * where it doesn't fit is a refusal with its reason.
 *
 * The item counts as just used: it is newer than every item in the stack, so the others give way before it. It fits a
 * gap when the drop's fit doesn't put it in the » menu, has no `overflow`, makes no item `too-wide` that wasn't before,
 * and squeezes no `fixed` item (it keeps its form, is drawn at least its form's `main.min` along the stack and at least
 * as wide across as before). A fixed item may shrink down to its `main.min` to make room; one with `stepping` may also
 * step to a later form, as a movable item may.
 *
 * Reasons: `no-forms` (the item has none), `fixed` (a fixed item is never dropped), `not-accepted` (`input.accepts`
 * refuses it), `not-allowed` (`options.allows` refuses the gap), `to-menu`, `overflow`, `too-wide` and `squeezes-fixed`.
 * The first three refuse every gap. Pure: no hit zones, no time; where the pointer is is the host's.
 *
 * See docs/placement.md, Entry: stack.
 */
import type { Rect } from "../geometry";
import { fitStack } from "./layout";
import { formMain, itemSteps, withItem, type FitOptions, type PlacedStackItem, type StackFit, type StackInput, type StackItem } from "./model";

/** Why a gap doesn't take the item. */
export type StackGapRefusal = "no-forms" | "fixed" | "not-accepted" | "not-allowed" | "to-menu" | "overflow" | "too-wide" | "squeezes-fixed";

/** One gap: before the `at`-th item of the stack without the dragged one (`at` = their count: after the last). */
export type StackGap =
  | {
      readonly at: number;
      readonly fits: true;
      /** The stack with the item inserted at `at`: what the drop makes. */
      readonly input: StackInput;
      /** Its fit: the layout after the drop. */
      readonly fit: StackFit;
      /** The item's rect in `fit` (stack-local px). */
      readonly slot: Rect;
    }
  | { readonly at: number; readonly fits: false; readonly reason: StackGapRefusal };

export interface StackGapOptions {
  /** The stack's fit before the drag, as `fitStack`'s `previous`: each gap's fit keeps the others' forms while they still fit. */
  readonly previous?: StackFit;
  /** Whether a gap takes the item (default: every gap does), asked with the item and the gap's `at`. */
  readonly allows?: (item: StackItem, at: number) => boolean;
}

/** Why a drop's fit leaves no room for the item, or null when it fits beside the others. */
function refusalOf(base: StackFit, fit: StackFit, dragged: PlacedStackItem, fixed: ReadonlyMap<string, StackItem>, axis: StackInput["axis"], tooWideBefore: ReadonlySet<string>): StackGapRefusal | null {
  const inMenu = new Set(fit.menu?.items ?? []);
  const wasInMenu = new Set(base.menu?.items ?? []);
  if (inMenu.has(dragged.id)) return "to-menu";
  for (const n of fit.notes) {
    if (n.code === "overflow") return "overflow";
    if (n.code === "too-wide" && !tooWideBefore.has(n.id)) return "too-wide";
  }
  const main = (r: Rect): number => (axis === "column" ? r.height : r.width);
  const across = (r: Rect): number => (axis === "column" ? r.width : r.height);
  const was = new Map(base.items.map((p) => [p.id, p]));
  for (const p of fit.items) {
    const item = fixed.get(p.id);
    const q = was.get(p.id);
    if (!item || !q || inMenu.has(p.id) || wasInMenu.has(q.id)) continue;
    // A fixed item that takes steps (`stepping`) may step for a drop, as a movable item may; in the form it takes it is
    // still never squeezed.
    if (p.form !== q.form && !itemSteps(item)) return "squeezes-fixed";
    if (main(p.rect) < formMain(item.forms[p.form]!, "min", fit.cross) - 1e-6) return "squeezes-fixed";
    if (p.form === q.form && across(p.rect) < across(q.rect) - 1e-6) return "squeezes-fixed";
  }
  return null;
}

export function stackGaps(input: StackInput, item: StackItem, options: StackGapOptions = {}): StackGap[] {
  const rest: StackInput = { ...input, items: input.items.filter((it) => it.id !== item.id) };
  const ats = Array.from({ length: rest.items.length + 1 }, (_, k) => k);
  const whole: StackGapRefusal | null = item.forms.length === 0 ? "no-forms" : item.fixed ? "fixed" : input.accepts && !input.accepts(item) ? "not-accepted" : null;
  if (whole) return ats.map((at) => ({ at, fits: false, reason: whole }));
  const fitOptions: FitOptions = options.previous ? { previous: options.previous } : {};
  const base = fitStack(rest, fitOptions);
  const fixed = new Map(rest.items.filter((it) => it.fixed).map((it) => [it.id, it]));
  const tooWideBefore = new Set(base.notes.flatMap((n) => (n.code === "too-wide" ? [n.id] : [])));
  const newest = rest.items.reduce((m, it) => Math.max(m, it.used), item.used) + 1;
  const held: StackItem = { ...item, used: newest };
  return ats.map((at): StackGap => {
    if (options.allows && !options.allows(item, at)) return { at, fits: false, reason: "not-allowed" };
    const solved = withItem(rest, held, at);
    const fit = fitStack(solved, fitOptions);
    const placed = fit.items.find((p) => p.id === item.id)!;
    const reason = refusalOf(base, fit, placed, fixed, rest.axis, tooWideBefore);
    return reason ? { at, fits: false, reason } : { at, fits: true, input: solved, fit, slot: placed.rect };
  });
}
