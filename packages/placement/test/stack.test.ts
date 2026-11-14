import { describe, expect, it } from "vitest";
import { fitStack, type StackFit, type StackInput } from "../src/stack";
import { barGroup, group, limits, mix, panel, seeded, stack } from "./stack-fixture";

const EPS = 1e-6;
const along = (axis: StackInput["axis"], r: { x: number; y: number; width: number; height: number }) => (axis === "column" ? { at: r.y, size: r.height } : { at: r.x, size: r.width });
const kinds = (fit: StackFit) => fit.items.map((i) => i.kind);

describe("fitStack: invariants", () => {
  it("nothing overlaps, everything lies inside the stack, each form is one the item declared", () => {
    const rand = seeded(7);
    let runs = 0;
    for (const axis of ["column", "row"] as const) {
      for (let trial = 0; trial < 40; trial++) {
        const items = mix(rand, 1 + Math.floor(rand() * 6));
        for (let length = 0; length <= 760; length += 11) {
          const input = stack(items, length, axis);
          const fit = fitStack(input);
          runs++;
          expect(fit.items.map((i) => i.id)).toEqual(items.map((i) => i.id));
          // Every form is in range and its kind is the declared one.
          fit.items.forEach((p, i) => {
            expect(p.form).toBeGreaterThanOrEqual(0);
            expect(p.form).toBeLessThan(items[i]!.forms.length);
            expect(p.kind).toBe(items[i]!.forms[p.form]!.kind);
          });
          const drawn = fit.items.filter((p) => p.kind !== "menu").map((p) => along(axis, p.rect));
          const overflow = fit.notes.some((n) => n.code === "overflow");
          for (let i = 1; i < drawn.length; i++) expect(drawn[i]!.at).toBeGreaterThanOrEqual(drawn[i - 1]!.at + drawn[i - 1]!.size - EPS);
          const end = Math.max(0, ...drawn.map((d) => d.at + d.size));
          const menu = fit.menu;
          if (menu) {
            const m = along(axis, menu.rect);
            expect(m.at).toBeGreaterThanOrEqual(end - EPS);
            if (!overflow) expect(m.at + m.size).toBeLessThanOrEqual(length + EPS);
            expect(menu.items).toEqual(fit.items.filter((p) => p.kind === "menu").map((p) => p.id));
          } else expect(fit.items.some((p) => p.kind === "menu")).toBe(false);
          // Inside the stack: along its length (unless nothing could give more way) and across its size.
          if (!overflow) expect(end).toBeLessThanOrEqual(length + EPS);
          for (const p of fit.items) {
            const cross = axis === "column" ? [p.rect.x, p.rect.width] : [p.rect.y, p.rect.height];
            expect(cross[0]).toBeGreaterThanOrEqual(0);
            expect(cross[0]! + cross[1]!).toBeLessThanOrEqual(fit.cross + EPS);
          }
          // The notes name only items of the stack, in forms they have.
          for (const n of fit.notes) if (n.code === "form-down") expect(items.find((i) => i.id === n.id)!.forms.length).toBeGreaterThan(n.to);
        }
      }
    }
    expect(runs).toBeGreaterThan(5000);
  });

  it("a form never grows back as the stack shortens (the same steps, taken further)", () => {
    const rand = seeded(11);
    for (let trial = 0; trial < 60; trial++) {
      const items = mix(rand, 2 + Math.floor(rand() * 5));
      let previous: number[] | null = null;
      for (let length = 900; length >= 0; length -= 9) {
        const forms = fitStack(stack(items, length)).items.map((p) => p.form);
        if (previous) forms.forEach((f, i) => expect(f).toBeGreaterThanOrEqual(previous![i]!));
        previous = forms;
      }
    }
  });

  it("a row is a column turned: the rects swap their axes", () => {
    const items = [panel("a", 1), group("b", 2), panel("c", 3)];
    for (const length of [120, 260, 400, 640]) {
      const col = fitStack(stack(items, length, "column"));
      const row = fitStack(stack(items, length, "row"));
      expect(row.cross).toBe(col.cross);
      expect(kinds(row)).toEqual(kinds(col));
      col.items.forEach((p, i) => {
        const r = row.items[i]!.rect;
        expect([r.y, r.x, r.height, r.width]).toEqual([p.rect.x, p.rect.y, p.rect.width, p.rect.height]);
      });
    }
  });

  it("is deterministic and never touches its input", () => {
    const items = [panel("a", 1), group("b", 2), panel("c", 3, 160, true)];
    const input = stack(items, 210);
    const frozen = JSON.stringify(input);
    expect(fitStack(input)).toEqual(fitStack(input));
    expect(JSON.stringify(input)).toBe(frozen);
  });
});

