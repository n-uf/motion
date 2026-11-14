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
    // The same kind at the same index but another size is the same form, re-measured (N1 below). An unchanged item is kept.
    expect(fitStack(input, { previous })).toEqual(previous);
  });

  it("N1: a form re-measured (a badge gained a digit) keeps its place; smaller frees room, larger gives way from the kept forms", () => {
    const group = (id: string, used: number, iconsMin: number): StackItem => ({ id, used, forms: [f("row", 150, 28), f("icons", iconsMin, 28), f("menu", 0, 0)] });
    const row = (items: StackItem[]): StackInput => ({ axis: "row", length: 350, cross: { min: 28, max: 40 }, items });
    const items = [group("a", 1, 40), group("b", 2, 40), group("c", 3, 40)];
    const before = fitStack(row(items));
    expect(kinds(before)).toEqual(["icons", "row", "row"]);
    // A press on a: with previous, nothing moves.
    const pressedA = [group("a", 4, 40), group("b", 2, 40), group("c", 3, 40)];
    expect(fitStack(row(pressedA), { previous: before })).toEqual(before);
    // …and a's icons form is 1 px longer (the repro): still the same forms, not ["row","icons","row"].
    const remeasured = [group("a", 4, 41), group("b", 2, 40), group("c", 3, 40)];
    expect(kinds(fitStack(row(remeasured), { previous: before }))).toEqual(["icons", "row", "row"]);
    // Much longer (150 over: nothing but the row fits less): it gives way from the kept forms, ages deciding only the new step.
    const huge = fitStack(row([group("a", 4, 95), group("b", 2, 40), group("c", 3, 40)]), { previous: before });
    expect(huge.need).toBeLessThanOrEqual(350);
    expect(huge.items[0]!.kind).toBe("icons");
    // Smaller: room came back, but growing never re-ranks: nothing fits larger, so the kept forms stay.
    expect(kinds(fitStack(row([group("a", 4, 20), group("b", 2, 40), group("c", 3, 40)]), { previous: before }))).toEqual(["icons", "row", "row"]);
  });

  /** Three groups on a row, `row(150)`, `icons(M)`, menu, with the ages and a's icons length given. */
  const trio = (ages: [number, number, number], aIcons: number, length = 350): StackInput => {
    const g = (id: string, used: number, iconsMin: number): StackItem => ({ id, used, forms: [f("row", 150, 28), f("icons", iconsMin, 28), f("menu", 0, 0)] });
    return { axis: "row", length, cross: { min: 28, max: 40 }, items: [g("a", ages[0], aIcons), g("b", ages[1], 40), g("c", ages[2], 40)] };
  };

  it("N2: a press, then a badge losing a digit, reshapes nothing: growing never re-ranks", () => {
    const q0 = fitStack(trio([1, 2, 3], 41));
    expect(kinds(q0)).toEqual(["icons", "row", "row"]);
    const q1 = fitStack(trio([4, 2, 3], 41), { previous: q0 });
    expect(kinds(q1)).toEqual(["icons", "row", "row"]);
    // a's icons 41 to 40: one px of room, nothing can grow, the fresh fit (b gives way instead) is not taken.
    const q2 = fitStack(trio([4, 2, 3], 40), { previous: q1 });
    expect(kinds(q2)).toEqual(["icons", "row", "row"]);
    expect(trio([4, 2, 3], 40)).not.toBeNull();
    expect(kinds(fitStack(trio([4, 2, 3], 40)))).toEqual(["row", "icons", "row"]);
  });

  it("a large room gain still restores everything, and a pure gain is the fresh fit", () => {
    const q0 = fitStack(trio([1, 2, 3], 41));
    const q1 = fitStack(trio([4, 2, 3], 41), { previous: q0 });
    // 450 px: all three rows fit.
    const roomy = fitStack(trio([4, 2, 3], 41, 500), { previous: q1 });
    expect(kinds(roomy)).toEqual(["row", "row", "row"]);
    expect(roomy).toEqual(fitStack(trio([4, 2, 3], 41, 500)));
    // Part of the room back with the ages unchanged: the fresh fit is a pure gain over the kept one, and it is taken.
    const kept = fitStack(trio([1, 2, 3], 41, 300));
    const grown = fitStack(trio([1, 2, 3], 41), { previous: kept });
    expect(grown).toEqual(fitStack(trio([1, 2, 3], 41)));
  });

  it("G1: items leave the menu when the form is larger, even if the stack gets shorter (the last one takes the » entry along)", () => {
    const g = (id: string, used: number): StackItem => ({ id, used, forms: [f("row", 100, 28), f("icons", 20, 28), f("menu", 0, 0)] });
    const c = (used: number): StackItem => ({ id: "c", used, forms: [f("row", 100, 28), f("fold", 60, 28), f("icons", 40, 28), f("menu", 0, 0)] });
    const row = (length: number, cUsed: number): StackInput => ({ axis: "row", length, cross: { min: 28, max: 40 }, items: [g("a", 1), g("b", 2), c(cUsed)] });
    const A = fitStack(row(128, 9));
    expect(kinds(A)).toEqual(["menu", "menu", "row"]);
    // A press on c: the same.
    const B = fitStack(row(128, 0), { previous: A });
    expect(kinds(B)).toEqual(["menu", "menu", "row"]);
    // 141 px: one icons beside the entry needs 148, both icons need 140. Only both leaving fits, so both come out together.
    expect(kinds(fitStack(row(141, 0), { previous: B }))).toEqual(["icons", "icons", "row"]);
    // 150 and 175: one comes out (148), then the other takes the entry with it (140).
    for (const length of [150, 175]) expect(kinds(fitStack(row(length, 0), { previous: B }))).toEqual(["icons", "icons", "row"]);
    // Under 140 nothing comes out: both icons plus the row need 140.
    expect(kinds(fitStack(row(139, 0), { previous: B }))).toEqual(["menu", "menu", "row"]);
  });

  it("room grows the item that gave way most recently first (newest used, with rank and kept respected)", () => {
    // All three icons (120 px); room for one row (+110) but not two. The newest used goes back first, whatever the place.
    const g = (id: string, used: number, kept = false): StackItem => ({ id, used, ...(kept ? { kept } : {}), forms: [f("row", 150, 28), f("icons", 40, 28), { ...f("menu", 0, 0), rank: 1 }] });
    const input = (ages: [number, number, number], length: number, keptC = false): StackInput => ({ axis: "row", length, cross: { min: 28, max: 40 }, items: [g("a", ages[0]), g("b", ages[1]), g("c", ages[2], keptC)] });
    const tight = fitStack(input([1, 2, 3], 200));
    expect(kinds(tight)).toEqual(["icons", "icons", "icons"]);
    // Ages flipped by a press (b is now the newest), then 100 px more: b grows back, not the oldest or the last.
    const press = fitStack(input([1, 5, 3], 200), { previous: tight });
    expect(kinds(press)).toEqual(["icons", "icons", "icons"]);
    expect(kinds(fitStack(input([1, 5, 3], 300), { previous: press }))).toEqual(["icons", "row", "icons"]);
    // A kept item grows back before the others, whatever its age.
    expect(kinds(fitStack(input([1, 5, 0], 300, true), { previous: press }))).toEqual(["icons", "icons", "row"]);
  });

  it("a sweep: after a press, shrinking only steps items down and growing never moves one down", () => {
    const rand = seeded(24);
    for (let trial = 0; trial < 120; trial++) {
      const list = mix(rand, 2 + Math.floor(rand() * 4));
      const axis = rand() < 0.5 ? "column" : "row";
      const length = 120 + Math.floor(rand() * 500);
      const before = fitStack(stack(list, length, axis));
      const next = list[Math.floor(rand() * list.length)]!;
      const pressedList = pressed(list, next.id);
      // The press itself: nothing changes.
      const afterPress = fitStack(stack(pressedList, length, axis), { previous: before });
      expect(afterPress).toEqual(before);
      for (const delta of [-60, -15, -1, 1, 15, 60, 200]) {
        const fit = fitStack(stack(pressedList, Math.max(30, length + delta), axis), { previous: afterPress });
        fit.items.forEach((p, i) => {
          const was = afterPress.items[i]!.form;
          if (delta < 0) expect(p.form, `shrink ${delta}: ${p.id}`).toBeGreaterThanOrEqual(was);
          else expect(p.form, `grow ${delta}: ${p.id}`).toBeLessThanOrEqual(was);
        });
      }
    }
  });
});

