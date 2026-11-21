/**
 * `controlLadder`, what each generated form says about its controls: `StackForm.tiers` (control id to tier index, for the
 * controls the form shows). `@n-uf/docking`'s tests check the layout reporting it.
 */
import { describe, expect, it } from "vitest";
import { controlLadder, type ControlLadderSpec } from "../src/stack";
import { barGroup, seeded } from "./stack-fixture";
import { randomSpec, shapeOf } from "./ladder-fixture";

const spec: ControlLadderSpec = { controls: [{ id: "a", tiers: [50, 30, 20] }, { id: "b", tiers: [40, 24] }, { id: "c", tiers: [60, 20, 10] }], gap: 4, grip: 10, more: 16, cross: 28 };
const ids = (s: ControlLadderSpec): string[] => s.controls.map((c) => c.id);

describe("a generated form says each control's tier", () => {
  it("every row form's tiers cover exactly its shown controls (all but the hidden ones); fold and menu leave it out", () => {
    const rand = seeded(11);
    for (let i = 0; i < 60; i++) {
      const s = randomSpec(rand, { strict: i % 2 === 0, n: 1 + (i % 5), tiers: 1 + (i % 4) });
      const shape = shapeOf(s);
      for (const [k, f] of controlLadder(s).row.entries()) {
        if (f.kind === "fold" || f.kind === "menu") {
          expect(f.tiers, `form ${k} (${f.kind})`).toBeUndefined();
          continue;
        }
        const shown = ids(s).filter((id) => !(f.hides ?? []).includes(id));
        expect(Object.keys(f.tiers ?? {}).sort(), `n ${shape.n}, T ${shape.T}, form ${k}`).toEqual(shown.sort());
      }
    }
  });

  it("along the tier steps one control's tier rises by one per step, in fold order; a control past its last tier stays on it", () => {
    const row = controlLadder(spec).row;
    const steps = ids(spec).length * (3 - 1);
    expect(row[0]!.tiers).toEqual({ a: 0, b: 0, c: 0 });
    const still: number[] = [];
    for (let k = 1; k <= steps; k++) {
      const before = row[k - 1]!.tiers!;
      const after = row[k]!.tiers!;
      const rose = ids(spec).filter((id) => after[id] !== before[id]);
      expect(rose.length, `step ${k}`).toBeLessThanOrEqual(1);
      if (rose.length === 0) still.push(k);
      else expect(after[rose[0]!]! - before[rose[0]!]!).toBe(1);
    }
    // Fold order is c, b, a: round one takes c, b, a to tier 1; round two takes c, b, a to tier 2; b lists two tiers, so its round-two step stays on tier 1.
    expect(row.slice(1, 4).map((f) => f.tiers)).toEqual([{ a: 0, b: 0, c: 1 }, { a: 0, b: 1, c: 1 }, { a: 1, b: 1, c: 1 }]);
    expect(still).toEqual([5]);
    expect(row[steps]!.tiers).toEqual({ a: 2, b: 1, c: 2 });
  });

  it("the partial folds keep the last tier for the controls they show", () => {
    const row = controlLadder(spec).row;
    const partial = row.filter((f) => f.kind === "row" && (f.hides?.length ?? 0) > 0);
    expect(partial.map((f) => f.hides)).toEqual([["c"], ["b", "c"]]);
    expect(partial.map((f) => f.tiers)).toEqual([{ a: 2, b: 1 }, { a: 2 }]);
  });

  it("every reported tier is a valid index into the control's own tiers, over a sweep of specs with unequal tier lists", () => {
    const rand = seeded(23);
    for (let i = 0; i < 60; i++) {
      const s = randomSpec(rand, { strict: i % 2 === 0, n: 2 + (i % 4), tiers: 1 + (i % 4) });
      // Cut some controls' lists short, or empty.
      const cut: ControlLadderSpec = { ...s, controls: s.controls.map((c, k) => ({ ...c, tiers: k === 0 && i % 3 === 0 ? [] : k % 3 === 1 ? c.tiers.slice(0, 1 + (i % 2)) : c.tiers })) };
      for (const [k, f] of controlLadder(cut).row.entries())
        for (const [id, tier] of Object.entries(f.tiers ?? {})) {
          const own = cut.controls.find((c) => c.id === id)!.tiers.length;
          expect(Number.isInteger(tier) && tier >= 0 && tier < Math.max(1, own), `form ${k}, ${id} at tier ${tier} of ${own}`).toBe(true);
        }
    }
  });

  it("a control with no tiers reports tier 0 on every row form", () => {
    const empty: ControlLadderSpec = { ...spec, controls: [{ id: "none", tiers: [] }, ...spec.controls] };
    const rows = controlLadder(empty).row.filter((f) => f.tiers !== undefined && "none" in f.tiers);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((f) => f.tiers!.none === 0)).toBe(true);
  });

  it("hand-written forms have none", () => {
    expect(barGroup("x", 0).forms.every((f) => f.tiers === undefined)).toBe(true);
  });
});
