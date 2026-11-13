/**
 * `fitStack`: which form each item of a stack takes, and where it goes.
 *
 * 1. Every item starts in its largest form (`forms[0]`).
 * 2. The stack's cross size is the largest `cross.natural` among the items whose form sets it (an open panel's, by
 *    default), clamped to the limits; with none, the rail width. An item whose form doesn't set it and asks for more
 *    than that steps down a form (a group never sets a column's width, so a group alone becomes a rail).
 * 3. While the smallest sizes (`main.min`) don't fit the length, the item used longest ago steps down one form;
 *    unkept before kept, the later in the stack first on a tie. The same item keeps giving way until its forms end.
 *    A `menu` form takes no room; the » entry does, while any item is in it.
 * 4. The room the items leave goes to the forms that grow, shared by their natural sizes. With none, the items keep
 *    their natural sizes from the start of the stack. Between the minimum and natural sizes every item shrinks by the
 *    same share of what it can give.
 *
 * The solver has no open or closed state: it lays out the items it is given, and a consumer closes a panel by not
 * passing it (or by giving it fewer forms). Pure: same input, same fit.
 */
import type { Rect } from "../geometry";
import { menuMain, railOf, setsCross, type PlacedStackItem, type StackFit, type StackForm, type StackInput, type StackItem, type StackMenu, type StackNote } from "./model";

const EPS = 1e-6;
const isMenu = (f: StackForm): boolean => f.kind === "menu";
const finite = (x: number, fallback = 0): number => (Number.isFinite(x) ? x : fallback);
const mainOf = (f: StackForm, which: "min" | "natural"): number => (isMenu(f) ? 0 : Math.max(0, finite(f.main[which])));

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
  const items = input.items;
  const length = Math.max(0, finite(input.length));
  const rail = railOf(input);
  const at = items.map(() => 0);
  const form = (i: number): StackForm => items[i]!.forms[at[i]!]!;
  const live = (i: number): boolean => items[i]!.forms.length > 0;

  const firstStep: number[] = [];
  const menuOrder: number[] = [];
  const step = (i: number): void => {
    if (!firstStep.includes(i)) firstStep.push(i);
    at[i]!++;
    if (isMenu(form(i)) && !menuOrder.includes(i)) menuOrder.push(i);
  };
  // An item that starts in the menu (its first form) is in it from the start.
  items.forEach((_, i) => {
    if (live(i) && isMenu(form(i))) menuOrder.push(i);
  });

  const crossOf = (): number => {
    const setters = items.map((_, i) => i).filter((i) => live(i) && !isMenu(form(i)) && setsCross(form(i)));
    if (setters.length === 0) return rail;
    const want = Math.max(...setters.map((i) => finite(form(i).cross.natural)));
    return Math.min(Math.max(want, input.cross.min), Math.max(input.cross.min, input.cross.max));
  };
  const inMenu = (): boolean => items.some((_, i) => live(i) && isMenu(form(i)));
  const minSum = (): number => items.reduce((s, _, i) => s + (live(i) ? mainOf(form(i), "min") : 0), 0) + (inMenu() ? menuMain(input) : 0);

  let cross = crossOf();
  let overflow = 0;
  const guard = items.reduce((s, it) => s + it.forms.length, 0) + 1;
  for (let n = 0; n <= guard; n++) {
    cross = crossOf();
    // Too wide for the stack: forms that don't set the cross size and ask for more than it is.
    const wide = items.map((_, i) => i).filter((i) => live(i) && !isMenu(form(i)) && !setsCross(form(i)) && finite(form(i).cross.natural) > cross + EPS && at[i]! + 1 < items[i]!.forms.length);
    if (wide.length > 0) {
      for (const i of wide) step(i);
      continue;
    }
    const over = minSum() - length;
    if (over <= EPS) break;
    const v = victim(items, at);
    if (v < 0) {
      overflow = over;
      break;
    }
    step(v);
  }
  cross = crossOf();

  // Sizes along the stack.
  const menuSize = inMenu() ? menuMain(input) : 0;
  const avail = Math.max(0, length - menuSize);
  const idx = items.map((_, i) => i).filter((i) => live(i) && !isMenu(form(i)));
  const min = (i: number): number => mainOf(form(i), "min");
  const nat = (i: number): number => Math.max(min(i), mainOf(form(i), "natural"));
  const sumMin = idx.reduce((s, i) => s + min(i), 0);
  const sumNat = idx.reduce((s, i) => s + nat(i), 0);
  const size = new Map<number, number>();
  if (sumNat <= avail + EPS) {
    const growers = idx.filter((i) => form(i).main.grows);
    const spare = Math.max(0, avail - sumNat);
    const weight = growers.reduce((s, i) => s + nat(i), 0);
    for (const i of idx) {
      const share = growers.includes(i) ? (weight > EPS ? nat(i) / weight : 1 / growers.length) : 0;
      size.set(i, nat(i) + spare * share);
    }
  } else {
    const t = avail > sumMin && sumNat > sumMin ? (avail - sumMin) / (sumNat - sumMin) : 0;
    for (const i of idx) size.set(i, min(i) + (nat(i) - min(i)) * t);
  }

  const rectAt = (start: number, main: number): Rect => (input.axis === "column" ? { x: 0, y: start, width: cross, height: main } : { x: start, y: 0, width: main, height: cross });
  const rects = new Map<number, Rect>();
  let cursor = 0;
  for (const i of idx) {
    const s = size.get(i)!;
    rects.set(i, rectAt(cursor, s));
    cursor += s;
  }
  const menuRect = rectAt(Math.max(cursor, length - menuSize), menuSize);
  const menu: StackMenu | null = menuOrder.length > 0 ? { rect: menuRect, items: items.map((it, i) => ({ id: it.id, i })).filter((x) => live(x.i) && isMenu(form(x.i))).map((x) => x.id) } : null;

  const placed: PlacedStackItem[] = items.map((it, i) => {
    if (!live(i)) return { id: it.id, form: -1, kind: "menu", rect: menuRect };
    const f = form(i);
    return { id: it.id, form: at[i]!, kind: f.kind, rect: isMenu(f) ? menuRect : rects.get(i)! };
  });

  const notes: StackNote[] = [];
  for (const i of firstStep) if (at[i]! > 0) notes.push({ code: "form-down", id: items[i]!.id, from: 0, to: at[i]! });
  for (const i of menuOrder) if (live(i) && isMenu(form(i))) notes.push({ code: "to-menu", id: items[i]!.id });
  if (overflow > EPS) notes.push({ code: "overflow", over: overflow });
  return { axis: input.axis, length, cross, items: placed, menu, notes };
}
