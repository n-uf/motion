/**
 * C28, a group takes its own size across: the opt-in `StackInput.ownCross`. An item whose current form doesn't set the
 * cross size is drawn at its own `cross.natural` (clamped to the stack's), from the start edge; forms that set it, and
 * the » entry, still span the stack; hits and markers still span it.
 */
import { describe, expect, it } from "vitest";
import { formSetsCross, fitStack, stackTargets, type StackFit, type StackForm, type StackInput, type StackItem } from "../src/stack";
import { barGroup, group, limits, mix, panel, seeded, stack } from "./stack-fixture";

const across = (axis: StackInput["axis"], r: { x: number; y: number; width: number; height: number }) => (axis === "column" ? { start: r.x, size: r.width } : { start: r.y, size: r.height });
const form = (kind: StackForm["kind"], min: number, cross: number, setsCross?: boolean): StackForm => ({ kind, main: { min, natural: min }, cross: { natural: cross }, ...(setsCross === undefined ? {} : { setsCross }) });

describe("C28: ownCross", () => {
  it("a group beside an open panel is as wide as its form asks, from the left; the panel and the stack are as wide as ever", () => {
    const input = stack([panel("pages", 1), group("tools", 2)], 600);
    const plain = fitStack(input);
    const own = fitStack({ ...input, ownCross: true });
    expect(plain.cross).toBe(240);
    expect(own.cross).toBe(240);
    expect(plain.items.map((p) => p.rect.width)).toEqual([240, 240]);
    expect(own.items.map((p) => p.rect.width)).toEqual([240, 180]);
    expect(own.items[1]!.rect.x).toBe(0);
    // Nothing else moves: forms, kinds, notes, and the rects along the stack.
    expect(own.items.map(({ rect, ...rest }) => ({ ...rest, y: rect.y, height: rect.height }))).toEqual(plain.items.map(({ rect, ...rest }) => ({ ...rest, y: rect.y, height: rect.height })));
    expect(own.notes).toEqual(plain.notes);
    expect(own.need).toBe(plain.need);
  });

  it("a group alone in a rail is as wide as its icons, not the rail; a stacked group as wide as its stacked words", () => {
    const rail = fitStack({ ...stack([group("tools", 1)], 600), ownCross: true });
    expect(rail.items[0]!.kind).toBe("icons");
    expect(rail.cross).toBe(30);
    expect(rail.items[0]!.rect.width).toBe(28);
    // Stacked: the panel is opened narrow (100 across), the group's row (180) doesn't fit, so its stacked words (84) do.
    const narrow = fitStack({ ...stack([panel("pages", 1, 160, false, 100), group("tools", 2)], 600), ownCross: true });
    expect(narrow.items[1]!.kind).toBe("stacked");
    expect(narrow.items[1]!.rect.width).toBe(84);
  });

  it("a form that sets the cross size spans the stack, and so does a header folded in a column an open panel made wide", () => {
    const own = fitStack({ ...stack([panel("a", 1, 160, true, 200), panel("b", 2, 160, false, 300)], 200), ownCross: true });
    // The two panels can't both stay open: whichever is open spans the column, whichever is folded to a header takes its natural across (clamped).
    for (const p of own.items) {
      if (p.kind === "open") expect(p.rect.width).toBe(own.cross);
      else expect(p.rect.width).toBeLessThanOrEqual(own.cross);
    }
    const opts = fitStack({ ...stack([{ id: "x", used: 1, forms: [form("row", 50, 90, true), form("icons", 20, 28)] }], 400), ownCross: true });
    expect(opts.items[0]!.rect.width).toBe(opts.cross);
  });

  it("an explicit setsCross: false on an open form takes its own size; true on a group's form spans", () => {
    const solo: StackItem = { id: "x", used: 1, forms: [form("open", 50, 150, false), form("menu", 0, 0)] };
    const withPanel = { ...stack([panel("pages", 1), solo], 600), ownCross: true };
    expect(fitStack(withPanel).items[1]!.rect.width).toBe(150);
    const setter: StackItem = { id: "y", used: 1, forms: [form("row", 50, 90, true), form("menu", 0, 0)] };
    const fit = fitStack({ ...stack([setter], 600), ownCross: true });
    expect(fit.cross).toBe(90 < limits.min ? limits.min : 90);
    expect(fit.items[0]!.rect.width).toBe(fit.cross);
  });

  it("an own size over the stack's is clamped to it; an own size under zero or not a number is 0 or the stack's", () => {
    const wide: StackItem = { id: "w", used: 1, forms: [{ kind: "row", main: { min: 40, natural: 40 }, cross: { natural: 500, min: 10 } }] };
    const neg: StackItem = { id: "n", used: 1, forms: [{ kind: "row", main: { min: 40, natural: 40 }, cross: { natural: -5, min: 0 } }] };
    const nan: StackItem = { id: "m", used: 1, forms: [{ kind: "row", main: { min: 40, natural: 40 }, cross: { natural: Number.NaN, min: 0 } }] };
    const fit = fitStack({ ...stack([panel("pages", 1), wide, neg, nan], 600), ownCross: true });
    expect(fit.cross).toBe(240);
    expect(fit.items.map((p) => p.rect.width)).toEqual([240, 240, 0, 240]);
  });

  it("a bar: the group's own height from the top; the » entry still spans the bar", () => {
    const input: StackInput = { ...stack([barGroup("a", 1), barGroup("b", 2), barGroup("c", 3)], 260, "row"), ownCross: true };
    const fit = fitStack(input);
    expect(fit.menu).not.toBeNull();
    for (const p of fit.items) {
      if (p.kind === "menu") expect(p.rect.height).toBe(fit.cross);
      else {
        expect(p.rect.y).toBe(0);
        expect(p.rect.height).toBe(input.items.find((it) => it.id === p.id)!.forms[p.form]!.cross.natural);
        expect(p.rect.height).toBeLessThanOrEqual(fit.cross);
      }
    }
    expect(fit.menu!.rect).toEqual({ x: fit.menu!.rect.x, y: 0, width: 28, height: fit.cross });
  });

  it("targets: the preview is the item's own size; hits and the marker span the stack", () => {
    const input: StackInput = { ...stack([panel("pages", 1), panel("findings", 2)], 600), ownCross: true };
    const targets = stackTargets(input, group("tools", 9));
    expect(targets).toHaveLength(3);
    for (const t of targets) {
      expect(t.slot!.width).toBe(180);
      expect(t.slot!.x).toBe(0);
      expect(t.hit.width).toBe(240);
      expect(t.marker.width).toBe(t.fit.cross);
      // The preview is the rect the drop makes.
      expect(t.slot).toEqual(fitStack(t.input).items.find((p) => p.id === "tools")!.rect);
    }
    const bar: StackInput = { ...stack([barGroup("a", 1)], 600, "row"), ownCross: true };
    for (const t of stackTargets(bar, barGroup("b", 9))) {
      expect(t.slot!.height).toBe(26);
      expect(t.hit.height).toBe(Math.max(30, t.fit.cross));
      expect(t.marker.height).toBe(t.fit.cross);
    }
  });

  it("works with previous, gap and pad", () => {
    const input: StackInput = { ...stack([panel("pages", 1), group("tools", 2)], 400), ownCross: true, gap: 6, pad: { start: 4, end: 4 } };
    const first = fitStack(input);
    const again = fitStack({ ...input, length: 500 }, { previous: first });
    expect(again.items[1]!.rect.width).toBe(180);
    expect(again.items[1]!.rect.x).toBe(0);
  });
});

