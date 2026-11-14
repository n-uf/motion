/**
 * C23, a press is not a reshape: `fitStack(input, { previous })` keeps the previous forms while they still fit, so a change
 * of ages alone reshapes nothing. Ages decide who gives way anew (the length shrank, an item was added or opened); room that
 * came back is used.
 */
import { describe, expect, it } from "vitest";
import { fitStack, stackTargets, type StackFit, type StackForm, type StackInput, type StackItem } from "../src/stack";
import { group, mix, panel, seeded, stack } from "./stack-fixture";

const kinds = (fit: StackFit) => fit.items.map((i) => i.kind);
/** `items` with item `id` pressed: it counts as just used. */
const pressed = (items: readonly StackItem[], id: string): StackItem[] => {
  const newest = Math.max(...items.map((i) => i.used)) + 1;
  return items.map((it) => (it.id === id ? { ...it, used: newest } : it));
};

describe("C23: previous", () => {
  const items = [panel("pages", 1), panel("notes", 2), panel("findings", 3)];

  it("a press (ages change, nothing else) gives the identical fit, whichever item is pressed", () => {
    const before = fitStack(stack(items, 250));
    expect(kinds(before)).toEqual(["header", "open", "open"]);
    let flipped = 0;
    for (const it of items) {
      const next = stack(pressed(items, it.id), 250);
      expect(fitStack(next, { previous: before })).toEqual(before);
      // Without `previous` the press does flip who gives way (the case this is for).
      if (JSON.stringify(fitStack(next)) !== JSON.stringify(before)) flipped++;
    }
    expect(flipped).toBeGreaterThan(0);
  });

  it("the same input with its own fit as previous is that fit", () => {
    const rand = seeded(21);
    for (let trial = 0; trial < 60; trial++) {
      const input = stack(mix(rand, 1 + Math.floor(rand() * 6)), 40 + Math.floor(rand() * 600), rand() < 0.5 ? "column" : "row");
      const fit = fitStack(input);
      expect(fitStack(input, { previous: fit })).toEqual(fit);
    }
  });

  it("shrink: the oldest gives way as before", () => {
    const before = fitStack(stack(items, 250));
    const shorter = stack(items, 205);
    const kept = fitStack(shorter, { previous: before });
    expect(kinds(kept)).toEqual(["rail", "open", "open"]);
    expect(kept).toEqual(fitStack(shorter));
    // With the ages flipped by a press first, what already gave way stays given way and the next one is by the new ages.
    const aged = stack(pressed(items, "pages"), 190);
    const next = fitStack(aged, { previous: before });
    expect(next.items[0]!.kind).not.toBe("open");
    expect(next.items.filter((i) => i.kind === "header" || i.kind === "rail" || i.kind === "menu").length).toBeGreaterThan(1);
  });

  it("grow: the forms come back", () => {
    const small = fitStack(stack(items, 190));
    expect(kinds(small)).not.toEqual(["open", "open", "open"]);
    const grown = fitStack(stack(items, 700), { previous: small });
    expect(kinds(grown)).toEqual(["open", "open", "open"]);
    expect(grown).toEqual(fitStack(stack(items, 700)));
    // Part of the room back: the result is a fit that holds and nothing is smaller than it was.
    const some = fitStack(stack(items, 250), { previous: small });
    expect(some).toEqual(fitStack(stack(items, 250)));
  });

  it("a panel opened by hand (its from goes down) starts over in its open form", () => {
    const folded = [{ ...panel("pages", 1), from: 1 }, panel("notes", 2)];
    const before = fitStack(stack(folded, 600));
    expect(before.items[0]!.kind).toBe("header");
    const opened = fitStack(stack([panel("pages", 1), panel("notes", 2)], 600), { previous: before });
    expect(opened.items[0]!.kind).toBe("open");
  });

  it("an item added keeps the others' forms when they all still fit, and is placed in its largest form", () => {
    const before = fitStack(stack([group("views", 1), panel("pages", 2)], 400));
    const added = fitStack(stack([group("views", 1), panel("pages", 2), group("tools", 9)], 700), { previous: before });
    expect(added.items.map((i) => i.id)).toEqual(["views", "pages", "tools"]);
    expect(added.items[2]!.form).toBe(0);
  });

  it("an item that gave way stays as it was when another item's age flips it (a click does not swap who is folded)", () => {
    const rand = seeded(22);
    for (let trial = 0; trial < 80; trial++) {
      const list = mix(rand, 2 + Math.floor(rand() * 4));
      const length = 100 + Math.floor(rand() * 500);
      const before = fitStack(stack(list, length));
      for (const it of list) expect(fitStack(stack(pressed(list, it.id), length), { previous: before })).toEqual(before);
    }
  });

  it("the preview's fit with previous equals the drop's", () => {
    const rand = seeded(23);
    for (let trial = 0; trial < 40; trial++) {
      const list = mix(rand, 1 + Math.floor(rand() * 4));
      const input: StackInput = stack(list, 120 + Math.floor(rand() * 500), rand() < 0.5 ? "column" : "row");
      const previous = fitStack(input);
      const dragged = rand() < 0.5 ? panel("dragged", 0) : group("dragged", 0);
      for (const t of stackTargets(input, dragged, { previous })) {
        // The drop is the app's solve of the stack with the item at that place, with the same previous.
        const drop = fitStack(t.input, { previous });
        expect(drop).toEqual(t.fit);
        expect(t.slot).toEqual(drop.items.find((i) => i.id === "dragged")!.rect);
      }
    }
  });

  it("with previous, a drop that leaves room doesn't reshape the other items", () => {
    const input = stack([panel("pages", 1), panel("notes", 2), panel("findings", 3)], 250);
    const previous = fitStack(input);
    const targets = stackTargets({ ...input, length: 600 }, group("tools", 9), { previous });
    for (const t of targets) for (const p of previous.items) expect(t.fit.items.find((i) => i.id === p.id)!.form).toBeLessThanOrEqual(p.form);
  });
});

