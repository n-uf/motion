/** The cross-fit rules (B1, B2), `from`, items with no forms, and the guards on odd input. */
import { describe, expect, it } from "vitest";
import { fitStack, type StackForm, type StackItem } from "../src/stack";
import { group, limits, mix, panel, seeded, stack } from "./stack-fixture";

const kinds = (items: readonly { kind: string }[]) => items.map((i) => i.kind);
const f = (kind: StackForm["kind"], main: number, cross: number, crossMin?: number): StackForm => ({ kind, main: { min: main, natural: main }, cross: { natural: cross, ...(crossMin !== undefined ? { min: crossMin } : {}) } });

describe("fitStack: cross-fit", () => {
  it("B1: a panel folding while it was the widest goes to its header, not past it to the rail", () => {
    // A is 240 wide, B 200: 180 of length is over by 10, A is older and folds; the column is now 200 wide, and a
    // header (it fits a column 100 wide) is fine there.
    const fit = fitStack(stack([panel("a", 1, 160, false, 240), panel("b", 2, 160, false, 200)], 170));
    expect(kinds(fit.items)).toEqual(["header", "open"]);
    expect(fit.cross).toBe(200);
    expect(fit.items[0]!.form).toBe(1);
    expect(fit.notes).toEqual([{ code: "form-down", id: "a", from: 0, to: 1 }]);
  });

  it("B1: without a small cross.min the same header is too wide for the narrower column and takes the rail", () => {
    const noMin = (p: StackItem): StackItem => ({ ...p, forms: p.forms.map((x) => ({ ...x, cross: { natural: x.cross.natural } })) });
    const fit = fitStack(stack([noMin(panel("a", 1, 160, false, 240)), panel("b", 2, 160, false, 200)], 170));
    expect(kinds(fit.items)).toEqual(["rail", "open"]);
  });

  it("a form steps down only when its cross.min is over the stack's cross size", () => {
    const g = (min: number): StackItem => ({ id: "g", used: 1, forms: [f("row", 30, 300, min), f("icons", 60, 28), f("menu", 0, 0)] });
    const open = panel("p", 2, 160, false, 200);
    expect(kinds(fitStack(stack([g(200), open], 600)).items)).toEqual(["row", "open"]);
    expect(kinds(fitStack(stack([g(201), open], 600)).items)).toEqual(["icons", "open"]);
    // The default min is natural.
    expect(kinds(fitStack(stack([g(200), open], 600)).items)).toEqual(kinds(fitStack(stack([{ ...g(200), forms: [f("row", 30, 200), f("icons", 60, 28), f("menu", 0, 0)] }, open], 600)).items));
  });

  it("B2: cross size never puts an item in the menu: it keeps its last drawn form and a too-wide note says so", () => {
    const wideIcons: StackItem = { id: "tools", used: 1, forms: [f("row", 30, 190), f("stacked", 78, 84), f("icons", 72, 36), f("menu", 0, 0)] };
    const fit = fitStack(stack([wideIcons], 2000));
    expect(kinds(fit.items)).toEqual(["icons"]);
    expect(fit.menu).toBeNull();
    expect(fit.cross).toBe(30);
    expect(fit.notes).toEqual([{ code: "form-down", id: "tools", from: 0, to: 2 }, { code: "too-wide", id: "tools" }]);
    // The length may still put it there.
    expect(kinds(fitStack(stack([wideIcons], 50)).items)).toEqual(["menu"]);
  });

  it("B2: the sweep never shows an item in the menu with room to spare", () => {
    const rand = seeded(41);
    for (let trial = 0; trial < 40; trial++) {
      const items = mix(rand, 1 + Math.floor(rand() * 5));
      for (let length = 40; length <= 900; length += 17) {
        const fit = fitStack(stack(items, length));
        if (!fit.menu) continue;
        // Something is in the menu: the stack is no longer than its length would take without the menu entry's help.
        const drawn = fit.items.filter((i) => i.kind !== "menu");
        const end = Math.max(0, ...drawn.map((i) => i.rect.y + i.rect.height));
        expect(end).toBeLessThanOrEqual(fit.menu.rect.y + 1e-6);
      }
    }
  });
});

