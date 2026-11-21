/**
 * `controlLadder`, what each generated form says about its controls: `StackForm.tiers` (control id to tier index, for the
 * controls the form shows), and the scene reporting the chosen form's `tiers` in the item's layout beside `hidden`.
 */
import { describe, expect, it } from "vitest";
import { solve, type Scene } from "../src/scene";
import { controlLadder, type ControlLadderSpec } from "../src/stack";
import { seeded } from "./stack-fixture";
import { randomSpec, shapeOf } from "./ladder-fixture";
import { bar, byId, controls, group, title } from "./scene-fixture";

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

  it("along the tier steps exactly one control's tier rises by one per step, in fold order", () => {
    const row = controlLadder(spec).row;
    const steps = ids(spec).length * (3 - 1);
    expect(row[0]!.tiers).toEqual({ a: 0, b: 0, c: 0 });
    for (let k = 1; k <= steps; k++) {
      const before = row[k - 1]!.tiers!;
      const after = row[k]!.tiers!;
      const rose = ids(spec).filter((id) => after[id] !== before[id]);
      expect(rose.length, `step ${k}`).toBe(1);
      expect(after[rose[0]!]! - before[rose[0]!]!).toBe(1);
    }
    // Fold order is c, b, a: round one takes c, b, a to tier 1; round two takes c, b, a to tier 2 (b has no tier 2: it stays 2 as the ladder counts).
    expect(row.slice(1, 4).map((f) => f.tiers)).toEqual([{ a: 0, b: 0, c: 1 }, { a: 0, b: 1, c: 1 }, { a: 1, b: 1, c: 1 }]);
    expect(row[steps]!.tiers).toEqual({ a: 2, b: 2, c: 2 });
  });

  it("the partial folds keep the last tier for the controls they show", () => {
    const row = controlLadder(spec).row;
    const partial = row.filter((f) => f.kind === "row" && (f.hides?.length ?? 0) > 0);
    expect(partial.map((f) => f.hides)).toEqual([["c"], ["b", "c"]]);
    expect(partial.map((f) => f.tiers)).toEqual([{ a: 2, b: 2 }, { a: 2 }]);
  });

  it("hand-written forms have none", () => {
    expect(group("x", 0).forms.row!.every((f) => f.tiers === undefined)).toBe(true);
  });
});

describe("the scene reports the chosen form's tiers beside hidden", () => {
  const { row } = controlLadder(spec);
  const barAt = (width: number): Scene => ({
    stage: { x: 0, y: 0, width, height: 400 },
    edges: [bar("titlebar", "top", 0, ["title", "g", "controls"])],
    items: byId([title(), { id: "g", kind: "group", used: 1, forms: { row } }, controls()]),
    floats: [],
    floatKinds: ["group"],
  });

  it("every item layout along a narrowing sweep carries its chosen form's tiers and hides", () => {
    const seen = new Set<number>();
    let prev: ReturnType<typeof solve> | undefined;
    for (let w = 700; w >= 120; w -= 2) {
      const l = solve(barAt(w), prev ? { previous: prev } : {});
      prev = l;
      const g = l.items.g!;
      if (g.inMenu) continue;
      seen.add(g.form);
      expect(g.tiers).toEqual(row[g.form]!.tiers);
      expect(g.hidden).toEqual(row[g.form]!.hides ?? []);
    }
    // Tier steps, partial folds and the fold were all met.
    expect(seen.size).toBeGreaterThan(5);
    expect([...seen].some((k) => row[k]!.kind === "fold")).toBe(true);
  });

  it("a hand-written form gives no tiers", () => {
    const l = solve({ ...barAt(700), items: byId([title(), group("g", 1), controls()]) });
    expect(l.items.g!.tiers).toBeUndefined();
  });
});
