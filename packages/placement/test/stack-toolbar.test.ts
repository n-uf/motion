/**
 * Step 3 of `./stack`, the cases a toolbar needs: T1 (a » per collapsed group: the `fold` form), T2/T4 (a give-way
 * step goes only to a form that shortens the stack), T3 (`rank`), T5 (`gap`, `pad` and the targets' `endReach`), T6
 * (a form too thick for the limits steps down), and a sweep over all of them together.
 */
import { describe, expect, it } from "vitest";
import { fitStack, stackTargets, withItem, type StackFit, type StackForm, type StackInput, type StackItem } from "../src/stack";
import { seeded } from "./stack-fixture";

const form = (kind: StackForm["kind"], min: number, extra: { natural?: number; rank?: number; cross?: number; crossMin?: number; setsCross?: boolean } = {}): StackForm => ({
  kind,
  main: { min, natural: extra.natural ?? min },
  cross: { natural: extra.cross ?? 26, ...(extra.crossMin !== undefined ? { min: extra.crossMin } : {}) },
  ...(extra.rank !== undefined ? { rank: extra.rank } : {}),
  ...(extra.setsCross !== undefined ? { setsCross: extra.setsCross } : {}),
});
const item = (id: string, used: number, forms: StackForm[], kept = false): StackItem => ({ id, used, forms, ...(kept ? { kept: true } : {}) });
const bar = (items: readonly StackItem[], length: number, more: Partial<StackInput> = {}): StackInput => ({ axis: "row", length, cross: { min: 30, max: 60, rail: 40 }, items, ...more });
const kinds = (fit: StackFit) => fit.items.map((i) => i.kind);
const forms = (fit: StackFit) => fit.items.map((i) => i.form);

describe("T1: a » per collapsed group (the fold form)", () => {
  const groups = (): StackItem[] => ["a", "b", "c"].map((id) => item(id, 1, [form("row", 100), form("fold", 30)]));

  it("the last two of three groups collapse: room for two » handles, in line and in place", () => {
    const fit = fitStack(bar(groups(), 160));
    expect(kinds(fit)).toEqual(["row", "fold", "fold"]);
    expect(fit.menu).toBeNull();
    expect(fit.items.map((i) => [i.rect.x, i.rect.width])).toEqual([
      [0, 100],
      [100, 30],
      [130, 30],
    ]);
    expect(fit.notes).toEqual([
      { code: "form-down", id: "c", from: 0, to: 1 },
      { code: "form-down", id: "b", from: 0, to: 1 },
    ]);
  });

  it("a fold is an ordinary form: it never touches the shared » entry and never makes one", () => {
    const fit = fitStack(bar(groups(), 100));
    expect(kinds(fit)).toEqual(["fold", "fold", "fold"]);
    expect(fit.menu).toBeNull();
    // With the menu behind it (ranked after the folds), a fold is a step before the menu, not the menu.
    const withMenu = groups().map((g) => ({ ...g, forms: [...g.forms, form("menu", 0, { rank: 1 })] }));
    const fits = fitStack(bar(withMenu, 100, { menu: { main: 28 } }));
    expect(kinds(fits)).toEqual(["fold", "fold", "fold"]);
    expect(fits.menu).toBeNull();
    expect(kinds(fitStack(bar(withMenu, 60, { menu: { main: 28 } })))).toEqual(["fold", "menu", "menu"]);
  });
});

