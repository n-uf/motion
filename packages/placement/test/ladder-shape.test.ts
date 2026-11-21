/**
 * `controlLadder`, the shape of what it generates: a fixed number of forms for a control and tier count, ranks spaced by
 * step type, `hides`, and the solver passing over a form that doesn't shorten the stack.
 */
import { describe, expect, it } from "vitest";
import { controlLadder, fitStack, type ControlLadderSpec } from "../src/stack";
import { seeded } from "./stack-fixture";
import { barAt, foldAt, formsOf, groupItem, menuAt, randomSpec, shapeOf, tierEnd, walk } from "./ladder-fixture";

const hand: ControlLadderSpec = { controls: [{ id: "a", tiers: [50, 30] }, { id: "b", tiers: [40, 24] }, { id: "c", tiers: [60, 20] }], gap: 4, grip: 10, more: 16, cross: 28, column: { icons: 90 } };

describe("5. fixed shape: the form count is a function of the control count and the tier count alone", () => {
  it("n controls and T tiers give n * T + 2 forms, whatever the lengths, over a sweep of specs", () => {
    const rand = seeded(7);
    for (let i = 0; i < 60; i++) {
      const spec = randomSpec(rand, { strict: i % 2 === 0, n: 1 + (i % 5), tiers: 1 + (i % 4) });
      const s = shapeOf(spec);
      const row = controlLadder(spec).row;
      expect(row.length, `n ${s.n}, T ${s.T}`).toBe(s.n * s.T + 2);
      expect(row.length - 1).toBe(menuAt(s));
      expect(row[foldAt(s)]!.kind).toBe("fold");
      expect(row[menuAt(s)]!.kind).toBe("menu");
      // The lengths change nothing about the shape: all zero, or all equal.
      const flat = { ...spec, controls: spec.controls.map((c) => ({ ...c, tiers: c.tiers.map(() => 0) })), gap: 0, grip: 0, more: 0 };
      expect(controlLadder(flat).row.length).toBe(row.length);
      const same = { ...spec, controls: spec.controls.map((c) => ({ ...c, tiers: c.tiers.map(() => 30) })) };
      expect(controlLadder(same).row.map((f) => [f.kind, f.rank ?? 0, f.hides?.length ?? 0])).toEqual(row.map((f) => [f.kind, f.rank ?? 0, f.hides?.length ?? 0]));
    }
  });

  it("every form is emitted even when it is no shorter than the one before", () => {
    const spec: ControlLadderSpec = { controls: [{ id: "a", tiers: [30, 30, 30] }, { id: "b", tiers: [30, 30, 30] }], more: 99, cross: 28 };
    const row = controlLadder(spec).row;
    expect(row.length).toBe(2 * 3 + 2);
    expect(row.map((f) => f.main.min)).toEqual([60, 60, 60, 60, 60, 129, 99, 0]);
  });

  it("no controls: no forms; one control: its tier steps, then fold and menu", () => {
    expect(controlLadder({ controls: [], more: 10, cross: 28 }).row).toEqual([]);
    const one = controlLadder({ controls: [{ id: "a", tiers: [40, 30, 20] }], grip: 8, more: 12, cross: 28 }).row;
    expect(one.map((f) => [f.kind, f.main.min, f.hides ?? []])).toEqual([
      ["row", 48, []],
      ["row", 38, []],
      ["row", 28, []],
      ["fold", 20, ["a"]],
      ["menu", 0, []],
    ]);
  });

  it("tiers it doesn't list repeat the last one; a missing length is 0", () => {
    const row = controlLadder({ controls: [{ id: "a", tiers: [40, 30, 20] }, { id: "b", tiers: [10] }, { id: "c", tiers: [] }], more: 5, cross: 28 }).row;
    // Tier 0: 40 + 10 + 0. Steps in fold order (c, b, a): c and b unchanged, a to 30; then a to 20 at tier 2 (c, b first).
    expect(row.slice(0, 7).map((f) => f.main.min)).toEqual([50, 50, 50, 40, 40, 40, 30]);
  });
});