describe("previous: a wider stack, and forms that changed", () => {
  const f = (kind: StackForm["kind"], min: number, cross: number, extra: { crossMin?: number; grows?: boolean; natural?: number } = {}): StackForm => ({
    kind,
    main: { min, natural: extra.natural ?? min, ...(extra.grows ? { grows: true } : {}) },
    cross: { natural: cross, ...(extra.crossMin !== undefined ? { min: extra.crossMin } : {}) },
  });
  const openPanel = (id: string, used: number): StackItem => ({ id, used, forms: [f("open", 90, 240, { natural: 160, grows: true }), f("header", 28, 240), f("rail", 24, 30), f("menu", 0, 0)] });
  const column = (items: StackItem[], max: number): StackInput => ({ axis: "column", length: 600, cross: { min: 60, max }, items });

  it("B1: forms that stepped down for a narrow column come back when it widens", () => {
    const tools: StackItem = { id: "tools", used: 2, forms: [f("row", 30, 190), f("stacked", 30, 84), f("icons", 30, 28), f("menu", 0, 0)] };
    const items = [openPanel("pages", 1), tools];
    const narrow = fitStack(column(items, 150));
    expect(kinds(narrow)).toEqual(["open", "stacked"]);
    const wide = column(items, 360);
    expect(kinds(fitStack(wide))).toEqual(["open", "row"]);
    expect(kinds(fitStack(wide, { previous: narrow }))).toEqual(["open", "row"]);
    // Narrowing again with the wide fit as previous: the group steps down, nothing else.
    expect(kinds(fitStack(column(items, 150), { previous: fitStack(wide) }))).toEqual(["open", "stacked"]);
  });

  it("B1: a header that went to its rail icon for a narrow column comes back as the column widens", () => {
    const header = (): StackItem => ({ id: "notes", used: 1, forms: [f("open", 90, 240, { natural: 160, grows: true }), f("header", 28, 240, { crossMin: 80 }), f("rail", 24, 30), f("menu", 0, 0)], from: 1 });
    const items = [openPanel("pages", 2), header()];
    const narrow = fitStack(column(items, 70));
    expect(kinds(narrow)).toEqual(["open", "rail"]);
    const wide = column(items, 360);
    expect(kinds(fitStack(wide))).toEqual(["open", "header"]);
    expect(kinds(fitStack(wide, { previous: narrow }))).toEqual(["open", "header"]);
  });

  it("B2: an item whose forms changed since starts over instead of keeping an index into the old ones", () => {
    const a = openPanel("a", 1);
    const b = openPanel("b", 2);
    const input: StackInput = { axis: "column", length: 150, cross: { min: 60, max: 360 }, items: [a, b] };
    const previous = fitStack(input);
    expect(kinds(previous)).toEqual(["header", "open"]);
    // a's forms are now rail and menu: index 1 is the menu, but the rail fits.
    const changed: StackItem = { ...a, forms: [f("rail", 24, 30), f("menu", 0, 0)] };
    const next = fitStack({ ...input, items: [changed, b] }, { previous });
    expect(kinds(next)).toEqual(["rail", "open"]);
    // The same kind at the same index but another size is another form too.
    const bigger: StackItem = { ...a, forms: [a.forms[0]!, f("header", 50, 240), a.forms[2]!, a.forms[3]!] };
    const resized = fitStack({ ...input, items: [bigger, b] }, { previous });
    expect(resized.items[0]!.min).toBe(50);
    expect(resized.items[0]!.kind).toBe("header");
    // And an unchanged item is kept as before.
    expect(fitStack(input, { previous })).toEqual(previous);
  });
});
