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
 *    same share of what it can give. A growing form whose item asks for a length (`StackItem.length`, for the stack's
 *    axis) is read at that length in place of its natural size, nothing else changes.
 *
 * A `fixed` item takes part in none of steps 1 to 4: it keeps its first allowed form, counts toward the length, and the
 * others give way around it. In step 5 it shrinks and grows like any item.
 *
 * With `ownCross`, an item in a group form (`row`, `stacked`, `wrap`, `icons`, `fold`) is drawn at its own `cross.natural`
 * (clamped to the stack's cross size) from the start edge instead of across the whole stack; a panel form (`open`,
 * `header`, `rail`) still spans it. Nothing else changes.
 *
 * `gap` sits between neighboring drawn items (the » entry is one), `pad` before the first and after the last; both
 * count toward the length and the rects include them, so an app draws at the rects.
 *
 * The solver has no open or closed state: it lays out the items it is given, and a consumer closes a panel by not
 * passing it (or by starting it at a later form with `from`). An item with no forms is left out (`no-forms`). Pure:
 * same input, same fit.
 */
import { EPS, type Rect } from "../geometry";
import { askedLength, formCrossMin, formFitsCross, formMain, formSetsCross, limitsOf, menuMain, spacingOf, wrapCross, wrapRows, type FitOptions, type PlacedStackItem, type StackFit, type StackForm, type StackInput, type StackItem, type StackMenu, type StackNote, type StackStep } from "./model";
const isMenu = (f: StackForm): boolean => f.kind === "menu";
/** The form kinds of a control group; `ownCross` draws these at their own size across. */
const GROUP_KINDS: ReadonlySet<string> = new Set(["row", "stacked", "wrap", "icons", "fold"]);
const finite = (x: number, fallback = 0): number => (Number.isFinite(x) ? x : fallback);
/** A form's length along the stack; a `wrap` form's is its rows at cross size `cross` times the row height. */
const mainOf = formMain;
/** The least a form can be drawn across the stack (a `wrap` form: the narrowest cross its rows fit). */
const crossMin = formCrossMin;
/** What a form asks for across (a `wrap` form: its one-row width). */
const crossNatural = (f: StackForm): number => (f.wrap ? wrapCross(f.wrap).natural : finite(f.cross.natural));

const rankOf = (f: StackForm): number => finite(f.rank ?? 0);

/**
 * The item that gives way next, among those with a step (`to[i]`, the form it would take, or -1): the lowest rank of the
 * form it steps into, unkept before kept, used longest ago, the later in the stack on a tie.
 */
