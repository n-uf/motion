/** ./tiling, a drag's layout half: `tilingDrag` over the reference adapter, its refusals, and `tilingConformance`. */
import { describe, expect, it } from "vitest";
import type { Rect } from "../index";
import {
  panesOf,
  splitTreeOps,
  tilingConformance,
  tilingDrag,
  type StackedSplit,
  type TilingDragOptions,
  type TilingStack,
  type TilingSubject,
  type TilingTree,
} from "../src/tiling";
import { randomTree, seeded } from "./tiling-fixture";
import { shuffle } from "./stack-fixture";

const ops = splitTreeOps<string>();
const AREA: Rect = { x: 0, y: 0, width: 800, height: 500 };
const opts = (more: Partial<TilingDragOptions<StackedSplit<string>, string>> = {}): TilingDragOptions<StackedSplit<string>, string> => ({ ops, area: AREA, min: 40, ...more });

/** A column of a over b on the left (40 %), c on the right: the sketch's three panes. */
const three: StackedSplit<string> = { split: { axis: "x", ratio: 0.4, a: { axis: "y", ratio: 0.5, a: { pane: "a" }, b: { pane: "b" } }, b: { pane: "c" } } };
const A: Rect = { x: 0, y: 0, width: 320, height: 250 };
const B: Rect = { x: 0, y: 250, width: 320, height: 250 };
const C: Rect = { x: 320, y: 0, width: 480, height: 500 };
const pane = (p: string): TilingSubject<string> => ({ kind: "pane", pane: p });

/** b and x stacked on the left (b drawn), c on the right. */
const stacked: StackedSplit<string> = { split: { axis: "x", ratio: 0.5, a: { pane: "b" }, b: { pane: "c" } }, stacks: [{ id: "s", members: ["b", "x"], active: "b" }] };
const stackS = stacked.stacks![0]!;

describe("tilingDrag: home and base", () => {
  it("the base is the tree with the subject released; home is the gap it leaves", () => {
    const d = tilingDrag(three, pane("a"), opts());
    expect(d.lift.layout.get("a")).toEqual(A);
    expect([...d.base.layout.keys()].sort()).toEqual(["b", "c"]);
    expect(d.base.layout.get("b")).toEqual({ x: 0, y: 0, width: 320, height: 500 });
    expect(d.home).toEqual(A);
  });

  it("home commits the lift tree itself, never normalized, and is remembered", () => {
    const d = tilingDrag(three, pane("a"), opts());
    const h = d.after({ kind: "home" });
    expect(h.tree).toBe(three);
    expect(h.layout).toEqual(d.lift.layout);
    expect(h.landing).toEqual(A);
    expect(h.moved).toEqual([]);
    expect(d.after({ kind: "home" })).toBe(h);
  });

  it("a member torn out of a stack that stays drawn leaves no gap: home is null", () => {
    const d = tilingDrag(stacked, pane("x"), opts());
    expect(d.home).toBeNull();
    expect(d.base.layout).toEqual(d.lift.layout);
    // The drawn member torn out: the stack is drawn as the next one, in the same place.
    const e = tilingDrag(stacked, pane("b"), opts());
    expect(e.home).toBeNull();
    expect(e.base.layout.get("x")).toEqual(e.lift.layout.get("b"));
  });

  it("a whole stack leaves a gap", () => {
    const d = tilingDrag(stacked, { kind: "stack", stack: stackS }, opts());
    expect(d.home).toEqual({ x: 0, y: 0, width: 400, height: 500 });
    expect([...d.base.layout.keys()]).toEqual(["c"]);
  });

  it("with no drag nothing changes: the tree given is never changed", () => {
    const frozen = JSON.parse(JSON.stringify(three)) as StackedSplit<string>;
    const deepFreeze = (o: object): void => {
      Object.freeze(o);
      for (const v of Object.values(o)) if (v && typeof v === "object") deepFreeze(v);
    };
    deepFreeze(frozen);
    const d = tilingDrag(frozen, pane("a"), opts());
    for (const at of ["b", "c"]) {
      d.after({ kind: "swap", at });
      d.after({ kind: "beside", at, side: "left" });
      d.after({ kind: "join", at });
    }
    expect(frozen).toEqual(three);
    expect(d.after({ kind: "home" }).tree).toBe(frozen);
  });
});

