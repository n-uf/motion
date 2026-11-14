/**
 * The Stack · forms page's scenarios, on `window.__motionLab.runAll(filter?)`. Each drives the page's sliders and
 * toggles (the same functions the controls call) and asserts what the solver gave and what the page drew from it:
 * C2 (a group alone is a rail), C6 (spare room, folded items take their own size), C8 (panels are independent), C9
 * (give-way by age, kept last), C10 (group forms by space), and that every drawn rect is the solver's.
 */
import type { StackFit, StackFormKind } from "@n-uf/placement/stack";
import { GROUPS, PANELS, titleOf, type ItemId } from "./sample";
import { fmt, install, near, rule, type Scenario } from "./run";
import { page, type FormsPage } from "./forms";

type Page = FormsPage;
const kindOf = (fit: StackFit, id: string): StackFormKind => fit.items.find((p) => p.id === id)!.kind;
const formOf = (fit: StackFit, id: string): number => fit.items.find((p) => p.id === id)!.form;
const rectOf = (fit: StackFit, id: string) => fit.items.find((p) => p.id === id)!.rect;
const fitFor = (p: Page, mode: string): StackFit => (mode === "bar" ? p.barFit : p.colFit);
const showOnly = (p: Page, ids: readonly ItemId[]): void => {
  for (const id of p.all) p.setShown(id, ids.includes(id));
};
const heightOf = (fit: StackFit, id: string): number => rectOf(fit, id).height;

/** Sweep the length from `from` down to `to` and give each fit. */
function sweep(p: Page, mode: string, from: number, to: number, step: number): { length: number; fit: StackFit }[] {
  const out: { length: number; fit: StackFit }[] = [];
  for (let l = from; l >= to; l -= step) {
    p.setLength(l);
    out.push({ length: p.length, fit: fitFor(p, mode) });
  }
  return out;
}

/** Whether the form index of each id never goes down as the stack shortens (a form never comes back by itself). */
function neverBack(steps: readonly { length: number; fit: StackFit }[], ids: readonly string[]): string[] {
  const bad: string[] = [];
  for (const id of ids) {
    let prev = -1;
    for (const s of steps) {
      const f = formOf(s.fit, id);
      if (f < prev) bad.push(`${titleOf(id)} went back from form ${prev} to ${f} at length ${s.length}`);
      prev = f;
    }
  }
  return bad;
}

const c2: Scenario<Page> = {
  name: "C2: a group alone gives a rail",
  modes: ["column", "bar"],
  async run(p, mode) {
    // Long enough that a bar of three groups and an open panel fits (3 × 200 + 150).
    p.setLength(760);
    const rows = [];
    // Only groups in the stacks.
    showOnly(p, ["views"]);
    const alone = fitFor(p, mode);
    const stack = mode === "bar" ? p.bar.el : p.column.el;
    rows.push(
      await rule(mode === "column" ? "A group alone: the column is a rail of 30 px, the group icons" : "A group alone: the bar is a rail tall (32 px)", (ok) => {
        ok(alone.cross === (mode === "bar" ? 32 : 30), `cross is ${alone.cross}`);
        if (mode === "column") ok(kindOf(alone, "views") === "icons", `Views is ${kindOf(alone, "views")}`);
        ok(Math.abs((mode === "bar" ? stack.getBoundingClientRect().height : stack.getBoundingClientRect().width) - alone.cross) < 0.5, "the drawn stack isn't that size");
      }),
    );
    showOnly(p, GROUPS);
    const groups = fitFor(p, mode);
    rows.push(
      await rule("Three groups: still a rail, none sets the width", (ok) => {
        ok(groups.cross === (mode === "bar" ? 32 : 30), `cross is ${groups.cross}`);
        if (mode === "column") for (const g of GROUPS) ok(kindOf(groups, g) === "icons", `${titleOf(g)} is ${kindOf(groups, g)}`);
      }),
    );
    // A panel opens: its width is the stack's, and the group keeps its wider form.
    p.setShown("pages", true);
    const withPanel = fitFor(p, mode);
    // A bar is a toolbar edge: a panel there has no open form, so it never sets the bar's height.
    rows.push(
      await (mode === "bar"
        ? rule("Beside a panel the bar stays a rail tall: a panel in a bar starts at its header and sets no height", (ok) => {
            ok(withPanel.cross === 32, `cross is ${withPanel.cross}`);
            ok(kindOf(withPanel, "pages") === "header", `Pages is ${kindOf(withPanel, "pages")}`);
          })
        : rule("Beside an open panel the stack takes the panel's size, and the groups their wide form", (ok) => {
            ok(withPanel.cross > 30, `cross is ${withPanel.cross}`);
            ok(kindOf(withPanel, "pages") === "open", `Pages is ${kindOf(withPanel, "pages")}`);
            ok(kindOf(withPanel, "views") === "row", `Views is ${kindOf(withPanel, "views")}`);
          })),
    );
    p.setShown("pages", false);
    rows.push(await rule("Without it the stack is a rail again", (ok) => ok(fitFor(p, mode).cross === (mode === "bar" ? 32 : 30), `cross is ${fitFor(p, mode).cross}`)));
    return rows;
  },
};

