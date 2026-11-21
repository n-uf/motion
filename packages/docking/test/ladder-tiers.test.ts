/**
 * `controlLadder`'s `StackForm.tiers` in the dock state: the chosen form's `tiers` reported in the item's layout beside
 * `hidden`, on every path that lays an item out.
 */
import { controlLadder, type ControlLadderSpec } from "@n-uf/placement/stack";
import { describe, expect, it } from "vitest";
import { solve, type DockState } from "../src";
import { WINDOW_A, winState } from "../src/testing";
import { bar, byId, controls, group, title } from "./fixture";

const spec: ControlLadderSpec = { controls: [{ id: "a", tiers: [50, 30, 20] }, { id: "b", tiers: [40, 24] }, { id: "c", tiers: [60, 20, 10] }], gap: 4, grip: 10, more: 16, cross: 28 };

describe("the dock state reports the chosen form's tiers beside hidden", () => {
  const { row } = controlLadder(spec);
  const barAt = (width: number): DockState => ({
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

describe("every path that reports hidden from a form reports tiers from the same form", () => {
  /** `s` with every column form of every item carrying its own `hides` and `tiers` (an index tells one from another). */
  const tiered = (s: DockState): DockState => ({
    ...s,
    items: Object.fromEntries(
      Object.entries(s.items).map(([id, it]) => [id, it.forms.column ? { ...it, forms: { ...it.forms, column: it.forms.column.map((f, k) => ({ ...f, hides: [`${id}-h${k}`], tiers: { [`${id}-c`]: k } })) } } : it]),
    ),
  });
  /** Every drawn item's `hidden` and `tiers` equal its chosen column form's; returns the kinds of path that were met. */
  function matches(l: ReturnType<typeof solve>, s: DockState): Set<string> {
    const met = new Set<string>();
    for (const [id, p] of Object.entries(l.items)) {
      if (p.inMenu || p.axis !== "column") continue;
      const f = s.items[id]!.forms.column![p.form]!;
      expect(p.hidden, `${id} hidden`).toEqual(f.hides);
      expect(p.tiers, `${id} tiers`).toEqual(f.tiers);
      met.add(p.floating ? "float" : p.rides ? "rider" : p.rail ? "rail" : "column");
    }
    return met;
  }

  it("a column, a float, a rider's bar and a rail segment", () => {
    const base = { size: 300 } as const;
    const met = new Set<string>();
    const floating = tiered(winState(WINDOW_A, { ...base, columns: { left: [["pages"]], right: [["findings"]] }, floats: [{ id: "annotations", rect: { x: 400, y: 200, width: 260, height: 300 } }] }));
    for (const x of matches(solve(floating), floating)) met.add(x);
    const rider = tiered(winState(WINDOW_A, { ...base, handFold: "ride", columns: { left: [["annotations"], ["findings"]], right: [["pages"]] }, from: { findings: 1 } }));
    for (const x of matches(solve(rider), rider)) met.add(x);
    const rail = tiered(winState(WINDOW_A, { ...base, columns: { left: [["annotations"], ["findings"]], right: [["pages"]] }, from: { findings: 1 } }));
    for (const x of matches(solve(rail), rail)) met.add(x);
    expect([...met].sort()).toEqual(["column", "float", "rail", "rider"]);
  });
});
