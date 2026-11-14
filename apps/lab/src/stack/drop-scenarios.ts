/**
 * The Stack · drop page's scenarios, on `window.__motionLab.runAll(filter?)`. Each drives the page with real pointer
 * and key events (the drag intent decides what shows and when, as for a person), and asserts what the page drew:
 * C1 (the preview is the rect the item gets after the drop: the preview's rect, the solver's and the landed item's are
 * the same, and the others have made room for it), C3 (every gap, below the last item too, opens a slot) and C4 (a
 * group dragged into a column lands in the form that fits).
 */
import type { Rect } from "@n-uf/motion";
import { overlap, nextFrame, type Point } from "../shared/geometry";
import { GROUPS, isPanel, titleOf, type ItemId } from "./sample";
import { fmt, install, near, rule, type Scenario } from "./run";
import { page, type DropPage, type StackName } from "./drop";

type Page = DropPage;

// --- driving the page ----------------------------------------------------------------------------------------------

let at: Point = { x: 0, y: 0 };
function pointer(p: Page, type: string, q: Point, target: EventTarget = window): void {
  const r = p.stage.getBoundingClientRect();
  at = q;
  target.dispatchEvent(
    new PointerEvent(type, { clientX: r.left + p.stage.clientLeft + q.x, clientY: r.top + p.stage.clientTop + q.y, bubbles: true, cancelable: true, button: 0, buttons: type === "pointerup" ? 0 : 1, pointerId: 1, isPrimary: true, pointerType: "mouse" }),
  );
}
const frames = async (n: number): Promise<void> => {
  for (let i = 0; i < n; i++) await nextFrame();
};
async function glide(p: Page, to: Point, step: number): Promise<void> {
  const from = at;
  const n = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / step));
  for (let i = 1; i <= n; i++) {
    pointer(p, "pointermove", { x: from.x + ((to.x - from.x) * i) / n, y: from.y + ((to.y - from.y) * i) / n });
    await nextFrame();
  }
}
/** Fly most of the way, then aim: the last 24 px slowly. */
async function approach(p: Page, to: Point): Promise<void> {
  const d = Math.hypot(to.x - at.x, to.y - at.y);
  if (d > 24) await glide(p, { x: to.x - ((to.x - at.x) * 24) / d, y: to.y - ((to.y - at.y) * 24) / d }, 14);
  await glide(p, to, 2);
}
async function until(cond: () => boolean, max = 150): Promise<boolean> {
  for (let i = 0; i < max; i++) {
    if (cond()) return true;
    await nextFrame();
  }
  return cond();
}
const domRect = (p: Page, el: Element): Rect => {
  const s = p.stage.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { x: r.left - s.left - p.stage.clientLeft, y: r.top - s.top - p.stage.clientTop, width: r.width, height: r.height };
};
const centre = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

/** Press an item on its grip; returns where. */
async function press(p: Page, id: ItemId): Promise<Point> {
  const stack = (["column", "bar"] as const).find((n) => p.orders[n].includes(id))!;
  const el = p.views[stack].itemEl(id)!;
  const grip = el.querySelector<HTMLElement>("[data-grab]")!;
  const g = domRect(p, grip);
  const start = { x: g.x + Math.min(8, g.width / 2), y: g.y + g.height / 2 };
  pointer(p, "pointerdown", start, grip);
  await nextFrame();
  at = start;
  return start;
}
/** Aim the held item at `to` until the preview shows and the others have made room. */
async function aimAt(p: Page, to: Point): Promise<boolean> {
  await approach(p, to);
  return until(() => !!p.dragging && !p.ind.hidden && p.dragging.room !== null && p.dragging.room === p.dragging.shown);
}
async function release(p: Page): Promise<void> {
  pointer(p, "pointerup", at);
  await frames(2);
}
function escape(): void {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
}

/** The drawn rect of every item but `id` (and each stack's » entry), in stage px. */
function othersDrawn(p: Page, id: string): Rect[] {
  const out: Rect[] = [];
  for (const name of ["column", "bar"] as const) {
    for (const [k, r] of p.views[name].drawn()) if (k !== id) out.push({ ...r, x: r.x + p.at[name].x, y: r.y + p.at[name].y });
  }
  return out;
}

// --- C1 ------------------------------------------------------------------------------------------------------------