describe("T2/T4: a give-way step goes only to a form that shortens the stack", () => {
  const a = item("a", 1, [form("row", 100), form("fold", 30)]);
  const b = item("b", 2, [form("row", 30), form("fold", 34)]);

  it("132 holds both rows; 120 folds only a, because b's fold is longer than its row", () => {
    expect(kinds(fitStack(bar([a, b], 132)))).toEqual(["row", "row"]);
    const tight = fitStack(bar([a, b], 120));
    expect(kinds(tight)).toEqual(["fold", "row"]);
    expect(tight.notes).toEqual([{ code: "form-down", id: "a", from: 0, to: 1 }]);
    // b alone: the fold is longer, so the item stays and the stack overflows.
    const alone = fitStack(bar([b], 20));
    expect(kinds(alone)).toEqual(["row"]);
    expect(alone.notes).toEqual([{ code: "overflow", over: 10 }]);
  });

  it("a next form with the same length is skipped, and the step goes on to the first one that is shorter", () => {
    const g = item("g", 1, [form("row", 50), form("stacked", 50), form("icons", 40)]);
    const fit = fitStack(bar([g], 45));
    expect(forms(fit)).toEqual([2]);
    expect(fit.notes).toEqual([{ code: "form-down", id: "g", from: 0, to: 2 }]);
    // A form behind a longer one is reached too.
    const h = item("h", 1, [form("row", 50), form("stacked", 60), form("icons", 40)]);
    expect(forms(fitStack(bar([h], 45)))).toEqual([2]);
  });

  it("counts the shared » entry: the first item in the menu only shortens the stack when it is bigger than the entry", () => {
    const small = item("s", 1, [form("row", 20), form("menu", 0)]);
    const fit = fitStack(bar([small], 10, { menu: { main: 28 } }));
    expect(kinds(fit)).toEqual(["row"]);
    expect(fit.notes).toEqual([{ code: "overflow", over: 10 }]);
    // With the entry already there the next item's whole length is saved.
    const big = (id: string, used: number): StackItem => item(id, used, [form("row", 40), form("menu", 0)]);
    const two = fitStack(bar([big("x", 1), big("y", 2)], 30, { menu: { main: 28 } }));
    expect(kinds(two)).toEqual(["menu", "menu"]);
  });

  it("a gap counts with the menu: going in removes an item and its gap, and adds the entry's", () => {
    const g = (id: string, used: number): StackItem => item(id, used, [form("row", 40), form("menu", 0)]);
    // Two rows and a gap: 40 + 10 + 40 = 90. One in the menu: 40 + 10 + 28 = 78 (shorter).
    const one = fitStack(bar([g("a", 1), g("b", 2)], 80, { menu: { main: 28 }, gap: 10 }));
    expect(kinds(one)).toEqual(["menu", "row"]);
    // An entry of 52 makes one step longer (40 + 10 + 52 = 102), but both together (52) are shorter: one batch.
    const batch = fitStack(bar([g("a", 1), g("b", 2)], 80, { menu: { main: 52 }, gap: 10 }));
    expect(kinds(batch)).toEqual(["menu", "menu"]);
    // An entry of 100 isn't beaten even by both: the items stay.
    const none = fitStack(bar([g("a", 1), g("b", 2)], 80, { menu: { main: 100 }, gap: 10 }));
    expect(kinds(none)).toEqual(["row", "row"]);
    expect(none.notes).toEqual([{ code: "overflow", over: 10 }]);
  });
});