describe("tilingDrag: after(held)", () => {
  it("a swap reopens the subject's old place for the partner: the neighbor gives the room back", () => {
    const d = tilingDrag(three, pane("a"), opts());
    const s = d.after({ kind: "swap", at: "c" });
    expect(s.refusal).toBeNull();
    expect(s.layout.get("c")).toEqual(A);
    expect(s.layout.get("a")).toEqual(C);
    expect(s.layout.get("b")).toEqual(B);
    expect(s.landing).toEqual(C);
    // Only the partner moves from where it was at the lift; b grew in the base, and is back at its lift rect.
    expect(s.moved).toEqual([{ pane: "c", from: C, to: A }]);
    expect(d.base.layout.get("b")).not.toEqual(B);
    expect(d.after({ kind: "swap", at: "c" })).toBe(s);
  });

  it("a side drop places the subject in the released tree, half and half", () => {
    const d = tilingDrag(three, pane("a"), opts());
    const s = d.after({ kind: "beside", at: "c", side: "bottom" });
    expect(s.refusal).toBeNull();
    expect(s.layout.get("c")).toEqual({ x: 320, y: 0, width: 480, height: 250 });
    expect(s.landing).toEqual({ x: 320, y: 250, width: 480, height: 250 });
    // b fills the column the release left.
    expect(s.layout.get("b")).toEqual({ x: 0, y: 0, width: 320, height: 500 });
    expect(s.tree).toEqual({ split: { axis: "x", ratio: 0.4, a: { pane: "b" }, b: { a: { pane: "c" }, b: { pane: "a" }, axis: "y", ratio: 0.5 } } });
  });

  it("beside and join take the released tree, swap the lift tree", () => {
    const calls: string[] = [];
    const spy: TilingTree<StackedSplit<string>, string> = {
      ...ops,
      release: (t, s) => {
        calls.push(t === three ? "release(lift)" : "release(?)");
        return ops.release(t, s);
      },
      beside: (t, s, at, side, size) => {
        calls.push(panesOf(t.split).includes("a") ? "beside(with subject)" : "beside(released)");
        return ops.beside(t, s, at, side, size);
      },
      swap: (t, s, at) => {
        calls.push(t === three ? "swap(lift)" : "swap(?)");
        return ops.swap(t, s, at);
      },
      join: (t, s, at, index) => {
        calls.push(panesOf(t.split).includes("a") ? "join(with subject)" : "join(released)");
        return ops.join!(t, s, at, index);
      },
    };
    const d = tilingDrag(three, pane("a"), opts({ ops: spy }));
    d.after({ kind: "beside", at: "c", side: "left" });
    d.after({ kind: "join", at: "c" });
    d.after({ kind: "swap", at: "c" });
    expect(calls).toEqual(["release(lift)", "beside(released)", "join(released)", "swap(lift)"]);
  });

  it("a whole stack moves as one: beside, swap and join keep its members together", () => {
    const d = tilingDrag(stacked, { kind: "stack", stack: stackS }, opts());
    const side = d.after({ kind: "beside", at: "c", side: "top" });
    expect(side.tree.stacks).toEqual([stackS]);
    expect(side.landing).toEqual({ x: 0, y: 0, width: 800, height: 250 });
    const swap = d.after({ kind: "swap", at: "c" });
    expect(swap.layout.get("b")).toEqual({ x: 400, y: 0, width: 400, height: 500 });
    expect(swap.layout.get("c")).toEqual({ x: 0, y: 0, width: 400, height: 500 });
    const join = d.after({ kind: "join", at: "c" });
    expect(join.tree.stacks).toEqual([{ id: "stack:c", members: ["c", "b", "x"], active: "b" }]);
    expect(join.landing).toEqual({ x: 0, y: 0, width: 800, height: 500 });
  });

  it("a lone pane swapped with a stack swaps with its drawn member: the other members stay", () => {
    const d = tilingDrag(stacked, pane("c"), opts());
    const s = d.after({ kind: "swap", at: "b" });
    expect(s.refusal).toBeNull();
    expect(s.tree.stacks).toEqual([{ id: "s", members: ["c", "x"], active: "c" }]);
    expect(s.tree.split).toEqual({ axis: "x", ratio: 0.5, a: { pane: "c" }, b: { pane: "b" } });
    expect(s.layout.get("b")).toEqual(d.lift.layout.get("c"));
    expect(s.landing).toEqual(d.lift.layout.get("b"));
  });

  it("a member torn out of a stack, swapped with a lone pane, leaves the partner in its place in the stack", () => {
    const s = tilingDrag(stacked, pane("x"), opts()).after({ kind: "swap", at: "c" });
    expect(s.tree.stacks).toEqual([{ id: "s", members: ["b", "c"], active: "b" }]);
    expect(s.tree.split).toEqual({ axis: "x", ratio: 0.5, a: { pane: "b" }, b: { pane: "x" } });
  });

  it("a member torn out and joined back at its index commits the lift tree's shape", () => {
    const d = tilingDrag(stacked, pane("x"), opts());
    const back = d.after({ kind: "join", at: "b", index: 1 });
    expect(back.refusal).toBeNull();
    expect(back.tree.stacks).toEqual([{ id: "s", members: ["b", "x"], active: "x" }]);
    expect(back.landing).toEqual(d.lift.layout.get("b"));
  });

  it("normalize is part of every after but home: a stack left with one member becomes its pane", () => {
    const d = tilingDrag(stacked, pane("x"), opts());
    const out = d.after({ kind: "beside", at: "c", side: "right" });
    expect(out.tree.stacks).toBeUndefined();
    expect(panesOf(out.tree.split)).toEqual(["b", "c", "x"]);
    expect(d.base.tree.stacks).toEqual([{ id: "s", members: ["b"], active: "b" }]);
  });
});