describe("fitStack: give-way", () => {
  it("every item starts in its largest form", () => {
    const fit = fitStack(stack([panel("a", 1), group("b", 2), panel("c", 3)], 2000));
    expect(fit.items.map((p) => p.form)).toEqual([0, 0, 0]);
    expect(fit.notes).toEqual([]);
    expect(fit.menu).toBeNull();
  });

  it("the item used longest ago steps down first, then the next, a form at a time", () => {
    const items = [panel("pages", 1), panel("notes", 2), panel("findings", 3)];
    // Three open panels need 3 x 90 at least.
    expect(kinds(fitStack(stack(items, 270)))).toEqual(["open", "open", "open"]);
    const one = fitStack(stack(items, 250));
    expect(kinds(one)).toEqual(["header", "open", "open"]);
    expect(one.notes).toEqual([{ code: "form-down", id: "pages", from: 0, to: 1 }]);
    // The oldest keeps giving way (header 28, rail icon 24) before the next one folds: it stays the oldest. The menu
    // is no step for it alone: the » entry (28) is bigger than the icon (24), and nothing else is stuck with it.
    expect(kinds(fitStack(stack(items, 205)))).toEqual(["rail", "open", "open"]);
    const next = fitStack(stack(items, 190));
    expect(kinds(next)).toEqual(["rail", "header", "open"]);
    expect(next.menu).toBeNull();
    expect(next.notes).toEqual([
      { code: "form-down", id: "pages", from: 0, to: 2 },
      { code: "form-down", id: "notes", from: 0, to: 1 },
    ]);
    // At 100, Pages and Notes (both icons, the oldest) go into the menu together (48 for the entry's 28), while
    // Findings folds to its icon: nothing open sets the width, so the column is a rail.
    expect(kinds(fitStack(stack(items, 100)))).toEqual(["menu", "menu", "rail"]);
    expect(kinds(fitStack(stack(items, 138)))).toEqual(["rail", "rail", "open"]);
    // Three icons are 72 px. Under that, icons go into the menu together: one alone (24 for the entry's 28) would
    // lengthen the stack, two shorten it (48 for 28), and each one after that saves its whole size.
    const tight = fitStack(stack(items, 60));
    expect(kinds(tight)).toEqual(["menu", "menu", "rail"]);
    expect(tight.menu!.items).toEqual(["pages", "notes"]);
    expect(tight.notes.some((n) => n.code === "overflow")).toBe(false);
    expect(kinds(fitStack(stack(items, 30)))).toEqual(["menu", "menu", "menu"]);
  });

  it("an item's use age is what orders it, not its place", () => {
    const items = [panel("a", 5), panel("b", 1), panel("c", 3)];
    expect(kinds(fitStack(stack(items, 250)))).toEqual(["open", "header", "open"]);
    expect(kinds(fitStack(stack(items.slice().reverse(), 250)))).toEqual(["open", "header", "open"]);
  });

  it("on equal use the later item in the stack gives way first", () => {
    const items = [panel("a", 2), panel("b", 2), panel("c", 2)];
    expect(kinds(fitStack(stack(items, 250)))).toEqual(["open", "open", "header"]);
  });

  it("kept panels go last, however long ago they were used", () => {
    const items = [panel("pages", 1, 160, true), panel("notes", 4), panel("findings", 5)];
    const fit = fitStack(stack(items, 250));
    expect(kinds(fit)).toEqual(["open", "header", "open"]);
    // Both unkept ones go all the way to the menu (together: the first alone would only lengthen the stack) before
    // the kept one goes a form down.
    expect(kinds(fitStack(stack(items, 90 + 48)))).toEqual(["open", "rail", "rail"]);
    expect(kinds(fitStack(stack(items, 90 + 28)))).toEqual(["open", "menu", "menu"]);
    expect(kinds(fitStack(stack(items, 60)))).toEqual(["rail", "menu", "menu"]);
  });

  it("groups and panels give way by the same age", () => {
    const items = [group("views", 1), panel("pages", 2), group("tools", 3)];
    // The three need 96 + 90 + 96. Over by a little: the oldest, the views group, takes its next form.
    expect(kinds(fitStack(stack(items, 400)))).toEqual(["row", "open", "row"]);
    expect(kinds(fitStack(stack(items, 270)))).toEqual(["stacked", "open", "row"]);
  });

  it("the menu entry takes room while an item is in it, and stands for every item in it", () => {
    const items = [group("a", 1), group("b", 2), group("c", 3)];
    const fit = fitStack({ ...stack(items, 60), menu: { main: 28 } });
    expect(fit.menu).not.toBeNull();
    const m = fit.menu!.rect;
    expect(m.height).toBe(28);
    expect(m.y + m.height).toBeLessThanOrEqual(60 + EPS);
    for (const p of fit.items) if (p.kind === "menu") expect(p.rect).toEqual(m);
    expect(fit.menu!.items.length).toBeGreaterThan(0);
  });

  it("forms that stop short of the menu overflow, and say so", () => {
    const noMenu = { ...panel("a", 1), forms: panel("a", 1).forms.slice(0, 2) };
    const fit = fitStack(stack([noMenu, { ...noMenu, id: "b", used: 2 }], 40));
    expect(kinds(fit)).toEqual(["header", "header"]);
    expect(fit.notes.at(-1)).toEqual({ code: "overflow", over: 16 });
  });
});