interface Case {
  readonly id: ItemId;
  readonly into: StackName;
  /** Set the stage up (lengths, orders). */
  readonly setup?: (p: Page) => void;
}
const C1_CASES: Record<string, Case> = {
  // A panel that sits in the bar, dragged into the column.
  "a panel into the column": { id: "pages", into: "column", setup: (p) => p.setOrders({ column: ["views", "annotations", "findings"], bar: ["pages", "tools", "zoom"] }) },
  "a group into the column": { id: "zoom", into: "column" },
  "a group into the bar": { id: "views", into: "bar" },
  "a panel into the bar": { id: "findings", into: "bar" },
  "a group into a short column": { id: "zoom", into: "column", setup: (p) => p.setLength("column", 250) },
  // Kept items give way last: a kept panel dragged into a short column that holds another kept panel.
  "a kept panel into a short column": {
    id: "annotations",
    into: "column",
    setup: (p) => {
      p.setLength("column", 300);
      p.setOrders({ column: ["views", "pages", "findings"], bar: ["annotations", "tools", "zoom"] }, undefined, { kept: ["annotations", "pages"] });
    },
  },
  // A panel folded by hand starts at its header, dragged and in the column it lands in.
  "a panel folded by hand into the column": {
    id: "pages",
    into: "column",
    setup: (p) => p.setOrders({ column: ["views", "annotations", "findings"], bar: ["pages", "tools", "zoom"] }, undefined, { from: { pages: 1, findings: 1 } }),
  },
};

const c1: Scenario<Page> = {
  name: "C1: the preview is the rect the item gets",
  modes: Object.keys(C1_CASES),
  async run(p, mode) {
    const c = C1_CASES[mode]!;
    c.setup?.(p);
    const gaps = p.targetsFor(c.id).filter((t) => t.stack === c.into).length;
    const rows = [];
    const sameRect: string[] = [];
    const room: string[] = [];
    const landed: string[] = [];
    let ran = 0;
    for (let k = 0; k < gaps; k++) {
      p.reset();
      c.setup?.(p);
      const target = p.targetsFor(c.id).find((t) => t.stack === c.into && t.at === k)!;
      // Skip a gap the item's own old place would swallow (a release over home does nothing).
      const home = domRect(p, p.views[(["column", "bar"] as const).find((n) => p.orders[n].includes(c.id))!].itemEl(c.id)!);
      const to = centre(target.hit);
      if (to.x >= home.x && to.x <= home.x + home.width && to.y >= home.y && to.y <= home.y + home.height) continue;
      await press(p, c.id);
      const shown = await aimAt(p, to);
      const label = `gap ${k}`;
      if (!shown) {
        landed.push(`${label}: the preview never showed with the room made (shown ${p.dragging?.shown}, room ${p.dragging?.room})`);
        escape();
        continue;
      }
      // The room has opened: nothing else lies under the dashed rectangle.
      const preview = domRect(p, p.ind);
      const inMenu = p.targetsFor(c.id).find((t) => t.id === p.dragging!.shown)!.target.fit.items.find((i) => i.id === c.id)!.kind === "menu";
      if (!inMenu) for (const r of othersDrawn(p, c.id)) if (overlap(r, preview) > 1) room.push(`${label}: ${fmt(r)} lies under the preview ${fmt(preview)}`);
      await release(p);
      ran++;
      const d = p.lastDrop!;
      if (!d.landed || d.landed.stack !== c.into || d.landed.at !== k) landed.push(`${label}: landed ${JSON.stringify(d.landed)}, not ${c.into} ${k}`);
      if (d.previewDom && d.previewSolve && !near(d.previewDom, d.previewSolve)) sameRect.push(`${label}: the dashed preview ${fmt(d.previewDom)} isn't the solver's ${fmt(d.previewSolve)}`);
      if (d.landedSolve && d.previewSolve && !near(d.landedSolve, d.previewSolve, 0.001)) sameRect.push(`${label}: the drop's rect ${fmt(d.landedSolve)} isn't the preview's ${fmt(d.previewSolve)}`);
      if (d.landedDom && d.previewDom) {
        if (!near(d.landedDom, d.previewDom)) sameRect.push(`${label}: the item landed at ${fmt(d.landedDom)}, the preview was ${fmt(d.previewDom)}`);
      } else if (!d.landedDom && d.previewDom) {
        const fit = p.fits()[c.into];
        const menu = fit.menu ? { ...fit.menu.rect, x: fit.menu.rect.x + p.at[c.into].x, y: fit.menu.rect.y + p.at[c.into].y } : null;
        if (!menu || !near(menu, d.previewDom)) sameRect.push(`${label}: the item is in the » menu, but the preview ${fmt(d.previewDom)} isn't the » entry ${fmt(menu)}`);
      } else sameRect.push(`${label}: nothing was previewed or nothing landed`);
    }
    rows.push(await rule(`Every gap's drop lands on the rect that was previewed (${gaps} gaps)`, (ok) => {
      ok(ran > 0, "no gap was driven");
      for (const m of [...landed, ...sameRect]) ok(false, m);
    }));
    rows.push(await rule("Once the room opens no other item lies under the preview", (ok) => room.forEach((m) => ok(false, m))));
    return rows;
  },
};

// --- C3 ------------------------------------------------------------------------------------------------------------

