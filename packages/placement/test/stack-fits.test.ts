/**
 * `stackTargets(…, { onlyFits: true })`: a gap is offered only where the dragged item fits beside the others. In a narrow
 * title bar the group's slot and the group itself no longer cover the title: with no room there is no target.
 */
import { describe, expect, it } from "vitest";
import { fitStack, stackTargets, type StackFit, type StackForm, type StackInput, type StackItem } from "../src/stack";
import { barGroup, group, mix, panel, seeded, stack } from "./stack-fixture";

const EPS = 1e-6;
const form = (kind: StackForm["kind"], min: number, natural = min, cross = 26): StackForm => ({ kind, main: { min, natural }, cross: { natural: cross } });
const fixed = (id: string, min: number, natural = min): StackItem => ({ id, used: 0, fixed: true, forms: [form("row", min, natural)] });
/** A group of a title bar: its words (220), icons (90), the » menu. */
const words = (id: string, used = 1): StackItem => ({ id, used, forms: [form("row", 220), form("icons", 90), form("menu", 0)] });
const bar = (items: readonly StackItem[], length: number): StackInput => ({ axis: "row", length, cross: { min: 26, max: 40 }, items });
const ids = (input: StackInput, dragged: StackItem, options = {}): string[] => stackTargets(input, dragged, { ...options, onlyFits: true }).map((t) => t.id);
const range = (r: { x: number; y: number; width: number; height: number }): [number, number] => [r.x, r.x + r.width];

/** The title (200), a page readout (80) and the window controls (90), all fixed. */
const chrome = [fixed("title", 200), fixed("readout", 80), fixed("controls", 90)];