describe("previous: room comes back in the reverse of give-way order, and stops at the first item that can't grow", () => {
  const f = (kind: StackForm["kind"], min: number): StackForm => ({ kind, main: { min, natural: min }, cross: { natural: 28 } });
  const bar = (items: StackItem[], length: number): StackInput => ({ axis: "row", length, gap: 0, pad: { start: 0, end: 0 }, cross: { min: 28, max: 40 }, items });
  const item = (id: string, used: number, row: number, fold = 30): StackItem => ({ id, used, forms: [f("row", row), f("fold", fold)] });

  it("the repro: a leading group stays folded when it can't open, and the trailing one doesn't jump the queue", () => {
    // b was used earlier than a, so b gives way first, then a; a comes back first.
    const items = [item("a", 2, 100), item("b", 1, 50)];
    const shrunk = fitStack(bar(items, 60));
    expect(kinds(shrunk)).toEqual(["fold", "fold"]);
    // 90 px: a can't open (100 + 30 = 130), so growth stops; b (80 would fit) stays folded. Before: ["fold", "row"].
    const grown = fitStack(bar(items, 90), { previous: shrunk });
    expect(kinds(grown)).toEqual(["fold", "fold"]);
    // The fresh solve at 90 says the same: b gave way first, then a.
    expect(kinds(fitStack(bar(items, 90)))).toEqual(["fold", "fold"]);
    expect(grown).toEqual(fitStack(bar(items, 90)));
    // Room for a: a opens first, then b when it fits too.
    expect(kinds(fitStack(bar(items, 130), { previous: shrunk }))).toEqual(["row", "fold"]);
    expect(kinds(fitStack(bar(items, 150), { previous: shrunk }))).toEqual(["row", "row"]);
  });

  it("three items: growth takes them newest first and stops at the first that can't open", () => {
    // Ages as in a bar: c (the trailing one) used longest ago gives way first, then b, then a.
    const items = [item("a", 3, 100), item("b", 2, 50), item("c", 1, 40)];
    const shrunk = fitStack(bar(items, 90));
    expect(kinds(shrunk)).toEqual(["fold", "fold", "fold"]);
    // 150: a can't open (160), so nothing does. Before: ["fold", "row", "row"] (b and c skipped ahead of a).
    expect(kinds(fitStack(bar(items, 150), { previous: shrunk }))).toEqual(["fold", "fold", "fold"]);
    expect(kinds(fitStack(bar(items, 150)))).toEqual(["fold", "fold", "fold"]);
    // 170: a opens (160), b can't (180): it stops there, and c stays folded too.
    const some = fitStack(bar(items, 170), { previous: shrunk });
    expect(kinds(some)).toEqual(["row", "fold", "fold"]);
    expect(some).toEqual(fitStack(bar(items, 170)));
    // 185: a, then b (180); c can't (190). 200: all three.
    expect(kinds(fitStack(bar(items, 185), { previous: shrunk }))).toEqual(["row", "row", "fold"]);
    expect(kinds(fitStack(bar(items, 200), { previous: shrunk }))).toEqual(["row", "row", "row"]);
  });

  it("a trailing item whose menu step was an ordinary one doesn't leave the menu ahead of a leading one that can't open", () => {
    // b (row 50, then the menu) gave way first, alone: the entry (30) is shorter than its row. Then a folded.
    const items: StackItem[] = [item("a", 2, 100), { id: "b", used: 1, forms: [f("row", 50), f("menu", 0)] }];
    const input = (length: number): StackInput => ({ ...bar(items, length), menu: { main: 30 } });
    const shrunk = fitStack(input(60));
    expect(kinds(shrunk)).toEqual(["fold", "menu"]);
    // 80 to 129: a can't open (100 + 30 = 130), so b stays in the menu, as the fresh fit says.
    for (let length = 80; length <= 129; length++) {
      const grown = fitStack(input(length), { previous: shrunk });
      expect(kinds(grown), `${length}`).toEqual(["fold", "menu"]);
      expect(grown, `${length}`).toEqual(fitStack(input(length)));
    }
    expect(kinds(fitStack(input(130), { previous: shrunk }))).toEqual(["row", "menu"]);
  });

  it("with `from`, a menu item leaving counts steps from its own start, not raw form indexes", () => {
    // g2 starts at its fold (from 1) and is older than g1, which is drawn smaller (icons, one step down). g2 leaving
    // the menu into its fold would be zero steps down while g1 is one: an older item larger than a newer one.
    const g = (id: string, used: number, forms: StackForm[], from?: number): StackItem => ({ id, used, forms, ...(from === undefined ? {} : { from }) });
    const items: StackItem[] = [
      g("g0", 1, [f("row", 135), f("menu", 0)], 1),
      g("g1", 3, [f("row", 138), f("icons", 18), f("menu", 0)]),
      g("g2", 2, [f("row", 57), f("fold", 34), f("menu", 0)], 1),
    ];
    const input = (length: number): StackInput => ({ ...bar(items, length), gap: 4, menu: { main: 32 } });
    const shrunk = fitStack(input(56));
    expect(kinds(shrunk)).toEqual(["menu", "icons", "menu"]);
    const grown = fitStack(input(100), { previous: shrunk });
    expect(kinds(grown)).not.toEqual(["menu", "icons", "fold"]);
    const g1 = grown.items.find((i) => i.id === "g1")!;
    const g2 = grown.items.find((i) => i.id === "g2")!;
    // g2 (older) is never fewer steps down from its start than g1 (newer).
    expect(g2.form - 1).toBeGreaterThanOrEqual(g1.form - 0);
  });

  it("a sweep: after a grow, no item that gave way earlier is in a larger form than one that gave way later, unless the fresh fit was a pure gain; along successive solves more room never undoes a growth", () => {
    const rand = seeded(25);
    // Shapes, some with a menu step that follows an ordinary form (row, then the menu) and so is taken alone.
    const shapes: StackForm["kind"][][] = [["row", "fold"], ["row", "menu"], ["row", "fold", "menu"], ["row", "fold", "icons", "menu"], ["row", "icons", "menu"]];
    const size = { row: () => 50 + Math.floor(rand() * 90), fold: () => 30 + Math.floor(rand() * 25), icons: () => 18 + Math.floor(rand() * 14), menu: () => 0 } as Record<string, () => number>;
    let checked = 0;
    for (let trial = 0; trial < 600; trial++) {
      const n = 2 + Math.floor(rand() * 4);
      const mixed = rand() < 0.6;
      const one = shapes[Math.floor(rand() * shapes.length)]!;
      // Distinct ages: the one used longest ago gives way first.
      const ages = Array.from({ length: n }, (_, i) => i + 1).sort(() => rand() - 0.5);
      const list: StackItem[] = ages.map((used, i) => {
        const shape = mixed ? shapes[Math.floor(rand() * shapes.length)]! : one;
        return { id: `g${i}`, used, forms: shape.map((k) => f(k, size[k]!())) };
      });
      const entry = 24 + Math.floor(rand() * 12);
      const input = (length: number): StackInput => ({ ...bar(list, length), menu: { main: entry } });
      const length = 40 + Math.floor(rand() * 300);
      const kept = fitStack(input(length));
      // Give-way order: older first. A pair already out of order in the kept fit isn't growth's doing. Two items with the
      // same forms compare by form; others by open (the first form), drawn smaller, or in the menu.
      const shape = (i: number): string => list[i]!.forms.map((q) => q.kind).join();
      const level = (fit: StackFit, i: number): number => (fit.items[i]!.kind === "menu" ? 2 : fit.items[i]!.form === 0 ? 0 : 1);
      const outOfOrder = (fit: StackFit, e: number, l: number): boolean => (shape(e) === shape(l) ? fit.items[e]!.form < fit.items[l]!.form : level(fit, e) < level(fit, l));
      const pairs: [number, number][] = [];
      for (let e = 0; e < n; e++) for (let l = 0; l < n; l++) if (list[e]!.used < list[l]!.used && !outOfOrder(kept, e, l)) pairs.push([e, l]);
      for (const delta of [1, 10, 30, 60, 120, 400]) {
        const fit = fitStack(input(length + delta), { previous: kept });
        expect(fit.items.every((p, i) => p.form <= kept.items[i]!.form)).toBe(true);
        const fresh = fitStack(input(length + delta));
        const pureGain = fresh.items.every((p, i) => p.form <= kept.items[i]!.form) && fresh.items.some((p, i) => p.form < kept.items[i]!.form);
        if (pureGain) continue;
        checked++;
        for (const [e, l] of pairs) expect(outOfOrder(fit, e, l), `trial ${trial} +${delta}: ${list[e]!.id} grew past ${list[l]!.id}`).toBe(false);
      }
      // A chain: each solve takes the one before as previous, the length growing a few px at a time.
      let last = kept;
      for (let l = length + 3; l <= length + 200; l += 3) {
        const next = fitStack(input(l), { previous: last });
        next.items.forEach((p, i) => expect(p.form, `trial ${trial} chain ${l}: ${p.id}`).toBeLessThanOrEqual(last.items[i]!.form));
        last = next;
      }
    }
    expect(checked).toBeGreaterThan(600);
  });
});