describe("T3: give-way order per form (rank)", () => {
  // A and B fold from a row; C goes full → primary only (rank 0) → fold (rank 1).
  const abc = (cKept: boolean, cUsed: number): StackItem[] => [
    item("a", 1, [form("row", 100), form("fold", 30)]),
    item("b", 2, [form("row", 100), form("fold", 30)]),
    item("c", cUsed, [form("row", 140), form("icons", 70, { rank: 0 }), form("fold", 30, { rank: 1 })], cKept),
  ];
  /** The distinct form vectors, from the long stack to the short one. */
  const path = (items: StackItem[]): string[] => {
    const out: string[] = [];
    for (let length = 400; length >= 60; length--) {
      const v = forms(fitStack(bar(items, length))).join("");
      if (out.at(-1) !== v) out.push(v);
    }
    return out;
  };

  it("A folds, B folds, C goes to primary only, then C folds last", () => {
    // C is the oldest, but kept: every unkept form with the same rank goes first.
    expect(path(abc(true, 0))).toEqual(["000", "100", "110", "111", "112"]);
  });

  it("with C the oldest and not kept, C's fold is still never before B's", () => {
    const states: number[][] = [];
    for (let length = 400; length >= 60; length--) states.push(forms(fitStack(bar(abc(false, 0), length))));
    for (const [a, b, c] of states as [number, number, number][]) if (c === 2) expect([a, b]).toEqual([1, 1]);
    // C went to its primary-only form first (rank 0, the oldest)…
    expect(states.some(([a, , c]) => c === 1 && a === 0)).toBe(true);
    // …and nothing was left without a step: the last state is every group folded.
    expect(states.at(-1)).toEqual([1, 1, 2]);
  });

  it("without ranks the oldest item goes all the way first (what rank changes)", () => {
    const flat = abc(false, 0).map((it) => ({ ...it, forms: it.forms.map(({ rank: _rank, ...f }) => f) }));
    const states: number[][] = [];
    for (let length = 400; length >= 60; length--) states.push(forms(fitStack(bar(flat, length))));
    expect(states.some(([a, b, c]) => c === 2 && (a === 0 || b === 0))).toBe(true);
  });

  it("ties go unkept before kept, then the oldest, then the later in the stack", () => {
    const row = (id: string, used: number, kept = false): StackItem => item(id, used, [form("row", 100), form("fold", 30, { rank: 1 })], kept);
    // All rank 1: kept goes last, then the oldest.
    expect(forms(fitStack(bar([row("a", 5), row("b", 1, true), row("c", 3)], 240)))).toEqual([0, 0, 1]);
    expect(forms(fitStack(bar([row("a", 5), row("b", 1, true), row("c", 3)], 180)))).toEqual([1, 0, 1]);
    // The same age: the later one first.
    expect(forms(fitStack(bar([row("a", 2), row("b", 2), row("c", 2)], 240)))).toEqual([0, 0, 1]);
  });

  it("the rank of the form stepped into counts, not the form left", () => {
    // x leaves a rank-5 form for a rank-0 one; y leaves a rank-0 form for a rank-1 one: x steps first although it is newer.
    const x = item("x", 9, [form("row", 100, { rank: 5 }), form("icons", 50, { rank: 0 })]);
    const y = item("y", 1, [form("row", 100, { rank: 0 }), form("icons", 50, { rank: 1 })]);
    expect(forms(fitStack(bar([x, y], 160)))).toEqual([1, 0]);
  });
});

