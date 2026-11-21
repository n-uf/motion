/**
 * A divider drag writes lengths for the dragged pair only, in ask units: with room to spare a drawn size is the ask
 * times the shared scale, so the pair's ask is drawn / scale; short of room it is `least + (drawn - least) / share`.
 * A bystander gets no length, so it travels to another stack as an item nobody resized, and nothing else moves because
 * the pair's weight (the sum of its asks) stays what it was, so the shared scale does too.
 */
import { describe, expect, it } from "vitest";
import { EPS } from "../src/geometry";
import { dividers, fitStack, resetBetween, resizeBetween, type StackFit, type StackInput, type StackItem } from "../src/stack";
import { sizesOf } from "../src/stack/layout";
import { mix, panel, seeded, stack } from "./stack-fixture";

const mainOf = (fit: StackFit, id: string): number => {
  const p = fit.items.find((i) => i.id === id)!;
  return fit.axis === "column" ? p.rect.height : p.rect.width;
};
const startOf = (fit: StackFit, id: string): number => {
  const p = fit.items.find((i) => i.id === id)!;
  return fit.axis === "column" ? p.rect.y : p.rect.x;
};
const mains = (fit: StackFit): Record<string, number> => Object.fromEntries(fit.items.map((p) => [p.id, mainOf(fit, p.id)]));
const ask = (input: StackInput, id: string): number | undefined => input.items.find((it) => it.id === id)!.length?.column;
const slack = (id: string, used: number): StackItem => ({
  id,
  used,
  forms: [
    { kind: "open", main: { min: 80, natural: 150, grows: true }, cross: { natural: 240 } },
    { kind: "header", main: { min: 20, natural: 40 }, cross: { natural: 240, min: 100 } },
    { kind: "rail", main: { min: 24, natural: 24 }, cross: { natural: 30 } },
    { kind: "menu", main: { min: 0, natural: 0 }, cross: { natural: 0 } },
  ],
});

describe("a bystander of a divider drag", () => {
  const three = (length: number): StackInput => stack([panel("a", 1, 300), panel("b", 2, 300), panel("c", 3, 300)], length);

  it("gets no length, with room to spare and short of it", () => {
    for (const length of [1200, 800, 600, 400]) {
      const input = three(length);
      const next = resizeBetween(input, "a", "b", 40);
      expect(next).not.toBe(input);
      expect(next.items[2]).toBe(input.items[2]);
      expect(next.items[2]!.length).toBeUndefined();
      expect(ask(next, "a")).toBeDefined();
      expect(ask(next, "b")).toBeDefined();
    }
  });

  it("a bystander dragged before keeps the length it had, as it was", () => {
    const first = resizeBetween(three(1200), "b", "c", 30);
    const second = resizeBetween(first, "a", "b", 40);
    expect(second.items[2]).toBe(first.items[2]);
    expect(ask(second, "c")).toBe(ask(first, "c"));
  });

  it("moved to another stack, it is drawn exactly as an item nobody resized", () => {
    // Right column [a, b, c] 1200 long, all natural 300; left [d] natural 200. Drag a|b by 40, then move c under d.
    for (const length of [1200, 900, 600]) {
      const input = three(length);
      const dragged = resizeBetween(input, "a", "b", 40);
      const there = (c: StackItem): StackFit => fitStack(stack([panel("d", 4, 200), c], 1200));
      const never = there(input.items[2]!);
      const moved = there(dragged.items[2]!);
      expect(moved).toEqual(never);
    }
    const there = fitStack(stack([panel("d", 4, 200), resizeBetween(three(1200), "a", "b", 40).items[2]!], 1200));
    expect(mainOf(there, "d")).toBeCloseTo(480, 6);
    expect(mainOf(there, "c")).toBeCloseTo(720, 6);
  });

  it("when the dragged pair moves instead, it carries asks that are relative, not inflated by the shared scale", () => {
    // With room the pair's lengths are drawn / scale: 440 / (4/3) and 360 / (4/3), which sum to the naturals they had.
    const next = resizeBetween(three(1200), "a", "b", 40);
    expect(ask(next, "a")).toBeCloseTo(330, 6);
    expect(ask(next, "b")).toBeCloseTo(270, 6);
    const fit = fitStack(next);
    expect([mainOf(fit, "a"), mainOf(fit, "b"), mainOf(fit, "c")].map((x) => Math.round(x * 1e6) / 1e6)).toEqual([440, 360, 400]);
  });
});