const c6: Scenario<Page> = {
  name: "C6: spare room goes to the open panels",
  modes: ["column"],
  async run(p) {
    const rows = [];
    p.setLength(700);
    const tall = p.colFit;
    rows.push(
      await rule("Groups and folded panels take only their own size; the open panels share the rest", (ok) => {
        for (const g of GROUPS) ok(heightOf(tall, g) === 30, `${titleOf(g)} is ${heightOf(tall, g)} tall, not 30`);
        const natural: Record<string, number> = { pages: 150, annotations: 130, findings: 170 };
        for (const id of PANELS) ok(heightOf(tall, id) > natural[id]!, `${titleOf(id)} is ${heightOf(tall, id)} tall, no more than its ${natural[id]}`);
        ok(Math.abs(tall.items.reduce((s, i) => s + i.rect.height, 0) - 700) < 0.01, "the items don't fill the column");
        const [a, b, c] = PANELS.map((id) => heightOf(tall, id) - natural[id]!);
        // Shared by natural sizes: spare / natural is the same for every open panel.
        ok(Math.abs(a! / 150 - b! / 130) < 1e-6 && Math.abs(b! / 130 - c! / 170) < 1e-6, "the spare isn't shared by natural sizes");
      }),
    );
    // One open panel among folded ones takes everything the others leave.
    for (const id of PANELS) p.setOpen(id, id === "findings");
    const one = p.colFit;
    rows.push(
      await rule("One open panel takes all the room the others leave", (ok) => {
        const others = one.items.filter((i) => i.id !== "findings").reduce((s, i) => s + i.rect.height, 0);
        ok(Math.abs(heightOf(one, "findings") - (700 - others)) < 0.01, `Findings is ${heightOf(one, "findings")} tall, the rest is ${700 - others}`);
        for (const id of ["pages", "annotations"]) ok(kindOf(one, id) === "header" && heightOf(one, id) === 30, `${titleOf(id)} is ${kindOf(one, id)}, ${heightOf(one, id)} tall`);
      }),
    );
    // Nothing open: a rail; every item at its own size from the start, the rest empty.
    p.setOpen("findings", false);
    const none = p.colFit;
    rows.push(
      await rule("Nothing open: the column shrinks to a rail and the rest of its length is empty", (ok) => {
        ok(none.cross === 30, `cross is ${none.cross}`);
        for (const id of PANELS) ok(kindOf(none, id) === "rail", `${titleOf(id)} is ${kindOf(none, id)}`);
        const end = Math.max(...none.items.map((i) => i.rect.y + i.rect.height));
        ok(end < 700 - 100, `the items run to ${end} of 700`);
        let at = 0;
        for (const i of none.items) {
          ok(Math.abs(i.rect.y - at) < 0.01, `${titleOf(i.id)} starts at ${i.rect.y}, not ${at}`);
          at = i.rect.y + i.rect.height;
        }
      }),
    );
    return rows;
  },
};

