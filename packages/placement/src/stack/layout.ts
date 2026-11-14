/**
 * `fitStack`: which form each item of a stack takes, and where it goes.
 *
 * 1. Every item starts in its largest form it may take (`forms[from]`, default the first).
 * 2. The stack's cross size is the largest `cross.natural` among the items whose form sets it (an open panel's, by
 *    default), clamped to the limits; with none, the rail width.
 * 3. Cross-fit: an item whose form doesn't set the cross size and whose `cross.min` is over it steps down until it
 *    fits (a group never sets a column's width, so a group alone becomes a rail of icons); so does one whose form does
 *    set it but whose `cross.min` is over the limits' `max`, with `strictCross` (an open panel in a thin bar becomes a
 *    header; without the option it is only clamped). Cross size never steps an item into the menu: when only the menu is left it keeps its last drawn form and a `too-wide` note
 *    says so.
 * 4. Give-way: while the smallest sizes (`main.min`, plus the gaps and the padding) don't fit the length, one item
 *    steps down. Each item's next step goes to the first later form that shortens the stack (a smaller total: the
 *    form's `main.min`, the » entry when the form is the menu, the gaps gained or lost); forms that don't are skipped,
 *    and an item with none stays. Of those steps the one into the lowest `rank` is taken; ties go unkept before kept,
 *    then the item used longest ago, then the later in the stack. A `menu` form takes no room; the » entry does, while
 *    any item is in it. The first item into the menu opens the entry: when it is stuck (no shorter form but the
 *    menu) and alone is shorter than the entry, the stuck items go in as one batch, in give-way order, as few as
 *    together shorten the stack; if all of them together don't, they stay. A `fold` form is an ordinary form with its
 *    own length. Steps 2 to 4 repeat until nothing changes: a panel folding can narrow the column, which asks more of
 *    the groups.
 * 5. The room the items leave goes to the forms that grow, shared by their natural sizes. With none, the items keep
 *    their natural sizes from the start of the stack. Between the minimum and natural sizes every item shrinks by the
 *    same share of what it can give.
 *
 * `gap` sits between neighbouring drawn items (the » entry is one), `pad` before the first and after the last; both
 * count toward the length and the rects include them, so an app draws at the rects.
 *
 * The solver has no open or closed state: it lays out the items it is given, and a consumer closes a panel by not
 * passing it (or by starting it at a later form with `from`). An item with no forms is left out (`no-forms`). Pure:
 * same input, same fit.
 */
import type { Rect } from "../geometry";
import { formSetsCross, limitsOf, menuMain, spacingOf, type FitOptions, type PlacedStackItem, type StackFit, type StackForm, type StackInput, type StackItem, type StackMenu, type StackNote } from "./model";

const EPS = 1e-6;
const isMenu = (f: StackForm): boolean => f.kind === "menu";
const finite = (x: number, fallback = 0): number => (Number.isFinite(x) ? x : fallback);
const mainOf = (f: StackForm, which: "min" | "natural"): number => (isMenu(f) ? 0 : Math.max(0, finite(f.main[which])));
/** The least a form can be drawn across the stack. */
const crossMin = (f: StackForm): number => finite(f.cross.min ?? f.cross.natural);

const rankOf = (f: StackForm): number => finite(f.rank ?? 0);

/**
 * The item that gives way next, among those with a step (`to[i]`, the form it would take, or -1): the lowest rank of the
 * form it steps into, unkept before kept, used longest ago, the later in the stack on a tie.
 */
function victim(items: readonly StackItem[], to: readonly number[]): number {
  let best = -1;
  for (let i = 0; i < items.length; i++) {
    if (to[i]! < 0) continue;
    if (best < 0) {
      best = i;
      continue;
    }
    const a = items[i]!;
    const b = items[best]!;
    const ra = rankOf(a.forms[to[i]!]!);
    const rb = rankOf(b.forms[to[best]!]!);
    const ka = a.kept ? 1 : 0;
    const kb = b.kept ? 1 : 0;
    if (ra !== rb ? ra < rb : ka !== kb ? ka < kb : a.used !== b.used ? a.used < b.used : true) best = i;
  }
  return best;
}

