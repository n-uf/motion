/**
 * Stacked panels share a draggable divider: `dividers` (one per pair of nearest open growing items), `resizeBetween`
 * (one makes a neighbor longer and the other shorter by the same amount), `resetBetween` and `resetLengths`.
 */
import { describe, expect, it } from "vitest";
import { dividers, fitStack, resetBetween, resetLengths, resizeBetween, type StackFit, type StackForm, type StackInput, type StackItem } from "../src/stack";
import { group, mix, panel, seeded, stack } from "./stack-fixture";

const sum = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0);
const mainOf = (fit: StackFit, id: string): number => {
  const p = fit.items.find((i) => i.id === id)!;
  return fit.axis === "column" ? p.rect.height : p.rect.width;
};
const mains = (fit: StackFit): Record<string, number> => Object.fromEntries(fit.items.map((p) => [p.id, mainOf(fit, p.id)]));
/** A panel folded by hand: it starts at its header. */
const folded = (id: string, used: number): StackItem => ({ ...panel(id, used), from: 1 });

describe("dividers", () => {
  it("one per pair of neighboring open panels, at the boundary", () => {
    const input = stack([panel("a", 1, 200), panel("b", 2, 100), panel("c", 3, 100)], 800);
    const fit = fitStack(input);
    const list = dividers(input, fit);
    expect(list.map((d) => [d.before, d.after])).toEqual([["a", "b"], ["b", "c"]]);
    const a = fit.items[0]!.rect;
    expect(list[0]!.rect).toEqual({ x: 0, y: a.y + a.height, width: a.width, height: 0 });
    expect(list[1]!.rect.y).toBeCloseTo(a.height + fit.items[1]!.rect.height, 6);
  });

  it("the range is how far each way the divider may move: down to each neighbor's least", () => {
    const input = stack([panel("a", 1, 200), panel("b", 2, 100)], 600);
    const fit = fitStack(input);
    const d = dividers(input, fit)[0]!;
    expect(d.range.min).toBeCloseTo(-(mainOf(fit, "a") - 90), 6);
    expect(d.range.max).toBeCloseTo(mainOf(fit, "b") - 90, 6);
    expect(d.range.min).toBeLessThanOrEqual(0);
    expect(d.range.max).toBeGreaterThanOrEqual(0);
  });

  it("a collapsed panel between two open ones: one divider, on the collapsed panel's far edge", () => {
    const input = stack([panel("a", 1), folded("b", 2), panel("c", 3)], 600);
    const fit = fitStack(input);
    expect(fit.items.map((p) => p.kind)).toEqual(["open", "header", "open"]);
    const list = dividers(input, fit);
    expect(list.map((d) => [d.before, d.after])).toEqual([["a", "c"]]);
    const b = fit.items[1]!.rect;
    expect(list[0]!.rect.y).toBeCloseTo(b.y + b.height, 6);
    expect(list[0]!.rect.height).toBe(0);
  });

  it("several collapsed panels between: still one, on the last one's far edge", () => {
    const input = stack([panel("a", 1), folded("b", 2), folded("c", 3), panel("d", 4)], 600);
    const fit = fitStack(input);
    const list = dividers(input, fit);
    expect(list.map((d) => [d.before, d.after])).toEqual([["a", "d"]]);
    const c = fit.items[2]!.rect;
    expect(list[0]!.rect.y).toBeCloseTo(c.y + c.height, 6);
  });

  it("a collapsed panel at an end, or one open panel alone, has none", () => {
    for (const items of [[folded("a", 1), panel("b", 2)], [panel("a", 1), folded("b", 2)], [panel("a", 1)], [folded("a", 1)], []]) {
      const input = stack(items, 600);
      expect(dividers(input, fitStack(input))).toEqual([]);
    }
  });

  it("a group between two open panels is not growing: it has no divider of its own", () => {
    const input = stack([panel("a", 1), group("tools", 2), panel("b", 3)], 700);
    const list = dividers(input, fitStack(input));
    expect(list.map((d) => [d.before, d.after])).toEqual([["a", "b"]]);
  });

  it("an item in the menu or a fixed one takes no part", () => {
    const fixedPanel: StackItem = { ...panel("title", 1), fixed: true };
    const input = stack([fixedPanel, panel("a", 2), panel("b", 3)], 700);
    expect(dividers(input, fitStack(input)).map((d) => [d.before, d.after])).toEqual([["a", "b"]]);
  });

  it("the strip is as thick as the gap, from the last item before to the one after", () => {
    const input: StackInput = { ...stack([panel("a", 1), folded("b", 2), panel("c", 3)], 700), gap: 6 };
    const fit = fitStack(input);
    const d = dividers(input, fit)[0]!;
    const b = fit.items[1]!.rect;
    const c = fit.items[2]!.rect;
    expect(d.rect.y).toBeCloseTo(b.y + b.height, 6);
    expect(d.rect.height).toBeCloseTo(c.y - (b.y + b.height), 6);
    expect(d.rect.height).toBeCloseTo(6, 6);
  });

  it("along a row the divider is a vertical strip", () => {
    const input = stack([panel("a", 1, 200), panel("b", 2, 100)], 600, "row");
    const fit = fitStack(input);
    const d = dividers(input, fit)[0]!;
    expect(d.rect.x).toBeCloseTo(mainOf(fit, "a"), 6);
    expect(d.rect.width).toBe(0);
    expect(d.rect.height).toBe(fit.items[0]!.rect.height);
  });
});

