/**
 * C29, a bar's reserved room: `StackItem.fixed`. A fixed item never gives way (it keeps its first allowed form), is
 * never dragged, has no drop slot inside it (the gaps beside it stay, its own area is in no gap's hit), counts toward
 * the length, and takes no part in `previous`'s growing back. The sample is a title bar: the window title and the window
 * controls are fixed, the toolbar groups between them are not.
 */
import { describe, expect, it } from "vitest";
import { fitStack, stackTargets, type StackFit, type StackForm, type StackInput, type StackItem } from "../src/stack";
import { barGroup, group, mix, panel, seeded, stack } from "./stack-fixture";

const EPS = 1e-6;
const form = (kind: StackForm["kind"], min: number, cross = 26): StackForm => ({ kind, main: { min, natural: min }, cross: { natural: cross } });
/** The window title: a fixed 160 px; its second form is shorter, but a fixed item never takes it. */
const title = (used = 0): StackItem => ({ id: "title", used, fixed: true, forms: [form("row", 160), form("icons", 40), form("menu", 0)] });
/** The window controls: a fixed 72 px. */
const controls = (used = 0): StackItem => ({ id: "controls", used, fixed: true, forms: [form("row", 72)] });
const bar = (items: readonly StackItem[], length: number): StackInput => stack(items, length, "row");

const range = (axis: StackInput["axis"], r: { x: number; y: number; width: number; height: number }): [number, number] => (axis === "column" ? [r.y, r.y + r.height] : [r.x, r.x + r.width]);
const overlap = (a: [number, number], b: [number, number]): number => Math.min(a[1], b[1]) - Math.max(a[0], b[0]);

describe("C29: a fixed item never gives way", () => {
  it("the others give way around it, and it keeps its first form however short the bar is", () => {
    const items = [title(), barGroup("a", 1), barGroup("b", 2), controls()];
    const roomy = fitStack(bar(items, 900));
    expect(roomy.items.map((p) => p.kind)).toEqual(["row", "row", "row", "row"]);
    for (const length of [600, 420, 330, 280, 240, 200, 100, 0]) {
      const fit = fitStack(bar(items, length));
      expect(fit.items[0]!.form).toBe(0);
      expect(fit.items[3]!.form).toBe(0);
      expect(fit.notes.filter((n) => (n.code === "form-down" || n.code === "to-menu") && (n.id === "title" || n.id === "controls"))).toEqual([]);
    }
    // Both groups folded to the menu, the fixed items in place: title, » entry, controls would be too long for 200, so it overflows.
    const tight = fitStack(bar(items, 150));
    expect(tight.items.map((p) => p.kind)).toEqual(["row", "menu", "menu", "row"]);
    expect(tight.notes.some((n) => n.code === "overflow")).toBe(true);
  });

  it("is skipped as the victim even when it is the oldest, unkept item: a younger, kept item gives way instead", () => {
    const old = { ...title(), used: -5 };
    const kept = { ...barGroup("a", 9, true) };
    const fit = fitStack(bar([old, kept], 330));
    expect(fit.items[0]!.form).toBe(0);
    expect(fit.items[1]!.form).toBeGreaterThan(0);
  });

  it("keeps its first allowed form: from picks it", () => {
    const folded: StackItem = { ...title(), from: 1 };
    const fit = fitStack(bar([folded, barGroup("a", 1)], 200));
    expect(fit.items[0]!.form).toBe(1);
    expect(fit.items[0]!.rect.width).toBe(40);
    expect(fit.notes.some((n) => n.code === "form-down" && n.id === "title")).toBe(false);
  });

  it("a stack of only fixed items too long for it overflows and never steps", () => {
    const fit = fitStack(bar([title(), controls()], 100));
    expect(fit.items.map((p) => p.form)).toEqual([0, 0]);
    expect(fit.menu).toBeNull();
    expect(fit.notes).toEqual([{ code: "overflow", over: 160 + 72 - 100 }]);
  });

  it("never steps down for the cross size either; the too-wide note says so", () => {
    const wide = (id: string, fixed: boolean): StackItem => ({ id, used: 0, ...(fixed ? { fixed } : {}), forms: [form("row", 60, 300), form("icons", 40, 28), form("menu", 0, 0)] });
    // An open panel makes the column 240 wide; a group whose row needs 300 across doesn't fit it.
    const fit = fitStack(stack([panel("pages", 1), wide("held", true), wide("free", false)], 600));
    expect(fit.items.find((p) => p.id === "held")!.form).toBe(0);
    expect(fit.items.find((p) => p.id === "free")!.form).toBe(1);
    expect(fit.notes.some((n) => n.code === "too-wide" && n.id === "held")).toBe(true);
  });

  it("counts toward the length: the others have that much less room", () => {
    const groups = [barGroup("a", 1), barGroup("b", 2)];
    const without = fitStack(bar(groups, 440));
    const withFixed = fitStack(bar([title(), ...groups], 440));
    expect(without.items.map((p) => p.kind)).toEqual(["row", "row"]);
    expect(withFixed.items.slice(1).map((p) => p.kind)).not.toEqual(["row", "row"]);
    expect(withFixed.need).toBeGreaterThan(160);
    const sum = fitStack(bar([title(), controls()], 600)).need;
    expect(sum).toBe(232);
  });

  it("a fixed form that grows still takes spare length, as any form does", () => {
    const grows: StackItem = { id: "title", used: 0, fixed: true, forms: [{ kind: "row", main: { min: 100, natural: 100, grows: true }, cross: { natural: 26 } }] };
    const fit = fitStack(bar([grows, controls()], 400));
    expect(fit.items[0]!.rect.width).toBe(400 - 72);
  });
});