describe("the generated ladder", () => {
  const { row, column } = controlLadder(hand);

  it("hand case: lengths, kinds, ranks and hides, controls a b c, c folding first", () => {
    expect(row.map((f) => [f.kind, f.main.min, f.main.natural, f.rank ?? 0, f.hides ?? []])).toEqual([
      ["row", 168, 168, 0, []],
      ["row", 128, 128, 100, []],
      ["row", 112, 112, 100 + 1 / 3, []],
      ["row", 92, 92, 100 + 2 / 3, []],
      ["row", 84, 84, 400 + 1 / 3, ["c"]],
      ["row", 56, 56, 400 + 2 / 3, ["b", "c"]],
      ["fold", 26, 26, 500, ["a", "b", "c"]],
      ["menu", 0, 0, 600, []],
    ]);
    expect(row.filter((f) => f.kind !== "menu").every((f) => f.cross.natural === 28 && f.grip === 10 && !f.setsCross && !f.wrap)).toBe(true);
  });

  it("foldOrder: a higher number folds first, ties to the later control", () => {
    const folded = (foldOrder: (number | undefined)[]) =>
      controlLadder({ ...hand, controls: hand.controls.map((c, i) => ({ ...c, foldOrder: foldOrder[i] })) }).row.filter((f) => f.hides && f.hides.length === 1).map((f) => f.hides![0]);
    expect(folded([undefined, undefined, undefined])).toEqual(["c"]);
    expect(folded([9, 1, 2])).toEqual(["a"]);
    expect(folded([5, 5, 5])).toEqual(["c"]);
    expect(folded([3, 3, 1])).toEqual(["b"]);
  });

  it("keep lifts the partial folds, the fold and the menu above every group of a lower level; tier steps stay", () => {
    const kept = controlLadder({ ...hand, keep: 1 }).row;
    expect(kept.map((f) => f.rank ?? 0).slice(0, 4)).toEqual(row.map((f) => f.rank ?? 0).slice(0, 4));
    expect(kept.slice(4).map((f) => f.rank)).toEqual(row.slice(4).map((f) => 1000 + f.rank!));
    // Another group of the bar gives way entirely before the kept one folds a control.
    const loose = (id: string, used: number) => groupItem({ id, spec: hand }, used);
    const pinned = { id: "p", used: 0, forms: kept };
    const fit = fitStack(barAt([pinned, loose("q", 1)], 60));
    expect(fit.items.map((p) => [p.id, p.form])).toEqual([["p", 6], ["q", 7]]);
  });

  it("the column form: an icons strip, then the menu", () => {
    expect(column!.map((f) => [f.kind, f.main.min, f.cross.natural])).toEqual([["icons", 90, 28], ["menu", 0, 0]]);
    expect(controlLadder({ ...hand, column: { icons: 70, cross: 24 } }).column![0]!.cross.natural).toBe(24);
    expect(controlLadder({ ...hand, column: undefined }).column).toBeUndefined();
  });

  it("ranks never go down along the ladder, and the step types are spaced apart", () => {
    const rand = seeded(5);
    for (let i = 0; i < 40; i++) {
      const spec = randomSpec(rand, { strict: i % 2 === 0, n: 1 + (i % 4), tiers: 1 + (i % 5) });
      const s = shapeOf(spec);
      const forms = controlLadder(spec).row;
      const ranks = forms.map((f) => f.rank ?? 0);
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
      expect(Math.max(...ranks.slice(0, tierEnd(s) + 1))).toBeLessThan(Math.min(...ranks.slice(tierEnd(s) + 1)));
    }
  });
});

describe("the solver passes over a form that doesn't shorten", () => {
  // A big `more` cell: a partial fold that hides one 10 px control for a 40 px cell is longer than the row it leaves.
  const spec: ControlLadderSpec = { controls: [{ id: "a", tiers: [30, 20] }, { id: "b", tiers: [30, 20] }], gap: 4, more: 40, cross: 28 };
  const g = { id: "g", spec };

  it("hand case: the partial fold that is longer is never drawn; the next shorter form is taken, and growing comes back", () => {
    const row = controlLadder(spec).row;
    expect(row.map((f) => f.main.min)).toEqual([64, 54, 44, 60, 40, 0]);
    // Forms: 0 (64), 1 (54), 2 (44), 3 = partial (60: longer than 44), 4 = fold (40), 5 = menu.
    const items = [groupItem(g, 0)];
    const fits = walk(items, [64, 54, 44, 43, 41, 40]);
    expect(fits.map((f) => f.items[0]!.form)).toEqual([0, 1, 2, 4, 4, 4]);
    expect(fits[3]!.steps).toEqual([{ id: "g", from: 0, to: 1 }, { id: "g", from: 1, to: 2 }, { id: "g", from: 2, to: 4 }]);
    // Growing back: 44 brings form 2 back, never form 3.
    const grown = walk(items, [41, 43, 44, 54, 64], fits[5]);
    expect(grown.map((f) => f.items[0]!.form)).toEqual([4, 4, 2, 1, 0]);
  });

  it("form indexes stay the same when a length changes", () => {
    // The same group with one control a little longer: same count of forms, the same kinds at the same indexes.
    const a = controlLadder(spec).row;
    const b = controlLadder({ ...spec, controls: [{ id: "a", tiers: [31, 20] }, { id: "b", tiers: [30, 19] }] }).row;
    expect(b.map((f) => f.kind)).toEqual(a.map((f) => f.kind));
    expect(formsOf(fitStack(barAt([groupItem(g, 0)], 54)))).toEqual({ g: 1 });
  });
});