describe("resizeBetween", () => {
  const input = stack([panel("a", 1, 200), panel("b", 2, 100), panel("c", 3, 100)], 800);
  const fit = fitStack(input);

  it("moves delta from after to before and nothing else", () => {
    const next = resizeBetween(input, "a", "b", 30);
    const after = fitStack(next);
    expect(mainOf(after, "a")).toBeCloseTo(mainOf(fit, "a") + 30, 6);
    expect(mainOf(after, "b")).toBeCloseTo(mainOf(fit, "b") - 30, 6);
    expect(mainOf(after, "c")).toBeCloseTo(mainOf(fit, "c"), 6);
    expect(after.items.map((p) => p.form)).toEqual(fit.items.map((p) => p.form));
    const back = fitStack(resizeBetween(input, "a", "b", -30));
    expect(mainOf(back, "a")).toBeCloseTo(mainOf(fit, "a") - 30, 6);
    expect(mainOf(back, "b")).toBeCloseTo(mainOf(fit, "b") + 30, 6);
  });

  it("the first resize writes the length of the pair only, so nothing else shifts and the others stay unsized", () => {
    const next = resizeBetween(input, "a", "b", 10);
    expect(typeof next.items[0]!.length?.column).toBe("number");
    expect(typeof next.items[1]!.length?.column).toBe("number");
    expect(next.items[2]).toBe(input.items[2]);
    expect(next.items[2]!.length).toBeUndefined();
    // The pair lays out as it was drawn, and so does the rest (the lengths' units: stack-divide-pair.test.ts).
    const after = fitStack(next);
    expect(mainOf(after, "a")).toBeCloseTo(mainOf(fit, "a") + 10, 6);
    expect(mainOf(after, "c")).toBeCloseTo(mainOf(fit, "c"), 6);
    // A header-only panel isn't growing: no length is written for it.
    const mixed = stack([panel("a", 1), folded("b", 2), panel("c", 3)], 600);
    const written = resizeBetween(mixed, "a", "c", 20);
    expect(written.items[1]).toBe(mixed.items[1]);
    expect(written.items[0]!.length?.column).toBeDefined();
    expect(mainOf(fitStack(written), "b")).toBe(28);
  });

  it("the other axis's length is kept", () => {
    const withRow: StackInput = { ...input, items: input.items.map((it) => ({ ...it, length: { row: 123 } })) };
    const next = resizeBetween(withRow, "a", "b", 10);
    expect(next.items.every((it) => it.length?.row === 123)).toBe(true);
    expect(next.items.map((it) => typeof it.length?.column)).toEqual(["number", "number", "undefined"]);
  });

  it("neither goes below its least: clamped, no collapse and no push", () => {
    const far = fitStack(resizeBetween(input, "a", "b", 10_000));
    expect(mainOf(far, "b")).toBeCloseTo(90, 6);
    expect(far.items.map((p) => p.kind)).toEqual(["open", "open", "open"]);
    expect(mainOf(far, "c")).toBeCloseTo(mainOf(fit, "c"), 6);
    expect(sum(Object.values(mains(far)))).toBeCloseTo(sum(Object.values(mains(fit))), 6);
    const up = fitStack(resizeBetween(input, "a", "b", -10_000));
    expect(mainOf(up, "a")).toBeCloseTo(90, 6);
    expect(mainOf(up, "b")).toBeCloseTo(mainOf(fit, "a") + mainOf(fit, "b") - 90, 6);
  });

  it("returns the same object when nothing changes", () => {
    expect(resizeBetween(input, "a", "b", 0)).toBe(input);
    expect(resizeBetween(input, "a", "b", NaN)).toBe(input);
    expect(resizeBetween(input, "a", "zzz", 10)).toBe(input);
    expect(resizeBetween(input, "b", "a", 10)).toBe(input);
    // Not neighbors: c lies between a and... a and c have b between them.
    expect(resizeBetween(input, "a", "c", 10)).toBe(input);
    // Already at the least.
    const atLeast = resizeBetween(input, "a", "b", 10_000);
    expect(resizeBetween(atLeast, "a", "b", 5)).toBe(atLeast);
    const tight = stack([panel("a", 1), panel("b", 2)], 180);
    expect(resizeBetween(tight, "a", "b", 5)).toBe(tight);
  });

  it("a header-only panel between them doesn't kill the divider: they trade across it", () => {
    const mixed = stack([panel("a", 1, 200), folded("b", 2), panel("c", 3, 100)], 600);
    const before = fitStack(mixed);
    const after = fitStack(resizeBetween(mixed, "a", "c", 25));
    expect(mainOf(after, "a")).toBeCloseTo(mainOf(before, "a") + 25, 6);
    expect(mainOf(after, "c")).toBeCloseTo(mainOf(before, "c") - 25, 6);
    expect(mainOf(after, "b")).toBe(28);
    // The collapsed panel's asked length, if any, is kept and not applied.
    const kept = fitStack(resizeBetween({ ...mixed, items: mixed.items.map((it) => (it.id === "b" ? { ...it, length: { column: 400 } } : it)) }, "a", "c", 25));
    expect(mainOf(kept, "b")).toBe(28);
  });

  it("works along a row on the row length", () => {
    const row = stack([panel("a", 1, 200), panel("b", 2, 100)], 600, "row");
    const next = resizeBetween(row, "a", "b", 40);
    expect(next.items[0]!.length?.row).toBeDefined();
    expect(next.items[0]!.length?.column).toBeUndefined();
    const fit0 = fitStack(row);
    const fit1 = fitStack(next);
    expect(mainOf(fit1, "a")).toBeCloseTo(mainOf(fit0, "a") + 40, 6);
  });

  it("a divider moved to the end of dividers().range is the clamp", () => {
    const d = dividers(input, fit)[0]!;
    const atMax = fitStack(resizeBetween(input, d.before, d.after, d.range.max));
    const beyond = fitStack(resizeBetween(input, d.before, d.after, d.range.max + 500));
    expect(beyond).toEqual(atMax);
    const atMin = fitStack(resizeBetween(input, d.before, d.after, d.range.min));
    expect(mainOf(atMin, "a")).toBeCloseTo(90, 6);
  });

  it("is a pure function of the state: the same press state and delta, the same result", () => {
    expect(resizeBetween(input, "a", "b", 17)).toEqual(resizeBetween(input, "a", "b", 17));
    // A drag works from the state at the press: each frame's delta is from the press, not from the last frame.
    const frame = resizeBetween(input, "a", "b", 40);
    expect(resizeBetween(input, "a", "b", 40)).toEqual(frame);
    expect(fitStack(resizeBetween(input, "a", "b", 40))).toEqual(fitStack(frame));
  });

  it("with the guard of a re-measured natural: a sized panel doesn't move, an unsized one follows its natural", () => {
    const sized = resizeBetween(input, "a", "b", 30);
    const remeasured = (only: (it: StackItem) => boolean): StackInput => ({
      ...sized,
      items: sized.items.map((it): StackItem => (only(it) ? { ...it, forms: it.forms.map((f, i): StackForm => (i === 0 ? { ...f, main: { ...f.main, natural: f.main.natural + 77 } } : f)) } : it)),
    });
    expect(fitStack(remeasured((it) => it.length?.column !== undefined))).toEqual(fitStack(sized));
    // `c` was not part of the drag: it asks its natural, as it did before.
    expect(mainOf(fitStack(remeasured((it) => it.id === "c")), "c")).toBeGreaterThan(mainOf(fitStack(sized), "c"));
  });

  it("a re-measured natural of an unsized bystander re-shares the column: the pair keeps its proportion, not its px", () => {
    // [a, b, c], naturals 300, a column of 1200: drag a|b by 40 (440 / 360 / 400), then `c` is measured 77 longer.
    const three = stack([panel("a", 1, 300), panel("b", 2, 300), panel("c", 3, 300)], 1200);
    const sized = resizeBetween(three, "a", "b", 40);
    const before = fitStack(sized);
    const after = fitStack({ ...sized, items: sized.items.map((it): StackItem => (it.id === "c" ? { ...it, forms: it.forms.map((f, i): StackForm => (i === 0 ? { ...f, main: { ...f.main, natural: 377 } } : f)) } : it)) });
    expect(mainOf(after, "c")).toBeGreaterThan(mainOf(before, "c"));
    expect(mainOf(after, "a")).toBeLessThan(mainOf(before, "a") - 1);
    expect(mainOf(after, "b")).toBeLessThan(mainOf(before, "b") - 1);
    expect(mainOf(after, "a") / mainOf(after, "b")).toBeCloseTo(mainOf(before, "a") / mainOf(before, "b"), 9);
    expect([mainOf(after, "a"), mainOf(after, "b"), mainOf(after, "c")].map((x) => Math.round(x * 10) / 10)).toEqual([405.3, 331.6, 463.1]);
  });
});

