/**
 * Stacked items that share a draggable divider: one makes its neighbor longer and the other shorter by the same
 * amount, and nothing else in the stack moves. A divider's state is the asked length of the items on both sides
 * (`StackItem.length`), which `fitStack` reads in place of a growing form's natural; these are the functions that read and
 * write it. Pure: a state in, a state out (the same object when nothing changed).
 *
 * A growing item is one drawn in a form that grows (`main.grows`, not in the » menu): the items that share spare length,
 * and so the items whose length is written. The two ends of a divider are neighboring growing items, neither `fixed` nor a
 * `wrap` form. A header, a rail icon, a group or a folded item between them isn't growing, so it has no divider of its own
 * and doesn't kill the divider across it; a growing item that is not an end (a fixed one, a `wrap` form that grows) ends
 * the chain: there is no divider across it.
 */
import { EPS, type Rect } from "../geometry";
import { fitStack, sizesOf } from "./layout";
import { formMain, type FitOptions, type StackAxis, type StackFit, type StackInput } from "./model";

/** One divider: between the open growing items `before` and `after` (ids), drawn at `rect`. */
export interface StackDivider {
  readonly before: string;
  readonly after: string;
  /**
   * The strip the divider sits on, stack-local: it starts where the last item drawn before `after` ends (the far edge of
   * the last collapsed item between the two, or of `before`), and is as thick as the gap to `after` (0 with no gap).
   * Across, it is `before`'s extent. A host draws its grab zone around it.
   */
  readonly rect: Rect;
  /**
   * How far the divider may move each way, px along the stack (`min` ≤ 0 ≤ `max`): the delta `resizeBetween` takes, a
   * negative one moving it toward `before`. Where either end reaches its least.
   */
  readonly range: { readonly min: number; readonly max: number };
}

interface Grower {
  readonly id: string;
  /** Whether it may be an end of a divider: not `fixed` and not a `wrap` form. */
  readonly end: boolean;
  /** The least it takes as the length was shared. */
  readonly least: number;
  /** What its form asks for by itself, the least at most. */
  readonly natural: number;
  /** How long it is drawn. */
  readonly drawn: number;
  /** Its place in `fit.items`. */
  readonly at: number;
}

const mainOf = (r: Rect, axis: StackAxis): number => (axis === "column" ? r.height : r.width);
const startOf = (r: Rect, axis: StackAxis): number => (axis === "column" ? r.y : r.x);

/** The items drawn in a form that grows, in the stack's order. */
function growers(input: StackInput, fit: StackFit): Grower[] {
  const byId = new Map(input.items.map((it) => [it.id, it]));
  const known = sizesOf(fit);
  const out: Grower[] = [];
  fit.items.forEach((p, at) => {
    const item = byId.get(p.id);
    const f = item?.forms[p.form];
    if (!item || !f || p.kind === "menu" || f.kind === "menu" || f.main.grows !== true) return;
    const least = known?.least.get(p.id) ?? formMain(f, "min", fit.cross);
    out.push({ id: p.id, end: item.fixed !== true && !f.wrap, least, natural: Math.max(least, formMain(f, "natural", fit.cross)), drawn: mainOf(p.rect, fit.axis), at });
  });
  return out;
}

/** The two items of a divider, when `before` and `after` are neighboring growing items, both ends, in that order. */
function pair(all: readonly Grower[], before: string, after: string): [Grower, Grower] | null {
  const i = all.findIndex((g) => g.id === before);
  const next = all[i + 1];
  return i >= 0 && next !== undefined && next.id === after && all[i]!.end && next.end ? [all[i]!, next] : null;
}

/**
 * `input` with the length of each item of the pair written so the stack is laid out as drawn (the pair given moved to
 * `to`) and nothing but the pair moves. A length is an ask, not a drawn size: with spare length a growing form is drawn
 * `scale` times its ask, so the ask written is the drawn size over `scale`; short of length the items are drawn part of
 * the way from their least to their ask (`tight`), so it is `least + (drawn - least) / tight`. An ask is a weight and the
 * least a floor on the drawn size, so with spare length an end drawn at its least asks for `least / scale`, under its
 * least, and is still drawn at its least. The pair's drawn sizes add up to what they did and every other item draws as it
 * did, so the scale is the same and no other item needs a length: a bystander keeps whatever it had, which is none when
 * nobody sized it, and travels to another stack as the item it is. Items already at their length stay the same objects.
 */
function written(input: StackInput, fit: StackFit, all: readonly Grower[], to: ReadonlyMap<string, number>): StackInput {
  const known = sizesOf(fit);
  const tight = known?.tight;
  const share = tight !== undefined && tight > EPS && tight < 1 ? tight : 1;
  const scale = known?.scale ?? 1;
  const byId = new Map(all.map((g) => [g.id, g]));
  const ask = (g: Grower, drawn: number): number => (scale > 1 + EPS ? drawn / scale : g.least + (drawn - g.least) / share);
  let changed = false;
  const items = input.items.map((it) => {
    const drawn = to.get(it.id);
    if (drawn === undefined) return it;
    // A length of 0 is no length (the item would read its natural), so an end whose least is 0 asks a hair over it.
    const length = Math.max(ask(byId.get(it.id)!, drawn), 2 * EPS);
    const was = it.length?.[input.axis];
    if (was !== undefined && Math.abs(was - length) <= EPS) return it;
    changed = true;
    return { ...it, length: { ...it.length, [input.axis]: length } };
  });
  return changed ? { ...input, items } : input;
}

