/** A `wrap` form: words in rows that wrap beside the grip's lead (a hanging indent), never one word on a non-last row. */
import { describe, expect, it } from "vitest";
import { fitStack, formCrossMin, formFitsCross, stackTargets, wrapCross, wrapLines, wrapRows, type StackForm, type StackInput, type StackItem, type WrapSpec } from "../src/stack";

const words: WrapSpec = { widths: [60, 50, 40], row: 28, gap: 4, lead: 16 };
const wrapForm = (spec: WrapSpec = words): StackForm => ({ kind: "wrap", main: { min: 0, natural: 0 }, cross: { natural: 0 }, wrap: spec });
const icons: StackForm = { kind: "icons", main: { min: 84, natural: 84 }, cross: { natural: 28 } };
const menu: StackForm = { kind: "menu", main: { min: 0, natural: 0 }, cross: { natural: 0 } };
const group = (id: string, used: number, spec: WrapSpec = words): StackItem => ({ id, used, forms: [wrapForm(spec), icons, menu] });
/** A panel that sets the column's width to `wide`. */
const panel = (id: string, used: number, wide: number): StackItem => ({
  id,
  used,
  forms: [
    { kind: "open", main: { min: 100, natural: 200, grows: true }, cross: { natural: wide } },
    { kind: "header", main: { min: 28, natural: 28 }, cross: { natural: wide, min: 40 } },
    menu,
  ],
});
const column = (items: StackItem[], length: number, cross = { min: 60, max: 480, rail: 30 }): StackInput => ({ axis: "column", length, cross, items, ownCross: true });

describe("wrapLines", () => {
  it("wraps the words in their own box beside the lead (a hanging indent), and reports the word indexes per row", () => {
    // Box = cross − 16.
    expect(wrapLines(words, 200)).toEqual({ lines: [[0, 1, 2]], width: 174, fits: true });
    expect(wrapLines(words, 150)).toEqual({ lines: [[0, 1], [2]], width: 130, fits: true });
    // A non-last row with a single word: it doesn't fit.
    expect(wrapLines(words, 120)).toEqual({ lines: [[0], [1, 2]], width: 110, fits: false });
    expect(wrapLines(words, 80).fits).toBe(false);
    expect(wrapRows(words, 150)).toEqual({ rows: 2, width: 130, fits: true });
  });

  it("its cross.min is the narrowest cross where no row but the last holds a single word", () => {
    expect(wrapCross(words)).toEqual({ natural: 174, min: 130 });
    expect(formCrossMin(wrapForm())).toBe(130);
    expect(formFitsCross(wrapForm(), 130)).toBe(true);
    expect(formFitsCross(wrapForm(), 129)).toBe(false);
  });

  it("fitting is monotone: a form that fits a cross fits every wider one, laid out at the widest narrower width that fits", () => {
    const odd: WrapSpec = { widths: [47, 20, 32, 59, 68], row: 24, gap: 4, lead: 19 };
    const min = formCrossMin(wrapForm(odd));
    for (let c = Math.ceil(min); c <= wrapCross(odd).natural; c++) {
      expect(formFitsCross(wrapForm(odd), c)).toBe(true);
      const l = wrapLines(odd, c);
      expect(l.lines.slice(0, -1).every((row) => row.length >= 2)).toBe(true);
      expect(l.width).toBeLessThanOrEqual(c + 1e-6);
    }
    // Greedily at 126 the rows would be [0,1,2], [3], [4]; laid at a narrower width that fits instead.
    expect(wrapLines(odd, 126).lines).not.toEqual([[0, 1, 2], [3], [4]]);
  });

  it("a single-word group rows normally: one row while the word fits beside the lead", () => {
    const one: WrapSpec = { widths: [80], row: 28, lead: 16 };
    expect(wrapLines(one, 100)).toEqual({ lines: [[0]], width: 96, fits: true });
    expect(formFitsCross(wrapForm(one), 90)).toBe(false);
  });
});

describe("a wrap form in a column", () => {
  it("is rows × row long and, under ownCross, as wide as its rows need, at several column widths", () => {
    for (const [wide, rows, width] of [[240, 1, 174], [150, 2, 130], [130, 2, 130]] as const) {
      const fit = fitStack(column([panel("p", 1, wide), group("g", 2)], 600));
      expect(fit.cross).toBe(wide);
      const g = fit.items.find((x) => x.id === "g")!;
      expect(g.kind).toBe("wrap");
      expect(g.rect.height).toBe(rows * 28);
      expect(g.rect.width).toBe(width);
    }
  });

  it("three words that fit two per row wrap in 2 rows; a column too narrow for two per row takes icons", () => {
    expect(fitStack(column([panel("p", 1, 150), group("g", 2)], 600)).items.find((x) => x.id === "g")!.kind).toBe("wrap");
    expect(fitStack(column([panel("p", 1, 120), group("g", 2)], 600)).items.find((x) => x.id === "g")!.kind).toBe("icons");
    expect(fitStack(column([panel("p", 1, 70), group("g", 2)], 600)).items.find((x) => x.id === "g")!.kind).toBe("icons");
  });

  it("gives way by its computed length, in the usual order", () => {
    // Column 150 wide: the group's rows are 56 long. Panel min 100 + 56 = 156 fits 160; at 150 someone gives way.
    const fits = fitStack(column([panel("p", 2, 150), group("g", 1)], 160));
    expect(fits.items.map((x) => x.kind)).toEqual(["open", "wrap"]);
    const short = fitStack(column([panel("p", 2, 150), group("g", 1)], 150));
    // The group, used longest ago, gives way first.
    expect(short.notes.filter((n) => n.code === "form-down").map((n) => (n as { id: string }).id)[0]).toBe("g");
    expect(short.items.find((x) => x.id === "p")!.kind).toBe("open");
  });

  it("N1: a word 1 px wider under previous keeps every form; only rows that change move anything", () => {
    const before = fitStack(column([panel("p", 1, 240), group("g", 2), group("h", 3)], 600));
    const wider: WrapSpec = { ...words, widths: [61, 50, 40] };
    const after = fitStack(column([panel("p", 1, 240), group("g", 2, wider), group("h", 3)], 600), { previous: before });
    expect(after.items.map((x) => x.kind)).toEqual(before.items.map((x) => x.kind));
    expect(after.items.find((x) => x.id === "h")!.rect).toEqual(before.items.find((x) => x.id === "h")!.rect);
    expect(after.items.find((x) => x.id === "g")!.rect.width).toBe(before.items.find((x) => x.id === "g")!.rect.width + 1);
  });

  it("preview = result: a gap's slot is the wrapped rect the drop makes", () => {
    const input = column([panel("p", 1, 150), group("h", 3)], 600);
    for (const t of stackTargets(input, group("g", 2))) {
      expect(t.slot).toEqual(fitStack(t.input).items.find((x) => x.id === "g")!.rect);
      expect(t.slot!.height).toBe(56);
    }
  });
});
