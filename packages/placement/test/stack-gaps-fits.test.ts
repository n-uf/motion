/**
 * `stackGaps`, fit only: a gap takes the item only where it fits beside the others. In a narrow title bar the group's
 * slot and the group itself never cover the title: with no room every gap is a refusal.
 */
import { describe, expect, it } from "vitest";
import { fitStack, stackGaps, withItem, type StackFit, type StackForm, type StackGap, type StackInput, type StackItem } from "../src/stack";
import { barGroup, group, mix, panel, seeded, stack } from "./stack-fixture";

const EPS = 1e-6;
const form = (kind: StackForm["kind"], min: number, natural = min, cross = 26): StackForm => ({ kind, main: { min, natural }, cross: { natural: cross } });
const fixed = (id: string, min: number, natural = min): StackItem => ({ id, used: 0, fixed: true, forms: [form("row", min, natural)] });
/** A group of a title bar: its words (220), icons (90), the » menu. */
const words = (id: string, used = 1): StackItem => ({ id, used, forms: [form("row", 220), form("icons", 90), form("menu", 0)] });
const bar = (items: readonly StackItem[], length: number): StackInput => ({ axis: "row", length, cross: { min: 26, max: 40 }, items });
type Fits = Extract<StackGap, { fits: true }>;
const fitting = (input: StackInput, item: StackItem, options = {}): Fits[] => stackGaps(input, item, options).filter((g): g is Fits => g.fits);
const ats = (input: StackInput, item: StackItem, options = {}): number[] => fitting(input, item, options).map((g) => g.at);

/** The title (200), a page readout (80) and the window controls (90), all fixed. */
const chrome = [fixed("title", 200), fixed("readout", 80), fixed("controls", 90)];

describe("stackGaps: fit only", () => {
  it("a title bar: with the room for the group's icons (370 + 90) every gap takes it, with less none; the words come with 590", () => {
    const item = words("marks", 5);
    expect(ats(bar(chrome, 440), item)).toEqual([]);
    expect(ats(bar(chrome, 459), item)).toEqual([]);
    expect(ats(bar(chrome, 460), item)).toEqual([0, 1, 2, 3]);
    expect(ats(bar(chrome, 589), item)).toEqual([0, 1, 2, 3]);
    for (const [length, kind] of [[460, "icons"], [589, "icons"], [590, "row"]] as const) {
      for (const g of fitting(bar(chrome, length), item)) expect(g.fit.items.find((p) => p.id === "marks")!.kind).toBe(kind);
    }
    // Every gap is still listed, as a refusal: the group would land in the menu.
    expect(stackGaps(bar(chrome, 440), item).map((g) => (g.fits ? "fits" : g.reason))).toEqual(["to-menu", "to-menu", "to-menu", "to-menu"]);
  });

  it("other groups give way first: the item is the newest, so while it fits in its icons the others fold", () => {
    const input = bar([chrome[0]!, chrome[1]!, words("a", 2), chrome[2]!], 500);
    const gaps = fitting(input, words("marks", 5));
    expect(gaps).toHaveLength(5);
    expect(gaps[0]!.fit.items.find((p) => p.id === "a")!.kind).toBe("menu");
    expect(ats({ ...input, length: 480 }, words("marks", 5))).toEqual([]);
  });

  it("a fixed item may shrink down to its main.min to make room; below the minimums there is no room", () => {
    // The title shrinks from 200 to 120, so the group's icons fit (380 of 380) beside the readout and the controls.
    const squeezable = [fixed("title", 120, 200), chrome[1]!, chrome[2]!];
    expect(ats(bar(squeezable, 420), words("marks", 5))).toEqual([0, 1, 2, 3]);
    const fit = fitting(bar(squeezable, 380), words("marks", 5));
    expect(fit.map((g) => g.at)).toEqual([0, 1, 2, 3]);
    expect(fit[0]!.fit.items.find((p) => p.id === "title")!.rect.width).toBe(120);
    expect(stackGaps(bar(squeezable, 379), words("marks", 5)).length).toBe(4);
    expect(ats(bar(squeezable, 379), words("marks", 5))).toEqual([]);
  });

  it("a growing title 80/160 beside the controls shrinks to 80 for a drop; below that it is refused", () => {
    const title: StackItem = { id: "title", used: 0, fixed: true, forms: [{ kind: "row", main: { min: 80, natural: 160, grows: true }, cross: { natural: 26 } }] };
    const controls = fixed("controls", 90);
    const item = words("marks", 5);
    // 80 + 90 + the group's icons (90) = 260.
    const at260 = fitting(bar([title, controls], 260), item);
    expect(at260.map((g) => g.at)).toEqual([0, 1, 2]);
    expect(at260[0]!.fit.items.find((p) => p.id === "title")!.rect.width).toBe(80);
    expect(ats(bar([title, controls], 259), item)).toEqual([]);
    expect(ats(bar([title, controls], 600), item)).toEqual([0, 1, 2]);
  });

  it("a fixed title that grows is not squeezed by a drop: it only gives back what it took", () => {
    const title: StackItem = { id: "title", used: 0, fixed: true, forms: [{ kind: "row", main: { min: 100, natural: 100, grows: true }, cross: { natural: 26 } }] };
    const input: StackInput = { axis: "row", length: 600, cross: { min: 30, max: 40 }, items: [title] };
    const item: StackItem = { id: "d", used: 1, forms: [form("row", 80), form("menu", 0)] };
    expect(ats(input, item)).toEqual([0, 1]);
    expect(ats({ ...input, length: 180 }, item)).toEqual([0, 1]);
    expect(ats({ ...input, length: 179 }, item)).toEqual([]);
  });

  it("a squeezed title that grows back when a neighbor folds is not squeezed further", () => {
    const title = fixed("title", 120, 200);
    const input = bar([title, words("a", 1)], 400);
    const base = fitStack(input);
    expect(base.items[0]!.rect.width).toBeCloseTo(180, 6);
    const item: StackItem = { id: "d", used: 5, forms: [form("row", 80), form("menu", 0)] };
    const gaps = fitting(input, item);
    expect(gaps.map((g) => g.at)).toEqual([0, 1, 2]);
    for (const g of gaps) {
      expect(g.fit.items.find((p) => p.id === "a")!.kind).toBe("icons");
      expect(g.fit.items.find((p) => p.id === "title")!.rect.width).toBeGreaterThan(base.items[0]!.rect.width);
    }
    const wider: StackItem = { id: "d", used: 5, forms: [form("row", 150), form("menu", 0)] };
    const at298 = fitting({ ...input, length: 298 }, wider);
    expect(at298.map((g) => g.at)).toEqual([0, 1, 2]);
    expect(at298[0]!.fit.items.find((p) => p.id === "title")!.rect.width).toBe(120);
    expect(ats({ ...input, length: 297 }, wider)).toEqual([]);
  });

  it("an item too wide across is refused", () => {
    const wide: StackItem = { id: "wide", used: 5, forms: [form("row", 60, 60, 60), form("menu", 0)] };
    expect(stackGaps(bar([chrome[0]!], 800), wide).map((g) => (g.fits ? "fits" : g.reason))).toEqual(["too-wide", "too-wide"]);
  });

  it("works with allows, accepts, previous, gap and pad, and in a column", () => {
    const input = { ...bar(chrome, 520), gap: 4, pad: { start: 4, end: 4 }, accepts: () => true };
    const previous = fitStack(input);
    expect(ats(input, words("marks", 5), { previous, allows: (_d: StackItem, at: number) => at !== 1 })).toEqual([0, 2, 3]);
    expect(ats({ ...input, length: 470 }, words("marks", 5))).toEqual([]);
    const column = stack([{ ...group("tools", 2), fixed: true }], 50);
    expect(ats(column, group("x", 5))).toEqual([]);
    expect(ats(stack([panel("pages", 1), group("tools", 2)], 600), group("x", 5))).toEqual([0, 1, 2]);
  });
});

