/**
 * C28, a group takes its own size across: the opt-in `StackInput.ownCross`. An item whose current form is a group kind
 * (`row`, `stacked`, `icons`, `fold`) is drawn at its own `cross.natural` (clamped to the stack's), from the start edge,
 * whether or not the form sets the cross size; panel kinds (`open`, `header`, `rail`) and the » entry span the stack;
 * hits and markers span it too.
 */
import { describe, expect, it } from "vitest";
import { fitStack, stackTargets, type StackFit, type StackForm, type StackInput, type StackItem } from "../src/stack";
import { barGroup, group, limits, mix, panel, seeded, stack } from "./stack-fixture";

const GROUP_KINDS = new Set<string>(["row", "stacked", "icons", "fold"]);

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

  it("open panels of different natural widths all span the column, as wide as the widest; so do the headers and rail icons", () => {
    const panels = [panel("a", 1, 160, false, 200), panel("b", 2, 160, false, 300)];
    const both = fitStack({ ...stack(panels, 600), ownCross: true });
    expect(both.items.map((p) => p.kind)).toEqual(["open", "open"]);
    expect(both.cross).toBe(300);
    expect(both.items.map((p) => [p.rect.x, p.rect.width])).toEqual([[0, 300], [0, 300]]);
    // Too short for both: the oldest folds to its header (200 across by its own form), which still fills the 300 column.
    const folded = fitStack({ ...stack(panels, 150), ownCross: true });
    expect(folded.items.map((p) => p.kind)).toEqual(["header", "open"]);
    expect(folded.items.map((p) => p.rect.width)).toEqual([300, 300]);
    // A rail icon (30 across by its form) fills the column too; the stack is the same as without ownCross.
    const rail = fitStack({ ...stack([panel("a", 1), panel("b", 2), panel("c", 3)], 100), ownCross: true });
    expect(rail.items.some((p) => p.kind === "rail")).toBe(true);
    for (const p of rail.items) expect(p.rect.width).toBe(rail.cross);
  });

  it("the form's kind decides, not setsCross: a panel form spans even when it sets nothing; a group's form that sets the cross size is drawn at its own width", () => {
    const solo: StackItem = { id: "x", used: 1, forms: [form("open", 50, 150, false), form("menu", 0, 0)] };
    const withPanel = { ...stack([panel("pages", 1), solo], 600), ownCross: true };
    expect(fitStack(withPanel).items[1]!.rect.width).toBe(240);
    // A group's form that doesn't set it is its own size too, whatever its `setsCross: false` says.
    const quiet: StackItem = { id: "q", used: 1, forms: [form("stacked", 50, 70, false), form("menu", 0, 0)] };
    expect(fitStack({ ...stack([panel("pages", 1), quiet], 600), ownCross: true }).items[1]!.rect.width).toBe(70);
    const setter: StackItem = { id: "y", used: 1, forms: [form("row", 50, 90, true), form("menu", 0, 0)] };
    const fit = fitStack({ ...stack([setter], 600), ownCross: true });
    expect(fit.cross).toBe(limits.min);
    expect(fit.items[0]!.rect.width).toBe(90);
  });

  /** The forms a group should have in a side column: stacked words (one word per line, sets the cross size), icons, the menu. */
  const column = (id: string, used: number, wide: number): StackItem => ({ id, used, forms: [form("stacked", 78, wide, true), form("icons", 72, 28), form("menu", 0, 0)] });

  it("a column holding only groups in their stacked form is as wide as the widest one; each group is drawn at its own width", () => {
    const narrow = { min: 40, max: 360 };
    const input: StackInput = { axis: "column", length: 600, cross: narrow, items: [column("views", 1, 84), column("tools", 2, 110), column("marks", 3, 96)] };
    const plain = fitStack(input);
    expect(plain.items.map((p) => p.kind)).toEqual(["stacked", "stacked", "stacked"]);
    expect(plain.cross).toBe(110);
    expect(plain.items.map((p) => p.rect.width)).toEqual([110, 110, 110]);
    const own = fitStack({ ...input, ownCross: true });
    expect(own.cross).toBe(110);
    expect(own.items.map((p) => [p.rect.x, p.rect.width])).toEqual([[0, 84], [0, 110], [0, 96]]);
    // Folded to icons (started there), none sets the cross size: the column is a rail and each icon group its own 28.
    const short = fitStack({ ...input, items: input.items.map((it) => ({ ...it, from: 1 })), ownCross: true });
    expect(short.items.map((p) => p.kind)).toEqual(["icons", "icons", "icons"]);
    expect(short.cross).toBe(30);
    expect(short.items.map((p) => p.rect.width)).toEqual([28, 28, 28]);
  });

  it("beside a wider open panel ownCross keeps each group at its own width, the panel spans the column", () => {
    const input: StackInput = { axis: "column", length: 600, cross: { min: 40, max: 360 }, ownCross: true, items: [panel("pages", 1), column("views", 2, 84), column("tools", 3, 110)] };
    const fit = fitStack(input);
    expect(fit.cross).toBe(240);
    expect(fit.items.map((p) => [p.id, p.rect.x, p.rect.width])).toEqual([["pages", 0, 240], ["views", 0, 84], ["tools", 0, 110]]);
    // Without the option each stretches across the column, as ever.
    expect(fitStack({ ...input, ownCross: false }).items.map((p) => p.rect.width)).toEqual([240, 240, 240]);
    // A group dropped in: its preview is its own width, the hit and the marker span the column.
    for (const t of stackTargets(input, column("marks", 9, 96))) {
      expect(t.slot!.width).toBe(96);
      expect(t.hit.width).toBe(240);
      expect(t.marker.width).toBe(240);
    }
  });

  it("dropping a words group into an empty side column makes it as wide as its stacked words, not as a row", () => {
    const input: StackInput = { axis: "column", length: 600, cross: { min: 40, max: 360 }, ownCross: true, items: [] };
    const [t] = stackTargets(input, column("marks", 9, 96));
    expect(t!.fit.cross).toBe(96);
    expect(t!.slot!.width).toBe(96);
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
        // Panel kinds and the » entry span; group kinds are their own size.
        if (!GROUP_KINDS.has(p.kind)) expect(size).toBe(own.cross);
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