describe("T5: gap, pad and the targets", () => {
  const trio = (): StackItem[] => ["a", "b", "c"].map((id, i) => item(id, i, [form("row", 100), form("fold", 30)]));
  const dragged = item("d", 9, [form("row", 100), form("fold", 30)]);

  it("a bar of three 100 px groups, pad.start 20 and gap 30: the rects and the gap zones", () => {
    const input = bar(trio(), 380, { gap: 30, pad: { start: 20 } });
    const fit = fitStack(input);
    expect(fit.items.map((i) => [i.rect.x, i.rect.width, i.rect.y, i.rect.height])).toEqual([
      [20, 100, 0, 40],
      [150, 100, 0, 40],
      [280, 100, 0, 40],
    ]);
    const targets = stackTargets(input, dragged);
    expect(targets.map((t) => [t.hit.x, t.hit.x + t.hit.width])).toEqual([
      [0, 70],
      [70, 200],
      [200, 330],
      [330, 380],
    ]);
    // The marker is a line at the dragged item's leading edge, over the whole bar.
    for (const t of targets) expect(t.marker).toMatchObject({ y: 0, width: 0, height: 40 });
  });

  it("gap 50", () => {
    const input = bar(trio(), 420, { gap: 50, pad: { start: 20 } });
    expect(fitStack(input).items.map((i) => i.rect.x)).toEqual([20, 170, 320]);
    expect(stackTargets(input, dragged).map((t) => [t.hit.x, t.hit.x + t.hit.width])).toEqual([
      [0, 70],
      [70, 220],
      [220, 370],
      [370, 420],
    ]);
  });

  it("gap and pad count toward the length: a stack that is long enough without them folds with them", () => {
    expect(kinds(fitStack(bar(trio(), 300)))).toEqual(["row", "row", "row"]);
    // 300 + 2 gaps of 10 + 15 + 5 padding = 340.
    expect(kinds(fitStack(bar(trio(), 339, { gap: 10, pad: { start: 15, end: 5 } })))).toEqual(["fold", "row", "row"]);
    expect(kinds(fitStack(bar(trio(), 340, { gap: 10, pad: { start: 15, end: 5 } })))).toEqual(["row", "row", "row"]);
  });

  it("the » entry is a neighbour and ends at the pad", () => {
    const g = (id: string, used: number): StackItem => item(id, used, [form("row", 100), form("menu", 0)]);
    const fit = fitStack(bar([g("a", 1), g("b", 2), g("c", 3)], 170, { menu: { main: 28 }, gap: 5, pad: { end: 10 } }));
    expect(kinds(fit)).toEqual(["menu", "menu", "row"]);
    expect(fit.items[2]!.rect).toMatchObject({ x: 0, width: 100 });
    expect(fit.menu!.rect).toMatchObject({ x: 132, width: 28 });
    expect(fit.menu!.rect.x + fit.menu!.rect.width).toBe(170 - 10);
  });

  it("endReach: the first and last gaps reach past the stack's ends; the others and the marker don't move", () => {
    const input = bar(trio(), 380, { gap: 30, pad: { start: 20 } });
    const plain = stackTargets(input, dragged);
    const reach = stackTargets(input, dragged, { endReach: 24 });
    expect(reach.map((t) => [t.hit.x, t.hit.x + t.hit.width])).toEqual([
      [-24, 70],
      [70, 200],
      [200, 330],
      [330, 404],
    ]);
    expect(reach.map((t) => t.marker)).toEqual(plain.map((t) => t.marker));
    expect(reach.map((t) => t.slot)).toEqual(plain.map((t) => t.slot));
    // A column reaches along y. An empty stack's one gap reaches both ways. A non-number is no reach.
    const column = stackTargets({ axis: "column", length: 100, cross: { min: 30, max: 60 }, items: [] }, dragged, { endReach: 10 });
    expect(column[0]!.hit).toMatchObject({ y: -10, height: 120 });
    expect(stackTargets(input, dragged, { endReach: NaN })[0]!.hit.x).toBe(0);
    expect(stackTargets(input, dragged, { endReach: -5 })[0]!.hit.x).toBe(0);
  });

  it("the hits still tile the stack, end to end, with gaps, padding and reach", () => {
    const input = bar(trio(), 380, { gap: 30, pad: { start: 20, end: 8 } });
    const t = stackTargets(input, dragged, { endReach: 12 });
    for (let k = 1; k < t.length; k++) expect(t[k]!.hit.x).toBeCloseTo(t[k - 1]!.hit.x + t[k - 1]!.hit.width);
  });

  it("bad numbers are no space", () => {
    const fit = fitStack(bar(trio(), 400, { gap: NaN, pad: { start: -5, end: Infinity } }));
    expect(fit.items.map((i) => i.rect.x)).toEqual([0, 100, 200]);
  });
});