const c8: Scenario<Page> = {
  name: "C8: panels open independently",
  // A bar is a toolbar edge: its panels have no open form, so there is nothing to open there.
  modes: ["column"],
  async run(p, mode) {
    showOnly(p, PANELS);
    p.setLength(mode === "bar" ? 760 : 700);
    const rows = [];
    const combos = Array.from({ length: 8 }, (_, n) => PANELS.map((_, i) => ((n >> i) & 1) === 1));
    rows.push(
      await rule("Any combination of open panels is drawn as set", (ok) => {
        for (const c of combos) {
          PANELS.forEach((id, i) => p.setOpen(id, c[i]!));
          const fit = fitFor(p, mode);
          PANELS.forEach((id, i) => ok((kindOf(fit, id) === "open") === c[i], `${c.map((x) => (x ? "open" : "folded")).join("/")}: ${titleOf(id)} is ${kindOf(fit, id)}`));
        }
      }),
    );
    rows.push(
      await rule("With room, opening or folding one panel folds no panel that was open", (ok) => {
        for (const c of combos) {
          for (const flip of PANELS.keys()) {
            PANELS.forEach((id, i) => p.setOpen(id, c[i]!));
            const before = fitFor(p, mode);
            p.setOpen(PANELS[flip]!, !c[flip]);
            const after = fitFor(p, mode);
            PANELS.forEach((id, i) => {
              if (i !== flip && kindOf(before, id) === "open") ok(kindOf(after, id) === "open", `flipping ${titleOf(PANELS[flip]!)} folded ${titleOf(id)}`);
            });
          }
        }
      }),
    );
    // Tight, the solver gives way by age. What the solver is given (each panel's first form, `from`) is still only
    // the flipped panel's to change, and no panel is ever drawn in a form above the one it was given.
    rows.push(
      await rule("Tight, opening or folding one panel changes no other panel's first form, and the solver never draws one above it", (ok) => {
        for (const length of mode === "bar" ? [440, 300] : [230, 160]) {
          p.setLength(length);
          for (const c of combos) {
            for (const flip of PANELS.keys()) {
              PANELS.forEach((id, i) => p.setOpen(id, c[i]!));
              const before = p.placed();
              p.setOpen(PANELS[flip]!, !c[flip]);
              const after = p.placed();
              const fit = fitFor(p, mode);
              PANELS.forEach((id, i) => {
                const was = before.find((x) => x.id === id)!;
                const now = after.find((x) => x.id === id)!;
                if (i !== flip) ok((was.from ?? 0) === (now.from ?? 0), `flipping ${titleOf(PANELS[flip]!)} changed ${titleOf(id)}'s first form at length ${length}`);
                ok(formOf(fit, id) >= (now.from ?? 0), `${titleOf(id)} is drawn above its first form (${formOf(fit, id)} < ${now.from ?? 0}) at length ${length}`);
              });
            }
          }
        }
      }),
    );
    return rows;
  },
};

const c9: Scenario<Page> = {
  name: "C9: give-way by age, kept last",
  modes: ["column", "bar"],
  async run(p, mode) {
    showOnly(p, PANELS);
    const from = mode === "bar" ? 760 : 700;
    const to = mode === "bar" ? 60 : 40;
    p.setAges(["pages", "annotations", "findings"]);
    const steps = sweep(p, mode, from, to, 3);
    // The longest length at which a panel is no longer in its first form (open; in a bar, which has no open form, its header), per panel.
    const first = mode === "bar" ? "header" : "open";
    const leaves = (list: typeof steps): Record<string, number> => Object.fromEntries(PANELS.map((id) => [id, list.find((s) => kindOf(s.fit, id) !== first)?.length ?? 0]));
    const base = leaves(steps);
    const rows = [];
    rows.push(
      await rule("The panel used longest ago folds first, then the next", (ok) => {
        ok(base.pages! > base.annotations! && base.annotations! > base.findings!, `they fold at ${titleOf("pages")} ${base.pages}, ${titleOf("annotations")} ${base.annotations}, ${titleOf("findings")} ${base.findings}`);
        ok(base.pages! > 0, "Pages never folded");
      }),
    );
    rows.push(await rule("A form never comes back as the stack shortens", (ok) => neverBack(steps, PANELS).forEach((m) => ok(false, m))));
    rows.push(
      await rule("Each panel passes its header and its rail icon on the way to the » menu", (ok) => {
        const seen = PANELS.map((id) => [...new Set(steps.map((s) => kindOf(s.fit, id)))]);
        ok(seen[0]!.join() === (mode === "column" ? "open,header,rail,menu" : "header,rail,menu"), `Pages passes ${seen[0]!.join(" → ")}`);
        const last = steps.at(-1)!.fit;
        ok(last.menu !== null && last.menu.items.length > 0, "nothing is in the » menu at the shortest length");
      }),
    );
    // A use: Annotations is now the oldest.
    p.setAges(["annotations", "findings", "pages"]);
    const used = sweep(p, mode, from, to, 3);
    const usedLeaves = leaves(used);
    rows.push(await rule("Using a panel makes it the newest: it folds last", (ok) => ok(usedLeaves.annotations! > usedLeaves.findings! && usedLeaves.findings! > usedLeaves.pages!, `they fold at ${JSON.stringify(usedLeaves)}`)));
    // Kept: Pages, the oldest, goes last.
    p.setAges(["pages", "annotations", "findings"]);
    p.setKept("pages", true);
    const kept = sweep(p, mode, from, to, 3);
    const keptLeaves = leaves(kept);
    rows.push(
      await rule("A kept panel folds after every panel that isn't, however long ago it was used", (ok) => {
        ok(keptLeaves.pages! < keptLeaves.annotations! && keptLeaves.pages! < keptLeaves.findings!, `they fold at ${JSON.stringify(keptLeaves)}`);
        ok(keptLeaves.annotations! > keptLeaves.findings!, "the unkept ones didn't go by age");
      }),
    );
    return rows;
  },
};