describe("fitStack: the cross size and the rail", () => {
  it("the widest open panel sets it, within the limits", () => {
    expect(fitStack(stack([panel("a", 1, 160, false, 200), panel("b", 2, 160, false, 300)], 900)).cross).toBe(300);
    expect(fitStack(stack([panel("a", 1, 160, false, 80)], 900)).cross).toBe(limits.min);
    // Clamped to the limits, whatever `cross.min` says (26.11.13 did, and `cross.min` already existed then).
    const wide = panel("a", 1, 160, false, 900);
    expect(fitStack(stack([wide], 900)).cross).toBe(limits.max);
    const stuck = { ...wide.forms[0]!, cross: { natural: 900, min: 500 } };
    const stuckItem = { ...wide, forms: [stuck, ...wide.forms.slice(1)] };
    expect(fitStack(stack([stuckItem], 900)).cross).toBe(limits.max);
    expect(fitStack(stack([stuckItem], 900)).items[0]!.kind).toBe("open");
    // With `strictCross` a `cross.min` over the limits' max steps down (T6); one it can live with is only clamped.
    expect(fitStack({ ...stack([stuckItem], 900), strictCross: true }).items[0]!.kind).not.toBe("open");
    const fine = { ...wide.forms[0]!, cross: { natural: 900, min: 200 } };
    expect(fitStack({ ...stack([{ ...wide, forms: [fine, ...wide.forms.slice(1)] }], 900), strictCross: true }).cross).toBe(limits.max);
  });

  it("C2: a group alone never sets the column's width: the column is a rail", () => {
    const fit = fitStack(stack([group("views", 1)], 600));
    expect(fit.cross).toBe(30);
    expect(fit.items[0]!.kind).toBe("icons");
    expect(fit.items[0]!.rect.width).toBe(30);
    // Several groups: the same rail.
    const many = fitStack(stack([group("views", 1), group("tools", 2), group("zoom", 3)], 600));
    expect(many.cross).toBe(30);
    expect(kinds(many)).toEqual(["icons", "icons", "icons"]);
  });

  it("C2: beside an open panel a group keeps its wider form, and the column keeps the panel's width", () => {
    const fit = fitStack(stack([group("views", 1), panel("pages", 2)], 600));
    expect(fit.cross).toBe(240);
    expect(fit.items[0]!.kind).toBe("row");
  });

  it("C6: with every panel folded and nothing open the column shrinks to a rail", () => {
    const folded = (id: string, used: number) => ({ ...panel(id, used), forms: panel(id, used).forms.slice(1) });
    const fit = fitStack(stack([folded("a", 1), folded("b", 2)], 600));
    expect(fit.cross).toBe(30);
    expect(kinds(fit)).toEqual(["rail", "rail"]);
  });

  it("a form can set the cross size itself (a header that keeps the column's width)", () => {
    const keepWidth = (id: string, used: number) => {
      const p = panel(id, used);
      return { ...p, forms: p.forms.slice(1).map((f, i) => (i === 0 ? { ...f, setsCross: true } : f)) };
    };
    const fit = fitStack(stack([keepWidth("a", 1)], 600));
    expect(fit.cross).toBe(240);
    expect(kinds(fit)).toEqual(["header"]);
  });

  it("an open panel stepping down lets the column narrow, and the groups beside it step down with it", () => {
    const items = [group("tools", 3), panel("pages", 1, 160)];
    expect(fitStack(stack(items, 600)).cross).toBe(240);
    // Too short for both: the panel folds, nothing sets the width any more, and the column is a rail: the group is
    // icons and the folded panel a rail icon.
    const tight = fitStack(stack(items, 100));
    expect(tight.cross).toBe(30);
    expect(kinds(tight)).toEqual(["icons", "rail"]);
  });

  it("C8: the solver has no open state of its own: it lays out the items it is given", () => {
    const three = [panel("a", 1), panel("b", 2), panel("c", 3)];
    const without = fitStack(stack([three[0]!, three[2]!], 700));
    const withB = fitStack(stack(three, 700));
    expect(without.items.map((p) => p.id)).toEqual(["a", "c"]);
    expect(withB.items.map((p) => p.id)).toEqual(["a", "b", "c"]);
    // Adding an item changes no other item's form while there is room for all.
    expect(withB.items.map((p) => p.kind)).toEqual(["open", "open", "open"]);
  });
});