describe("the lengths written for the pair", () => {
  it("with room to spare: the drawn size over the shared scale", () => {
    const input = stack([panel("a", 1, 300), panel("b", 2, 300), panel("c", 3, 300)], 1200);
    const fit = fitStack(input);
    const scale = sizesOf(fit)!.scale;
    expect(scale).toBeCloseTo(4 / 3, 9);
    const next = resizeBetween(input, "a", "b", 40);
    expect(ask(next, "a")).toBeCloseTo((mainOf(fit, "a") + 40) / scale, 9);
    expect(ask(next, "b")).toBeCloseTo((mainOf(fit, "b") - 40) / scale, 9);
  });

  it("short of room: least + (drawn - least) / share", () => {
    const input = stack([panel("a", 1, 300), panel("b", 2, 300), panel("c", 3, 300)], 600);
    const fit = fitStack(input);
    const share = sizesOf(fit)!.tight;
    expect(share).toBeGreaterThan(0);
    expect(share).toBeLessThan(1);
    const next = resizeBetween(input, "a", "b", 25);
    expect(ask(next, "a")).toBeCloseTo(90 + (mainOf(fit, "a") + 25 - 90) / share, 9);
    expect(ask(next, "b")).toBeCloseTo(90 + (mainOf(fit, "b") - 25 - 90) / share, 9);
    expect(ask(next, "c")).toBeUndefined();
  });

  it("the pair's weight is what it was, so the shared scale is unchanged", () => {
    const input = stack([panel("a", 1, 300), panel("b", 2, 300), panel("c", 3, 300)], 1200);
    const next = resizeBetween(input, "a", "b", 40);
    expect(ask(next, "a")! + ask(next, "b")!).toBeCloseTo(600, 9);
    expect(sizesOf(fitStack(next))!.scale).toBeCloseTo(sizesOf(fitStack(input))!.scale, 9);
  });

  it("a pair already sized keeps its lengths in ask units over repeated drags", () => {
    const input = stack([panel("a", 1, 300), panel("b", 2, 300), panel("c", 3, 300)], 1200);
    let state = input;
    for (const delta of [40, -10, 25, -60, 5]) {
      const before = fitStack(state);
      state = resizeBetween(state, "a", "b", delta);
      const after = fitStack(state);
      expect(mainOf(after, "c")).toBeCloseTo(mainOf(before, "c"), 6);
      expect(sizesOf(after)!.scale).toBeCloseTo(sizesOf(before)!.scale, 9);
    }
    expect(state.items[2]!.length).toBeUndefined();
  });
});

