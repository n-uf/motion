/**
 * C23, a press is not a reshape: `fitStack(input, { previous })` keeps the previous forms while they still fit, so a change
 * of ages alone reshapes nothing. Ages decide who gives way anew (the length shrank, an item was added or opened); room that
 * came back is used.
 */
import { describe, expect, it } from "vitest";
import { fitStack, stackTargets, type StackFit, type StackInput, type StackItem } from "../src/stack";
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