describe("fitStack: spare room", () => {
  it("goes to the open panels, shared by their natural sizes", () => {
    const items = [panel("a", 1, 100), group("g", 2), panel("b", 3, 200)];
    const fit = fitStack(stack(items, 600));
    const [a, g, b] = fit.items;
    expect(g!.rect.height).toBe(96);
    const spare = 600 - (100 + 96 + 200);
    expect(a!.rect.height).toBeCloseTo(100 + (spare * 100) / 300, 6);
    expect(b!.rect.height).toBeCloseTo(200 + (spare * 200) / 300, 6);
    // The stack is full: the items tile it.
    expect(b!.rect.y + b!.rect.height).toBeCloseTo(600, 6);
    expect(a!.rect.y).toBe(0);
    expect(g!.rect.y).toBeCloseTo(a!.rect.height, 6);
  });

  it("folded panels and groups take only their own height", () => {
    const items = [panel("a", 1), group("g", 2), panel("b", 3)];
    // Squeezed so the oldest is a header: it is 28 tall, the group keeps its 96, the open panel takes the rest.
    const fit = fitStack(stack(items, 250));
    expect(kinds(fit)).toEqual(["header", "row", "open"]);
    expect(fit.items[0]!.rect.height).toBe(28);
    expect(fit.items[1]!.rect.height).toBe(96);
    expect(fit.items[2]!.rect.height).toBe(250 - 28 - 96);
  });

  it("C6: with no open panel the items keep their natural sizes from the start, and the rest is empty", () => {
    const fit = fitStack(stack([group("views", 1), group("tools", 2)], 600));
    expect(fit.items[0]!.rect).toEqual({ x: 0, y: 0, width: 30, height: 72 });
    expect(fit.items[1]!.rect).toEqual({ x: 0, y: 72, width: 30, height: 72 });
  });

  it("between the minimum and natural sizes every panel gives the same share of what it can", () => {
    const items = [panel("a", 1, 200), panel("b", 2, 120)];
    // Natural 320, min 180: 250 is half-way.
    const fit = fitStack(stack(items, 250));
    expect(kinds(fit)).toEqual(["open", "open"]);
    expect(fit.items[0]!.rect.height).toBeCloseTo(90 + 110 * (70 / 140), 6);
    expect(fit.items[1]!.rect.height).toBeCloseTo(90 + 30 * (70 / 140), 6);
    expect(fit.items[0]!.rect.height + fit.items[1]!.rect.height).toBeCloseTo(250, 6);
  });

  it("a row lays a bar out the same way, along x", () => {
    const input = { axis: "row", length: 440, cross: { min: 28, max: 40, rail: 30 }, items: [barGroup("views", 1), barGroup("tools", 2)] } as const;
    // Groups set no bar height, so the bar is a rail tall; a row of words is 26 tall and fits.
    const fit = fitStack(input);
    expect(fit.cross).toBe(30);
    expect(kinds(fit)).toEqual(["row", "row"]);
    expect(fit.items[0]!.rect).toEqual({ x: 0, y: 0, width: 220, height: 30 });
    expect(fit.items[1]!.rect).toEqual({ x: 220, y: 0, width: 220, height: 30 });
    // Shorter: the oldest group steps down past stacked words (too tall for the rail) to icons.
    const short = fitStack({ ...input, length: 300 });
    expect(kinds(short)).toEqual(["icons", "row"]);
  });
});