const c10: Scenario<Page> = {
  name: "C10: group forms by space",
  modes: ["column width", "bar length"],
  async run(p, mode) {
    const rows = [];
    if (mode === "column width") {
      showOnly(p, ["pages", ...GROUPS]);
      p.setLength(600);
      const steps: { width: number; fit: StackFit }[] = [];
      for (let w = 360; w >= 60; w -= 2) {
        p.setWidth(w);
        steps.push({ width: p.width, fit: p.colFit });
      }
      const at = (w: number): StackFit => steps.find((s) => s.width === w)!.fit;
      rows.push(
        await rule("Beside an open panel a group takes the largest form that fits the width: words, stacked words, icons", (ok) => {
          for (const g of GROUPS) {
            ok(kindOf(at(360), g) === "row", `${titleOf(g)} at 360 is ${kindOf(at(360), g)}`);
            ok(kindOf(at(150), g) === "stacked", `${titleOf(g)} at 150 is ${kindOf(at(150), g)}`);
            ok(kindOf(at(70), g) === "icons", `${titleOf(g)} at 70 is ${kindOf(at(70), g)}`);
          }
        }),
        // The open form can be drawn as thin as its `cross.min` (100): squeezed to 150 it stays open, under 100 it
        // steps down (a form too thick for the limit does), nothing open sets the width and the column is a rail.
        await rule("The open panel is squeezed down to its cross.min, and steps down under it", (ok) => {
          ok(kindOf(at(150), "pages") === "open", `Pages at 150 is ${kindOf(at(150), "pages")}`);
          ok(kindOf(at(100), "pages") === "open", `Pages at 100 is ${kindOf(at(100), "pages")}`);
          ok(kindOf(at(90), "pages") !== "open", `Pages at 90 is open, thinner than the 100 px it can live with`);
          ok(at(150).cross === 150, `the column is ${at(150).cross} wide at 150`);
        }),
      );
      rows.push(
        await rule("A narrower column never gives a group a larger form back", (ok) => {
          for (const g of GROUPS) {
            let prev = -1;
            for (const s of steps) {
              ok(formOf(s.fit, g) >= prev, `${titleOf(g)} went back at ${s.width}`);
              prev = formOf(s.fit, g);
            }
          }
        }),
      );
      rows.push(
        await rule("Every group fits the column it is in", (ok) => {
          for (const s of steps) for (const g of GROUPS) ok(rectOf(s.fit, g).width <= s.fit.cross + 0.01, `${titleOf(g)} is wider than the column at ${s.width}`);
        }),
      );
    } else {
      showOnly(p, GROUPS);
      p.setAges(["views", "tools", "zoom"]);
      const steps = sweep(p, "bar", 700, 40, 3);
      rows.push(await rule("A group never comes back to a larger form as the bar shortens", (ok) => neverBack(steps, GROUPS).forEach((m) => ok(false, m))));
      rows.push(
        await rule("The groups step down in age order, down to the » menu", (ok) => {
          const first = (g: string): number => steps.find((s) => formOf(s.fit, g) > 0)?.length ?? 0;
          ok(first("views") > first("tools") && first("tools") > first("zoom"), `they first step at ${first("views")}, ${first("tools")}, ${first("zoom")}`);
          const end = steps.at(-1)!.fit;
          for (const g of GROUPS) ok(kindOf(end, g) === "menu", `${titleOf(g)} is ${kindOf(end, g)} at the shortest length`);
          ok(end.menu?.items.join() === GROUPS.join(), `the menu holds ${end.menu?.items.join()}`);
          ok(steps.every((s) => s.fit.cross === 32), "the bar's height changed");
        }),
      );
      rows.push(
        await rule("The » entry shows exactly while a group is in it, and is drawn", (ok) => {
          for (const s of steps) {
            const inMenu = s.fit.items.some((i) => i.kind === "menu");
            ok((s.fit.menu !== null) === inMenu, `at ${s.length} the menu is ${s.fit.menu ? "there" : "absent"} with ${inMenu ? "" : "no "}items in it`);
          }
          p.setLength(40);
          ok(p.bar.menuEl.hidden === false, "the » entry isn't drawn at 40");
          p.setLength(700);
          ok(p.bar.menuEl.hidden === true, "the » entry is drawn at 700");
        }),
      );
    }
    return rows;
  },
};

