/**
 * What a divider may span, what the lengths it writes cover, and what a reset is: a divider spans only items drawn but
 * not growing; any growing item that isn't an end (a fixed one, a `wrap` form that grows) ends the chain; the items
 * that share spare length are exactly the items whose length is written; `resetBetween` is a no-op on an untouched pair;
 * a collapsed item that was never sized gets the length that keeps its proportion for when it reopens.
 */
import { describe, expect, it } from "vitest";
import { dividers, fitStack, resetBetween, resetLengths, resizeBetween, type StackFit, type StackInput, type StackItem } from "../src/stack";
import { group, mix, panel, seeded, stack } from "./stack-fixture";

const mainOf = (fit: StackFit, id: string): number => {
  const p = fit.items.find((i) => i.id === id)!;
  return fit.axis === "column" ? p.rect.height : p.rect.width;
};
const mains = (fit: StackFit): Record<string, number> => Object.fromEntries(fit.items.map((p) => [p.id, mainOf(fit, p.id)]));
const sum = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0);
const folded = (id: string, used: number, natural = 160): StackItem => ({ ...panel(id, used, natural), from: 1 });
/** A column of words that grows: two rows of 40 at the 240 cross the panels make; icons after it. */
const words = (id: string, used: number): StackItem => ({
  id,
  used,
  forms: [
    { kind: "wrap", main: { min: 0, natural: 0, grows: true }, cross: { natural: 0 }, wrap: { widths: [100, 100, 100, 100], row: 20 } },
    { kind: "icons", main: { min: 30, natural: 30 }, cross: { natural: 28 } },
    { kind: "menu", main: { min: 0, natural: 0 }, cross: { natural: 0 } },
  ],
});
const slack = (id: string, used: number): StackItem => ({
  id,
  used,
  forms: [
    { kind: "open", main: { min: 80, natural: 150, grows: true }, cross: { natural: 240 } },
    { kind: "header", main: { min: 20, natural: 40 }, cross: { natural: 240, min: 100 } },
    { kind: "rail", main: { min: 24, natural: 24 }, cross: { natural: 30 } },
    { kind: "menu", main: { min: 0, natural: 0 }, cross: { natural: 0 } },
  ],
});

describe("a growing item that is not an end ends the chain", () => {
  const fixedGrower: StackItem = { ...panel("f", 2), fixed: true };

  it("a fixed growing item between two open ones: no divider across it, and no resize across it", () => {
    for (const length of [700, 330]) {
      const input = stack([panel("a", 1), fixedGrower, panel("c", 3)], length);
      expect(dividers(input, fitStack(input))).toEqual([]);
      expect(resizeBetween(input, "a", "c", 40)).toBe(input);
      expect(resizeBetween(input, "a", "f", 40)).toBe(input);
      expect(resizeBetween(input, "f", "c", 40)).toBe(input);
      expect(resetBetween(input, "a", "c")).toBe(input);
    }
  });

  it("a fixed growing item at the end leaves the pairs before it", () => {
    const input = stack([panel("a", 1), panel("b", 2), fixedGrower], 700);
    expect(dividers(input, fitStack(input)).map((d) => [d.before, d.after])).toEqual([["a", "b"]]);
    const fit = fitStack(input);
    const next = fitStack(resizeBetween(input, "a", "b", 20));
    expect(mainOf(next, "f")).toBeCloseTo(mainOf(fit, "f"), 6);
  });

  it("a wrap form that grows is never an end and ends the chain", () => {
    const input = stack([panel("a", 1), words("w", 2), panel("c", 3)], 700);
    expect(dividers(input, fitStack(input))).toEqual([]);
    expect(resizeBetween(input, "a", "c", 25)).toBe(input);
    expect(resizeBetween(input, "a", "w", 25)).toBe(input);
    expect(resizeBetween(input, "w", "c", 25)).toBe(input);
  });

  it("a header, a rail icon, a group or a folded item between two open ones does not end it", () => {
    const input = stack([panel("a", 1), folded("b", 2), group("g", 3), panel("c", 4)], 700);
    expect(dividers(input, fitStack(input)).map((d) => [d.before, d.after])).toEqual([["a", "c"]]);
  });
});

