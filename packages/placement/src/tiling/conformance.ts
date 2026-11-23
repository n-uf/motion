/**
 * The properties of a tiling drag's layout half, run on any `TilingTree` adapter: a host runs them on its own adapter
 * and trees, the library's tests on the reference one. Pure: no test runner, no DOM. See docs/placement.md, Entry: tiling.
 */
import { EPS, overlap, type Rect } from "../geometry";
import { PANE_SIDES } from "./regions";
import { layoutSplitTree } from "./layout";
import { panesOf } from "./split";
import { tilingDrag, type TilingDragOptions, type TilingHeld, type TilingSubject } from "./drag";

/** The properties, by name (each is a key of `TilingConformance.counts`). */
export const TILING_PROPERTIES = [
  /** `after(home).tree` is the lift tree itself, its layout the lift's, never normalized. */
  "home-is-lift",
  /** `home` is the subject's lift rect when the release takes a drawn pane away, else null. */
  "home-is-the-gap",
  /** Home lies only over base panes whose rect changed when the subject was released. */
  "home-over-changed",
  /** `after(held).layout` is `after(held).tree` laid out; the landing is the subject's rect there; a refused place is the lift. */
  "one-layout",
  /** A swap puts the partner in the subject's lift rect and the subject in the partner's, and the others keep theirs. Not checked under per-child layout callbacks (`fixed`, `fixedAcross`, `floor`), which may move the ratios. */
  "swap-exchanges",
  /** `beside` and `join` commit `normalize(change(release(tree)))`: the subject is released first, then placed. */
  "release-first",
  /** A whole stack moves as one: after any change its members are in one stack, in their order. */
  "stack-moves-whole",
  /** `normalize` changes nothing on any `after(held).tree`. */
  "normalize-idempotent",
  /** The drag never changes the tree it is given, and remembers each held place (the same place, the same object). */
  "nothing-changes",
] as const;

export type TilingProperty = (typeof TILING_PROPERTIES)[number];

/** A conformance run: whether every property held, the first failures (in words), and per property how many checks ran and failed. */
export interface TilingConformance {
  readonly ok: boolean;
  readonly failures: readonly string[];
  readonly counts: Readonly<Record<TilingProperty, { readonly checked: number; readonly failed: number }>>;
}