describe("C29: never dragged, no slot inside it", () => {
  it("a fixed dragged item has no targets, in the stack or out of it", () => {
    const input = bar([title(), barGroup("a", 1), controls()], 700);
    expect(stackTargets(input, title())).toEqual([]);
    expect(stackTargets(input, controls())).toEqual([]);
    expect(stackTargets(input, { ...barGroup("x", 1), fixed: true })).toEqual([]);
    expect(stackTargets(input, barGroup("x", 1)).length).toBeGreaterThan(0);
  });

  it("the gaps before and after a fixed item stay; its own area is in no hit", () => {
    const input = bar([title(), barGroup("a", 1), barGroup("b", 2), controls()], 900);
    const base = fitStack(input);
    const targets = stackTargets(input, barGroup("x", 9), { endReach: 10 });
    expect(targets.map((t) => t.id)).toEqual(["gap:0", "gap:1", "gap:2", "gap:3", "gap:4"]);
    const [t0, t1, , t3, t4] = targets;
    const titleRect = range("row", base.items[0]!.rect);
    const controlsRect = range("row", base.items[3]!.rect);
    // Gap 0 (before the title) stops where the title starts; gap 1 (after it) starts where it ends.
    expect(t0!.hit.x).toBe(-10);
    expect(t0!.hit.x + t0!.hit.width).toBe(titleRect[0]);
    expect(t1!.hit.x).toBe(titleRect[1]);
    // Gap 3 (before the controls) stops where they start, gap 4 begins where they end and reaches past the bar.
    expect(t3!.hit.x + t3!.hit.width).toBe(controlsRect[0]);
    expect(t4!.hit.x).toBe(controlsRect[1]);
    expect(t4!.hit.x + t4!.hit.width).toBe(900 + 10);
    for (const t of targets) for (const r of [titleRect, controlsRect]) expect(overlap([t.hit.x, t.hit.x + t.hit.width], r)).toBeLessThanOrEqual(EPS);
    // The unfixed middle is split at the item's middle as ever.
    const a = range("row", base.items[1]!.rect);
    expect(t1!.hit.x + t1!.hit.width).toBe((a[0] + a[1]) / 2);
  });

  it("the same bar without fixed items is split at every middle, as before", () => {
    const items = [barGroup("a", 1), barGroup("b", 2)];
    const base = fitStack(bar(items, 700));
    const targets = stackTargets(bar(items, 700), barGroup("x", 9));
    const a = range("row", base.items[0]!.rect);
    expect(targets[0]!.hit.x + targets[0]!.hit.width).toBe((a[0] + a[1]) / 2);
  });

  it("works in a column, with previous, and with a fixed item in the menu or overflowing", () => {
    const col = stack([{ ...group("g", 1), fixed: true }, group("h", 2)], 400);
    const prev = fitStack(col);
    const base = fitStack(col, { previous: prev });
    const targets = stackTargets(col, group("x", 9), { previous: prev });
    const g = range("column", base.items[0]!.rect);
    expect(targets[0]!.hit.y + targets[0]!.hit.height).toBe(g[0]);
    expect(targets[1]!.hit.y).toBe(g[1]);
    // Overflowing (the fixed items are 232 long in a bar of 100): the hits are out of the fixed items, which run past the bar.
    const over = bar([title(), controls()], 100);
    const overFit = fitStack(over);
    for (const t of stackTargets(over, barGroup("x", 9), { endReach: 10 })) {
      expect(t.hit.width).toBeGreaterThanOrEqual(0);
      for (const p of overFit.items) expect(overlap([t.hit.x, t.hit.x + t.hit.width], range("row", p.rect))).toBeLessThanOrEqual(EPS);
    }
    // A fixed item that starts in the menu has no rect: the gaps beside it are a point.
    const inMenu: StackItem = { id: "m", used: 0, fixed: true, forms: [form("menu", 0)] };
    const fit = stackTargets(bar([inMenu, barGroup("a", 1)], 500), barGroup("x", 9));
    expect(fit.map((t) => t.id)).toEqual(["gap:0", "gap:1", "gap:2"]);
  });
});