describe("T6: a form that says it is too thick for the limits steps down", () => {
  // Only a form with an explicit `cross.min` over the limits' `max` steps down; without one it is clamped, as it was.
  const panel = (): StackItem =>
    item("p", 1, [form("open", 150, { natural: 200, cross: 120, crossMin: 120, setsCross: true }), form("header", 60, { cross: 28 }), form("rail", 26, { cross: 26 }), form("menu", 0)]);

  it("a form with no cross.min is clamped to the bar's max, as before", () => {
    const plain = item("p", 1, [form("open", 150, { natural: 200, cross: 120, setsCross: true }), form("header", 60, { cross: 28 })]);
    const fit = fitStack({ axis: "row", length: 400, cross: { min: 30, max: 40 }, items: [plain] });
    expect(kinds(fit)).toEqual(["open"]);
    expect(fit.cross).toBe(40);
    expect(fit.notes).toEqual([]);
  });

  it("an open panel whose cross.min is over a bar's cross.max lands as a header, and the bar stays thin", () => {
    const fit = fitStack({ axis: "row", length: 400, cross: { min: 30, max: 40 }, items: [panel()] });
    expect(kinds(fit)).toEqual(["header"]);
    expect(fit.cross).toBeLessThanOrEqual(40);
    expect(fit.notes).toEqual([{ code: "form-down", id: "p", from: 0, to: 1 }]);
  });

  it("the bar's cross never grows over max, whatever it holds", () => {
    for (const max of [30, 40, 60]) {
      const fit = fitStack({ axis: "row", length: 500, cross: { min: 30, max }, items: [panel(), item("g", 2, [form("row", 100)])] });
      expect(fit.cross).toBeLessThanOrEqual(max);
      expect(fit.items.every((i) => i.rect.height <= max)).toBe(true);
    }
  });

  it("a form that can be drawn that thin (cross.min within max) is only clamped", () => {
    const squeezable = item("p", 1, [form("open", 150, { natural: 200, cross: 120, crossMin: 36, setsCross: true }), form("header", 60)]);
    const fit = fitStack({ axis: "row", length: 400, cross: { min: 30, max: 40 }, items: [squeezable] });
    expect(kinds(fit)).toEqual(["open"]);
    expect(fit.cross).toBe(40);
    expect(fit.notes).toEqual([]);
  });

  it("never into the menu: the last drawn form stays, with too-wide", () => {
    const stuck = item("p", 1, [form("open", 150, { cross: 120, crossMin: 120, setsCross: true }), form("menu", 0)]);
    const fit = fitStack({ axis: "row", length: 400, cross: { min: 30, max: 40 }, items: [stuck] });
    expect(kinds(fit)).toEqual(["open"]);
    expect(fit.cross).toBe(40);
    expect(fit.notes).toEqual([{ code: "too-wide", id: "p" }]);
  });

  it("an open panel dropped into the bar lands as a header, and the bar keeps its height", () => {
    const input: StackInput = { axis: "row", length: 400, cross: { min: 30, max: 40 }, items: [item("g", 1, [form("row", 100), form("fold", 30)])] };
    for (const t of stackTargets(input, panel())) {
      expect(t.fit.items.find((i) => i.id === "p")!.kind).toBe("header");
      expect(t.fit.cross).toBeLessThanOrEqual(40);
      expect(t.marker.height).toBeLessThanOrEqual(40);
    }
  });
});