describe("tilingDrag: refusals", () => {
  it("names each refusal with a code, and a refused place is the lift", () => {
    const d = tilingDrag(three, pane("a"), opts({ still: (p) => p === "b" }));
    expect(d.after({ kind: "swap", at: "a" }).refusal).toEqual({ code: "self" });
    expect(d.after({ kind: "swap", at: "b" }).refusal).toEqual({ code: "still" });
    expect(d.after({ kind: "swap", at: "zz" }).refusal).toEqual({ code: "missing" });
    const r = d.after({ kind: "beside", at: "b", side: "left" });
    expect(r.refusal).toEqual({ code: "still" });
    expect(r.tree).toBe(three);
    expect(r.landing).toBeNull();
    expect(r.moved).toEqual([]);
  });

  it("a swap with the stack a member is torn from is its own place", () => {
    const d = tilingDrag(stacked, pane("x"), opts());
    expect(d.after({ kind: "swap", at: "b" }).refusal).toEqual({ code: "self" });
    expect(d.after({ kind: "join", at: "b" }).refusal).toBeNull();
  });

  it("an adapter with no join refuses every join", () => {
    const { join: _join, ...noJoin } = ops;
    void _join;
    const d = tilingDrag(three, pane("a"), opts({ ops: noJoin }));
    expect(d.after({ kind: "join", at: "c" }).refusal).toEqual({ code: "join" });
  });

  it("room along and across the split, from the base rect (canSplitPane), with the numbers", () => {
    const d = tilingDrag(three, pane("a"), opts({ gap: 8, min: 200 }));
    // b is 316 wide in the base: a left drop needs 2 * 200 + 8.
    expect(d.after({ kind: "beside", at: "b", side: "left" }).refusal).toEqual({ code: "room-along", need: 408, have: 316 });
    const flat: StackedSplit<string> = { split: { axis: "x", a: { pane: "p" }, b: { a: { pane: "q" }, b: { pane: "r" }, axis: "x" } } };
    const f = tilingDrag(flat, pane("p"), { ops, area: { x: 0, y: 0, width: 800, height: 100 }, min: 120 });
    expect(f.after({ kind: "beside", at: "q", side: "right" }).refusal).toEqual({ code: "room-across", need: 120, have: 100 });
  });

  it("fit: in the layout the release makes, a pane below min refuses the place", () => {
    // An adapter that places the subject in a sliver: the room is there, the fit is not.
    const sliver: TilingTree<StackedSplit<string>, string> = {
      ...ops,
      beside: (t, s, at, side, size) => {
        const placed = ops.beside(t, s, at, side, size);
        const thin = (n: StackedSplit<string>["split"]): StackedSplit<string>["split"] =>
          !n || "pane" in n ? n : n.ratio === 0.5 && "pane" in n.b && n.b.pane === "a" ? { ...n, ratio: 0.95 } : { ...n, a: thin(n.a)!, b: thin(n.b)! };
        return { ...placed, split: thin(placed.split) };
      },
    };
    const d = tilingDrag(three, pane("a"), opts({ ops: sliver, min: 40 }));
    expect(d.after({ kind: "beside", at: "c", side: "right" }).refusal).toEqual({ code: "fit", pane: "a" });
  });

  /** p narrow (80 px) on the left, q and r beside it. */
  const narrow: StackedSplit<string> = { split: { axis: "x", ratio: 0.1, a: { pane: "p" }, b: { axis: "x", ratio: 0.5, a: { pane: "q" }, b: { pane: "r" } } } };

  it("fit on a swap: each pane takes the other's rect, and the one that lands below min refuses it", () => {
    // q lifted onto p: q would take p's 80 px.
    expect(tilingDrag(narrow, pane("q"), opts({ min: 100 })).after({ kind: "swap", at: "p" }).refusal).toEqual({ code: "fit", pane: "q" });
    // p lifted onto q: p takes q's room, and q would take p's 80 px.
    expect(tilingDrag(narrow, pane("p"), opts({ min: 100 })).after({ kind: "swap", at: "q" }).refusal).toEqual({ code: "fit", pane: "q" });
    // With room on both sides the swap stands.
    expect(tilingDrag(narrow, pane("q"), opts({ min: 60 })).after({ kind: "swap", at: "p" }).refusal).toBeNull();
  });

  it("fit on a join: judged on the stack's rect in the layout the join makes", () => {
    // r joined to p: the stack, drawn as r, is p's 80 px.
    expect(tilingDrag(narrow, pane("r"), opts({ min: 100 })).after({ kind: "join", at: "p" }).refusal).toEqual({ code: "fit", pane: "r" });
    expect(tilingDrag(narrow, pane("r"), opts({ min: 100 })).after({ kind: "join", at: "q" }).refusal).toBeNull();
  });

  it("a subject not in the tree is an error", () => {
    expect(() => tilingDrag(three, pane("zz"), opts())).toThrow(/pane zz\) is not in the tree/);
    expect(() => tilingDrag(three, { kind: "stack", stack: { id: "gone", members: ["y", "z"], active: "y" } }, opts())).toThrow(/stack gone\) is not in the tree/);
  });
});