describe("onlyFits", () => {
  it("a title bar: with the room for the group's icons (370 + 90) every gap is offered, with less none; the words come with 590", () => {
    const dragged = words("marks", 5);
    expect(ids(bar(chrome, 440), dragged)).toEqual([]);
    expect(ids(bar(chrome, 459), dragged)).toEqual([]);
    expect(ids(bar(chrome, 460), dragged)).toEqual(["gap:0", "gap:1", "gap:2", "gap:3"]);
    expect(ids(bar(chrome, 589), dragged)).toEqual(["gap:0", "gap:1", "gap:2", "gap:3"]);
    for (const [length, kind] of [[460, "icons"], [589, "icons"], [590, "row"]] as const) {
      for (const t of stackTargets(bar(chrome, length), dragged, { onlyFits: true })) expect(t.fit.items.find((p) => p.id === "marks")!.kind).toBe(kind);
    }
    // Without the option every gap is offered, however narrow: the group lands in the menu or the bar overflows.
    expect(stackTargets(bar(chrome, 440), dragged).map((t) => t.id)).toEqual(["gap:0", "gap:1", "gap:2", "gap:3"]);
    expect(stackTargets(bar(chrome, 440), dragged).every((t) => t.fit.notes.some((n) => n.code === "overflow" || n.code === "to-menu"))).toBe(true);
  });

  it("the gaps it offers are exactly the unrestricted ones: ids, hits, slots and fits, and no hit covers a fixed item", () => {
    const input = bar([chrome[0]!, chrome[1]!, words("a", 2), chrome[2]!], 700);
    const all = stackTargets(input, words("marks", 5));
    const fits = stackTargets(input, words("marks", 5), { onlyFits: true });
    expect(fits).toEqual(all);
    const base = fitStack(input);
    for (const t of fits) for (const [i, it] of input.items.entries()) if (it.fixed) expect(Math.min(range(t.hit)[1], range(base.items[i]!.rect)[1]) - Math.max(range(t.hit)[0], range(base.items[i]!.rect)[0])).toBeLessThanOrEqual(EPS);
  });

  it("other groups give way first: the dragged item is the newest, so while it fits in its icons the others fold", () => {
    const input = bar([chrome[0]!, chrome[1]!, words("a", 2), chrome[2]!], 500);
    const targets = stackTargets(input, words("marks", 5), { onlyFits: true });
    expect(targets).toHaveLength(5);
    expect(targets[0]!.fit.items.find((p) => p.id === "a")!.kind).toBe("menu");
    expect(ids(input, words("marks", 5)).length).toBe(5);
    expect(ids({ ...input, length: 480 }, words("marks", 5))).toEqual([]);
  });

  it("a fixed item squeezed to make room is a refusal: it is drawn at the size it had", () => {
    // The title can be squeezed from 200 to 120, so the group's icons fit by length (380 of 420) but not at its natural size.
    const squeezable = [fixed("title", 120, 200), chrome[1]!, chrome[2]!];
    const input = bar(squeezable, 420);
    expect(stackTargets(input, words("marks", 5)).length).toBe(4);
    expect(ids(input, words("marks", 5))).toEqual([]);
    expect(ids(bar(squeezable, 460), words("marks", 5))).toEqual(["gap:0", "gap:1", "gap:2", "gap:3"]);
  });

  it("a fixed title that grows is not squeezed by a drop: it only gives back what it took", () => {
    // The title takes the whole bar (600) while alone; with the group beside it it is 520, still over its natural 100.
    const title: StackItem = { id: "title", used: 0, fixed: true, forms: [{ kind: "row", main: { min: 100, natural: 100, grows: true }, cross: { natural: 26 } }] };
    const input: StackInput = { axis: "row", length: 600, cross: { min: 30, max: 40 }, items: [title] };
    const dragged: StackItem = { id: "d", used: 1, forms: [form("row", 80), form("menu", 0)] };
    expect(stackTargets(input, dragged).length).toBe(2);
    expect(ids(input, dragged)).toEqual(["gap:0", "gap:1"]);
    // Down to the title's natural length plus the group (100 + 80) it is still a target; under it the bar overflows.
    expect(ids({ ...input, length: 180 }, dragged)).toEqual(["gap:0", "gap:1"]);
    expect(ids({ ...input, length: 179 }, dragged)).toEqual([]);
  });

  it("a squeezed title that grows back when a neighbour folds is not squeezed further", () => {
    const title = fixed("title", 120, 200);
    const input = bar([title, words("a", 1)], 400);
    const base = fitStack(input);
    // Before the drop the title is squeezed (180 of its 200) beside the open group.
    expect(base.items[0]!.rect.width).toBeCloseTo(180, 6);
    const dragged: StackItem = { id: "d", used: 5, forms: [form("row", 80), form("menu", 0)] };
    // The drop makes the group give way (its icons), so the title is back at its 200.
    const targets = stackTargets(input, dragged, { onlyFits: true });
    expect(targets.map((t) => t.id)).toEqual(["gap:0", "gap:1", "gap:2"]);
    for (const t of targets) {
      expect(t.fit.items.find((p) => p.id === "a")!.kind).toBe("icons");
      expect(t.fit.items.find((p) => p.id === "title")!.rect.width).toBeGreaterThan(base.items[0]!.rect.width);
    }
    // Squeezed further (a longer dragged item, the group already as small as it gets): refused.
    const wider: StackItem = { id: "d", used: 5, forms: [form("row", 150), form("menu", 0)] };
    expect(ids(input, wider)).toEqual([]);
    expect(stackTargets(input, wider).length).toBe(3);
  });

  it("a dragged item that is too wide across is a refusal; so is a gap that makes another item too wide", () => {
    const wide: StackItem = { id: "wide", used: 5, forms: [form("row", 60, 60, 60), form("menu", 0)] };
    const input = bar([chrome[0]!], 800);
    expect(stackTargets(input, wide).length).toBe(2);
    expect(ids(input, wide)).toEqual([]);
  });

  it("works with allows, accepts, previous, endReach, gap and pad, and in a column", () => {
    const input = { ...bar(chrome, 520), gap: 4, pad: { start: 4, end: 4 }, accepts: () => true };
    const previous = fitStack(input);
    // 370 + 90 + 3 gaps of 4 + 8 pad = 480 of 520: fits.
    expect(ids(input, words("marks", 5), { previous, endReach: 10, allows: (_d: StackItem, at: number) => at !== 1 })).toEqual(["gap:0", "gap:2", "gap:3"]);
    expect(ids({ ...input, length: 470 }, words("marks", 5))).toEqual([]);
    // A column of 50 px has no room for another group's icons (72).
    const column = stack([{ ...group("tools", 2), fixed: true }], 50);
    expect(stackTargets(column, group("x", 5)).length).toBe(2);
    expect(ids(column, group("x", 5))).toEqual([]);
    expect(ids(stack([panel("pages", 1), group("tools", 2)], 600), group("x", 5))).toEqual(["gap:0", "gap:1", "gap:2"]);
  });

  it("is off by default, and false is the default", () => {
    const input = bar(chrome, 300);
    expect(stackTargets(input, words("marks", 5), { onlyFits: false })).toEqual(stackTargets(input, words("marks", 5)));
  });
});

