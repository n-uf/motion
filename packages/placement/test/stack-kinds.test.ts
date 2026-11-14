/**
 * C25, targets by kind: `StackInput.accepts` (the stack takes the dragged item or gives no target at all) and
 * `stackTargets(…, { allows })` (single gaps left out). Item kinds are the host's: here an item's kind is its id's first letter.
 */
import { describe, expect, it } from "vitest";
import { fitStack, stackTargets, type StackInput, type StackItem } from "../src/stack";
import { barGroup, group, mix, panel, seeded, stack } from "./stack-fixture";

const kindOf = (item: StackItem): string => (item.id.startsWith("p") ? "panel" : "group");

describe("C25: accepts", () => {
  const items = [panel("p1", 1), group("g1", 2), panel("p2", 3)];

  it("a stack that doesn't accept the dragged item gives no target; one that does gives the targets it always gave", () => {
    const open = stack(items, 600);
    const toolbarOnly: StackInput = { ...open, accepts: (it) => kindOf(it) === "group" };
    const panelsOnly: StackInput = { ...open, accepts: (it) => kindOf(it) === "panel" };
    expect(stackTargets(toolbarOnly, panel("p9", 9))).toEqual([]);
    expect(stackTargets(panelsOnly, group("g9", 9))).toEqual([]);
    expect(stackTargets(toolbarOnly, group("g9", 9)).map((t) => t.id)).toEqual(["gap:0", "gap:1", "gap:2", "gap:3"]);
    // The gaps are those of the stack without `accepts`, except for the stack that was solved (it carries the predicate).
    const plain = stackTargets(open, group("g9", 9));
    const kind = stackTargets(toolbarOnly, group("g9", 9));
    expect(kind.map((t) => ({ ...t, input: undefined }))).toEqual(plain.map((t) => ({ ...t, input: undefined })));
    expect(kind.map((t) => t.fit)).toEqual(plain.map((t) => t.fit));
  });

  it("an empty stack that doesn't accept the item has no gap either", () => {
    expect(stackTargets({ ...stack([], 400), accepts: () => false }, group("g9", 9))).toEqual([]);
    expect(stackTargets({ ...stack([], 400), accepts: () => true }, group("g9", 9)).map((t) => t.id)).toEqual(["gap:0"]);
  });

  it("is asked about the dragged item, once, and never by fitStack", () => {
    const asked: string[] = [];
    const input: StackInput = { ...stack(items, 600), accepts: (it) => (asked.push(it.id), true) };
    stackTargets(input, group("g9", 9));
    expect(asked).toEqual(["g9"]);
    asked.length = 0;
    fitStack(input);
    expect(asked).toEqual([]);
  });

  it("a reorder inside the stack asks about the dragged item like any other", () => {
    const input: StackInput = { ...stack(items, 600), accepts: () => false };
    expect(stackTargets(input, items[0]!)).toEqual([]);
  });

  it("an item with no forms has no targets, whatever accepts says", () => {
    expect(stackTargets({ ...stack(items, 600), accepts: () => true }, { id: "p0", used: 0, forms: [] })).toEqual([]);
  });

  it("fitStack lays out the items it is given, accepted or not", () => {
    const input = stack(items, 600);
    expect(fitStack({ ...input, accepts: () => false })).toEqual(fitStack(input));
  });
});

describe("C25: allows", () => {
  const items = [panel("p1", 1), group("g1", 2), panel("p2", 3)];
  const input = stack(items, 600);
  const dragged = group("g9", 9);

  it("leaves out the gaps it refuses and keeps the others exactly", () => {
    const all = stackTargets(input, dragged);
    const some = stackTargets(input, dragged, { allows: (_d, at) => at % 2 === 0 });
    expect(some.map((t) => t.id)).toEqual(["gap:0", "gap:2"]);
    expect(some).toEqual(all.filter((t) => t.place.at % 2 === 0));
  });

  it("is called with the dragged item and the gap's at, for every gap of the stack without the dragged item", () => {
    const calls: [string, number][] = [];
    stackTargets(input, items[1]!, {
      allows: (d, at) => (calls.push([d.id, at]), true),
    });
    // Three items, one lifted out: two left, gaps 0 to 2.
    expect(calls).toEqual([
      ["g1", 0],
      ["g1", 1],
      ["g1", 2],
    ]);
  });

  it("a gap that refuses everything leaves no target; allows of true changes nothing", () => {
    expect(stackTargets(input, dragged, { allows: () => false })).toEqual([]);
    expect(stackTargets(input, dragged, { allows: () => true })).toEqual(stackTargets(input, dragged));
  });

  it("works with accepts, previous and endReach, on a bar", () => {
    const bar = stack([barGroup("g1", 1), barGroup("g2", 2)], 500, "row");
    const previous = fitStack(bar);
    const options = { previous, endReach: 12, allows: (_d: StackItem, at: number) => at !== 1 };
    const targets = stackTargets({ ...bar, accepts: () => true }, barGroup("g9", 9), options);
    expect(targets.map((t) => t.id)).toEqual(["gap:0", "gap:2"]);
    expect(targets[0]!.hit.x).toBe(-12);
  });
});

describe("C25: sweeps", () => {
  it("no target for what the stack refuses, none for a gap allows refuses, and the rest are the unrestricted ones", () => {
    const rand = seeded(25);
    for (let trial = 0; trial < 300; trial++) {
      const axis = rand() < 0.5 ? "column" : "row";
      const base = stack(mix(rand, Math.floor(rand() * 6)), 100 + Math.floor(rand() * 600), axis);
      const wants = rand() < 0.5 ? "panel" : "group";
      const dragged = rand() < 0.5 ? panel("pd", 0) : group("gd", 0);
      const gaps = new Set(Array.from({ length: base.items.length + 1 }, (_, k) => k).filter(() => rand() < 0.6));
      const input: StackInput = { ...base, accepts: (it) => kindOf(it) === wants };
      const targets = stackTargets(input, dragged, { allows: (_d, at) => gaps.has(at) });
      const unrestricted = stackTargets(base, dragged);
      if (kindOf(dragged) !== wants) {
        expect(targets).toEqual([]);
        continue;
      }
      expect(targets.map((t) => t.place.at)).toEqual(unrestricted.map((t) => t.place.at).filter((k) => gaps.has(k)));
      for (const t of targets) expect(gaps.has(t.place.at)).toBe(true);
      expect(targets.map((t) => t.fit)).toEqual(unrestricted.filter((t) => gaps.has(t.place.at)).map((t) => t.fit));
    }
  });
});