describe("the items that share spare length keep their drawn size when their neighbors are dragged, and get no length", () => {
  it("a wrap form that grows keeps its drawn length when its neighbors are dragged, with room and short", () => {
    for (const length of [900, 700, 420, 330]) {
      const input = stack([panel("a", 1, 200), panel("c", 2, 100), words("w", 3)], length);
      const fit = fitStack(input);
      expect(fit.items.map((p) => p.kind)).toEqual(["open", "open", "wrap"]);
      for (const delta of [-60, 30, 400]) {
        const next = fitStack(resizeBetween(input, "a", "c", delta));
        expect(mainOf(next, "w")).toBeCloseTo(mainOf(fit, "w"), 5);
        expect(sum(Object.values(mains(next)))).toBeCloseTo(sum(Object.values(mains(fit))), 5);
      }
    }
  });

  it("a wrap form is never resized: the verbs name only its neighbors", () => {
    const input = stack([panel("a", 1, 200), panel("c", 2, 100), words("w", 3)], 700);
    const fit = fitStack(input);
    const moved = resizeBetween(input, "a", "c", -10);
    expect(moved.items.find((it) => it.id === "w")).toBe(input.items.find((it) => it.id === "w"));
    expect(mainOf(fitStack(moved), "w")).toBeCloseTo(mainOf(fit, "w"), 5);
    expect(dividers(input, fit).map((d) => [d.before, d.after])).toEqual([["a", "c"]]);
  });

  it("only the pair is written: every other item, growing or not, is the object it was and draws as it did", () => {
    const input = stack([panel("a", 1, 200), group("g", 2), panel("c", 3, 100), words("w", 4), { ...panel("f", 5), fixed: true }], 1100);
    const next = resizeBetween(input, "a", "c", 20);
    const fit = fitStack(input);
    const after = fitStack(next);
    for (const [i, it] of input.items.entries()) {
      if (it.id === "a" || it.id === "c") expect(next.items[i]!.length?.column).toBeDefined();
      else {
        expect(next.items[i]).toBe(it);
        expect(mainOf(after, it.id)).toBeCloseTo(mainOf(fit, it.id), 6);
      }
    }
  });
});