describe("stackGaps: sweep", () => {
  /** The rule, read from a drop's fit (not from the solver's code). */
  const fitsBeside = (base: StackFit, fit: StackFit, item: string, fixedItems: readonly StackItem[], axis: StackInput["axis"]): boolean => {
    if (fit.items.find((p) => p.id === item)!.kind === "menu") return false;
    if (fit.notes.some((n) => n.code === "overflow")) return false;
    const before = new Set(base.notes.filter((n) => n.code === "too-wide").map((n) => (n as { id: string }).id));
    if (fit.notes.some((n) => n.code === "too-wide" && !before.has(n.id))) return false;
    const along = (r: { width: number; height: number }) => (axis === "column" ? r.height : r.width);
    const cross = (r: { width: number; height: number }) => (axis === "column" ? r.width : r.height);
    return fixedItems.every((it) => {
      const a = base.items.find((p) => p.id === it.id)!;
      const b = fit.items.find((p) => p.id === it.id)!;
      if (a.kind === "menu" || b.kind === "menu") return true;
      return b.form === a.form && along(b.rect) >= it.forms[b.form]!.main.min - EPS && cross(b.rect) >= cross(a.rect) - EPS;
    });
  };

  it("a gap takes the item exactly when its fit passes the rule; some sweeps leave gaps, some none", () => {
    const rand = seeded(5);
    let some = 0;
    let none = 0;
    let all = 0;
    for (let trial = 0; trial < 400; trial++) {
      const axis: StackInput["axis"] = rand() < 0.5 ? "column" : "row";
      const items = mix(rand, Math.floor(rand() * 5)).map((it) => (axis === "row" && it.id.startsWith("g") ? barGroup(it.id, it.used, it.kept === true) : it));
      const marked = items.map((it): StackItem => (rand() < 0.4 ? { ...it, fixed: true, forms: it.forms.map((f, k) => (k === 0 ? { ...f, main: { ...f.main, min: f.main.min - 20 } } : f)) } : it));
      const withEnds = axis === "row" && rand() < 0.5 ? [fixed("title", 120, 160), ...marked, fixed("controls", 72)] : marked;
      const input = { ...stack(withEnds, 60 + Math.floor(rand() * 700), axis), ...(rand() < 0.3 ? { gap: 6, pad: { start: 4, end: 4 } } : {}) };
      const item = rand() < 0.5 ? (axis === "row" ? barGroup("d", 0) : group("d", 0)) : panel("d", 0);
      const gaps = stackGaps(input, item);
      const base = fitStack(input);
      const fixedItems = input.items.filter((it) => it.fixed);
      const newest = input.items.reduce((m, it) => Math.max(m, it.used), item.used) + 1;
      for (const g of gaps) {
        const fit = fitStack(withItem(input, { ...item, used: newest }, g.at));
        expect(g.fits).toBe(fitsBeside(base, fit, "d", fixedItems, axis));
        if (g.fits) expect(g.fit).toEqual(fit);
      }
      const n = gaps.filter((g) => g.fits).length;
      if (n === 0) none++;
      else if (n === gaps.length) all++;
      else some++;
    }
    expect(none).toBeGreaterThan(0);
    expect(all).toBeGreaterThan(0);
    expect(some + none + all).toBe(400);
  });
});