describe("C28: sweep", () => {
  const rectsInside = (fit: StackFit, axis: StackInput["axis"]): void => {
    for (const p of fit.items) {
      const a = across(axis, p.rect);
      expect(a.start).toBe(0);
      expect(a.size).toBeGreaterThanOrEqual(0);
      expect(a.size).toBeLessThanOrEqual(fit.cross + 1e-9);
    }
  };

  it("rects stay inside the stack across and start at its edge; forms, notes and lengths are as without ownCross; sizes are the own natural, clamped", () => {
    const rand = seeded(28);
    for (let trial = 0; trial < 500; trial++) {
      const axis: StackInput["axis"] = rand() < 0.5 ? "column" : "row";
      const items = mix(rand, 1 + Math.floor(rand() * 6)).map((it, i) => (axis === "row" && it.id.startsWith("g") ? barGroup(it.id, it.used, it.kept === true) : { ...it, id: `${it.id}-${i}` }));
      const input = stack(items, 60 + Math.floor(rand() * 600), axis);
      const plain = fitStack(input);
      const own = fitStack({ ...input, ownCross: true });
      rectsInside(own, axis);
      expect(own.cross).toBe(plain.cross);
      expect(own.notes).toEqual(plain.notes);
      expect(own.need).toBe(plain.need);
      expect(own.menu).toEqual(plain.menu);
      expect(own.items.map((p) => [p.id, p.form, p.kind])).toEqual(plain.items.map((p) => [p.id, p.form, p.kind]));
      own.items.forEach((p, i) => {
        const q = plain.items[i]!;
        // Along the stack: the same rect.
        if (axis === "column") expect([p.rect.y, p.rect.height]).toEqual([q.rect.y, q.rect.height]);
        else expect([p.rect.x, p.rect.width]).toEqual([q.rect.x, q.rect.width]);
        const item = input.items.find((it) => it.id === p.id)!;
        const f = item.forms[p.form]!;
        const size = across(axis, p.rect).size;
        if (p.kind === "menu" || formSetsCross(f)) expect(size).toBe(own.cross);
        else expect(size).toBe(Math.min(own.cross, Math.max(0, f.cross.natural)));
      });
      // Targets: previews in the same bounds, hits and markers over the stack.
      for (const t of stackTargets({ ...input, ownCross: true }, rand() < 0.5 ? group("d", 0) : panel("d", 0))) {
        rectsInside(t.fit, axis);
        expect(across(axis, t.marker).size).toBe(t.fit.cross);
        expect(across(axis, t.hit).size).toBeGreaterThanOrEqual(own.cross - 1e-9);
      }
    }
  });
});