describe("resetBetween on a pair nobody touched", () => {
  it("is a no-op in every regime", () => {
    const rand = seeded(61);
    let checked = 0;
    for (let trial = 0; trial < 300; trial++) {
      const axis = rand() < 0.5 ? "column" : "row";
      const base = mix(rand, 2 + Math.floor(rand() * 5)).map((it, i) => (rand() < 0.4 ? slack(`s${i}`, it.used) : it));
      const input = stack(base, 100 + Math.floor(rand() * 800), axis);
      const fit = fitStack(input);
      for (const d of dividers(input, fit)) {
        expect(resetBetween(input, d.before, d.after)).toBe(input);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(150);
  });

  it("short of room it splits least + (natural - least) * s with one shared s", () => {
    // Two panels, least 90, naturals 100 and 300; 280 long: s = (280 - 180) / (400 - 180)
    const input = stack([panel("a", 1, 100), panel("b", 2, 300)], 280);
    const fit = fitStack(input);
    const dragged = resizeBetween(input, "a", "b", 40);
    expect(mainOf(fitStack(dragged), "a")).toBeCloseTo(mainOf(fit, "a") + 40, 5);
    const s = (280 - 180) / (400 - 180);
    const reset = fitStack(resetBetween(dragged, "a", "b"));
    expect(mainOf(reset, "a")).toBeCloseTo(90 + 10 * s, 5);
    expect(mainOf(reset, "b")).toBeCloseTo(90 + 210 * s, 5);
  });

  it("with room it splits the combined length in proportion to the naturals", () => {
    const input = stack([panel("a", 1, 100), panel("b", 2, 300)], 800);
    const dragged = resizeBetween(input, "a", "b", 60);
    const reset = fitStack(resetBetween(dragged, "a", "b"));
    expect(mainOf(reset, "a")).toBeCloseTo(200, 5);
    expect(mainOf(reset, "b")).toBeCloseTo(600, 5);
  });
});

describe("resetLengths", () => {
  it("counts a change only when an item has a length for the stack's axis", () => {
    const input = stack([panel("a", 1), panel("b", 2)], 600);
    const other: StackInput = { ...input, items: input.items.map((it) => ({ ...it, length: { row: 50 } })) };
    expect(resetLengths(other)).toBe(other);
    const empty: StackInput = { ...input, items: input.items.map((it) => ({ ...it, length: {} })) };
    expect(resetLengths(empty)).toBe(empty);
    const some: StackInput = { ...input, items: [{ ...input.items[0]!, length: { column: 90 } }, input.items[1]!] };
    const reset = resetLengths(some);
    expect(reset).not.toBe(some);
    expect(reset.items[1]).toBe(input.items[1]);
  });
});

describe("a collapsed item that was never sized", () => {
  it("gets no length from a drag of its neighbors, and keeps its proportion when it reopens", () => {
    for (const length of [700, 450, 330]) {
      // (A short length reads an ask under its least as the least, so `c` dragged under it there is another matter.)
      for (const delta of length === 700 ? [-20, 20] : [-20]) {
        const input = stack([panel("a", 1, 200), folded("b", 2, 160), panel("c", 3, 100)], length);
        const next = resizeBetween(input, "a", "c", delta);
        expect(next).not.toBe(input);
        expect(next.items[1]).toBe(input.items[1]);
        expect(next.items[1]!.length).toBeUndefined();
        // Reopened, it is drawn as it is when nobody resized the others: the pair's asks still add up to what they did.
        const open = (s: StackInput): StackInput => ({ ...s, items: s.items.map((it) => (it.id === "b" ? { ...it, from: undefined } : it)) });
        const was = fitStack(open(input));
        const now = fitStack(open(next));
        expect(mainOf(now, "b")).toBeCloseTo(mainOf(was, "b"), 5);
        expect(mainOf(now, "a") + mainOf(now, "c")).toBeCloseTo(mainOf(was, "a") + mainOf(was, "c"), 5);
      }
    }
  });

  it("dragged to an end's least with room, it still gets none, and reopened it asks its natural next to the pair's asks", () => {
    const input = stack([panel("a", 1, 200), folded("b", 2, 160), panel("c", 3, 100)], 700);
    const next = resizeBetween(input, "a", "c", 10_000);
    expect(mainOf(fitStack(next), "c")).toBeCloseTo(90, 6);
    expect(next.items[1]).toBe(input.items[1]);
    expect(mainOf(fitStack(next), "b")).toBe(28);
    const reopened: StackInput = { ...next, items: next.items.map((it) => (it.id === "b" ? { ...it, from: undefined } : it)) };
    const fit = fitStack(reopened);
    // `c` is held at its least; `a` and `b` share the rest in proportion to their asks (a's written length, b's natural).
    expect(mainOf(fit, "c")).toBeCloseTo(90, 6);
    expect(mainOf(fit, "b") / mainOf(fit, "a")).toBeCloseTo(160 / next.items[0]!.length!.column!, 6);
    expect(mainOf(fit, "a") + mainOf(fit, "b") + mainOf(fit, "c")).toBeCloseTo(700, 6);
  });

  it("a collapsed item with a length of its own keeps it, and a short stack writes nothing for it", () => {
    const input = stack([panel("a", 1, 200), { ...folded("b", 2, 160), length: { column: 321 } }, panel("c", 3, 100)], 700);
    expect(resizeBetween(input, "a", "c", 20).items[1]!.length?.column).toBe(321);
    const short = stack([panel("a", 1, 200), folded("b", 2, 160), panel("c", 3, 300)], 400);
    expect(fitStack(short).items.map((p) => p.kind)).toEqual(["open", "header", "open"]);
    expect(resizeBetween(short, "a", "c", 10).items[1]!.length).toBeUndefined();
  });

  it("an item in the menu, a group and a fixed item get none", () => {
    const input = stack([panel("a", 1, 200), group("g", 2), panel("c", 3, 100), { ...folded("f", 4), fixed: true }], 900);
    const next = resizeBetween(input, "a", "c", 20);
    expect(next.items.find((it) => it.id === "g")!.length).toBeUndefined();
    expect(next.items.find((it) => it.id === "f")!.length).toBeUndefined();
  });
});
