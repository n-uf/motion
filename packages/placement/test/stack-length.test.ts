/**
 * An asked length: `StackItem.length` (per axis, px along the stack) is read in place of the natural of the growing form
 * the item is in. The least stays the form's `main.min`; there is no new formula, so the spare-room branch (sized
 * panels scale together in proportion) and the short branch (they interpolate toward their least) both apply.
 * A stack that declares no length is laid out exactly as before.
 */
import { describe, expect, it } from "vitest";
import { fitStack, type StackFit, type StackForm, type StackItem } from "../src/stack";
import { group, mix, panel, seeded, stack } from "./stack-fixture";

const withLength = (it: StackItem, length: NonNullable<StackItem["length"]>): StackItem => ({ ...it, length });
const heights = (fit: StackFit): number[] => fit.items.map((p) => p.rect.height);
const sum = (xs: readonly number[]): number => xs.reduce((s, x) => s + x, 0);
const close = (a: readonly number[], b: readonly number[]): void => {
  expect(a.length).toBe(b.length);
  a.forEach((x, i) => expect(x).toBeCloseTo(b[i]!, 6));
};

describe("an asked length, read in place of the natural", () => {
  it("with spare room, sized panels share the stack in proportion to their lengths", () => {
    const items = [withLength(panel("a", 1, 160), { column: 300 }), withLength(panel("b", 2, 160), { column: 100 })];
    const fit = fitStack(stack(items, 800));
    close(heights(fit), [600, 200]);
    expect(sum(heights(fit))).toBeCloseTo(800, 6);
  });

  it("a sized and an unsized panel: the unsized one asks for its natural", () => {
    const items = [withLength(panel("a", 1, 160), { column: 300 }), panel("b", 2, 100)];
    close(heights(fitStack(stack(items, 800))), [600, 200]);
  });

  it("short of room, sized panels interpolate between their least and their asked length", () => {
    const items = [withLength(panel("a", 1, 160), { column: 400 }), withLength(panel("b", 2, 160), { column: 200 })];
    // least 90 each (180), asked 600: t = (330 - 180) / (600 - 180)
    const t = (330 - 180) / (600 - 180);
    const fit = fitStack(stack(items, 330));
    close(heights(fit), [90 + (400 - 90) * t, 90 + (200 - 90) * t]);
    expect(fit.items.map((p) => p.kind)).toEqual(["open", "open"]);
  });

  it("an asked length under the least is the least", () => {
    const items = [withLength(panel("a", 1, 160), { column: 10 }), withLength(panel("b", 2, 160), { column: 10 })];
    close(heights(fitStack(stack(items, 500))), [250, 250]);
    const tight = fitStack(stack([withLength(panel("a", 1, 160), { column: 10 }), withLength(panel("b", 2, 160), { column: 400 })], 400));
    expect(heights(tight)[0]!).toBeGreaterThanOrEqual(90 - 1e-9);
    expect(sum(heights(tight))).toBeCloseTo(400, 6);
  });

  it("a negative, infinite or NaN length is not an asked length", () => {
    const plain = fitStack(stack([panel("a", 1, 160), panel("b", 2, 100)], 600));
    for (const bad of [-5, Infinity, NaN]) {
      expect(fitStack(stack([withLength(panel("a", 1, 160), { column: bad }), panel("b", 2, 100)], 600))).toEqual(plain);
    }
  });

  it("a re-measured natural of a sized panel moves nothing", () => {
    const grown = (it: StackItem): StackItem => ({ ...it, forms: it.forms.map((f, i): StackForm => (i === 0 ? { ...f, main: { ...f.main, natural: f.main.natural * 2 } } : f)) });
    const sized = [withLength(panel("a", 1, 160), { column: 300 }), withLength(panel("b", 2, 160), { column: 100 })];
    for (const length of [300, 500, 800]) {
      const before = fitStack(stack(sized, length));
      expect(fitStack(stack(sized.map(grown), length))).toEqual(before);
    }
  });

  it("only the other axis, or a form that doesn't grow, leaves the layout as it was", () => {
    const plain = [panel("a", 1, 160), panel("b", 2, 100), panel("c", 3, 220)];
    for (const length of [180, 330, 700]) {
      const base = fitStack(stack(plain, length));
      // A row length never reaches a column.
      expect(fitStack(stack(plain.map((it) => withLength(it, { row: 999 })), length))).toEqual(base);
    }
    // A header-only panel is not growing: its asked length is kept but not applied.
    const folded = [{ ...withLength(panel("a", 1, 160), { column: 500 }), from: 1 }, panel("b", 2, 100)];
    const same = [{ ...panel("a", 1, 160), from: 1 }, panel("b", 2, 100)];
    expect(fitStack(stack(folded, 600))).toEqual(fitStack(stack(same, 600)));
  });

  it("a length is per axis: a bar reads its own", () => {
    const items = [withLength(panel("a", 1, 160), { column: 100, row: 300 }), withLength(panel("b", 2, 160), { column: 300, row: 100 })];
    const widths = fitStack(stack(items, 800, "row")).items.map((p) => p.rect.width);
    close(widths, [600, 200]);
  });

  it("sizing never changes who gives way down the ladder", () => {
    const rand = seeded(41);
    for (let trial = 0; trial < 120; trial++) {
      const items = mix(rand, 1 + Math.floor(rand() * 6));
      const length = 40 + Math.floor(rand() * 600);
      const axis = rand() < 0.5 ? "column" : "row";
      const sized = items.map((it) => (rand() < 0.7 ? withLength(it, { [axis]: Math.floor(rand() * 500) }) : it));
      const a = fitStack(stack(items, length, axis));
      const b = fitStack(stack(sized, length, axis));
      expect(b.items.map((p) => [p.id, p.form, p.kind])).toEqual(a.items.map((p) => [p.id, p.form, p.kind]));
      expect(b.notes).toEqual(a.notes);
      expect(b.steps).toEqual(a.steps);
      expect(b.need).toEqual(a.need);
      expect(b.cross).toEqual(a.cross);
    }
  });

  it("sized or not, the items fill the stack end to end and none is under its least", () => {
    const rand = seeded(43);
    for (let trial = 0; trial < 120; trial++) {
      const axis = rand() < 0.5 ? "column" : "row";
      const items = mix(rand, 1 + Math.floor(rand() * 6)).map((it) => (rand() < 0.7 ? withLength(it, { [axis]: Math.floor(rand() * 500) }) : it));
      const length = 200 + Math.floor(rand() * 500);
      const fit = fitStack(stack(items, length, axis));
      const main = (p: StackFit["items"][number]): number => (axis === "column" ? p.rect.height : p.rect.width);
      const drawn = fit.items.filter((p) => p.kind !== "menu");
      for (const p of drawn) {
        const f = items.find((it) => it.id === p.id)!.forms[p.form]!;
        expect(main(p)).toBeGreaterThanOrEqual(f.main.min - 1e-6);
      }
      if (fit.notes.some((n) => n.code === "overflow")) continue;
      const growers = drawn.some((p) => items.find((it) => it.id === p.id)!.forms[p.form]!.main.grows);
      if (growers) expect(sum(drawn.map(main))).toBeCloseTo(length - (fit.menu ? 28 : 0), 4);
    }
  });

  it("groups in the stack are untouched by a neighbor's length", () => {
    const items = [group("tools", 5), withLength(panel("a", 1, 160), { column: 300 }), panel("b", 2, 100)];
    const fit = fitStack(stack(items, 700));
    expect(fit.items[0]!.rect.height).toBe(96);
    expect(sum(heights(fit))).toBeCloseTo(700, 6);
  });
});