const c3: Scenario<Page> = {
  name: "C3: every gap opens a slot",
  modes: ["column", "bar"],
  async run(p, mode) {
    const into = mode as StackName;
    const id: ItemId = into === "column" ? "zoom" : "findings";
    const targets = p.targetsFor(id).filter((t) => t.stack === into);
    const items = p.orders[into].length;
    const rows = [];
    const seen: string[] = [];
    const orders = JSON.stringify(p.orders);
    let aimed = 0;
    for (const t of targets) {
      p.reset();
      await press(p, id);
      const to = centre(t.hit);
      await approach(p, to);
      const ok = await until(() => !!p.dragging && p.dragging.shown === t.id && !p.ind.hidden);
      aimed++;
      if (!ok) seen.push(`${t.id}: showed ${p.dragging?.shown ?? "nothing"}`);
      else {
        const r = domRect(p, p.ind);
        if (r.width <= 0 || r.height <= 0) seen.push(`${t.id}: the slot is empty`);
        if (!p.indLabel.textContent?.includes(t.label)) seen.push(`${t.id}: the label says "${p.indLabel.textContent}", not "${t.label}"`);
        if (p.marker.hidden) seen.push(`${t.id}: no marker`);
      }
      escape();
      await frames(2);
      if (JSON.stringify(p.orders) !== orders) seen.push(`${t.id}: Escape moved something`);
    }
    rows.push(await rule(`A gap before each of the ${items} items and one after the last: ${items + 1} slots`, (ok) => {
      ok(targets.length === items + 1, `${targets.length} targets for ${items} items`);
      ok(targets.map((t) => t.at).join() === Array.from({ length: items + 1 }, (_, i) => i).join(), "the gaps aren't 0 … n");
    }));
    rows.push(await rule("Held over each gap, the preview shows that gap's slot, labelled, with its marker; Escape drops nothing", (ok) => {
      ok(aimed === items + 1, `${aimed} gaps driven`);
      for (const m of seen) ok(false, m);
    }));
    rows.push(
      await rule("The last gap, below the last item, opens a slot too", (ok) => {
        const last = targets.at(-1)!;
        ok(last.at === items && last.label.endsWith("at the end"), `the last gap is "${last.label}"`);
        const lastItem = p.fits()[into].items.at(-1);
        ok(!!lastItem, "no last item");
      }),
    );
    return rows;
  },
};

// --- C4 ------------------------------------------------------------------------------------------------------------

const c4: Scenario<Page> = {
  name: "C4: a group dragged into a column",
  modes: ["beside the panels", "groups only"],
  async run(p, mode) {
    const rows = [];
    if (mode === "groups only") p.setOrders({ column: ["views"], bar: ["pages", "annotations", "findings", "tools", "zoom"] });
    const id: ItemId = "zoom";
    const gap = 1;
    const target = p.targetsFor(id).find((t) => t.stack === "column" && t.at === gap)!;
    await press(p, id);
    const shown = await aimAt(p, centre(target.hit));
    const preview = domRect(p, p.ind);
    const expected = target.target.fit.items.find((i) => i.id === id)!;
    await release(p);
    const d = p.lastDrop!;
    const fit = p.fits().column;
    const placed = fit.items.find((i) => i.id === id)!;
    rows.push(
      await rule("Slots open in the column for the group", (ok) => {
        ok(shown, `no slot showed (shown ${p.dragging?.shown ?? d.shown})`);
        ok(d.landed?.stack === "column" && d.landed.at === gap, `landed ${JSON.stringify(d.landed)}`);
        ok(preview.width > 0 && preview.height > 0, "the slot is empty");
      }),
    );
    rows.push(
      await rule(mode === "groups only" ? "The group takes the rail's form: icons, 30 px wide" : "The group takes the largest form that fits the column: its words in a row", (ok) => {
        ok(placed.kind === expected.kind, `landed as ${placed.kind}, the preview said ${expected.kind}`);
        if (mode === "groups only") {
          ok(placed.kind === "icons", `it is ${placed.kind}`);
          ok(fit.cross === 30 && Math.abs(preview.width - 30) < 0.5, `the column is ${fit.cross} wide, the preview ${Math.round(preview.width)}`);
        } else {
          ok(placed.kind === "row", `it is ${placed.kind}`);
          ok(placed.rect.width <= fit.cross + 0.01, "it is wider than the column");
        }
        ok(d.landedDom !== null && d.previewDom !== null && near(d.landedDom, d.previewDom), `landed ${fmt(d.landedDom)}, previewed ${fmt(d.previewDom)}`);
      }),
    );
    rows.push(
      await rule("Only that group moved: the other items keep their order", (ok) => {
        const col = p.orders.column.filter((x) => x !== id);
        const before = mode === "groups only" ? ["views"] : ["views", "pages", "annotations", "findings"];
        ok(col.join() === before.join(), `the column is now ${p.orders.column.map(titleOf).join(", ")}`);
        ok(!isPanel(id) && GROUPS.includes(id), "sample");
      }),
    );
    return rows;
  },
};

const SCENARIOS = [c1, c3, c4];

install(page, SCENARIOS, () => page.reset(), document.getElementById("sd-run") as HTMLButtonElement, document.getElementById("sd-runs") as HTMLTableSectionElement);
