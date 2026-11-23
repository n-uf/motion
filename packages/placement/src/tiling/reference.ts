/**
 * The reference `TilingTree` adapter: placement's own `Split`, with optional stacks beside it. Tests, labs and hosts
 * whose tree is a `Split` use it as it is; a host with its own tree reads it as the worked example of each change.
 * See docs/placement.md, Entry: tiling.
 */
import type { Rect } from "../geometry";
import type { TilingPart, TilingStack, TilingSubject, TilingTree } from "./tree";
import { removePane, splitPane, type Split } from "./split";

/** The reference adapter's parts: none by default. */
export interface SplitTreeOpsOptions<K> {
  /** A title bar's height along each pane's top, px: its one part (a join). Default 0: no parts. */
  readonly bar?: number;
  /** A stack's tab width per member, px (default 80): its bar's slots. */
  readonly tab?: (member: K) => number;
}

/**
 * A split tree with stacks: `split` divides the area among the drawn panes, and each stack stands in it as its
 * `active` member's key. A pane in no stack is drawn alone. A stack of one is kept until `normalize` makes it a pane.
 */
export interface StackedSplit<K> {
  readonly split: Split<K> | null;
  readonly stacks?: readonly TilingStack<K>[];
}

/** `split` with every pane key mapped by `fn` (the same object where nothing changes). */
function mapKeys<K>(split: Split<K> | null, fn: (k: K) => K): Split<K> | null {
  if (!split) return split;
  if ("pane" in split) {
    const k = fn(split.pane);
    return k === split.pane ? split : { pane: k };
  }
  const a = mapKeys(split.a, fn)!;
  const b = mapKeys(split.b, fn)!;
  return a === split.a && b === split.b ? split : { ...split, a, b };
}

const stacksOf = <K>(t: StackedSplit<K>): readonly TilingStack<K>[] => t.stacks ?? [];
const of = <K>(split: Split<K> | null, stacks: readonly TilingStack<K>[]): StackedSplit<K> => (stacks.length ? { split, stacks } : { split });
const membersOf = <K>(s: TilingSubject<K>): readonly K[] => (s.kind === "pane" ? [s.pane] : s.stack.members);
const drawnOf = <K>(s: TilingSubject<K>): K => (s.kind === "pane" ? s.pane : s.stack.active);

/**
 * The reference adapter over `StackedSplit<K>`:
 * - `release`: a whole stack leaves the split (its drawn key, `removePane`) and the stack list; a pane in a stack leaves
 *   its members (the next member, else the one before, is drawn when it was the active one); a pane alone leaves the split;
 * - `beside`: `splitPane` on `at`'s side (a half split), a whole stack drawn as its active member and kept whole;
 * - `swap`: a pane trades keys with `at` wherever each is (the split, a stack's members), so each takes the other's
 *   place; a whole stack trades its drawn place in the split with `at`'s;
 * - `join`: the subject's members go into `at`'s stack at `index` (default last; clamped), the first of them drawn; a
 *   pane `at` alone becomes a stack, its id `stack:<at>` (made unique);
 * - `normalize`: a stack of fewer than two members becomes its pane; the same object when there is none;
 * - `parts` (with `options.bar`): a title bar along each pane's top, `bar` px high; a stack's bar has a slot per member,
 *   left to right, each `tab(member)` px wide (default 80), cut at the bar's end.
 */
export function splitTreeOps<K>(options: SplitTreeOpsOptions<K> = {}): TilingTree<StackedSplit<K>, K> {
  const bar = options.bar ?? 0;
  const tab = options.tab ?? (() => 80);
  return {
    ...(bar > 0
      ? {
          parts(t: StackedSplit<K>, pane: K, r: Rect): readonly TilingPart[] {
            const rect: Rect = { x: r.x, y: r.y, width: r.width, height: Math.min(bar, r.height) };
            const stack = stacksOf(t).find((s) => s.members.includes(pane));
            if (!stack) return [{ key: "bar", rect }];
            const slots: Rect[] = [];
            let x = rect.x;
            for (const m of stack.members) {
              const width = Math.max(0, Math.min(tab(m), rect.x + rect.width - x));
              slots.push({ x, y: rect.y, width, height: rect.height });
              x += width;
            }
            return [{ key: "bar", rect, slots }];
          },
        }
      : {}),
    split: (t) => t.split,
    stackOf: (t, pane) => stacksOf(t).find((s) => s.members.includes(pane)) ?? null,
    release(t, s) {
      if (s.kind === "stack") {
        const stack = stacksOf(t).find((x) => x.id === s.stack.id);
        return of(removePane(t.split, stack?.active ?? s.stack.active), stacksOf(t).filter((x) => x !== stack));
      }
      const stack = stacksOf(t).find((x) => x.members.includes(s.pane));
      if (!stack) return of(removePane(t.split, s.pane), stacksOf(t));
      const i = stack.members.indexOf(s.pane);
      const members = stack.members.filter((m) => m !== s.pane);
      if (members.length === 0) return of(removePane(t.split, s.pane), stacksOf(t).filter((x) => x !== stack));
      const active = stack.active === s.pane ? (members[i] ?? members[i - 1]!) : stack.active;
      const was = stack.active;
      return of(
        mapKeys(t.split, (k) => (k === was ? active : k)),
        stacksOf(t).map((x) => (x === stack ? { id: stack.id, members, active } : x)),
      );
    },
    beside(released, s, at, side) {
      const split = splitPane(released.split, at, drawnOf(s), side);
      return of(split, s.kind === "pane" ? stacksOf(released) : [...stacksOf(released), s.stack]);
    },
    swap(t, s, at) {
      if (s.kind === "stack") {
        const x = stacksOf(t).find((st) => st.id === s.stack.id)?.active ?? s.stack.active;
        return of(mapKeys(t.split, (k) => (k === x ? at : k === at ? x : k)), stacksOf(t));
      }
      const x = s.pane;
      const trade = (k: K): K => (k === x ? at : k === at ? x : k);
      return of(
        mapKeys(t.split, trade),
        stacksOf(t).map((st) => ({ id: st.id, members: st.members.map(trade), active: trade(st.active) })),
      );
    },
    join(released, s, at, index) {
      const moving = membersOf(s);
      const target = stacksOf(released).find((x) => x.members.includes(at));
      const into = target ? target.members : [at];
      const i = Math.max(0, Math.min(into.length, index ?? into.length));
      const members = [...into.slice(0, i), ...moving, ...into.slice(i)];
      const active = moving[0]!;
      const drawn = target ? target.active : at;
      const ids = new Set(stacksOf(released).map((x) => x.id));
      let id = target?.id ?? `stack:${String(at)}`;
      for (let n = 2; !target && ids.has(id); n++) id = `stack:${String(at)}:${n}`;
      const stack: TilingStack<K> = { id, members, active };
      return of(
        mapKeys(released.split, (k) => (k === drawn ? active : k)),
        target ? stacksOf(released).map((x) => (x === target ? stack : x)) : [...stacksOf(released), stack],
      );
    },
    normalize(t) {
      const kept = stacksOf(t).filter((s) => s.members.length >= 2);
      return kept.length === stacksOf(t).length ? t : of(t.split, kept);
    },
  };
}