/**
 * `fitStack(input, options?)`. With `options.previous` (the fit the stack had before) the forms it chose are kept while
 * they still fit: the solve starts from them instead of from every item's largest form, so a change of ages alone
 * (a press on a header) reshapes nothing, and ages decide only who gives way anew when the length shrank or an item
 * was added or opened. Room that came back is used: when the forms kept leave more spare length than they did (the length
 * grew, a gap or a size shrank; `need` is what each fit says its forms need), the largest forms are tried again, as
 * without `previous`. A `previous` with no `need` (one an app built by hand) is no help and the fresh fit is returned.
 */
export function fitStack(input: StackInput, options: FitOptions = {}): StackFit {
  const fresh = solve(input);
  const previous = options.previous;
  if (!previous || previous.need === undefined) return fresh;
  const seed = { need: 0 };
  const kept = solve(input, previous, seed);
  // Room came back when the kept forms leave more spare length now than before they gave way anew, or when the stack got
  // wider across (a wider limit lets a panel open wider, and the forms that stepped down for the old width may come back).
  const moreLength = Math.max(0, kept.length) - seed.need > previous.length - previous.need + EPS;
  const moreCross = kept.cross > previous.cross + EPS;
  return moreLength || moreCross ? fresh : kept;
}

/** `seed.need` (when given) is told the length the forms taken from `previous` need under this input, before any step. */
function solve(input: StackInput, previous?: StackFit, seed?: { need: number }): StackFit {
  const length = Math.max(0, finite(input.length));
  const lim = limitsOf(input);
  const items = input.items.filter((it) => it.forms.length > 0);
  const start = items.map((it) => Math.min(Math.max(0, Math.floor(finite(it.from ?? 0))), it.forms.length - 1));
  const at = [...start];
  if (previous) {
    // An item the previous fit had keeps its form while `from` still allows it and the form is still the one it was (the
    // same kind and smallest size); one whose `from` went down since (a panel opened) starts over, and so does a new one
    // or one whose forms changed. Where an item started then is its first `form-down` note's `from`, or the form it had
    // when it never moved.
    const had = new Map(previous.items.map((p) => [p.id, p]));
    const began = new Map<string, number>();
    for (const n of previous.notes) if (n.code === "form-down" && !began.has(n.id)) began.set(n.id, n.from);
    items.forEach((it, i) => {
      const p = had.get(it.id);
      if (!p || p.form < start[i]! || p.form >= it.forms.length || start[i]! < (began.get(it.id) ?? p.form)) return;
      const f = it.forms[p.form]!;
      if (f.kind === p.kind && (p.min === undefined || mainOf(f, "min") === p.min)) at[i] = p.form;
    });
  }
  const form = (i: number): StackForm => items[i]!.forms[at[i]!]!;
  const idx = items.map((_, i) => i);

  const firstStep: number[] = [];
  const menuOrder: number[] = [];
  const step = (i: number, j: number): void => {
    if (!firstStep.includes(i)) firstStep.push(i);
    at[i] = j;
    if (isMenu(form(i)) && !menuOrder.includes(i)) menuOrder.push(i);
  };
  // Items kept from the previous fit give way (and entered the menu) in the order its notes say, then the rest by place.
  const named = (code: "form-down" | "to-menu"): number[] => (previous ? previous.notes.filter((n) => n.code === code).map((n) => items.findIndex((it) => it.id === (n as { id: string }).id)) : []);
  for (const i of [...named("form-down"), ...idx]) if (i >= 0 && at[i]! > start[i]! && !firstStep.includes(i)) firstStep.push(i);
  // An item that starts in the menu is in it from the start.
  for (const i of [...named("to-menu"), ...idx]) if (i >= 0 && isMenu(form(i)) && !menuOrder.includes(i)) menuOrder.push(i);

  const crossOf = (): number => {
    const setters = idx.filter((i) => !isMenu(form(i)) && formSetsCross(form(i)));
    if (setters.length === 0) return lim.rail;
    const want = Math.max(...setters.map((i) => finite(form(i).cross.natural)));
    return Math.min(Math.max(want, lim.min), lim.max);
  };
  const inMenu = (): boolean => idx.some((i) => isMenu(form(i)));
  const sp = spacingOf(input);
  /** The gaps between `slots` neighbours: the drawn items, and the » entry while any item is in it. */
  const gapsOf = (): number => {
    const slots = idx.filter((i) => !isMenu(form(i))).length + (inMenu() ? 1 : 0);
    return slots > 1 ? (slots - 1) * sp.gap : 0;
  };
  /** The shortest the stack can be drawn now: the smallest sizes, the » entry, the gaps and the padding. */
  const minSum = (): number => idx.reduce((s, i) => s + mainOf(form(i), "min"), 0) + (inMenu() ? menuMain(input) : 0) + gapsOf() + sp.start + sp.end;
  /** The form item `i` would step to: the first later one that shortens the stack, else -1 (it stays). */
  const stepTo = (i: number): number => {
    const from = at[i]!;
    const base = minSum();
    let found = -1;
    for (let j = from + 1; j < items[i]!.forms.length && found < 0; j++) {
      at[i] = j;
      if (minSum() < base - EPS) found = j;
    }
    at[i] = from;
    return found;
  };
  /** The first menu form after item `i`'s current one, or -1. */
  const menuFormAfter = (i: number): number => {
    for (let j = at[i]! + 1; j < items[i]!.forms.length; j++) if (isMenu(items[i]!.forms[j]!)) return j;
    return -1;
  };
  /**
   * The items to step into the menu together, as [item, form] pairs in give-way order: the fewest from `pool` (the form
   * each would take, -1 for an item not in it) that together shorten the stack, entry and gaps counted. Null when even
   * all of them don't.
   */
  const menuBatch = (pool: readonly number[]): [number, number][] | null => {
    const saved = [...at];
    const base = minSum();
    const left = [...pool];
    const batch: [number, number][] = [];
    let found = false;
    for (let b = victim(items, left); b >= 0 && !found; b = victim(items, left)) {
      batch.push([b, left[b]!]);
      at[b] = left[b]!;
      left[b] = -1;
      found = minSum() < base - EPS;
    }
    at.splice(0, at.length, ...saved);
    return found ? batch : null;
  };
  const canStep = (i: number): boolean => at[i]! + 1 < items[i]!.forms.length;
  const tooWide = (i: number, cross: number): boolean => {
    const f = form(i);
    if (isMenu(f)) return false;
    // A form that sets the cross size is clamped to `max`, as it always was; only with `strictCross` is it never drawn
    // thinner than its `cross.min`, and steps down when that is over `max`.
    if (formSetsCross(f)) return input.strictCross === true && crossMin(f) > lim.max + EPS;
    return crossMin(f) > cross + EPS;
  };

  if (seed) seed.need = minSum();
  let cross = crossOf();
  let overflow = 0;
  // Every pass steps at least one item one form (by cross size or by length), so twice the forms is more than enough.
  const guard = 2 * items.reduce((s, it) => s + it.forms.length, 0) + 2;
  for (let n = 0; n <= guard; n++) {
    cross = crossOf();
    // Too wide for the stack: step down, but never into the menu (that is the length's call).
    let stepped = false;
    for (const i of idx) {
      if (tooWide(i, cross) && canStep(i) && !isMenu(items[i]!.forms[at[i]! + 1]!)) {
        step(i, at[i]! + 1);
        stepped = true;
      }
    }
    if (stepped) continue;
    const over = minSum() - length;
    if (over <= EPS) break;
    const to = idx.map(stepTo);
    // Items that can't shorten the stack on their own but have the menu ahead: while the » entry doesn't exist, the
    // first one in costs the entry, so they go in together or not at all.
    const pool = idx.map((i) => (to[i]! < 0 && !inMenu() ? menuFormAfter(i) : -1));
    const v = victim(
      items,
      idx.map((i) => (to[i]! >= 0 ? to[i]! : pool[i]!)),
    );
    if (v >= 0 && to[v]! < 0) {
      const batch = menuBatch(pool);
      if (batch) {
        for (const [i, j] of batch) step(i, j);
        continue;
      }
    }
    const w = v >= 0 && to[v]! >= 0 ? v : victim(items, to);
    if (w < 0) {
      overflow = items.length > 0 ? over : 0;
      break;
    }
    step(w, to[w]!);
  }
  cross = crossOf();

  // Sizes along the stack.
  const menuSize = inMenu() ? menuMain(input) : 0;
  const avail = Math.max(0, length - sp.start - sp.end - gapsOf() - menuSize);
  const drawn = idx.filter((i) => !isMenu(form(i)));
  const min = (i: number): number => mainOf(form(i), "min");
  const nat = (i: number): number => Math.max(min(i), mainOf(form(i), "natural"));
  const sumMin = drawn.reduce((s, i) => s + min(i), 0);
  const sumNat = drawn.reduce((s, i) => s + nat(i), 0);
  const size = new Map<number, number>();
  if (sumNat <= avail + EPS) {
    const growers = drawn.filter((i) => form(i).main.grows);
    const spare = Math.max(0, avail - sumNat);
    const weight = growers.reduce((s, i) => s + nat(i), 0);
    for (const i of drawn) {
      const share = growers.includes(i) ? (weight > EPS ? nat(i) / weight : 1 / growers.length) : 0;
      size.set(i, nat(i) + spare * share);
    }
  } else {
    const t = avail > sumMin && sumNat > sumMin ? (avail - sumMin) / (sumNat - sumMin) : 0;
    for (const i of drawn) size.set(i, min(i) + (nat(i) - min(i)) * t);
  }

  const rectAt = (from: number, main: number): Rect => (input.axis === "column" ? { x: 0, y: from, width: cross, height: main } : { x: from, y: 0, width: main, height: cross });
  const rects = new Map<number, Rect>();
  let cursor = sp.start;
  for (const i of drawn) {
    const s = size.get(i)!;
    rects.set(i, rectAt(cursor, s));
    cursor += s + sp.gap;
  }
  // The » entry sits at the end of the stack, after the padding, or right after the last item when room is short.
  const menuRect = rectAt(Math.max(drawn.length > 0 ? cursor : sp.start, length - sp.end - menuSize), menuSize);
  const inside = idx.filter((i) => isMenu(form(i)));
  const menu: StackMenu | null = inside.length > 0 ? { rect: menuRect, items: inside.map((i) => items[i]!.id) } : null;

  const placed: PlacedStackItem[] = idx.map((i) => ({ id: items[i]!.id, form: at[i]!, kind: form(i).kind, rect: isMenu(form(i)) ? menuRect : rects.get(i)!, min: mainOf(form(i), "min") }));

  const notes: StackNote[] = [];
  for (const it of input.items) if (it.forms.length === 0) notes.push({ code: "no-forms", id: it.id });
  for (const i of firstStep) if (at[i]! > start[i]!) notes.push({ code: "form-down", id: items[i]!.id, from: start[i]!, to: at[i]! });
  for (const i of menuOrder) if (isMenu(form(i))) notes.push({ code: "to-menu", id: items[i]!.id });
  for (const i of idx) if (tooWide(i, cross)) notes.push({ code: "too-wide", id: items[i]!.id });
  if (overflow > EPS) notes.push({ code: "overflow", over: overflow });
  return { axis: input.axis, length, cross, items: placed, menu, notes, need: minSum() };
}
