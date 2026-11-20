/**
 * `stackGaps`: one edge's drop places, fit only. Every gap is one entry in order; a gap that takes the item is exactly
 * the solve its drop makes, and one that doesn't says why.
 */
import { describe, expect, it } from "vitest";
import { fitStack, stackGaps, withItem, type StackItem } from "../src/stack";
import { barGroup, group, mix, panel, seeded, stack } from "./stack-fixture";

const fixedTitle: StackItem = { id: "title", used: 0, fixed: true, forms: [{ kind: "row", main: { min: 80, natural: 160, grows: true }, cross: { natural: 26 } }] };

describe("stackGaps", () => {
  it("an empty stack has one gap, and it lands the item at the start", () => {
    const gaps = stackGaps(stack([], 400), panel("a", 1));
    expect(gaps.map((g) => g.at)).toEqual([0]);
    const g = gaps[0]!;
    expect(g.fits).toBe(true);
    if (g.fits) expect(g.slot.y).toBe(0);
  });

  it("lifts the item out first: a reorder within the stack has a gap before each other item and after the last", () => {
    const input = stack([panel("a", 1), panel("b", 2), panel("c", 3)], 800);
    const gaps = stackGaps(input, input.items[1]!);
    expect(gaps.map((g) => g.at)).toEqual([0, 1, 2]);
    expect(gaps.every((g) => g.fits)).toBe(true);
  });

  it("each gap that fits is the solve its drop makes, with the item as the newest", () => {
    const bad: string[] = [];
    for (let seed = 1; seed <= 120; seed++) {
      const rnd = seeded(seed);
      const items = mix(rnd, 1 + Math.floor(rnd() * 5));
      const input = stack(items, 200 + Math.floor(rnd() * 600));
      const item = rnd() < 0.5 ? panel("x", 0) : group("x", 0);
      for (const g of stackGaps(input, item)) {
        if (!g.fits) continue;
        const newest = items.reduce((m, it) => Math.max(m, it.used), 0) + 1;
        const want = fitStack(withItem(input, { ...item, used: newest }, g.at));
        if (JSON.stringify(want) !== JSON.stringify(g.fit)) bad.push(`seed ${seed} gap ${g.at}: fit differs`);
        if (JSON.stringify(g.fit.items.find((p) => p.id === "x")!.rect) !== JSON.stringify(g.slot)) bad.push(`seed ${seed} gap ${g.at}: slot differs`);
        if (g.fit.items.find((p) => p.id === "x")!.kind === "menu") bad.push(`seed ${seed} gap ${g.at}: in the menu`);
        if (g.fit.notes.some((n) => n.code === "overflow")) bad.push(`seed ${seed} gap ${g.at}: overflows`);
      }
    }
    expect(bad.slice(0, 8)).toEqual([]);
  });

  it("refuses with a reason: the menu, an overflow, a squeezed fixed item", () => {
    // A bar too short for the title and a group's smallest form: the group goes to the menu.
    const short = stack([fixedTitle], 100, "row");
    expect(stackGaps(short, barGroup("g", 1)).map((g) => (g.fits ? "fits" : g.reason))).toEqual(["to-menu", "to-menu"]);
    // A group with no menu form overflows the bar instead.
    const noMenu: StackItem = { ...barGroup("g", 1), forms: barGroup("g", 1).forms.slice(0, 3) };
    expect(stackGaps(short, noMenu).map((g) => (g.fits ? "fits" : g.reason))).toEqual(["overflow", "overflow"]);
    // Room for the group only if the title shrinks below its natural length: fine down to its `main.min`.
    const room = stack([fixedTitle], 80 + 84 + 1, "row");
    expect(stackGaps(room, { ...barGroup("g", 1), forms: [barGroup("g", 1).forms[2]!] }).every((g) => g.fits)).toBe(true);
  });

  it("refuses every gap for an item it never takes", () => {
    const input = { ...stack([panel("a", 1)], 600), accepts: (it: StackItem) => it.id !== "no" };
    expect(stackGaps(input, { ...panel("no", 1) }).map((g) => (g.fits ? "fits" : g.reason))).toEqual(["not-accepted", "not-accepted"]);
    expect(stackGaps(input, { id: "none", used: 1, forms: [] }).map((g) => (g.fits ? "fits" : g.reason))).toEqual(["no-forms", "no-forms"]);
    expect(stackGaps(input, { ...panel("f", 1), fixed: true }).map((g) => (g.fits ? "fits" : g.reason))).toEqual(["fixed", "fixed"]);
  });

  it("`allows` refuses single gaps; the others keep their places", () => {
    const input = stack([panel("a", 1), panel("b", 2)], 800);
    const gaps = stackGaps(input, panel("x", 0), { allows: (_it, at) => at !== 1 });
    expect(gaps.map((g) => (g.fits ? g.at : `${g.at}:${g.reason}`))).toEqual([0, "1:not-allowed", 2]);
  });
});