describe("properties over seeded stacks", () => {
  /** A seeded stack and one of its dividers, as the drag at the press has them. */
  function trials(seed: number, count: number, lengths: (rand: () => number) => number): { input: StackInput; fit: StackFit; before: string; after: string }[] {
    const rand = seeded(seed);
    const out: { input: StackInput; fit: StackFit; before: string; after: string }[] = [];
    for (let trial = 0; trial < count; trial++) {
      const axis = rand() < 0.5 ? "column" : "row";
      const base = mix(rand, 2 + Math.floor(rand() * 5)).map((it, i) => {
        const r = rand();
        if (r < 0.3) return slack(`s${i}`, it.used);
        if (r < 0.4 && it.id.startsWith("p")) return { ...it, fixed: true };
        return it;
      });
      const sized = base.map((it) => (rand() < 0.4 && it.forms[0]!.main.grows ? { ...it, length: { [axis]: 100 + Math.floor(rand() * 300) } } : it));
      const input = stack(sized, lengths(rand), axis);
      const fit = fitStack(input);
      const list = dividers(input, fit);
      if (list.length === 0) continue;
      const d = list[Math.floor(rand() * list.length)]!;
      out.push({ input, fit, before: d.before, after: d.after });
    }
    return out;
  }
  const withRoom = (rand: () => number): number => 700 + Math.floor(rand() * 900);
  const short = (rand: () => number): number => 150 + Math.floor(rand() * 300);

  for (const [regime, lengths, scaleWanted] of [["with room", withRoom, true], ["short of room", short, false]] as const) {
    it(`nothing else moves, and the pair lays out as drawn, ${regime}`, () => {
      let checked = 0;
      let pairOnly = 0;
      const rand = seeded(scaleWanted ? 1101 : 1202);
      for (const { input, fit, before, after } of trials(scaleWanted ? 101 : 202, 400, lengths)) {
        const known = sizesOf(fit)!;
        if ((known.scale > 1 + EPS) !== scaleWanted) continue;
        const d = dividers(input, fit).find((x) => x.before === before && x.after === after)!;
        const delta = Math.floor(rand() * 300) - 150;
        const next = resizeBetween(input, before, after, delta);
        const clamped = Math.min(Math.max(delta, d.range.min), d.range.max);
        const was = mains(fit);
        const frame = fitStack(next);
        const now = mains(frame);
        if (Math.abs(clamped) < 1e-6) {
          expect(next).toBe(input);
          continue;
        }
        checked++;
        // The frame: the pair trades `clamped`, every other item keeps its drawn size and its place.
        expect(frame.items.map((p) => [p.id, p.form])).toEqual(fit.items.map((p) => [p.id, p.form]));
        for (const id of Object.keys(was)) {
          const want = id === before ? was[id]! + clamped : id === after ? was[id]! - clamped : was[id]!;
          expect(now[id]!).toBeCloseTo(want, 4);
          if (id !== before && id !== after && !(startOf(fit, id) > startOf(fit, before) && startOf(fit, id) < startOf(fit, after))) expect(startOf(frame, id)).toBeCloseTo(startOf(fit, id), 4);
        }
        // When the pair's asks can be written in ask units (not under their least), only the pair is written.
        const least = known.least;
        const b = was[before]! + clamped;
        const a = was[after]! - clamped;
        const writable = !scaleWanted || (b >= known.scale * least.get(before)! - EPS && a >= known.scale * least.get(after)! - EPS);
        if (writable) {
          pairOnly++;
          input.items.forEach((it, i) => {
            if (it.id !== before && it.id !== after) expect(next.items[i]).toBe(it);
          });
        }
      }
      expect(checked).toBeGreaterThan(100);
      expect(pairOnly).toBeGreaterThan(50);
    });
  }

  it("a bystander moved to another stack is drawn as one nobody resized, in every regime", () => {
    let checked = 0;
    for (const { input, before, after } of trials(303, 300, (rand) => 200 + Math.floor(rand() * 900))) {
      const fit = fitStack(input);
      const known = sizesOf(fit)!;
      const d = dividers(input, fit).find((x) => x.before === before && x.after === after)!;
      const next = resizeBetween(input, before, after, d.range.max / 2);
      const was = mains(fit);
      const b = was[before]! + d.range.max / 2;
      const a = was[after]! - d.range.max / 2;
      if (known.scale > 1 + EPS && (b < known.scale * known.least.get(before)! - EPS || a < known.scale * known.least.get(after)! - EPS)) continue;
      const other = [panel("x", 9, 200)];
      for (const it of input.items) {
        if (it.id === before || it.id === after || !it.forms[0]!.main.grows || it.forms[0]!.kind !== "open") continue;
        const moved = next.items.find((n) => n.id === it.id)!;
        const there = (item: StackItem): StackFit => fitStack(stack([...other, item], 900, input.axis));
        expect(there(moved)).toEqual(there(it));
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100);
  });
});

describe("resetBetween", () => {
  it("writes the length every growing item is drawn at, as it always has", () => {
    const input = stack([panel("a", 1, 200), panel("b", 2, 300), panel("c", 3, 300)], 1200);
    const dragged = resizeBetween(input, "a", "b", 60);
    expect(dragged.items[2]!.length).toBeUndefined();
    const reset = resetBetween(dragged, "a", "b");
    expect(reset).not.toBe(dragged);
    const fit = fitStack(reset);
    for (const it of reset.items) expect(it.length?.column).toBeCloseTo(mainOf(fit, it.id), 6);
    expect(mainOf(fit, "c")).toBeCloseTo(mainOf(fitStack(dragged), "c"), 6);
  });
});

describe("a pair that cannot be written in ask units", () => {
  it("with room, an end drawn under the scale times its least is written in drawn sizes for the whole stack, so it still reaches its least", () => {
    // Naturals 300, length 1200: the scale is 4/3, so an ask under 90 * 4/3 = 120 would be read as its least, 90, and
    // drawn at 120. To draw `b` at 90 the stack is written as drawn (scale 1).
    const input = stack([panel("a", 1, 300), panel("b", 2, 300), panel("c", 3, 300)], 1200);
    const next = resizeBetween(input, "a", "b", 10_000);
    const fit = fitStack(next);
    expect(mainOf(fit, "b")).toBeCloseTo(90, 6);
    expect(mainOf(fit, "c")).toBeCloseTo(400, 6);
    expect(mainOf(fit, "a")).toBeCloseTo(710, 6);
    expect(sizesOf(fit)!.scale).toBeCloseTo(1, 9);
  });
});