/** Structural equality of plain data: primitives, arrays, plain objects, Maps and Sets. */
function sameData(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (a instanceof Map || b instanceof Map) {
    if (!(a instanceof Map && b instanceof Map) || a.size !== b.size) return false;
    for (const [k, v] of a) if (!b.has(k) || !sameData(v, b.get(k))) return false;
    return true;
  }
  if (a instanceof Set || b instanceof Set) {
    if (!(a instanceof Set && b instanceof Set) || a.size !== b.size) return false;
    for (const v of a) if (!b.has(v)) return false;
    return true;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => sameData((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** A deep copy of plain data (arrays, plain objects, Maps, Sets), to prove the drag left its tree alone. */
function copy<V>(v: V): V {
  if (typeof v !== "object" || v === null) return v;
  if (v instanceof Map) return new Map([...v].map(([k, x]) => [k, copy(x)])) as V;
  if (v instanceof Set) return new Set([...v].map(copy)) as V;
  if (Array.isArray(v)) return v.map(copy) as V;
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, copy(x)])) as V;
}

const near = (a: Rect | undefined | null, b: Rect | undefined | null, by = 0.5): boolean =>
  !!a && !!b && Math.abs(a.x - b.x) <= by && Math.abs(a.y - b.y) <= by && Math.abs(a.width - b.width) <= by && Math.abs(a.height - b.height) <= by;

const show = (h: TilingHeld<unknown>): string =>
  h.kind === "home" ? "home" : `${h.kind} ${String(h.at)}${h.kind === "beside" ? ` ${h.side}` : h.kind === "join" && h.index !== undefined ? ` @${h.index}` : ""}`;

/** Every subject a tree offers: each pane drawn alone, each stack whole, and each member of a stack torn out of it. */
export function tilingSubjects<T, K>(tree: T, options: Pick<TilingDragOptions<T, K>, "ops">): TilingSubject<K>[] {
  const { ops } = options;
  const out: TilingSubject<K>[] = [];
  for (const pane of panesOf(ops.split(tree))) {
    const stack = ops.stackOf?.(tree, pane) ?? null;
    if (!stack) out.push({ kind: "pane", pane });
    else out.push({ kind: "stack", stack }, ...stack.members.map((m): TilingSubject<K> => ({ kind: "pane", pane: m })));
  }
  return out;
}

/**
 * Runs every property on every subject of every tree (`tilingSubjects`) and every held place of its drag: home, and for
 * each pane drawn in the base a swap, the four sides and a join (last and first). Trees are taken as committed ones,
 * so `normalize` (if any) must leave them as they are. Gives the first `limit` failures (default 20) in words.
 */
export function tilingConformance<T, K>(trees: Iterable<T>, options: TilingDragOptions<T, K>, limit = 20): TilingConformance {
  const { ops, area } = options;
  const counts = Object.fromEntries(TILING_PROPERTIES.map((p) => [p, { checked: 0, failed: 0 }])) as Record<TilingProperty, { checked: number; failed: number }>;
  const failures: string[] = [];
  const norm = (t: T): T => (ops.normalize ? ops.normalize(t) : t);
  const lay = (t: T) => layoutSplitTree(ops.split(t), area, options).panes;
  const drawnAs = (t: T, k: K): K => ops.stackOf?.(t, k)?.active ?? k;
  const callbacks = !!(options.fixed || options.fixedAcross || options.floor);
  let n = 0;
  for (const tree of trees) {
    const snapshot = copy(tree);
    for (const subject of tilingSubjects(tree, options)) {
      const name = `tree ${n}, ${subject.kind === "pane" ? `pane ${String(subject.pane)}` : `stack ${subject.stack.id}`}`;
      const check = (p: TilingProperty, ok: boolean, why: () => string): void => {
        counts[p].checked++;
        if (ok) return;
        counts[p].failed++;
        if (failures.length < limit) failures.push(`${p}: ${name}: ${why()}`);
      };
      const drag = tilingDrag(tree, subject, options);
      const key = subject.kind === "pane" ? subject.pane : subject.stack.active;
      const liftOf = (k: K): Rect | undefined => drag.lift.layout.get(drag.lift.layout.has(k) ? k : drawnAs(tree, k));
      const subjectLift = liftOf(key);

      // Home.
      const home = drag.after({ kind: "home" });
      check("home-is-lift", home.tree === tree && sameData(home.layout, drag.lift.layout) && home.refusal === null, () => "after(home) is not the lift tree laid out");
      const takes = panesOf(ops.split(drag.base.tree)).length < panesOf(ops.split(tree)).length;
      check("home-is-the-gap", takes ? near(drag.home, subjectLift, EPS) : drag.home === null, () => `home ${JSON.stringify(drag.home)}, the release ${takes ? "takes" : "takes no"} drawn pane`);
      if (drag.home) {
        for (const [pane, r] of drag.base.layout) {
          if (overlap(drag.home, r) <= EPS) continue;
          check("home-over-changed", !near(r, liftOf(pane), EPS), () => `home lies over ${String(pane)}, which the release left at ${JSON.stringify(r)}`);
        }
      }

      // Every held place on every base pane.
      const held: TilingHeld<K>[] = [{ kind: "home" }];
      for (const at of drag.base.layout.keys()) {
        held.push({ kind: "swap", at }, ...PANE_SIDES.map((side): TilingHeld<K> => ({ kind: "beside", at, side })));
        if (ops.join) held.push({ kind: "join", at }, { kind: "join", at, index: 0 });
      }
      for (const h of held) {
        const a = drag.after(h);
        check("nothing-changes", drag.after(h) === a, () => `${show(h)}: after() gave a new object for the same place`);
        check("normalize-idempotent", sameData(norm(a.tree), a.tree), () => `${show(h)}: normalize changes after().tree`);
        if (a.refusal) {
          check("one-layout", a.tree === tree && a.landing === null && a.moved.length === 0, () => `${show(h)}: refused (${a.refusal!.code}) but not the lift`);
          continue;
        }
        const own = drawnAs(a.tree, key);
        check("one-layout", sameData(a.layout, lay(a.tree)) && near(a.landing, a.layout.get(own), EPS), () => `${show(h)}: the layout or the landing is not after().tree's`);
        // Per-child layout callbacks (floors, fixed lengths) read which pane is where, so a swap may move the split
        // ratios themselves: the exchange is then what those callbacks make of it, and is not checked.
        if (h.kind === "swap" && !callbacks) {
          const partner = drawnAs(a.tree, h.at);
          const exchanged = near(a.layout.get(partner), subjectLift) && near(a.layout.get(own), liftOf(h.at));
          const others = [...a.layout].every(([p, r]) => p === own || p === partner || near(r, liftOf(p)));
          check("swap-exchanges", exchanged && others, () => `${show(h)}: partner at ${JSON.stringify(a.layout.get(partner))} (subject was ${JSON.stringify(subjectLift)}), subject at ${JSON.stringify(a.layout.get(own))}${others ? "" : ", and another pane moved"}`);
        }
        if (h.kind === "beside" || h.kind === "join") {
          const released = ops.release(tree, subject);
          const changed = h.kind === "beside" ? ops.beside(released, subject, h.at, h.side, { kind: "half" }) : ops.join!(released, subject, h.at, h.index);
          check("release-first", sameData(a.tree, norm(changed)), () => `${show(h)}: after().tree is not normalize(change(release(tree)))`);
        }
        if (subject.kind === "stack" && h.kind !== "home") {
          const ms = subject.stack.members;
          const st = ops.stackOf?.(a.tree, ms[0]!) ?? null;
          const i = st ? st.members.indexOf(ms[0]!) : -1;
          const whole = !!st && ms.every((m, j) => st.members[i + j] === m);
          check("stack-moves-whole", whole, () => `${show(h)}: the stack's members are not together in one stack`);
        }
      }
      check("nothing-changes", sameData(tree, snapshot), () => "the drag changed the tree it was given");
    }
    n++;
  }
  return { ok: failures.length === 0 && Object.values(counts).every((c) => c.failed === 0), failures, counts };
}