const drawn: Scenario<Page> = {
  name: "The page draws the solver's rects",
  modes: ["column", "bar"],
  async run(p, mode) {
    const rows = [];
    const view = mode === "bar" ? p.bar : p.column;
    rows.push(
      await rule("Every item is drawn at its rect, an item in the menu isn't drawn, the » entry is at its rect", (ok) => {
        const lengths = mode === "bar" ? [760, 560, 360, 200, 90] : [700, 450, 280, 150, 60];
        for (const length of lengths) {
          for (const state of [
            () => p.all.forEach((id) => p.setShown(id, true)),
            () => showOnly(p, GROUPS),
            () => {
              p.all.forEach((id) => p.setShown(id, true));
              PANELS.forEach((id) => p.setOpen(id, id === "annotations"));
            },
          ]) {
            state();
            p.setLength(length);
            const fit = fitFor(p, mode);
            const d = view.drawn();
            for (const i of fit.items) {
              if (i.kind === "menu") ok(!d.has(i.id), `${titleOf(i.id)} is in the menu but drawn (length ${length})`);
              else ok(d.has(i.id) && near(d.get(i.id)!, i.rect), `${titleOf(i.id)} drawn at ${fmt(d.get(i.id))}, solver ${fmt(i.rect)} (length ${length})`);
            }
            const box = view.el.getBoundingClientRect();
            ok(Math.abs(box.width - (mode === "bar" ? fit.length : fit.cross)) < 0.5 && Math.abs(box.height - (mode === "bar" ? fit.cross : fit.length)) < 0.5, `the stack is ${Math.round(box.width)} × ${Math.round(box.height)}`);
            if (fit.menu) {
              const m = view.menuEl.getBoundingClientRect();
              ok(near({ x: m.left - box.left, y: m.top - box.top, width: m.width, height: m.height }, fit.menu.rect), `the » entry is drawn at ${Math.round(m.left - box.left)},${Math.round(m.top - box.top)}`);
            } else ok(view.menuEl.hidden === true, "a » entry is drawn with nothing in it");
          }
        }
      }),
    );
    return rows;
  },
};

const status: Scenario<Page> = {
  name: "The status lists the notes",
  modes: ["column and bar"],
  async run(p) {
    p.setAges(["pages", "annotations", "findings", "views", "tools", "zoom"]);
    p.setLength(220);
    const rows = [];
    rows.push(
      await rule("Every item the notes name is in the status, with where it went", (ok) => {
        const words = p.status;
        for (const fit of [p.colFit, p.barFit]) {
          ok(fit.notes.length > 0, `no notes at length 220 (${fit.axis})`);
          for (const n of fit.notes) if (n.code !== "overflow") ok(words.includes(titleOf(n.id)), `the status doesn't name ${titleOf(n.id)}`);
        }
        for (const fit of [p.colFit, p.barFit]) if (fit.menu) ok(words.includes("» menu"), "the status doesn't say what is in the » menu");
        ok(words.includes("→"), "the status doesn't say where an item went");
      }),
    );
    return rows;
  },
};

