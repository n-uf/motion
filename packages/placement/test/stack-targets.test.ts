import { describe, expect, it } from "vitest";
import { fitStack, stackTargets, withItem, type StackInput, type StackItem } from "../src/stack";
import { group, mix, panel, seeded, stack } from "./stack-fixture";

const along = (axis: StackInput["axis"], r: { x: number; y: number; width: number; height: number }) => (axis === "column" ? { at: r.y, size: r.height } : { at: r.x, size: r.width });

describe("stackTargets", () => {
  const items = [panel("pages", 1), group("views", 2), panel("findings", 3)];

  it("C3: one target for every gap: before each item and at the end", () => {
    const targets = stackTargets(stack(items, 600), panel("notes", 9));
    expect(targets.map((t) => t.id)).toEqual(["gap:0", "gap:1", "gap:2", "gap:3"]);
    expect(targets.map((t) => t.place)).toEqual([0, 1, 2, 3].map((at) => ({ kind: "gap", at })));
    expect(targets.every((t) => t.priority === 2 && t.item === "notes")).toBe(true);
    // An empty stack has its one gap, over the whole rail.
    const empty = stackTargets(stack([], 600), group("zoom", 9));
    expect(empty.map((t) => t.id)).toEqual(["gap:0"]);
    expect(empty[0]!.hit).toEqual({ x: 0, y: 0, width: 30, height: 600 });
  });

  it("A4: a hit is as wide across as the stack or the drop's fit, whichever is larger, so the preview is under it", () => {
    // A panel dropped into a rail: the column opens to 240, the hits already reach that far.
    const rail = stackTargets(stack([group("views", 1)], 600), panel("pages", 9));
    for (const t of rail) {
      expect(t.fit.cross).toBe(240);
      expect(t.hit.width).toBe(240);
      expect(t.slot!.x + t.slot!.width).toBeLessThanOrEqual(t.hit.x + t.hit.width);
    }
    // A group dropped into an open column: the stack's own width.
    const open = stackTargets(stack([panel("pages", 1)], 600), group("tools", 9));
    for (const t of open) expect(t.hit.width).toBe(Math.max(240, t.fit.cross));
    // A bar: the same, across is the height.
    const bar = stackTargets(stack([group("views", 1)], 600, "row"), panel("pages", 9));
    for (const t of bar) expect(t.hit.height).toBe(Math.max(30, t.fit.cross));
    // Whatever the case, the preview lies inside the target's hit across.
    const rand = seeded(3);
    for (let trial = 0; trial < 20; trial++) {
      const input = stack(mix(rand, Math.floor(rand() * 5)), 100 + Math.floor(rand() * 500));
      for (const t of stackTargets(input, panel("d", 0, 140, false, 80 + Math.floor(rand() * 200)))) expect(t.slot!.x + t.slot!.width).toBeLessThanOrEqual(t.hit.x + t.hit.width + 1e-6);
    }
  });

  it("A3: an item of the input with the dragged id is lifted out first: a reorder within a stack", () => {
    const targets = stackTargets(stack(items, 600), items[0]!);
    // Three items, one lifted out: two left, three gaps.
    expect(targets.map((t) => t.id)).toEqual(["gap:0", "gap:1", "gap:2"]);
    for (const t of targets) {
      expect(t.input.items.map((i) => i.id).filter((id) => id === "pages")).toEqual(["pages"]);
      expect(t.fit.items).toHaveLength(3);
    }
    // After Findings: Views, Findings, Pages.
    expect(targets[2]!.input.items.map((i) => i.id)).toEqual(["views", "findings", "pages"]);
    expect(targets[2]!.fit.items.map((i) => i.id)).toEqual(["views", "findings", "pages"]);
    // The preview is the rect it gets after the move, as for an item from elsewhere.
    for (const t of targets) expect(t.slot).toEqual(fitStack(t.input).items[t.place.at]!.rect);
  });

  it("A2: a dragged item with no forms has no targets; an item with no forms in the stack still has its gaps", () => {
    expect(stackTargets(stack(items, 600), { id: "x", used: 1, forms: [] })).toEqual([]);
    const withEmpty = stack([panel("a", 1), { id: "none", used: 2, forms: [] }, panel("b", 3)], 600);
    const targets = stackTargets(withEmpty, group("g", 9));
    expect(targets).toHaveLength(4);
    for (const t of targets) expect(t.fit.items.find((i) => i.id === "g")!.rect).toEqual(t.slot);
    for (let i = 1; i < targets.length; i++) expect(targets[i]!.hit.y).toBeGreaterThanOrEqual(targets[i - 1]!.hit.y);
  });

  it("N6: with every item in the menu only the gap at the end has any length", () => {
    const input = stack([group("a", 1), group("b", 2), group("c", 3)], 28);
    const fit = fitStack(input);
    expect(fit.items.every((i) => i.kind === "menu")).toBe(true);
    const targets = stackTargets(input, group("d", 9));
    expect(targets.slice(0, -1).every((t) => t.hit.height === 0)).toBe(true);
    expect(targets.at(-1)!.hit.height).toBe(28);
  });

  it("the hits split the stack at the items' middles, gap after gap, with no hole", () => {
    const input = stack(items, 600);
    const fit = fitStack(input);
    const hits = stackTargets(input, panel("notes", 9)).map((t) => t.hit);
    const mids = fit.items.map((p) => p.rect.y + p.rect.height / 2);
    expect(hits.map((h) => h.y)).toEqual([0, ...mids]);
    expect(hits.map((h) => h.y + h.height)).toEqual([...mids, 600]);
    expect(hits.every((h) => h.x === 0 && h.width === fit.cross)).toBe(true);
  });

  it("a row splits along x", () => {
    const input = stack([panel("a", 1), panel("b", 2)], 500, "row");
    const hits = stackTargets(input, panel("c", 9)).map((t) => t.hit);
    expect(hits.every((h) => h.y === 0)).toBe(true);
    expect(hits[0]!.x).toBe(0);
    expect(hits.at(-1)!.x + hits.at(-1)!.width).toBe(500);
  });

  it("the marker is the line where the dragged item's leading edge lands", () => {
    const input = stack(items, 600);
    for (const t of stackTargets(input, panel("notes", 9))) {
      const r = t.fit.items[t.place.at]!.rect;
      expect(t.marker).toEqual({ x: r.x, y: r.y, width: r.width, height: 0 });
    }
    const row = stackTargets(stack([panel("a", 1)], 500, "row"), panel("b", 9));
    for (const t of row) {
      const r = t.fit.items[t.place.at]!.rect;
      expect(t.marker).toEqual({ x: r.x, y: r.y, width: 0, height: r.height });
    }
  });

  it("C1: the preview is exactly the rect the item gets after the drop, for every gap, length and dragged kind", () => {
    const rand = seeded(23);
    let checked = 0;
    for (const axis of ["column", "row"] as const) {
      for (let trial = 0; trial < 25; trial++) {
        const base = mix(rand, Math.floor(rand() * 6));
        for (const dragged of [panel("d", 0, 180), group("d", 0), panel("d", 0, 120, true), { ...panel("d", 0, 150), from: 1 }]) {
          for (let length = 0; length <= 700; length += 37) {
            const input = stack(base, length, axis);
            for (const t of stackTargets(input, dragged)) {
              const k = t.place.at;
              // What a drop does: the same stack with the item inserted, solved. The dragged item is the newest.
              const newest = Math.max(dragged.used, ...base.map((i) => i.used)) + 1;
              const dropped = fitStack(withItem(input, { ...dragged, used: newest }, k));
              expect(t.slot).toEqual(dropped.items[k]!.rect);
              expect(t.fit).toEqual(dropped);
              expect(fitStack(t.input)).toEqual(dropped);
              expect(t.fit.items[k]!.id).toBe("d");
              expect(t.input.items.map((i) => i.id)).toEqual(withItem(input, dragged, k).items.map((i) => i.id));
              checked++;
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(5000);
  });

  it("the hits tile the stack, in the order of the gaps, whatever the lengths and forms", () => {
    const rand = seeded(5);
    for (const axis of ["column", "row"] as const) {
      for (let trial = 0; trial < 30; trial++) {
        const base = mix(rand, Math.floor(rand() * 7));
        for (let length = 0; length <= 700; length += 29) {
          const input = stack(base, length, axis);
          const hits = stackTargets(input, group("d", 0)).map((t) => along(axis, t.hit));
          expect(hits.length).toBe(base.length + 1);
          expect(hits[0]!.at).toBe(0);
          for (let i = 1; i < hits.length; i++) expect(hits[i]!.at).toBeCloseTo(hits[i - 1]!.at + hits[i - 1]!.size, 6);
          expect(hits.at(-1)!.at + hits.at(-1)!.size).toBeCloseTo(length, 6);
          for (const h of hits) expect(h.size).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it("C4: a dragged group lands in the form that fits", () => {
    const tools = (used = 0): StackItem => group("tools", used);
    // Beside an open panel in a column there is room for a block of words; folded into a tight one it is icons.
    const roomy = stackTargets(stack([panel("pages", 1)], 800), tools());
    expect(roomy.map((t) => t.fit.items[t.place.at]!.kind)).toEqual(["row", "row"]);
    // The column holds only groups: a rail, and the group is icons whichever gap it goes to.
    const rail = stackTargets(stack([group("views", 1), group("zoom", 2)], 800), tools());
    expect(rail.map((t) => t.fit.items[t.place.at]!.kind)).toEqual(["icons", "icons", "icons"]);
    expect(rail.every((t) => t.fit.cross === 30)).toBe(true);
    // Short of length: the others, older than the newcomer, give way first.
    const tight = stackTargets(stack([panel("pages", 1), panel("notes", 2)], 250), tools());
    for (const t of tight) {
      expect(t.fit.items[t.place.at]!.form).toBe(0);
      expect(t.fit.notes).toEqual([{ code: "form-down", id: "pages", from: 0, to: 1 }]);
    }
  });

  it("a panel dropped into a rail column opens it to the panel's width", () => {
    const targets = stackTargets(stack([group("views", 1), group("tools", 2)], 600), panel("pages", 9));
    expect(targets.every((t) => t.fit.cross === 240 && t.fit.items[t.place.at]!.kind === "open")).toBe(true);
    // The hits reach as far across as the column will be after the drop.
    expect(targets[0]!.hit.width).toBe(240);
  });

  it("a gap next to an item in the menu has a hit of its own, ordered with the rest", () => {
    const input = stack([group("a", 1), group("b", 2), group("c", 3)], 90);
    const fit = fitStack(input);
    expect(fit.menu).not.toBeNull();
    const targets = stackTargets(input, group("d", 9));
    expect(targets).toHaveLength(4);
    for (let i = 1; i < targets.length; i++) expect(targets[i]!.hit.y).toBeGreaterThanOrEqual(targets[i - 1]!.hit.y);
  });
});