describe("onlyFits: sweep", () => {
  /** The rule, read from a drop's fit (not from the solver's code): the dragged item is drawn, nothing overflows or is newly too wide, no fixed item is squeezed. */
  const fitsBeside = (base: StackFit, fit: StackFit, dragged: string, fixedItems: readonly StackItem[], axis: StackInput["axis"]): boolean => {
    if (fit.items.find((p) => p.id === dragged)!.kind === "menu") return false;
    if (fit.notes.some((n) => n.code === "overflow")) return false;
    const before = new Set(base.notes.filter((n) => n.code === "too-wide").map((n) => (n as { id: string }).id));
    if (fit.notes.some((n) => n.code === "too-wide" && !before.has(n.id))) return false;
    const along = (r: { width: number; height: number }) => (axis === "column" ? r.height : r.width);
    const cross = (r: { width: number; height: number }) => (axis === "column" ? r.width : r.height);
    return fixedItems.every((it) => {
      const a = base.items.find((p) => p.id === it.id)!;
      const b = fit.items.find((p) => p.id === it.id)!;
      if (a.kind === "menu" || b.kind === "menu") return true;
      const f = it.forms[b.form]!;
      const natural = Math.max(f.main.min, f.main.natural);
      return b.form === a.form && along(b.rect) >= Math.min(along(a.rect), natural) - EPS && cross(b.rect) >= cross(a.rect) - EPS;
    });
  };

  it("a gap is a target exactly when its fit passes the rule; no kept hit covers a fixed item; some sweeps leave gaps, some none", () => {
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
      const dragged = rand() < 0.5 ? (axis === "row" ? barGroup("d", 0) : group("d", 0)) : panel("d", 0);
      const everything = stackTargets(input, dragged);
      const fits = stackTargets(input, dragged, { onlyFits: true });
      const base = fitStack(input);
      const fixedItems = input.items.filter((it) => it.fixed);
      const expected = everything.filter((t) => fitsBeside(base, t.fit, "d", fixedItems, axis));
      expect(fits.map((t) => t.id)).toEqual(expected.map((t) => t.id));
      expect(fits).toEqual(expected);
      for (const t of fits) {
        const hit = axis === "row" ? [t.hit.x, t.hit.x + t.hit.width] : [t.hit.y, t.hit.y + t.hit.height];
        input.items.forEach((it, i) => {
          if (!it.fixed || base.items[i]!.kind === "menu") return;
          const r = base.items[i]!.rect;
          const f = axis === "row" ? [r.x, r.x + r.width] : [r.y, r.y + r.height];
          expect(Math.min(hit[1]!, f[1]!) - Math.max(hit[0]!, f[0]!)).toBeLessThanOrEqual(EPS);
        });
      }
      if (fits.length === 0) none++;
      else if (fits.length === everything.length) all++;
      else some++;
    }
    // The sweep sees the three outcomes (fixed items change which fits, so some trials have every gap, some none).
    expect(none).toBeGreaterThan(0);
    expect(all).toBeGreaterThan(0);
    expect(some + none + all).toBe(400);
  });
});