describe("resetBetween", () => {
  it("splits the two's combined length in proportion to their naturals, nothing else moves", () => {
    const input = stack([panel("a", 1, 160), panel("b", 2, 100), panel("c", 3, 100)], 700);
    const dragged = resizeBetween(input, "a", "b", 40);
    const before = fitStack(dragged);
    const reset = resetBetween(dragged, "a", "b");
    const fit = fitStack(reset);
    const both = mainOf(before, "a") + mainOf(before, "b");
    expect(mainOf(fit, "a")).toBeCloseTo((both * 160) / 260, 5);
    expect(mainOf(fit, "b")).toBeCloseTo((both * 100) / 260, 5);
    expect(mainOf(fit, "c")).toBeCloseTo(mainOf(before, "c"), 6);
  });

  it("with the rest of the stack unsized and the pair at its split already, it changes nothing", () => {
    const input = stack([panel("a", 1, 160), panel("b", 2, 100)], 700);
    expect(resetBetween(input, "a", "b")).toBe(input);
    const again = resetBetween(resizeBetween(input, "a", "b", 30), "a", "b");
    expect(fitStack(again)).toEqual(fitStack(input));
  });

  it("a header-only panel between them: the pair is still reset", () => {
    const input = stack([panel("a", 1, 160), folded("b", 2), panel("c", 3, 100)], 600);
    const dragged = resizeBetween(input, "a", "c", 50);
    const fit = fitStack(resetBetween(dragged, "a", "c"));
    const base = fitStack(input);
    expect(mainOf(fit, "a")).toBeCloseTo(mainOf(base, "a"), 5);
    expect(mainOf(fit, "c")).toBeCloseTo(mainOf(base, "c"), 5);
  });

  it("not neighbors, unknown ids: the same object", () => {
    const input = stack([panel("a", 1), panel("b", 2), panel("c", 3)], 700);
    expect(resetBetween(input, "a", "c")).toBe(input);
    expect(resetBetween(input, "a", "x")).toBe(input);
    expect(resetBetween(input, "b", "a")).toBe(input);
  });
});