describe("C29: previous growth", () => {
  it("a fixed item takes no part in growing back: the same form through a shrink and a grow, the others grow as without it", () => {
    const items = [title(), barGroup("a", 1), barGroup("b", 2), controls()];
    let previous: StackFit | undefined;
    const lengths = [900, 500, 330, 240, 160, 330, 500, 900];
    for (const length of lengths) {
      const fit = fitStack(bar(items, length), previous ? { previous } : {});
      expect(fit.items[0]!.form).toBe(0);
      expect(fit.items[3]!.form).toBe(0);
      previous = fit;
    }
    // Back at the full length, everything is open as at the start.
    expect(previous!.items.map((p) => p.kind)).toEqual(["row", "row", "row", "row"]);
    // A hand-made previous that has the fixed item in another form is ignored for it.
    const forged: StackFit = { ...fitStack(bar(items, 900)), items: fitStack(bar(items, 900)).items.map((p) => (p.id === "title" ? { ...p, form: 1, kind: "icons" as const } : p)) };
    expect(fitStack(bar(items, 900), { previous: forged }).items[0]!.form).toBe(0);
  });
});

describe("C29: sweeps", () => {
  /** A bar or a column of random items, some of them fixed (about a third, and sometimes a title and controls at the ends). */
  function randomStack(rand: () => number): { input: StackInput; fixed: Map<string, number> } {
    const axis: StackInput["axis"] = rand() < 0.5 ? "column" : "row";
    const items = mix(rand, 1 + Math.floor(rand() * 5)).map((it) => (it.id.startsWith("g") && axis === "row" ? barGroup(it.id, it.used, it.kept === true) : it));
    const fixedItems = items.map((it): StackItem => (rand() < 0.35 ? { ...it, fixed: true } : it));
    const withEnds = axis === "row" && rand() < 0.5 ? [title(), ...fixedItems, controls()] : fixedItems;
    const fixed = new Map<string, number>();
    for (const it of withEnds) if (it.fixed) fixed.set(it.id, Math.min(Math.max(0, it.from ?? 0), it.forms.length - 1));
    return { input: stack(withEnds, 0, axis), fixed };
  }

  it("fixed items never change form; the invariants hold: nothing overlaps, forms are declared, the menu lists the menu items", () => {
    const rand = seeded(29);
    let runs = 0;
    for (let trial = 0; trial < 120; trial++) {
      const { input: base, fixed } = randomStack(rand);
      let previous: StackFit | undefined;
      // A long run of lengths up and down, with and without `previous`.
      const lengths = Array.from({ length: 40 }, () => Math.floor(rand() * 800));
      for (const length of lengths) {
        const input = { ...base, length };
        for (const fit of [fitStack(input), (previous = fitStack(input, previous ? { previous } : {}))]) {
          runs++;
          fit.items.forEach((p, i) => {
            const it = input.items[i]!;
            expect(p.form).toBeGreaterThanOrEqual(0);
            expect(p.form).toBeLessThan(it.forms.length);
            expect(p.kind).toBe(it.forms[p.form]!.kind);
            if (it.fixed) expect(p.form).toBe(fixed.get(it.id));
          });
          // No fixed item has a form-down note; one in the menu is there only because it started there.
          for (const n of fit.notes) if (n.code === "form-down") expect(fixed.has(n.id)).toBe(false);
          for (const n of fit.notes) if (n.code === "to-menu" && fixed.has(n.id)) expect(input.items.find((it) => it.id === n.id)!.forms[fixed.get(n.id)!]!.kind).toBe("menu");
          const drawn = fit.items.filter((p) => p.kind !== "menu").map((p) => range(input.axis, p.rect));
          for (let i = 1; i < drawn.length; i++) expect(drawn[i]![0]).toBeGreaterThanOrEqual(drawn[i - 1]![1] - EPS);
          expect(fit.menu?.items ?? []).toEqual(fit.items.filter((p) => p.kind === "menu").map((p) => p.id));
          // A fixed item counts toward the length: unless the stack overflows, the drawn items end inside it.
          if (!fit.notes.some((n) => n.code === "overflow")) expect(Math.max(0, ...drawn.map((d) => d[1]))).toBeLessThanOrEqual(length + EPS);
        }
      }
    }
    expect(runs).toBeGreaterThan(8000);
  });

  it("no gap hit overlaps a fixed item's rect, the gaps before and after it stay, and the invariants of the targets hold", () => {
    const rand = seeded(290);
    for (let trial = 0; trial < 300; trial++) {
      const { input: base } = randomStack(rand);
      const input = { ...base, length: 60 + Math.floor(rand() * 700), ...(rand() < 0.3 ? { gap: 6, pad: { start: 4, end: 4 } } : {}) };
      const reach = rand() < 0.5 ? 0 : 12;
      const dragged = rand() < 0.5 ? (input.axis === "row" ? barGroup("d", 0) : group("d", 0)) : panel("d", 0);
      const base0 = fitStack(input);
      const targets = stackTargets(input, dragged, { endReach: reach });
      // One target per gap of the stack, the fixed items included.
      expect(targets.map((t) => t.place.at)).toEqual(Array.from({ length: input.items.length + 1 }, (_, k) => k));
      for (const t of targets) {
        const hit = range(input.axis, t.hit);
        expect(hit[1]).toBeGreaterThanOrEqual(hit[0] - EPS);
        input.items.forEach((it, i) => {
          const p = base0.items[i]!;
          if (!it.fixed || p.kind === "menu") return;
          expect(overlap(hit, range(input.axis, p.rect)), `${t.id} over ${it.id}`).toBeLessThanOrEqual(EPS);
        });
        // The preview is the fit the drop makes.
        expect(t.slot).toEqual(fitStack(t.input).items.find((p) => p.id === "d")!.rect);
        // The fixed items are in the preview in their first form too.
        for (const p of t.fit.items) {
          const it = t.input.items.find((x) => x.id === p.id)!;
          if (it.fixed) expect(p.form).toBe(Math.min(Math.max(0, it.from ?? 0), it.forms.length - 1));
        }
      }
      // Dragging a fixed item gives nothing.
      const f = input.items.find((it) => it.fixed);
      if (f) expect(stackTargets(input, f)).toEqual([]);
    }
  });
});