/** Every item drawn in a stack has a grab handle you can see: a `[data-grab]` of a non-zero size, inside the item. */
function grabFailures(p: Page, mode: string, seen: Set<string>): string[] {
  const view = mode === "bar" ? p.bar : p.column;
  const out: string[] = [];
  for (const el of view.el.querySelectorAll<HTMLElement>(".st-item")) {
    if (el.hidden) continue;
    const id = el.dataset.id!;
    seen.add(el.dataset.kind!);
    const grab = el.querySelector<HTMLElement>("[data-grab]");
    if (!grab) {
      out.push(`${titleOf(id)} (${el.dataset.kind}) has no grab handle`);
      continue;
    }
    const g = grab.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const style = getComputedStyle(grab);
    const w = Math.min(g.right, r.right) - Math.max(g.left, r.left);
    const h = Math.min(g.bottom, r.bottom) - Math.max(g.top, r.top);
    if (g.width < 1 || g.height < 1 || style.display === "none" || style.visibility === "hidden") out.push(`${titleOf(id)} (${el.dataset.kind}): its grab handle is ${Math.round(g.width)} × ${Math.round(g.height)}, ${style.display === "none" ? "display: none" : style.visibility}`);
    else if (w * h < g.width * g.height * 0.5) out.push(`${titleOf(id)} (${el.dataset.kind}): its grab handle lies outside the item`);
  }
  return out;
}

const grips: Scenario<Page> = {
  name: "Every drawn item has a grab handle",
  modes: ["column", "bar"],
  async run(p, mode) {
    const seen = new Set<string>();
    const bad: string[] = [];
    // Panels open, then all folded by hand, then groups alone (a rail): the lengths and widths run every form.
    const states: [string, () => void][] = [
      ["open", () => PANELS.forEach((id) => p.setOpen(id, true))],
      ["folded", () => PANELS.forEach((id) => p.setOpen(id, false))],
      ["groups only", () => p.all.forEach((id) => p.setShown(id, GROUPS.includes(id)))],
    ];
    for (const [name, state] of states) {
      p.reset();
      p.all.forEach((id) => p.setShown(id, true));
      state();
      for (const width of [360, 150, 60]) {
        p.setWidth(width);
        for (let length = 760; length >= 80; length -= 20) {
          p.setLength(length);
          for (const m of grabFailures(p, mode, seen)) if (bad.length < 6 && !bad.includes(m)) bad.push(`${name}, length ${length}, width ${width}: ${m}`);
        }
      }
    }
    return [
      await rule("Every drawn item has a visible grab handle of a non-zero size, in every form", (ok) => bad.forEach((m) => ok(false, m))),
      await rule("The sweep drew every form: open, header, rail, row, stacked, icons", (ok) => {
        // A panel in a bar has no open form.
        for (const k of mode === "bar" ? ["header", "rail", "row", "stacked", "icons"] : ["open", "header", "rail", "row", "stacked", "icons"]) ok(seen.has(k), `no item was drawn in the ${k} form`);
      }),
    ];
  },
};

/** A bar is a toolbar edge: at most this tall, whatever is used. */
const BAR_TALLEST = 40;