function victim(items: readonly StackItem[], to: readonly number[]): number {
  let best = -1;
  for (let i = 0; i < items.length; i++) {
    if (to[i]! < 0 || items[i]!.fixed) continue;
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
 * was added or opened. Room that came back is used, but growing never re-ranks. When the stack got wider across (a wider
 * limit lets a panel open wider, and the forms that stepped down for the old width may come back) the fresh fit is
 * taken. When the forms kept leave more spare length than they did (the length grew, a gap or a size shrank; `need` is
 * what each fit says its forms need) room comes back by undoing the give-way history (`steps`, carried on from fit to
 * fit) from its last step, a batch into the » menu together, an item to the nearest earlier form that fits; the first
 * step that can't be undone stops all growth. So growing back is exactly the reverse of giving way: at every length the
 * way back holds what the way down held. A `previous` without a history (built by hand, or by an older version) grows
 * the old way: a fresh fit that is a pure gain over the kept one, else the item that gave way most recently by its
 * rank, `kept` and age first, one at a time, menu items out only when that keeps the order. A `previous` with no `need`
 * (one an app built by hand) is no help and the fresh fit is returned.
 */
export function fitStack(input: StackInput, options: FitOptions = {}): StackFit {
  const fresh = solve(input);
  const previous = options.previous;
  if (!previous || previous.need === undefined) return fresh;
  const seed = { need: 0 };
  const kept = solve(input, previous, seed);
  if (kept.cross > previous.cross + EPS) return fresh;
  const moreLength = Math.max(0, kept.length) - seed.need > previous.length - previous.need + EPS;
  if (!moreLength) return kept;
  // With the give-way history, room comes back by undoing it from the last step (exactly the reverse); without one (a
  // previous fit built by hand, or by an older version), a fresh fit that is a pure gain is taken.
  const gain = !previous.steps && fresh.items.every((p, i) => p.form <= kept.items[i]!.form) && fresh.items.some((p, i) => p.form < kept.items[i]!.form);
  return gain ? fresh : solve(input, previous, { need: 0 }, true);
}

/**
 * `seed.need` (when given) is told the length the forms taken from `previous` need under this input, before any step.
 * With `grow` the forms taken from `previous` grow back while the stack still fits, in the reverse of give-way order.
 */
function solve(input: StackInput, previous?: StackFit, seed?: { need: number }, grow = false): StackFit {
  const length = Math.max(0, finite(input.length));
  const lim = limitsOf(input);
  const items = input.items.filter((it) => it.forms.length > 0);
  // A `title` form is offered only with `input.titles`; otherwise it is passed over like a form that isn't there.
  const offered = (f: StackForm): boolean => f.title !== true || input.titles === true;
  /** The first form at or after `j` that is offered (`j` itself when none is: an item keeps a form to draw). */
  const offeredFrom = (it: StackItem, j: number): number => {
    for (let k = j; k < it.forms.length; k++) if (offered(it.forms[k]!)) return k;
    return j;
  };
  const start = items.map((it) => offeredFrom(it, Math.min(Math.max(0, Math.floor(finite(it.from ?? 0))), it.forms.length - 1)));
  const at = [...start];
  if (previous) {
    // An item the previous fit had keeps its form while `from` still allows it and the form at that index is still of the
    // same kind; one whose `from` went down since (a panel opened) starts over, and so does a new one or one whose forms
    // changed. Where an item started then is its first `form-down` note's `from`, or the form it had when it never moved.
    const had = new Map(previous.items.map((p) => [p.id, p]));
    const began = new Map<string, number>();
    for (const n of previous.notes) if (n.code === "form-down" && !began.has(n.id)) began.set(n.id, n.from);
    items.forEach((it, i) => {
      const p = had.get(it.id);
      if (it.fixed || !p || p.form < start[i]! || p.form >= it.forms.length || start[i]! < (began.get(it.id) ?? p.form)) return;
      const f = it.forms[p.form]!;
      // The size isn't compared: a form re-measured (a badge gained a digit) is still the form it was. A smaller one
      // frees room, which the fresh fit takes (`need`), a larger one gives way from the kept forms.
      if (f.kind === p.kind && offered(f)) at[i] = p.form;
    });
  }
  const form = (i: number): StackForm => items[i]!.forms[at[i]!]!;
  const idx = items.map((_, i) => i);

  // The give-way history: carried on from `previous` for the items whose steps still lead from their start to the form
  // they keep, then every step taken here. Room coming back undoes it from the last step.
  const hist: StackStep[] = [];
  const withHistory = new Set<string>();
  let batches = 0;
  if (previous?.steps) {
    const byId = new Map(items.map((it, i) => [it.id, i]));
    const ends = new Map<string, number>();
    const good = new Set<string>(items.map((it) => it.id));
    for (const s of previous.steps) {
      const i = byId.get(s.id);
      if (i === undefined) continue;
      if (s.from !== (ends.get(s.id) ?? start[i]!)) good.delete(s.id);
      ends.set(s.id, s.to);
    }
    items.forEach((it, i) => {
      if ((ends.get(it.id) ?? start[i]!) !== at[i]) good.delete(it.id);
    });
    for (const s of previous.steps) if (good.has(s.id) && byId.has(s.id)) hist.push(s);
    for (const s of hist) {
      withHistory.add(s.id);
      if (s.batch !== undefined) batches = Math.max(batches, s.batch + 1);
    }
  }
  const firstStep: number[] = [];
  const menuOrder: number[] = [];
  const step = (i: number, j: number, batch?: number): void => {
    if (!firstStep.includes(i)) firstStep.push(i);
    hist.push({ id: items[i]!.id, from: at[i]!, to: j, ...(batch !== undefined ? { batch } : {}) });
    withHistory.add(items[i]!.id);
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
    const want = Math.max(...setters.map((i) => crossNatural(form(i))));
    return Math.min(Math.max(want, lim.min), lim.max);
  };
  const inMenu = (): boolean => idx.some((i) => isMenu(form(i)));
  const sp = spacingOf(input);
  /** The gaps between `slots` neighbors: the drawn items, and the » entry while any item is in it. */
  const gapsOf = (): number => {
    const slots = idx.filter((i) => !isMenu(form(i))).length + (inMenu() ? 1 : 0);
    return slots > 1 ? (slots - 1) * sp.gap : 0;
  };
  /**
   * A fixed item whose form grows (a title) holds its natural length while the other items can still step to a form of
   * the kind they are in (a toolbar's compact variants: row to a smaller row): its shrink below natural is a give-way
   * step that ranks after every such step and before every step that changes a form's kind (icons, fold, the menu).
   * `hold` is on while those steps come first.
   */
  const holds = (i: number): boolean => items[i]!.fixed === true && form(i).main.grows === true;
  let hold = idx.some(holds);
  /** The shortest the stack can be drawn now: the smallest sizes, the » entry, the gaps and the padding. */
  const minSumWith = (held: boolean): number => {
    // A wrap form's length follows the cross size the forms make now.
    const c = items.some((it) => it.forms.some((f) => f.wrap)) ? crossOf() : 0;
    return idx.reduce((s, i) => s + mainOf(form(i), held && holds(i) ? "natural" : "min", c), 0) + (inMenu() ? menuMain(input) : 0) + gapsOf() + sp.start + sp.end;
  };
  const minSum = (): number => minSumWith(hold);
  /** Whether stepping item `i` to form `j` keeps its form's kind (a compact variant of the form it is in). */
  const sameKind = (i: number, j: number): boolean => items[i]!.forms[j]!.kind === form(i).kind;
  /** The form item `i` would step to: the first later one that shortens the stack, else -1 (it stays). */
  const stepTo = (i: number): number => {
    const from = at[i]!;
    const base = minSum();
    let found = -1;
    for (let j = from + 1; j < items[i]!.forms.length && found < 0; j++) {
      if (!offered(items[i]!.forms[j]!)) continue;
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
  /** The next offered form after item `i`'s current one, or -1. */
  const nextOffered = (i: number): number => {
    for (let j = at[i]! + 1; j < items[i]!.forms.length; j++) if (offered(items[i]!.forms[j]!)) return j;
    return -1;
  };
  const canStep = (i: number): boolean => nextOffered(i) >= 0;
  const tooWide = (i: number, cross: number): boolean => {
    const f = form(i);
    if (isMenu(f)) return false;
    // A form that sets the cross size is clamped to `max`, as it always was; only with `strictCross` is it never drawn
    // thinner than its `cross.min`, and steps down when that is over `max`.
    if (formSetsCross(f)) return input.strictCross === true && crossMin(f) > lim.max + EPS;
    // A wrap form fits only where its rows do (no single word on a row but the last): checked at this cross itself.
    if (f.wrap) return !formFitsCross(f, cross);
    return crossMin(f) > cross + EPS;
  };

  // What the forms need at least, every growing fixed item at its minimum (the measure room coming back is read by).
  if (seed) seed.need = minSumWith(false);
  if (grow) {
    // Room came back and the kept forms fit: they grow back one at a time, the reverse of how they gave way (the form an
    // item is in now was stepped into at its rank, so the highest rank first, then `kept`, the newest used, the earlier
    // in the stack). An item goes back to the nearest earlier form the stack still fits with, the cross size unchanged:
    // a larger form is what counts, not a longer stack (the last item leaving the menu takes the » entry with it).
    const comesBefore = (a: number, b: number): boolean => {
      const ra = rankOf(items[a]!.forms[at[a]!]!);
      const rb = rankOf(items[b]!.forms[at[b]!]!);
      const ka = items[a]!.kept ? 1 : 0;
      const kb = items[b]!.kept ? 1 : 0;
      return ra !== rb ? ra > rb : ka !== kb ? ka > kb : items[a]!.used !== items[b]!.used ? items[a]!.used > items[b]!.used : a < b;
    };
    // With the give-way history: undo it from the last step (a batch into the menu comes out together) while the stack
    // still fits; the first step that can't be undone stops all growth. Exactly the reverse of giving way.
    const index = new Map(items.map((it, i) => [it.id, i]));
    let stuck = false;
    const undoes = (n: number, c0: number): boolean => {
      const group = hist.slice(hist.length - n);
      const changed = [...new Set(group.map((s) => index.get(s.id)!))];
      const was = changed.map((i) => at[i]!);
      // A step to a form of the same kind (a compact variant) was taken while the growing fixed items held their natural
      // length: it comes back only when they still do. Every other step came after their shrink.
      const forms = (s: StackStep) => items[index.get(s.id)!]!.forms;
      hold = group.every((s) => forms(s)[s.from]!.kind === forms(s)[s.to]!.kind) && idx.some(holds);
      for (const s of [...group].reverse()) at[index.get(s.id)!] = s.from;
      if (minSum() <= length + EPS && crossOf() === c0 && changed.every((j) => !tooWide(j, c0))) return true;
      changed.forEach((i, k) => (at[i] = was[k]!));
      return false;
    };
    while (hist.length > 0) {
      const c0 = crossOf();
      const last = hist[hist.length - 1]!;
      let n = 1;
      if (last.batch !== undefined) while (n < hist.length && hist[hist.length - 1 - n]!.batch === last.batch) n++;
      // An item goes back to the nearest earlier form the stack fits with: when undoing its last step doesn't fit, its
      // steps just before it (in a row at the end of the history) are undone with it.
      let took = 0;
      for (let m = n; m <= hist.length && took === 0; m++) {
        if (m > n && (last.batch !== undefined || hist[hist.length - m]!.id !== last.id)) break;
        if (undoes(m, c0)) took = m;
      }
      if (took === 0) {
        stuck = true;
        break;
      }
      hist.length -= took;
    }
    // Without a history (a previous fit built by hand, or items whose steps it lost): the items next in the reverse of
    // give-way order. Strictly as a stack: only the item next in that order may grow. When it can't, growth stops; no
    // item behind it jumps the queue (a leading group never opens while a trailing one that gave way after it stays
    // folded).
    hold = false;
    for (;;) {
      if (stuck) break;
      const c0 = crossOf();
      const fitsWith = (changed: readonly number[]): boolean => minSum() <= length + EPS && crossOf() === c0 && changed.every((j) => !tooWide(j, c0));
      const queue = idx.filter((i) => !items[i]!.fixed && at[i]! > start[i]! && !withHistory.has(items[i]!.id)).sort((a, b) => (comesBefore(a, b) ? -1 : 1));
      const next = queue[0];
      if (next === undefined) break;
      const cur = at[next]!;
      let to = -1;
      for (let k = cur - 1; k >= start[next]! && to < 0; k--) {
        if (!offered(items[next]!.forms[k]!)) continue;
        at[next] = k;
        if (fitsWith([next])) to = k;
      }
      at[next] = cur;
      if (to >= 0) {
        at[next] = to;
        continue;
      }
      // The next item can't grow alone. Items in the menu may still come out, the fewest in the same order that fit
      // (together when only their leaving together removes the » entry), but only while that keeps the order: an item
      // leaves the menu only with every menu item ahead of it, only for a form no fewer steps down from its start than
      // every item ahead of it that isn't in the menu (the items that opened the entry went in together, after the others
      // had stepped down as far as they could), and never ahead of an item whose step down ranked higher than its own
      // step into the menu (that step came after it: room returns to the most recent give-way first). Steps count from
      // each item's `from`.
      const inside: number[] = [];
      for (const [q, i] of queue.entries()) {
        if (!isMenu(form(i))) continue;
        const ahead = queue.slice(0, q);
        if (!ahead.every((j) => isMenu(form(j)) || (at[i]! - 1 - start[i]! >= at[j]! - start[j]! && rankOf(form(i)) >= rankOf(form(j))))) break;
        inside.push(i);
      }
      let out = false;
      for (let n = 1; n <= inside.length && !out; n++) {
        const group = inside.slice(0, n);
        const was = group.map((i) => at[i]!);
        for (const i of group) at[i] = at[i]! - 1;
        if (fitsWith(group)) out = true;
        else group.forEach((i, k) => (at[i] = was[k]!));
      }
      if (!out) break;
    }
  }
  hold = idx.some(holds);
  let cross = crossOf();
  let overflow = 0;
  // Every pass steps at least one item one form (by cross size or by length), so twice the forms is more than enough.
  const guard = 2 * items.reduce((s, it) => s + it.forms.length, 0) + 2;
  for (let n = 0; n <= guard; n++) {
    cross = crossOf();
    // Too wide for the stack: step down, but never into the menu (that is the length's call).
    let stepped = false;
    for (const i of idx) {
      if (!items[i]!.fixed && tooWide(i, cross) && canStep(i) && !isMenu(items[i]!.forms[nextOffered(i)]!)) {
        step(i, nextOffered(i));
        stepped = true;
      }
    }
    if (stepped) continue;
    const over = minSum() - length;
    if (over <= EPS) break;
    // A fixed item never gives way: it has no step.
    const to = idx.map((i) => (items[i]!.fixed ? -1 : stepTo(i)));
    if (hold) {
      // First the steps that keep a form's kind (compact variants), the growing fixed items at their natural length;
      // with none left, they may shrink (`hold` off) and the other steps follow.
      const variant = victim(
        items,
        idx.map((i) => (to[i]! >= 0 && sameKind(i, to[i]!) ? to[i]! : -1)),
      );
      if (variant >= 0) step(variant, to[variant]!);
      else hold = false;
      continue;
    }
    // Items that can't shorten the stack on their own but have the menu ahead: while the » entry doesn't exist, the
    // first one in costs the entry, so they go in together or not at all.
    const pool = idx.map((i) => (to[i]! < 0 && !inMenu() && !items[i]!.fixed ? menuFormAfter(i) : -1));
    const v = victim(
      items,
      idx.map((i) => (to[i]! >= 0 ? to[i]! : pool[i]!)),
    );
    if (v >= 0 && to[v]! < 0) {
      const batch = menuBatch(pool);
      if (batch) {
        const id = batches++;
        for (const [i, j] of batch) step(i, j, id);
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
  // While the growing fixed items still hold (the forms fit with them at their natural length), the others take the
  // shortage first: a held item's least is its natural length.
  const min = (i: number): number => mainOf(form(i), hold && holds(i) ? "natural" : "min", cross);
  // What a growing form asks for: its item's asked length (`StackItem.length`) when it has one, else the form's natural.
  const nat = (i: number): number => Math.max(min(i), askedLength(items[i]!, form(i), input.axis) ?? mainOf(form(i), "natural", cross));
  const sumMin = drawn.reduce((s, i) => s + min(i), 0);
  const sumNat = drawn.reduce((s, i) => s + nat(i), 0);
  const size = new Map<number, number>();
  // The share of the way from the least to the asked sizes the items are drawn at: 1 with room enough for all.
  let tight = 1;
  // How much longer than it asks a growing form is drawn with spare length: 1 + spare / weight.
  let scale = 1;
  if (sumNat <= avail + EPS) {
    const growers = drawn.filter((i) => form(i).main.grows);
    const spare = Math.max(0, avail - sumNat);
    const weight = growers.reduce((s, i) => s + nat(i), 0);
    if (weight > EPS) scale = 1 + spare / weight;
    for (const i of drawn) {
      const share = growers.includes(i) ? (weight > EPS ? nat(i) / weight : 1 / growers.length) : 0;
      size.set(i, nat(i) + spare * share);
    }
  } else {
    const t = avail > sumMin && sumNat > sumMin ? (avail - sumMin) / (sumNat - sumMin) : 0;
    tight = t;
    for (const i of drawn) size.set(i, min(i) + (nat(i) - min(i)) * t);
  }

  const rectAt = (from: number, main: number, across = cross): Rect => (input.axis === "column" ? { x: 0, y: from, width: across, height: main } : { x: from, y: 0, width: main, height: across });
  /**
   * The size across an item is drawn: the stack's, or with `ownCross` and a group form (`row`, `stacked`, `wrap`, `icons`, `fold`),
   * its own `cross.natural` (clamped to the stack's), from the start edge. The kind decides, not `setsCross`: a group's
   * form that sets the cross size (a column of words) widens the column but is drawn at its own width, and a panel's form
   * (`open`, `header`, `rail`) and the » entry fill the stack.
   */
  const acrossOf = (i: number): number => {
    const f = form(i);
    if (input.ownCross !== true || !GROUP_KINDS.has(f.kind)) return cross;
    // A wrap form is as wide as its rows need at the stack's cross size.
    if (f.wrap) return Math.min(cross, wrapRows(f.wrap, cross).width);
    return Math.min(cross, Math.max(0, finite(f.cross.natural, cross)));
  };
  const rects = new Map<number, Rect>();
  let cursor = sp.start;
  for (const i of drawn) {
    const s = size.get(i)!;
    rects.set(i, rectAt(cursor, s, acrossOf(i)));
    cursor += s + sp.gap;
  }
  // The » entry sits at the end of the stack, after the padding, or right after the last item when room is short.
  const menuRect = rectAt(Math.max(drawn.length > 0 ? cursor : sp.start, length - sp.end - menuSize), menuSize);
  const inside = idx.filter((i) => isMenu(form(i)));
  const menu: StackMenu | null = inside.length > 0 ? { rect: menuRect, items: inside.map((i) => items[i]!.id) } : null;

  const placed: PlacedStackItem[] = idx.map((i) => ({ id: items[i]!.id, form: at[i]!, kind: form(i).kind, rect: isMenu(form(i)) ? menuRect : rects.get(i)! }));

  const notes: StackNote[] = [];
  for (const it of input.items) if (it.forms.length === 0) notes.push({ code: "no-forms", id: it.id });
  for (const i of firstStep) if (at[i]! > start[i]!) notes.push({ code: "form-down", id: items[i]!.id, from: start[i]!, to: at[i]! });
  for (const i of menuOrder) if (isMenu(form(i))) notes.push({ code: "to-menu", id: items[i]!.id });
  for (const i of idx) if (tooWide(i, cross)) notes.push({ code: "too-wide", id: items[i]!.id });
  if (overflow > EPS) notes.push({ code: "overflow", over: overflow });
  const fit: StackFit = { axis: input.axis, length, cross, items: placed, menu, notes, need: minSumWith(false), steps: hist };
  sizes.set(fit, { tight, scale, least: new Map(drawn.map((i) => [items[i]!.id, min(i)])) });
  return fit;
}

/** What `solve` knew about the sizes of a fit and the fit doesn't say. */
export interface FitSizes {
  /** How far from the least to the asked sizes the items were drawn: 1 with room for all of them, less when short. */
  readonly tight: number;
  /** How much longer than it asks each growing form was drawn: 1 + spare / weight with spare length, else 1. */
  readonly scale: number;
  /** The least each drawn item could take as the sizes were shared (a held growing fixed item's is its natural). */
  readonly least: ReadonlyMap<string, number>;
}
/** The sizes of each fit `solve` made, kept off the fit itself so a fit is exactly what it was. */
const sizes = new WeakMap<StackFit, FitSizes>();
/**
 * What `fitStack` knew about how it shared the length: `undefined` for a fit it didn't make. A divider drag reads it to
 * write lengths that reproduce the drawn sizes exactly.
 */
export const sizesOf = (fit: StackFit): FitSizes | undefined => sizes.get(fit);