describe("fitStack: the menu entry only when it helps", () => {
  it("N2: an item doesn't go into the menu when the » entry is bigger than it and nothing else can give way", () => {
    const tiny: StackItem = { id: "t", used: 1, forms: [f("rail", 24, 30), f("menu", 0, 0)] };
    const fit = fitStack({ ...stack([tiny], 20), menu: { main: 28 } });
    expect(kinds(fit.items)).toEqual(["rail"]);
    expect(fit.menu).toBeNull();
    expect(fit.notes).toEqual([{ code: "overflow", over: 4 }]);
    // With another item that can still give way, the solver goes on.
    const other: StackItem = { id: "o", used: 2, forms: [f("rail", 24, 30), f("menu", 0, 0)] };
    const both = fitStack({ ...stack([tiny, other], 20), menu: { main: 28 } });
    expect(both.items.some((i) => i.kind === "menu")).toBe(true);
  });
});

describe("fitStack: from and items with no forms", () => {
  it("A1: from is the first form the item may take; form and the notes are absolute indexes", () => {
    const folded: StackItem = { ...panel("a", 1), from: 1 };
    const long = fitStack(stack([folded, panel("b", 2)], 900));
    expect(long.items[0]).toMatchObject({ kind: "header", form: 1 });
    expect(long.notes).toEqual([]);
    // Tight: it gives way from where it started, to an index of the whole list.
    const tight = fitStack(stack([folded, panel("b", 2, 160, true)], 60));
    expect(tight.notes).toContainEqual({ code: "form-down", id: "a", from: 1, to: 3 });
    expect(tight.items[0]).toMatchObject({ kind: "menu", form: 3 });
    // Never above it: even with room to spare.
    for (let length = 0; length <= 900; length += 13) expect(fitStack(stack([folded], length)).items[0]!.form).toBeGreaterThanOrEqual(1);
  });

  it("A1: from is clamped to the item's forms, and an item that starts in the menu is in it", () => {
    expect(fitStack(stack([{ ...panel("a", 1), from: 99 }], 600)).items[0]).toMatchObject({ kind: "menu", form: 3 });
    expect(fitStack(stack([{ ...panel("a", 1), from: -4 }], 600)).items[0]).toMatchObject({ kind: "open", form: 0 });
    expect(fitStack(stack([{ ...panel("a", 1), from: NaN }], 600)).items[0]!.form).toBe(0);
    const fit = fitStack(stack([{ ...panel("a", 1), from: 3 }, panel("b", 2)], 600));
    expect(fit.menu!.items).toEqual(["a"]);
    expect(fit.notes).toContainEqual({ code: "to-menu", id: "a" });
  });

  it("A2: an item with no forms is left out of items, with a note, and menu.items always equals the items in the menu", () => {
    const none: StackItem = { id: "none", used: 0, forms: [] };
    const fit = fitStack(stack([panel("a", 1), none, group("g", 2), panel("b", 3)], 150));
    expect(fit.items.map((i) => i.id)).toEqual(["a", "g", "b"]);
    expect(fit.notes[0]).toEqual({ code: "no-forms", id: "none" });
    const rand = seeded(2);
    for (let trial = 0; trial < 60; trial++) {
      const items = mix(rand, 2 + Math.floor(rand() * 5)).flatMap((it) => (rand() < 0.2 ? [it, { id: `${it.id}-none`, used: 0, forms: [] }] : [it]));
      for (let length = 0; length <= 600; length += 23) {
        const r = fitStack(stack(items, length));
        expect(r.menu?.items ?? []).toEqual(r.items.filter((i) => i.kind === "menu").map((i) => i.id));
        expect(r.items.map((i) => i.id)).toEqual(items.filter((i) => i.forms.length > 0).map((i) => i.id));
      }
    }
  });
});

describe("fitStack: odd input", () => {
  it("N1: a limit that isn't a number never makes a non-number rect", () => {
    const items = [panel("a", 1), group("b", 2)];
    for (const cross of [{ min: NaN, max: 300, rail: 30 }, { min: 100, max: NaN, rail: 30 }, { min: 100, max: 300, rail: NaN }, { min: -Infinity, max: Infinity, rail: Infinity }, { min: 300, max: 100, rail: 30 }]) {
      const fit = fitStack({ axis: "column", length: 400, cross, items });
      expect(Number.isFinite(fit.cross)).toBe(true);
      for (const i of fit.items) for (const v of Object.values(i.rect)) expect(Number.isFinite(v)).toBe(true);
    }
    // A NaN max is no limit; max is never under min.
    expect(fitStack({ axis: "column", length: 400, cross: { min: 0, max: NaN }, items: [panel("a", 1, 160, false, 500)] }).cross).toBe(500);
    expect(fitStack({ axis: "column", length: 400, cross: { min: 300, max: 100 }, items: [panel("a", 1)] }).cross).toBe(300);
    expect(limits.rail).toBe(30);
  });
});