describe("sweep: rank, gap, pad and fold together", () => {
  /** A group with random sizes in the order row, stacked, icons, fold, menu; some forms are longer than the one before. */
  function randomGroup(rand: () => number, i: number, menu: boolean): StackItem {
    const sizes: number[] = [];
    let at = 60 + Math.floor(rand() * 140);
    for (let k = 0; k < 4; k++) {
      sizes.push(at);
      // Mostly smaller, sometimes the same or longer (a fold with a » can be longer than icons).
      at = Math.max(12, Math.round(at * (0.45 + rand() * 0.8)));
    }
    const kindsOf: StackForm["kind"][] = ["row", "stacked", "icons", "fold"];
    const list = kindsOf.map((k, n) => form(k, sizes[n]!, { natural: sizes[n]! + Math.floor(rand() * 20), rank: Math.floor(rand() * 3) * (n > 0 ? 1 : 0) }));
    return { id: `g${i}`, used: Math.floor(rand() * 6), ...(rand() < 0.25 ? { kept: true } : {}), forms: menu ? [...list, form("menu", 0, { rank: 3 })] : list };
  }
  const sweepInput = (rand: () => number, menu: boolean): StackInput => ({
    axis: "row",
    length: 0,
    cross: { min: 30, max: 60, rail: 40 },
    items: Array.from({ length: 1 + Math.floor(rand() * 5) }, (_, i) => randomGroup(rand, i, menu)),
    gap: Math.floor(rand() * 13),
    pad: { start: Math.floor(rand() * 21), end: Math.floor(rand() * 21) },
    menu: { main: 20 + Math.floor(rand() * 20) },
  });
  const total = (input: StackInput, fit: StackFit): number => {
    const gap = input.gap ?? 0;
    let sum = (input.pad?.start ?? 0) + (input.pad?.end ?? 0);
    let slots = 0;
    for (const p of fit.items) {
      const f = input.items.find((it) => it.id === p.id)!.forms[p.form]!;
      if (p.kind === "menu") continue;
      sum += f.main.min;
      slots++;
    }
    if (fit.menu) {
      sum += input.menu!.main;
      slots++;
    }
    return sum + (slots > 1 ? (slots - 1) * gap : 0);
  };

  it("nothing overlaps and everything lies inside, between the padding", () => {
    const rand = seeded(11);
    for (let trial = 0; trial < 80; trial++) {
      const base = sweepInput(rand, rand() < 0.5);
      for (let length = 0; length <= 700; length += 17) {
        const input = { ...base, length };
        const fit = fitStack(input);
        const over = fit.notes.some((n) => n.code === "overflow");
        const rects = [...fit.items.filter((i) => i.kind !== "menu").map((i) => i.rect), ...(fit.menu ? [fit.menu.rect] : [])].sort((a, b) => a.x - b.x);
        for (let k = 0; k < rects.length; k++) {
          const r = rects[k]!;
          expect(r.width).toBeGreaterThanOrEqual(-1e-6);
          if (k > 0) expect(r.x).toBeGreaterThanOrEqual(rects[k - 1]!.x + rects[k - 1]!.width + (input.gap ?? 0) - 1e-6);
          if (!over) {
            expect(r.x).toBeGreaterThanOrEqual((input.pad?.start ?? 0) - 1e-6);
            expect(r.x + r.width).toBeLessThanOrEqual(length - (input.pad?.end ?? 0) + 1e-6);
          }
        }
      }
    }
  });

  it("a form never grows back as the stack shortens, and the minimum length never grows", () => {
    const rand = seeded(12);
    for (let trial = 0; trial < 80; trial++) {
      const base = sweepInput(rand, rand() < 0.5);
      let prev: StackFit | null = null;
      for (let length = 700; length >= 0; length -= 7) {
        const input = { ...base, length };
        const fit = fitStack(input);
        if (prev) {
          fit.items.forEach((p, i) => expect(p.form).toBeGreaterThanOrEqual(prev!.items[i]!.form));
          expect(total(input, fit)).toBeLessThanOrEqual(total(input, prev) + 1e-6);
        }
        prev = fit;
      }
    }
  });

  it("every step strictly shortens: an item sits on the chain of strictly smaller forms from its start", () => {
    const rand = seeded(13);
    for (let trial = 0; trial < 80; trial++) {
      const base = sweepInput(rand, false);
      for (let length = 0; length <= 600; length += 11) {
        const fit = fitStack({ ...base, length });
        for (const p of fit.items) {
          const f = base.items.find((it) => it.id === p.id)!.forms;
          const chain = [0];
          for (let j = 1; j < f.length; j++) if (f[j]!.main.min < f[chain.at(-1)!]!.main.min - 1e-6) chain.push(j);
          expect(chain).toContain(p.form);
        }
      }
    }
    // With the menu: a changed item is in the menu or strictly shorter than where it started.
    for (let trial = 0; trial < 80; trial++) {
      const base = sweepInput(rand, true);
      for (let length = 0; length <= 600; length += 11) {
        const fit = fitStack({ ...base, length });
        for (const p of fit.items) {
          if (p.form === 0) continue;
          const f = base.items.find((it) => it.id === p.id)!.forms;
          expect(p.kind === "menu" || f[p.form]!.main.min < f[0]!.main.min).toBe(true);
        }
      }
    }
  });

  it("the preview equals the drop, and the hits tile the stack", () => {
    const rand = seeded(14);
    for (let trial = 0; trial < 60; trial++) {
      const base = sweepInput(rand, rand() < 0.5);
      const dragged = randomGroup(rand, 99, rand() < 0.5);
      for (let length = 40; length <= 600; length += 41) {
        const input = { ...base, length };
        const targets = stackTargets(input, dragged, { endReach: 10 });
        for (const t of targets) {
          // The drop is the solve of the stack with the item at that place: the same rect as the preview.
          const dropped = t.input.items.find((i) => i.id === dragged.id)!;
          expect(t.input.items.indexOf(dropped)).toBe(t.place.at);
          expect(t.slot).toEqual(fitStack(withItem({ ...input, items: input.items.filter((i) => i.id !== dragged.id) }, dropped, t.place.at)).items.find((i) => i.id === dragged.id)!.rect);
          expect(t.slot).toEqual(fitStack(t.input).items.find((i) => i.id === dragged.id)!.rect);
        }
        for (let k = 1; k < targets.length; k++) expect(targets[k]!.hit.x).toBeCloseTo(targets[k - 1]!.hit.x + targets[k - 1]!.hit.width);
        expect(targets[0]!.hit.x).toBe(-10);
      }
    }
  });
});