describe("resetLengths", () => {
  it("deletes every asked length of the stack, back to today's split", () => {
    const input = stack([panel("a", 1, 160), panel("b", 2, 100), panel("c", 3, 120)], 700);
    const dragged = resizeBetween(resizeBetween(input, "a", "b", 40), "b", "c", -20);
    const reset = resetLengths(dragged);
    expect(reset.items.every((it) => it.length === undefined)).toBe(true);
    expect(fitStack(reset)).toEqual(fitStack(input));
    expect(reset).toEqual(input);
  });

  it("the other axis's length stays, and an unsized stack is the same object", () => {
    const input = stack([panel("a", 1), panel("b", 2)], 600);
    expect(resetLengths(input)).toBe(input);
    const both: StackInput = { ...input, items: input.items.map((it) => ({ ...it, length: { column: 100, row: 50 } })) };
    expect(resetLengths(both).items.map((it) => it.length)).toEqual([{ row: 50 }, { row: 50 }]);
  });
});

describe("properties", () => {
  /** A panel whose non-growing forms can still shrink (least under natural): the tight share reaches them too. */
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
  const sizedOrNot = (rand: () => number, items: readonly StackItem[], axis: "column" | "row"): StackItem[] =>
    items.map((it) => (rand() < 0.5 ? { ...it, length: { [axis]: 60 + Math.floor(rand() * 400) } } : it));
  const growing = (input: StackInput, fit: StackFit): string[] =>
    fit.items.filter((p) => input.items.find((it) => it.id === p.id)!.forms[p.form]!.main.grows === true && p.kind !== "menu").map((p) => p.id);

  it("after any resizeBetween the total is unchanged and only the two moved, in every regime", () => {
    const rand = seeded(7);
    let moved = 0;
    for (let trial = 0; trial < 300; trial++) {
      const axis = rand() < 0.5 ? "column" : "row";
      const base = mix(rand, 2 + Math.floor(rand() * 5)).map((it, i) => (rand() < 0.4 ? slack(`s${i}`, it.used) : it));
      const input = stack(sizedOrNot(rand, base, axis), 120 + Math.floor(rand() * 700), axis);
      const fit = fitStack(input);
      const open = growing(input, fit);
      if (open.length < 2) continue;
      const k = Math.floor(rand() * (open.length - 1));
      const delta = Math.floor(rand() * 300) - 150;
      const next = resizeBetween(input, open[k]!, open[k + 1]!, delta);
      const after = fitStack(next);
      // The forms, the notes and the cross size are what they were.
      expect(after.items.map((p) => [p.id, p.form])).toEqual(fit.items.map((p) => [p.id, p.form]));
      expect(after.notes).toEqual(fit.notes);
      const was = mains(fit);
      const now = mains(after);
      expect(sum(Object.values(now))).toBeCloseTo(sum(Object.values(was)), 4);
      const d = dividers(input, fit).find((x) => x.before === open[k] && x.after === open[k + 1])!;
      const clamped = Math.min(Math.max(delta, d.range.min), d.range.max);
      for (const id of Object.keys(was)) {
        const want = id === open[k] ? was[id]! + clamped : id === open[k + 1] ? was[id]! - clamped : was[id]!;
        expect(now[id]!).toBeCloseTo(want, 4);
      }
      if (Math.abs(clamped) > 1e-6) moved++;
      else expect(next).toBe(input);
    }
    expect(moved).toBeGreaterThan(100);
  });

  it("both neighbors can reach their least, with spare room and when short", () => {
    const rand = seeded(9);
    let reached = 0;
    for (let trial = 0; trial < 200; trial++) {
      const base = [panel("a", 1, 100 + Math.floor(rand() * 200)), panel("b", 2, 100 + Math.floor(rand() * 200)), panel("c", 3, 100 + Math.floor(rand() * 200))];
      const input = stack(sizedOrNot(rand, base, "column"), 280 + Math.floor(rand() * 600));
      const fit = fitStack(input);
      const open = growing(input, fit);
      if (open.length < 2) continue;
      const k = Math.floor(rand() * (open.length - 1));
      const down = fitStack(resizeBetween(input, open[k]!, open[k + 1]!, 100_000));
      const up = fitStack(resizeBetween(input, open[k]!, open[k + 1]!, -100_000));
      expect(mainOf(down, open[k + 1]!)).toBeCloseTo(90, 5);
      expect(mainOf(up, open[k]!)).toBeCloseTo(90, 5);
      reached++;
    }
    expect(reached).toBeGreaterThan(100);
  });

  it("shrinking the window and growing it back gives the same layout and the same lengths", () => {
    const rand = seeded(11);
    for (let trial = 0; trial < 120; trial++) {
      const base = mix(rand, 2 + Math.floor(rand() * 4));
      const length = 300 + Math.floor(rand() * 500);
      const input = stack(sizedOrNot(rand, base, "column"), length);
      const open = growing(input, fitStack(input));
      if (open.length < 2) continue;
      const sized = resizeBetween(input, open[0]!, open[1]!, 20);
      const snapshot = JSON.stringify(sized);
      const small = fitStack({ ...sized, length: length * 0.5 });
      expect(small.items.length).toBe(sized.items.length);
      expect(JSON.stringify(sized)).toBe(snapshot);
      expect(fitStack({ ...sized, length })).toEqual(fitStack(sized));
    }
  });

  it("close and reopen: the others share the room in proportion, and reopened it comes back as it was", () => {
    const sized = resizeBetween(stack([panel("a", 1, 160), panel("b", 2, 100), panel("c", 3, 120)], 700), "a", "b", 35);
    const full = fitStack(sized);
    const without = { ...sized, items: sized.items.filter((it) => it.id !== "b") };
    const closed = fitStack(without);
    expect(mainOf(closed, "a") + mainOf(closed, "c")).toBeCloseTo(700, 6);
    expect(mainOf(closed, "a") / mainOf(closed, "c")).toBeCloseTo(mainOf(full, "a") / mainOf(full, "c"), 6);
    const reopened = { ...without, items: [without.items[0]!, sized.items[1]!, without.items[1]!] };
    expect(fitStack(reopened)).toEqual(full);
  });

  it("the asked length travels with the item to another stack of the same axis, and a bar never reads a column length", () => {
    const sized = resizeBetween(stack([panel("a", 1, 160), panel("b", 2, 100)], 700), "a", "b", 35);
    const moved = sized.items[0]!;
    expect(moved.length?.column).toBeDefined();
    const there = stack([moved, panel("x", 5, 100)], 700);
    expect(mainOf(fitStack(there), "a")).toBeGreaterThan(mainOf(fitStack(stack([panel("a", 1, 160), panel("x", 5, 100)], 700)), "a"));
    const bar = fitStack(stack([moved, panel("x", 5, 100)], 700, "row"));
    expect(bar).toEqual(fitStack(stack([panel("a", 1, 160), panel("x", 5, 100)], 700, "row")));
  });

  it("the state is plain data: stored and read back, it lays out the same", () => {
    const rand = seeded(13);
    for (let trial = 0; trial < 60; trial++) {
      const base = mix(rand, 2 + Math.floor(rand() * 4));
      const input = stack(sizedOrNot(rand, base, "column"), 300 + Math.floor(rand() * 500));
      const open = growing(input, fitStack(input));
      if (open.length < 2) continue;
      const sized = resizeBetween(input, open[0]!, open[1]!, 12.5);
      const back = JSON.parse(JSON.stringify(sized)) as StackInput;
      expect(fitStack(back)).toEqual(fitStack(sized));
    }
  });

  it("an older state with no length is today's layout", () => {
    const rand = seeded(15);
    for (let trial = 0; trial < 80; trial++) {
      const input = stack(mix(rand, 1 + Math.floor(rand() * 6)), 40 + Math.floor(rand() * 600), rand() < 0.5 ? "column" : "row");
      expect(resetLengths(input)).toBe(input);
      expect(fitStack({ ...input, items: input.items.map((it) => ({ ...it, length: {} })) })).toEqual(fitStack(input));
    }
  });
});
