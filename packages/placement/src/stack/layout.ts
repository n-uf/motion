/**
 * `fitStack`: which form each item of a stack takes, and where it goes.
 *
 * 1. Every item starts in its largest form it may take (`forms[from]`, default the first).
 * 2. The stack's cross size is the largest `cross.natural` among the items whose form sets it (an open panel's, by
 *    default), clamped to the limits; with none, the rail width.
 * 3. Cross-fit: an item whose form doesn't set the cross size and whose `cross.min` is over it steps down until it
 *    fits (a group never sets a column's width, so a group alone becomes a rail of icons). Cross size never steps
 *    an item into the menu: when only the menu is left it keeps its last drawn form and a `too-wide` note says so.
 * 4. Give-way: while the smallest sizes (`main.min`) don't fit the length, the item used longest ago steps down one
 *    form; unkept before kept, the later in the stack first on a tie. The same item keeps giving way until its forms
 *    end, then the next does. A `menu` form takes no room; the » entry does, while any item is in it (and an item
 *    doesn't go into the menu when that would only make the stack longer and nothing else can give way).
 *    Steps 2 to 4 repeat until nothing changes: a panel folding can narrow the column, which asks more of the groups.
 * 5. The room the items leave goes to the forms that grow, shared by their natural sizes. With none, the items keep
 *    their natural sizes from the start of the stack. Between the minimum and natural sizes every item shrinks by the
 *    same share of what it can give.
 *
 * The solver has no open or closed state: it lays out the items it is given, and a consumer closes a panel by not
 * passing it (or by starting it at a later form with `from`). An item with no forms is left out (`no-forms`). Pure:
 * same input, same fit.
 */
import type { Rect } from "../geometry";
import { formSetsCross, limitsOf, menuMain, type PlacedStackItem, type StackFit, type StackForm, type StackInput, type StackItem, type StackMenu, type StackNote } from "./model";

const EPS = 1e-6;
const isMenu = (f: StackForm): boolean => f.kind === "menu";
const finite = (x: number, fallback = 0): number => (Number.isFinite(x) ? x : fallback);
const mainOf = (f: StackForm, which: "min" | "natural"): number => (isMenu(f) ? 0 : Math.max(0, finite(f.main[which])));
/** The least a form can be drawn across the stack. */
const crossMin = (f: StackForm): number => finite(f.cross.min ?? f.cross.natural);

/** The item that gives way next: unkept before kept, used longest ago, the later in the stack on a tie. */
function victim(items: readonly StackItem[], at: readonly number[]): number {
  let best = -1;
  for (let i = 0; i < items.length; i++) {
    if (at[i]! + 1 >= items[i]!.forms.length) continue;
    if (best < 0) {
      best = i;
      continue;
    }
    const a = items[i]!;
    const b = items[best]!;
    const ka = a.kept ? 1 : 0;
    const kb = b.kept ? 1 : 0;
    if (ka !== kb ? ka < kb : a.used !== b.used ? a.used < b.used : true) best = i;
  }
  return best;
}

export function fitStack(input: StackInput): StackFit {
  const length = Math.max(0, finite(input.length));
  const lim = limitsOf(input);
  const items = input.items.filter((it) => it.forms.length > 0);
  const start = items.map((it) => Math.min(Math.max(0, Math.floor(finite(it.from ?? 0))), it.forms.length - 1));
  const at = [...start];
  const form = (i: number): StackForm => items[i]!.forms[at[i]!]!;
  const idx = items.map((_, i) => i);

  const firstStep: number[] = [];
  const menuOrder: number[] = [];
  const step = (i: number): void => {
    if (!firstStep.includes(i)) firstStep.push(i);
    at[i]!++;
    if (isMenu(form(i)) && !menuOrder.includes(i)) menuOrder.push(i);
  };
  // An item that starts in the menu is in it from the start.
  for (const i of idx) if (isMenu(form(i))) menuOrder.push(i);

  const crossOf = (): number => {
    const setters = idx.filter((i) => !isMenu(form(i)) && formSetsCross(form(i)));
    if (setters.length === 0) return lim.rail;
    const want = Math.max(...setters.map((i) => finite(form(i).cross.natural)));
    return Math.min(Math.max(want, lim.min), lim.max);
  };
  const inMenu = (): boolean => idx.some((i) => isMenu(form(i)));
  const minSum = (): number => idx.reduce((s, i) => s + mainOf(form(i), "min"), 0) + (inMenu() ? menuMain(input) : 0);
  const canStep = (i: number): boolean => at[i]! + 1 < items[i]!.forms.length;
  const tooWide = (i: number, cross: number): boolean => !isMenu(form(i)) && !formSetsCross(form(i)) && crossMin(form(i)) > cross + EPS;

  let cross = crossOf();
  let overflow = 0;
  const guard = items.reduce((s, it) => s + it.forms.length, 0) + 1;
  for (let n = 0; n <= guard; n++) {
    cross = crossOf();
    // Too wide for the stack: step down, but never into the menu (that is the length's call).
    let stepped = false;
    for (const i of idx) {
      if (tooWide(i, cross) && canStep(i) && !isMenu(items[i]!.forms[at[i]! + 1]!)) {
        step(i);
        stepped = true;
      }
    }
    if (stepped) continue;
    const over = minSum() - length;
    if (over <= EPS) break;
    const v = victim(items, at);
    if (v < 0) {
      overflow = over;
      break;
    }
    // Into the menu only when that helps, or when something else can still give way.
    const intoMenu = isMenu(items[v]!.forms[at[v]! + 1]!);
    const gain = mainOf(form(v), "min") - (inMenu() ? 0 : menuMain(input));
    if (intoMenu && gain < 0 && idx.filter(canStep).length === 1) {
      overflow = over;
      break;
    }
    step(v);
  }
  cross = crossOf();

  // Sizes along the stack.
  const menuSize = inMenu() ? menuMain(input) : 0;
  const avail = Math.max(0, length - menuSize);
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
  let cursor = 0;
  for (const i of drawn) {
    const s = size.get(i)!;
    rects.set(i, rectAt(cursor, s));
    cursor += s;
  }
  const menuRect = rectAt(Math.max(cursor, length - menuSize), menuSize);
  const inside = idx.filter((i) => isMenu(form(i)));
  const menu: StackMenu | null = inside.length > 0 ? { rect: menuRect, items: inside.map((i) => items[i]!.id) } : null;

  const placed: PlacedStackItem[] = idx.map((i) => ({ id: items[i]!.id, form: at[i]!, kind: form(i).kind, rect: isMenu(form(i)) ? menuRect : rects.get(i)! }));

  const notes: StackNote[] = [];
  for (const it of input.items) if (it.forms.length === 0) notes.push({ code: "no-forms", id: it.id });
  for (const i of firstStep) if (at[i]! > start[i]!) notes.push({ code: "form-down", id: items[i]!.id, from: start[i]!, to: at[i]! });
  for (const i of menuOrder) if (isMenu(form(i))) notes.push({ code: "to-menu", id: items[i]!.id });
  for (const i of idx) if (tooWide(i, cross)) notes.push({ code: "too-wide", id: items[i]!.id });
  if (overflow > EPS) notes.push({ code: "overflow", over: overflow });
  return { axis: input.axis, length, cross, items: placed, menu, notes };
}