/** A random tree over panes 0..n-1, some drawn panes standing for a stack of 2..4 members. */
function randomStacked(rnd: () => number, n: number): StackedSplit<number> {
  const split = randomTree(rnd, n, { gap: 0.3, id: 0.3 });
  const stacks: TilingStack<number>[] = [];
  let extra = 100;
  for (const p of panesOf(split)) {
    if (rnd() >= 0.35) continue;
    const more = Array.from({ length: 1 + Math.floor(rnd() * 3) }, () => extra++);
    stacks.push({ id: `s${p}`, members: shuffle(rnd, [p, ...more]), active: p });
  }
  return stacks.length ? { split, stacks } : { split };
}

describe("tilingConformance", () => {
  const numOps = splitTreeOps<number>();
  const trees = (seed: number, count: number): StackedSplit<number>[] => {
    const rnd = seeded(seed);
    return Array.from({ length: count }, (_, i) => randomStacked(rnd, 1 + (i % 6)));
  };

  it("the reference adapter holds every property over a sweep of trees, subjects and places", () => {
    const run = tilingConformance(trees(7, 60), { ops: numOps, area: AREA, min: 30, gap: 6, handle: 2 });
    expect(run.failures).toEqual([]);
    expect(run.ok).toBe(true);
    for (const [p, c] of Object.entries(run.counts)) expect(c.checked, p).toBeGreaterThan(0);
  });

  it("and under per-child floors (the swap's exchange is then the floors' to say, and not checked)", () => {
    const run = tilingConformance(trees(11, 40), {
      ops: numOps,
      area: { x: 0, y: 0, width: 1200, height: 700 },
      min: 20,
      gap: 4,
      floor: (child) => ({ min: "pane" in child && child.pane % 2 === 0 ? 120 : 40 }),
    });
    expect(run.failures).toEqual([]);
    expect(run.counts["swap-exchanges"].checked).toBe(0);
    expect(run.counts["release-first"].checked).toBeGreaterThan(0);
    // The weaker swap property still runs: the partner lands in the subject's old slot of the split.
    expect(run.counts["swap-trades-slots"].checked).toBeGreaterThan(0);
    expect(run.counts["swap-keeps-stack-mates"].checked).toBeGreaterThan(0);
  });

  it("catches an adapter that does not release: the subject is then in the tree twice", () => {
    const keeps: TilingTree<StackedSplit<string>, string> = { ...ops, release: (t) => t };
    const run = tilingConformance([three, stacked], { ops: keeps, area: AREA, min: 10 });
    expect(run.ok).toBe(false);
    expect(run.counts["subject-once"].failed).toBeGreaterThan(0);
  });

  it("catches a swap that drops a stack partner's mates", () => {
    // A swap with a stack's drawn member that takes the subject into the split and drops the stack's other members.
    const loses: TilingTree<StackedSplit<string>, string> = {
      ...ops,
      swap: (t, s, at) => {
        const swapped = ops.swap(t, s, at);
        return s.kind === "pane" && ops.stackOf!(t, at) ? { split: swapped.split } : swapped;
      },
    };
    const run = tilingConformance([stacked], { ops: loses, area: AREA, min: 10 });
    expect(run.ok).toBe(false);
    expect(run.counts["swap-keeps-stack-mates"].failed).toBeGreaterThan(0);
  });

  it("catches an adapter that breaks a property", () => {
    // A swap that moves only the subject, and a normalize that is not idempotent.
    let n = 0;
    const broken: TilingTree<StackedSplit<string>, string> = {
      ...ops,
      swap: (t, s, at) => ops.beside(ops.release(t, s), s, at, "left", { kind: "half" }),
      normalize: (t) => ({ ...t, split: t.split && !("pane" in t.split) ? { ...t.split, ratio: 0.5 + (n++ % 2) * 0.1 } : t.split }),
    };
    const run = tilingConformance([three], { ops: broken, area: AREA, min: 10 });
    expect(run.ok).toBe(false);
    expect(run.counts["swap-exchanges"].failed).toBeGreaterThan(0);
    expect(run.counts["normalize-idempotent"].failed).toBeGreaterThan(0);
  });
});