const independent: Scenario<Page> = {
  name: "The column and the bar are independent examples",
  modes: ["a use in the column leaves the bar's fit identical", "a use in the bar leaves the column's fit identical", "a click on an item in the column", "the bar is never taller than a toolbar"],
  async run(p, mode) {
    const rows = [];
    const lengths = [120, 200, 280, 360, 440, 520, 640, 760];
    const fitOf = (side: "column" | "bar"): string => JSON.stringify(side === "column" ? p.colFit : p.barFit);
    if (mode === "the bar is never taller than a toolbar") {
      // A small seeded generator; any combination of shown, kept, ages and lengths.
      let a = 12345;
      const rand = (): number => {
        a = (Math.imul(a ^ (a >>> 15), 2246822519) + 0x9e3779b9) >>> 0;
        return a / 4294967296;
      };
      let worst = 0;
      let at = "";
      for (let trial = 0; trial < 300; trial++) {
        p.reset();
        for (const id of p.all) {
          p.setShown(id, rand() < 0.8, "bar");
          p.setKept(id, rand() < 0.3, "bar");
          p.setOpen(id, rand() < 0.5, "bar");
          if (rand() < 0.4) p.use(id, "bar");
        }
        p.setLength(80 + Math.floor(rand() * 680));
        if (p.barFit.cross > worst) {
          worst = p.barFit.cross;
          at = `trial ${trial}, length ${p.length}`;
        }
      }
      rows.push(await rule(`With any combination of uses the bar is never taller than ${BAR_TALLEST} px, and no panel in it is open`, (ok) => ok(worst <= BAR_TALLEST, `the bar was ${worst} px tall (${at})`)));
      p.reset();
      p.setLength(520);
      rows.push(await rule("A panel in the bar has no open form: header, rail icon or the » menu", (ok) => {
        for (const id of p.panels) ok(["header", "rail", "menu"].includes(kindOf(p.barFit, id)), `${titleOf(id)} is ${kindOf(p.barFit, id)} in the bar`);
      }));
      return rows;
    }
    const other = mode.includes("in the column") ? "bar" : "column";
    const side = other === "bar" ? "column" : "bar";
    const failures: string[] = [];
    for (const length of lengths) {
      for (const id of p.all) {
        p.reset();
        p.setLength(length);
        const before = fitOf(other);
        if (mode.startsWith("a click")) {
          // A real click on the item, as the operator does.
          const el = (side === "column" ? p.column : p.bar).itemEl(id);
          if (el && !el.hidden) el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
          else continue;
        } else p.use(id, side);
        if (fitOf(other) !== before) failures.push(`length ${length}: using ${titleOf(id)} in the ${side} changed the ${other}'s fit`);
      }
    }
    rows.push(await rule(`Using any item in the ${side} leaves the ${other}'s fit identical, at every length`, (ok) => failures.slice(0, 5).forEach((m) => ok(false, m))));
    return rows;
  },
};

// --- C23 ---------------------------------------------------------------------------------------------------------------

const c23: Scenario<Page> = {
  name: "C23: a press is not a reshape",
  modes: ["column", "bar"],
  async run(p, mode) {
    const view = mode === "bar" ? p.bar : p.column;
    const rects = (): string => JSON.stringify(fitFor(p, mode).items.map((i) => [i.id, i.kind, i.rect]));
    const orders: ItemIdList[] = [
      ["pages", "annotations", "findings", "views", "tools", "zoom"],
      ["zoom", "tools", "views", "findings", "annotations", "pages"],
      ["findings", "views", "pages", "zoom", "annotations", "tools"],
    ];
    const failures: string[] = [];
    let flipped = 0;
    let cases = 0;
    for (const order of orders) {
      for (const length of mode === "bar" ? [200, 300, 420, 520, 640] : [140, 220, 300, 380, 460]) {
        p.reset();
        p.setAges(order);
        p.setLength(length);
        const before = rects();
        // Press every item in turn, as a click on its grip or header (no drag): nothing may move, not even the item pressed.
        for (const item of fitFor(p, mode).items.map((i) => i.id)) {
          const el = view.itemEl(item);
          if (!el || el.hidden) continue;
          (el.querySelector("[data-grab]") ?? el).dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
          cases++;
          if (rects() !== before) failures.push(`length ${length}: pressing ${titleOf(item)} changed the ${mode}`);
        }
        // The control: a use that solves afresh (no previous) does flip who gives way in some of these cases.
        p.reset();
        p.setAges(order);
        p.setLength(length);
        const fresh = rects();
        for (const item of fitFor(p, mode).items.map((i) => i.id)) {
          p.use(item as ItemId, mode === "bar" ? "bar" : "column");
          if (rects() !== fresh) flipped++;
        }
      }
    }
    return [
      await rule("Clicking any item's grip or header, without a drag, leaves every item's form and rect as it was, at every length and age order", (ok) => {
        ok(cases > 30, `only ${cases} presses ran`);
        failures.slice(0, 5).forEach((m) => ok(false, m));
      }),
      await rule("Without `previous` the same presses do flip who gives way (the case is real)", (ok) => ok(flipped > 0, "no press flipped anything without previous")),
    ];
  },
};

type ItemIdList = readonly ItemId[];

const SCENARIOS = [c2, c6, c8, c9, c10, drawn, status, grips, independent, c23];

install(page, SCENARIOS, () => page.reset(), document.getElementById("sf-run") as HTMLButtonElement, document.getElementById("sf-runs") as HTMLTableSectionElement);