/**
 * The two items of the divider between `before` and `after` redrawn: `to(b, a)` is the length `before` is to be drawn at
 * (`after` takes the rest of their combined length). The same object when they aren't neighbors or `before` stays.
 */
function trade(input: StackInput, before: string, after: string, options: FitOptions, to: (b: Grower, a: Grower) => number): StackInput {
  const fit = fitStack(input, options);
  const all = growers(input, fit);
  const ends = pair(all, before, after);
  if (!ends) return input;
  const [b, a] = ends;
  const first = to(b, a);
  if (Math.abs(first - b.drawn) <= EPS) return input;
  return written(
    input,
    fit,
    all,
    new Map([
      [b.id, first],
      [a.id, b.drawn + a.drawn - first],
    ]),
  );
}

/**
 * The dividers of a stack laid out as `fit`, one per pair of neighboring growing items that are both ends, in the stack's
 * order. A collapsed item has none of its own; where collapsed items sit between two open ones there is one divider
 * between the open ones, on the far edge of the last collapsed one. A growing item that isn't an end (a fixed one, a
 * `wrap` form) has none and ends the chain.
 */
export function dividers(input: StackInput, fit: StackFit): StackDivider[] {
  const all = growers(input, fit);
  const out: StackDivider[] = [];
  for (let k = 0; k + 1 < all.length; k++) {
    const b = all[k]!;
    const a = all[k + 1]!;
    if (!b.end || !a.end) continue;
    // The last item drawn before `after`: the divider sits on its far edge.
    let prev = a.at - 1;
    while (prev > b.at && fit.items[prev]!.kind === "menu") prev--;
    const last = fit.items[prev]!.rect;
    const from = startOf(last, fit.axis) + mainOf(last, fit.axis);
    const thick = Math.max(0, startOf(fit.items[a.at]!.rect, fit.axis) - from);
    const across = fit.items[b.at]!.rect;
    const rect: Rect = fit.axis === "column" ? { x: across.x, y: from, width: across.width, height: thick } : { x: from, y: across.y, width: thick, height: across.height };
    out.push({ before: b.id, after: a.id, rect, range: { min: 0 - Math.max(0, b.drawn - b.least), max: Math.max(0, a.drawn - a.least) } });
  }
  return out;
}

/**
 * Move the divider between the open growing items `before` and `after` by `delta` px along the stack: `before` gets
 * longer by `delta` and `after` shorter (a negative `delta` the other way), so the stack's total is the same and only the
 * two move. It writes the length of the two only, in ask units (see `written`), so nothing else shifts and the others
 * stay as they were, sized or not. Neither goes
 * under its least: `delta` is clamped to the divider's `range`, no item collapses and none is pushed. Returns the same
 * object when nothing changes (not neighbors, an unknown id, a `delta` that isn't a number, or one clamped to 0).
 * `options.previous` is the fit the stack had, as for `fitStack`.
 */
export function resizeBetween(input: StackInput, before: string, after: string, delta: number, options: FitOptions = {}): StackInput {
  if (!Number.isFinite(delta)) return input;
  return trade(input, before, after, options, (b, a) => b.drawn + Math.min(Math.max(delta, 0 - Math.max(0, b.drawn - b.least)), Math.max(0, a.drawn - a.least)));
}

/**
 * Give the two items of a divider back the split they would be drawn at if both asked for their natural, their combined
 * drawn length kept and nothing else moving: in proportion to their naturals (their forms' `main.natural`, the least at
 * most) with room for both, and `least + (natural - least) * s` with one shared `s` when short, as `fitStack` shares a
 * short length. The double-click action. Returns the same object when the two are at that split already (a pair nobody
 * resized always is, in every regime), or are not neighbors. Like a drag it writes the lengths of the two only.
 */
export function resetBetween(input: StackInput, before: string, after: string, options: FitOptions = {}): StackInput {
  return trade(input, before, after, options, (b, a) => {
    const both = b.drawn + a.drawn;
    const natural = b.natural + a.natural;
    const least = b.least + a.least;
    let want: number;
    if (both >= natural - EPS) want = natural > EPS ? (both * b.natural) / natural : both / 2;
    else want = b.least + (b.natural - b.least) * (natural - least > EPS ? (both - least) / (natural - least) : 0);
    return Math.min(Math.max(want, b.least), Math.max(b.least, both - a.least));
  });
}

/**
 * `input` with every asked length of the stack's axis deleted, back to the split a stack with none has. An item's length
 * for the other axis stays. Returns the same object when no item had one.
 */
export function resetLengths(input: StackInput): StackInput {
  let changed = false;
  const items = input.items.map((it) => {
    if (it.length?.[input.axis] === undefined) return it;
    changed = true;
    const { [input.axis]: _dropped, ...rest } = it.length;
    const { length: _length, ...bare } = it;
    return Object.keys(rest).length > 0 ? { ...bare, length: rest } : bare;
  });
  return changed ? { ...input, items } : input;
}
