/**
 * `StackItem.stepping`: a fixed item that still takes steps (a page readout in a title bar: never dragged, nothing lands
 * before it, but it steps through its own ladder and folds into the bar's »). The solver treats it as an ordinary item:
 * its fit equals a movable item's with the same forms, `used` and `kept`, at every length, fresh and walked down and up
 * with `previous`. It never holds for the title rule, and `stackGaps` still refuses every gap for it.
 */
import { describe, expect, it } from "vitest";
import { controlLadder, fitStack, itemSteps, stackGaps, type StackFit, type StackItem } from "../src/stack";
import { barAt, down, groupItem, randomSpec, title, up, walk, type Group } from "./ladder-fixture";
import { seeded } from "./stack-fixture";

const strip = (fit: StackFit): unknown => JSON.parse(JSON.stringify(fit));
const spec = (rand: () => number) => randomSpec(rand, { strict: true });

/** The readout: a ladder of its own, fixed, and taking steps. */
const readout = (g: Group, used: number, kept = false): StackItem => ({ ...groupItem(g, used, kept), fixed: true, stepping: true });
const movable = (it: StackItem): StackItem => {
  const { fixed: _f, stepping: _s, ...rest } = it;
  return rest;
};

describe("a fixed item with `stepping`", () => {
  it("reads as an item that takes steps; plain fixed does not", () => {
    expect([itemSteps({}), itemSteps({ fixed: true }), itemSteps({ fixed: true, stepping: true }), itemSteps({ stepping: true })]).toEqual([true, false, true, true]);
  });

  it("fits exactly as a movable item with the same forms, used and kept, fresh and walked down and back up", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rand = seeded(seed);
      const groups: Group[] = [0, 1, 2].map((i) => ({ id: `g${i}`, spec: spec(rand) }));
      const page: Group = { id: "page", spec: spec(rand) };
      const at = Math.floor(rand() * 4);
      const kept = rand() < 0.3;
      const others = groups.map((g, i) => groupItem(g, i + 1));
      const withPage = (it: StackItem): StackItem[] => [title(), ...others.slice(0, at), it, ...others.slice(at)];
      const fixedItems = withPage(readout(page, 0.5 + at, kept));
      const movableItems = withPage(movable(readout(page, 0.5 + at, kept)));
      const top = 900;
      const lengths = [...down(top, 120).filter((n) => n % 7 === 0), ...up(120, top).filter((n) => n % 11 === 0)];
      const a = walk(fixedItems, lengths);
      const b = walk(movableItems, lengths);
      a.forEach((fit, k) => expect(strip(fit), `seed ${seed} at ${lengths[k]}`).toEqual(strip(b[k]!)));
      for (const n of [top, 400, 260, 160]) expect(strip(fitStack(barAt(fixedItems, n)))).toEqual(strip(fitStack(barAt(movableItems, n))));
    }
  });

  it("steps down and folds into the » while plain fixed keeps its first form", () => {
    const page: Group = { id: "page", spec: { controls: [{ id: "p", tiers: [60, 30] }], gap: 4, grip: 0, more: 10, cross: 28, column: { icons: 40 } } };
    const g: Group = { id: "g", spec: { controls: [{ id: "a", tiers: [50, 30] }, { id: "b", tiers: [50, 30] }], gap: 4, grip: 10, more: 12, cross: 28, column: { icons: 60 } } };
    const run = (it: StackItem) => [200, 150, 80, 30].map((n) => fitStack(barAt([groupItem(g, 2), it], n)).items[1]!);
    const stepping = run(readout(page, 1));
    const plain = run({ ...readout(page, 1), stepping: false });
    expect(plain.map((p) => p.form)).toEqual([0, 0, 0, 0]);
    // Its own ladder: the full row, the compact row, its fold, then the bar's » with the group.
    expect(stepping.map((p) => p.kind)).toEqual(["row", "row", "fold", "menu"]);
    expect(stepping.map((p) => p.form)).toEqual([0, 1, 2, controlLadder(page.spec).row.length - 1]);
  });

  it("never holds for the title rule: a stepping fixed item that grows shrinks like any growing item", () => {
    const grows: StackItem = { ...title(), stepping: true };
    const g: Group = { id: "g", spec: { controls: [{ id: "a", tiers: [60, 40, 20] }, { id: "b", tiers: [60, 40, 20] }], gap: 4, grip: 10, more: 12, cross: 28, column: { icons: 60 } } };
    for (const n of [400, 300, 250, 200]) {
      const a = fitStack(barAt([grows, groupItem(g, 1)], n));
      const b = fitStack(barAt([movable(grows), groupItem(g, 1)], n));
      expect(strip(a)).toEqual(strip(b));
    }
  });

  it("is never dropped: stackGaps refuses every gap for it", () => {
    const page: Group = { id: "page", spec: spec(seeded(3)) };
    const gaps = stackGaps(barAt([title()], 600), readout(page, 1));
    expect(gaps.every((g) => !g.fits && g.reason === "fixed")).toBe(true);
  });

  it("a drop beside it may step it, as it may a movable item; plain fixed refuses that drop (squeezes-fixed)", () => {
    const page: Group = { id: "page", spec: { controls: [{ id: "p", tiers: [80, 30] }], gap: 4, grip: 0, more: 10, cross: 28, column: { icons: 40 } } };
    const dragged: StackItem = { id: "d", used: 9, forms: [{ kind: "row", main: { min: 90, natural: 90 }, cross: { natural: 28 } }] };
    // 150 long: the readout's full row (80) and the dropped item (90) don't fit side by side; its compact row (30) does.
    const at = (it: StackItem) => stackGaps(barAt([it], 150), dragged).map((g) => (g.fits ? "fits" : g.reason));
    expect(at({ ...readout(page, 1), stepping: false }).every((r) => r !== "fits")).toBe(true);
    expect(at(readout(page, 1))).toEqual(["fits", "fits"]);
  });
});
