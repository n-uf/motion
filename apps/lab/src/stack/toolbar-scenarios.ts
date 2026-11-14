/**
 * The Stack · toolbar page's scenarios, on `window.__motionLab.runAll(filter?)`. Each drives the page (its sliders and
 * real pointer events) and asserts what the solver gave and what the page drew from it:
 * T1 (a » per collapsed group, in line), T2/T4 (a step goes only to a shorter form), T3 (the ranked primary gives way
 * last), T5 (gap, padding, the ends' reach, the marker's cross size), T6 (a form too thick for the bar steps down), N1/N2
 * (a press or a count reshapes nothing else) and G2 (under previous, room comes back in the reverse of give-way order).
 * The solver's own repro inputs run too, so a rule missing from the package fails here as well as on the page.
 */
import type { Rect } from "@n-uf/motion";
import { fitStack, stackTargets, type StackFit, type StackForm, type StackInput, type StackItem } from "@n-uf/placement/stack";
import { nextFrame, type Point } from "../shared/geometry";
import { fmt, install, near, rule, type Scenario } from "./run";
import { page, type TbId, type ToolbarPage } from "./toolbar";

type Page = ToolbarPage;
const kindOf = (fit: StackFit, id: string): string => fit.items.find((p) => p.id === id)?.kind ?? "none";
const formOf = (fit: StackFit, id: string): number => fit.items.find((p) => p.id === id)?.form ?? -1;
const OTHERS: readonly TbId[] = ["views", "zoom", "mark"];

/** Every length from `from` down to `to`: the page's fit at each. */
function sweep(p: Page, from: number, to: number, step = 2): { length: number; fit: StackFit }[] {
  const out: { length: number; fit: StackFit }[] = [];
  for (let l = from; l >= to; l -= step) {
    p.setLength(l);
    out.push({ length: p.length, fit: p.fit() });
  }
  return out;
}

/** An item's rect as the DOM has it, relative to the bar. */
const barRect = (p: Page, id: string): Rect | null => {
  const n = p.itemEl(id);
  if (!n || n.hidden) return null;
  const b = p.bar.getBoundingClientRect();
  const r = n.getBoundingClientRect();
  return { x: r.left - b.left - p.bar.clientLeft, y: r.top - b.top - p.bar.clientTop, width: r.width, height: r.height };
};

// --- the solver's own repros, as an app would call it ------------------------------------------------------------

const form = (kind: StackForm["kind"], min: number, rank?: number): StackForm => ({ kind, main: { min, natural: min }, cross: { natural: 26 }, ...(rank !== undefined ? { rank } : {}) });
const item = (id: string, used: number, forms: StackForm[], kept = false): StackItem => ({ id, used, forms, ...(kept ? { kept: true } : {}) });
const bar = (items: StackItem[], length: number, more: Partial<StackInput> = {}): StackInput => ({ axis: "row", length, cross: { min: 30, max: 60, rail: 40 }, items, ...more });
const kinds = (fit: StackFit): string[] => fit.items.map((i) => i.kind);

// --- driving the page ----------------------------------------------------------------------------------------------

let at: Point = { x: 0, y: 0 };
function pointer(p: Page, type: string, q: Point, target: EventTarget = window): void {
  const r = p.stage.getBoundingClientRect();
  at = q;
  target.dispatchEvent(
    new PointerEvent(type, { clientX: r.left + p.stage.clientLeft + q.x, clientY: r.top + p.stage.clientTop + q.y, bubbles: true, cancelable: true, button: 0, buttons: type === "pointerup" ? 0 : 1, pointerId: 1, isPrimary: true, pointerType: "mouse" }),
  );
}
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
/** Press an item on its grip. */
async function press(p: Page, id: TbId): Promise<void> {
  const el = p.order.includes(id) ? p.itemEl(id)! : p.tray;
  const grip = el.querySelector<HTMLElement>("[data-grab]")!;
  const g = domRect(p, grip);
  const start = { x: g.x + Math.min(8, g.width / 2), y: g.y + g.height / 2 };
  pointer(p, "pointerdown", start, grip);
  await nextFrame();
  at = start;
}
/**
 * Aim the held item at `to` until the preview shows and the others have made room. With `want` (the target's id) it
 * waits for that target, not the gap the pointer passed over (the intent switches only after a dwell).
 */
async function aimAt(p: Page, to: Point, want?: string): Promise<boolean> {
  await approach(p, to);
  return until(() => !!p.dragging && !p.ind.hidden && p.dragging.room !== null && p.dragging.room === p.dragging.shown && (want === undefined || p.dragging.shown === want));
}
async function release(p: Page): Promise<void> {
  pointer(p, "pointerup", at);
  for (let i = 0; i < 2; i++) await nextFrame();
}
const stageAt = (p: Page, x: number): Point => ({ x: p.at.bar.x + x, y: p.at.bar.y + p.fit().cross / 2 });

// --- T1 ------------------------------------------------------------------------------------------------------------

const t1: Scenario<Page> = {
  name: "T1: a » per collapsed group, in line",
  modes: ["bar"],
  async run(p) {
    const rows = [];
    rows.push(
      await rule("Solver: three groups of row and fold, the last two collapsed: two » handles, in place, no shared » entry", (ok) => {
        const groups = ["a", "b", "c"].map((id) => item(id, 1, [form("row", 100), form("fold", 30)]));
        const fit = fitStack(bar(groups, 160));
        ok(kinds(fit).join() === "row,fold,fold", `kinds ${kinds(fit).join()}`);
        ok(fit.menu === null, "the shared » entry is in use");
        ok(fit.items.map((i) => i.rect.x).join() === "0,100,130", `at ${fit.items.map((i) => i.rect.x).join()}`);
      }),
    );
    // Find the lengths where the page has two and three folds and no shared » entry.
    const steps = sweep(p, 740, 100);
    const folds = (fit: StackFit): string[] => fit.items.filter((i) => i.kind === "fold").map((i) => i.id);
    const two = steps.find((s) => folds(s.fit).length === 2 && !s.fit.menu);
    const three = steps.find((s) => folds(s.fit).length === 3 && !s.fit.menu);
    rows.push(
      await rule("Two and then three groups fold, each in line at its place with its own », and the shared » entry stays hidden", (ok) => {
        ok(!!two && !!three, `lengths with two folds: ${two?.length ?? "none"}, with three: ${three?.length ?? "none"}`);
        for (const s of [two, three]) {
          if (!s) continue;
          p.setLength(s.length);
          const fit = p.fit();
          ok(p.menuEl.hidden === true, `at ${s.length} the shared » entry is drawn`);
          const drawn = fit.items.filter((i) => i.kind === "fold");
          let prevEnd = -1;
          for (const f of drawn) {
            const dom = barRect(p, f.id);
            ok(!!dom && near(dom, f.rect), `${f.id} drawn at ${fmt(dom)}, solver ${fmt(f.rect)}`);
            ok(!!p.itemEl(f.id)?.querySelector(".tb-more"), `${f.id} has no » of its own`);
            ok(f.rect.width === 36, `${f.id} takes ${f.rect.width} px, not its own length`);
            ok(f.rect.x >= prevEnd, `${f.id} overlaps the one before it`);
            prevEnd = f.rect.x + f.rect.width;
          }
          // In line: the items keep the bar's order, a gap apart.
          const order = fit.items.map((i) => i.id).join();
          ok(order === p.order.join(), `the order changed: ${order}`);
          for (let k = 1; k < fit.items.length; k++) {
            const a = fit.items[k - 1]!.rect;
            const b = fit.items[k]!.rect;
            ok(Math.abs(b.x - (a.x + a.width) - p.gap) < 0.5, `between item ${k - 1} and ${k} there are ${Math.round((b.x - a.x - a.width) * 10) / 10} px, not the gap (${p.gap})`);
          }
        }
      }),
    );
    return rows;
  },
};

// --- T2/T4 ---------------------------------------------------------------------------------------------------------

const t2: Scenario<Page> = {
  name: "T2/T4: a step goes only to a shorter form",
  modes: ["bar"],
  async run(p) {
    const rows = [];
    rows.push(
      await rule("Solver: a [row 100, fold 30] and b [row 30, fold 34] stay rows at 132; at 120 only a folds", (ok) => {
        const a = item("a", 1, [form("row", 100), form("fold", 30)]);
        const b = item("b", 2, [form("row", 30), form("fold", 34)]);
        ok(kinds(fitStack(bar([a, b], 132))).join() === "row,row", `132: ${kinds(fitStack(bar([a, b], 132))).join()}`);
        ok(kinds(fitStack(bar([a, b], 120))).join() === "fold,row", `120: ${kinds(fitStack(bar([a, b], 120))).join()}`);
      }),
    );
    rows.push(
      await rule("Solver: a next form with the same length is skipped, and with none shorter the item stays", (ok) => {
        const g = item("g", 1, [form("row", 50), form("stacked", 50), form("icons", 40)]);
        ok(fitStack(bar([g], 45)).items[0]!.form === 2, `went to form ${fitStack(bar([g], 45)).items[0]!.form}`);
        const fold = fitStack(bar([item("b", 1, [form("row", 30), form("fold", 34)])], 20));
        ok(kinds(fold).join() === "row", `b went to ${kinds(fold).join()}`);
        ok(fold.notes.some((n) => n.code === "overflow"), "no overflow note");
      }),
    );
    const steps = sweep(p, 740, 100);
    rows.push(
      await rule("Page: Mark's stacked form, as long as its row, is never taken at any length, and its forms only get shorter", (ok) => {
        let prev = 0;
        for (const s of steps) {
          ok(kindOf(s.fit, "mark") !== "stacked", `Mark is stacked at ${s.length}`);
          const f = formOf(s.fit, "mark");
          ok(f >= prev, `Mark went back at ${s.length}`);
          prev = f;
        }
        ok(steps.some((s) => kindOf(s.fit, "mark") === "fold"), "Mark never folds in the range");
        // The page draws what the solver gave.
        p.setLength(500);
        ok(p.itemEl("mark")?.dataset.kind !== "stacked", "Mark is drawn stacked");
      }),
    );
    return rows;
  },
};

// --- T3 ------------------------------------------------------------------------------------------------------------

const t3: Scenario<Page> = {
  name: "T3: the ranked primary gives way last",
  modes: ["used last", "used longest ago"],
  async run(p, mode) {
    const rows = [];
    p.setToolsAge(mode === "used last" ? "newest" : "oldest");
    const steps = sweep(p, 740, 100);
    const folded = (fit: StackFit, id: string): boolean => ["fold", "menu"].includes(kindOf(fit, id));
    rows.push(
      await rule("Tools folds only after every other group is folded, and before any other goes to the shared » entry", (ok) => {
        ok(steps.some((s) => kindOf(s.fit, "tools") === "fold"), "Tools never folds in the range");
        ok(steps.some((s) => kindOf(s.fit, "tools") === "icons"), "Tools never goes to its main tool alone");
        for (const s of steps) {
          if (kindOf(s.fit, "tools") === "fold") for (const id of OTHERS) ok(folded(s.fit, id), `Tools is folded at ${s.length} while ${id} is ${kindOf(s.fit, id)}`);
          if (s.fit.menu) ok(kindOf(s.fit, "tools") === "fold", `at ${s.length} a group is in the » menu while Tools is ${kindOf(s.fit, "tools")}`);
        }
      }),
    );
    if (mode === "used last")
      rows.push(
        await rule("Used last, Tools goes to its main tool only after the others have folded", (ok) => {
          for (const s of steps) if (kindOf(s.fit, "tools") === "icons") for (const id of OTHERS) ok(folded(s.fit, id), `Tools is on its main tool at ${s.length} while ${id} is ${kindOf(s.fit, id)}`);
        }),
      );
    rows.push(
      await rule("Solver: groups A, B, C with C [full, primary only (rank 0), fold (rank 1)]: A folds, B folds, C primary only, C folds last", (ok) => {
        const group = (id: string, used: number): StackItem => item(id, used, [form("row", 100), form("fold", 30, 0)]);
        const c = item("c", 0, [form("row", 140, 0), form("icons", 70, 0), form("fold", 30, 1)], true);
        const path: string[] = [];
        for (let l = 400; l >= 60; l--) {
          const v = fitStack(bar([group("a", 1), group("b", 2), c], l)).items.map((i) => i.form).join("");
          if (path.at(-1) !== v) path.push(v);
        }
        ok(path.join() === "000,100,110,111,112", `the steps were ${path.join(" ")}`);
      }),
    );
    return rows;
  },
};

// --- T5 ------------------------------------------------------------------------------------------------------------

const t5: Scenario<Page> = {
  name: "T5: gaps, padding and the ends' reach",
  modes: ["rects", "reach", "marker"],
  async run(p, mode) {
    const rows = [];
    if (mode === "rects") {
      rows.push(
        await rule("Solver: three 100 px groups, pad.start 20, gap 30 and 50: the rects and the gap zones", (ok) => {
          const trio = (): StackItem[] => ["a", "b", "c"].map((id, i) => item(id, i, [form("row", 100), form("fold", 30)]));
          const d = item("d", 9, [form("row", 100), form("fold", 30)]);
          for (const [g, length, xs, zones] of [
            [30, 380, "20,150,280", "0-70,70-200,200-330,330-380"],
            [50, 420, "20,170,320", "0-70,70-220,220-370,370-420"],
          ] as const) {
            const input = bar(trio(), length, { gap: g, pad: { start: 20 } });
            ok(fitStack(input).items.map((i) => i.rect.x).join() === xs, `gap ${g}: at ${fitStack(input).items.map((i) => i.rect.x).join()}`);
            const z = stackTargets(input, d).map((t) => `${t.hit.x}-${t.hit.x + t.hit.width}`).join();
            ok(z === zones, `gap ${g}: zones ${z}`);
          }
        }),
      );
      rows.push(
        await rule("Page: every group is drawn at the solver's rect, a gap and a padding apart, at the default and at a wide gap and padding", (ok) => {
          for (const [gap, pad] of [[8, 12], [20, 30]] as const) {
            p.setGap(gap);
            p.setPad(pad);
            p.setLength(800);
            const fit = p.fit();
            ok(fit.items.every((i) => i.kind === "row"), `not all rows at ${p.length}: ${kinds(fit).join()}`);
            let prevEnd = pad;
            for (const it of fit.items) {
              const dom = barRect(p, it.id);
              ok(!!dom && near(dom, it.rect), `${it.id} drawn at ${fmt(dom)}, solver ${fmt(it.rect)}`);
              ok(Math.abs(it.rect.x - prevEnd - (it === fit.items[0] ? 0 : gap)) < 0.5, `${it.id} starts ${Math.round((it.rect.x - prevEnd) * 10) / 10} px after the one before (gap ${gap}, pad ${pad})`);
              prevEnd = it.rect.x + it.rect.width;
            }
            ok(fit.items[0]!.rect.x === pad, `the first starts at ${fit.items[0]!.rect.x}, not at the padding (${pad})`);
          }
        }),
      );
      rows.push(
        await rule("Page: the gaps and padding count toward the length: a stack of rows at 718 px folds one group a pixel below it", (ok) => {
          p.reset();
          p.setLength(718);
          ok(kinds(p.fit()).join() === "row,row,row,row", `at 718: ${kinds(p.fit()).join()}`);
          p.setLength(716);
          ok(kinds(p.fit()).join() !== "row,row,row,row", "at 716 nothing folds");
          p.setGap(0);
          p.setPad(0);
          p.setLength(670);
          ok(kinds(p.fit()).join() === "row,row,row,row", `with no gap or padding at 670: ${kinds(p.fit()).join()}`);
        }),
      );
    }
    if (mode === "reach") {
      p.setLength(600);
      for (const [end, name] of [["end", "past the bar's end"], ["start", "before the bar's start"]] as const)
        rows.push(
          await rule(`A drag with the pointer ${name} still drops at that end`, async (ok) => {
            const id: TbId = end === "end" ? "views" : "mark";
            const targets = p.targetsFor(id);
            const first = targets[0]!;
            const last = targets.at(-1)!;
            const fit = p.fit();
            ok(first.hit.x <= p.at.bar.x - p.endReach + 0.5, `the first gap starts at ${first.hit.x}, bar at ${p.at.bar.x} (reach ${p.endReach})`);
            ok(last.hit.x + last.hit.width >= p.at.bar.x + fit.length + p.endReach - 0.5, `the last gap ends at ${last.hit.x + last.hit.width}, bar's end at ${p.at.bar.x + fit.length}`);
            await press(p, id);
            const aim = end === "end" ? p.fit().length + 14 : -14;
            const ready = await aimAt(p, stageAt(p, aim), (end === "end" ? last : first).id);
            ok(ready, `no preview with the pointer ${aim} px along the bar`);
            await release(p);
            const o = p.order;
            ok(end === "end" ? o.at(-1) === id : o[0] === id, `order after the drop: ${o.join()}`);
            ok(p.lastDrop?.landed !== null, "no drop");
          }),
        );
    }
    if (mode === "marker") {
      rows.push(
        await rule("The marker is a line across the bar's whole cross size, at the preview's leading edge", (ok) => {
          p.setLength(600);
          for (const id of ["views", "findings"] as const) {
            for (const t of p.targetsFor(id)) {
              ok(Math.abs(t.marker.height - t.target.fit.cross) < 0.01, `${id}: marker ${t.id} is ${t.marker.height} tall, the bar ${t.target.fit.cross}`);
              ok(t.marker.width === 0, `marker ${t.id} has a width of ${t.marker.width}`);
              ok(Math.abs(t.marker.x - t.slot.x) < 0.01, `marker ${t.id} at ${t.marker.x}, preview starts at ${t.slot.x}`);
            }
          }
        }),
      );
    }
    return rows;
  },
};

// --- T6 ------------------------------------------------------------------------------------------------------------

const t6: Scenario<Page> = {
  name: "T6: a form too thick for the bar steps down",
  modes: ["in the bar", "dropped in"],
  async run(p, mode) {
    const rows = [];
    if (mode === "in the bar") {
      p.setOrder(["views", "findings", "zoom"], { findings: 20 });
      const steps = sweep(p, 740, 100);
      rows.push(
        await rule(`The bar is never taller than ${p.barHeight} px and the panel is never open, at any length`, (ok) => {
          for (const s of steps) {
            ok(s.fit.cross <= p.barHeight + 0.01, `the bar is ${s.fit.cross} tall at ${s.length}`);
            ok(kindOf(s.fit, "findings") !== "open", `the panel is open at ${s.length}`);
          }
          p.setLength(600);
          ok(kindOf(p.fit(), "findings") === "header", `the panel is ${kindOf(p.fit(), "findings")} at 600`);
          ok(p.bar.getBoundingClientRect().height <= p.barHeight + 1, `the bar is drawn ${p.bar.getBoundingClientRect().height} tall`);
        }),
      );
      rows.push(
        await rule("Solver: a bar with cross.max 40 and strictCross, an open panel with cross.min 120: a header, and the bar stays thin; without strictCross it is clamped", (ok) => {
          const panel = item("p", 1, [{ kind: "open", main: { min: 150, natural: 200 }, cross: { natural: 120, min: 120 }, setsCross: true }, form("header", 60), form("menu", 0)]);
          const input = { axis: "row", length: 400, cross: { min: 30, max: 40 }, items: [panel] } as const;
          const fit = fitStack({ ...input, strictCross: true });
          ok(fit.items[0]!.kind === "header" && fit.cross <= 40, `${fit.items[0]!.kind}, ${fit.cross} tall`);
          ok(fitStack(input).items[0]!.kind === "open", "without strictCross the panel is not clamped as it was");
        }),
      );
    } else {
      p.setLength(600);
      await press(p, "findings");
      const gapX = p.fit().items.find((i) => i.id === "zoom")!.rect.x - p.gap / 2;
      const before = p.order.indexOf("zoom");
      const ready = await aimAt(p, stageAt(p, gapX), `gap:${before}`);
      const during = p.dragging;
      rows.push(
        await rule("The preview is a header-sized rect in a bar that stays 40 px tall", (ok) => {
          ok(ready, "no preview");
          const ind = domRect(p, p.ind);
          ok(ind.height <= p.barHeight + 0.5, `the preview is ${Math.round(ind.height)} px tall`);
          ok(!!during && during.id === "findings", "not dragging the panel");
          ok(p.bar.getBoundingClientRect().height <= p.barHeight + 1, `the bar is ${p.bar.getBoundingClientRect().height} tall while dragging`);
        }),
      );
      await release(p);
      rows.push(
        await rule("Dropped, the panel lands as a header on the preview's rect, and the bar is still 40 px", (ok) => {
          const d = p.lastDrop;
          ok(!!d && d.landed !== null, "no drop");
          if (!d) return;
          ok(d.landedKind === "header", `it landed ${d.landedKind}`);
          ok(!!d.previewDom && !!d.landedDom && near(d.previewDom, d.landedDom), `preview ${fmt(d.previewDom)}, landed ${fmt(d.landedDom)}`);
          ok(!!d.landedSolve && !!d.landedDom && near(d.landedSolve, d.landedDom), `solver ${fmt(d.landedSolve)}, landed ${fmt(d.landedDom)}`);
          ok(p.fit().cross <= p.barHeight + 0.01, `the bar is ${p.fit().cross} tall`);
        }),
      );
    }
    return rows;
  },
};

// --- C23 and N1 ----------------------------------------------------------------------------------------------------------

const formsNow = (fit: StackFit): string => fit.items.map((i) => `${i.id}:${i.form}`).join(" ");

const n1: Scenario<Page> = {
  name: "N1: a press, then a count gaining a digit, reshapes nothing else",
  modes: ["bar"],
  async run(p) {
    const rows = [];
    // A length where some group has given way, a few px are to spare (the longer badge fits where it is), and a fresh solve
    // after the presses and the count would reshape the bar: the case the check is for.
    let length = 0;
    for (let l = 740; l >= 300 && !length; l -= 2) {
      p.reset();
      p.setLength(l);
      const f = p.fit();
      if (!(f.items.some((i) => i.form > 0) && !f.menu && f.length - (f.need ?? 0) >= 40)) continue;
      const ids = f.items.map((i) => i.id) as TbId[];
      for (const id of ids) {
        p.reset();
        p.setLength(l);
        for (const other of ids) p.press(other);
        p.setCount(id, 12345);
        if (formsNow(fitStack(p.input())) !== formsNow(f)) length = l;
      }
    }
    p.reset();
    p.setLength(length || 500);
    const before = p.fit();
    const forms0 = formsNow(before);
    const rects0 = JSON.stringify(before.items.map((i) => i.rect));
    // Press every group on its grip, no drag: with previous, every form and rect stays.
    const failures: string[] = [];
    for (const id of before.items.map((i) => i.id) as TbId[]) {
      await press(p, id);
      await release(p);
      if (formsNow(p.fit()) !== forms0 || JSON.stringify(p.fit().items.map((i) => i.rect)) !== rects0) failures.push(`pressing ${id} reshaped the bar: ${formsNow(p.fit())}`);
    }
    rows.push(
      await rule("C23: a click on any group's grip, without a drag, leaves every form and rect as it was", (ok) => {
        ok(length > 0, "no length found where a group has given way");
        failures.forEach((m) => ok(false, m));
      }),
    );
    // Then a badge with five digits on each group in turn (it grows the group's forms by 35 px): the forms stay.
    const grew: string[] = [];
    for (const id of before.items.map((i) => i.id) as TbId[]) {
      // Each group on its own, from a fresh start at the same length, after every group was pressed.
      p.reset();
      p.setLength(length || 500);
      for (const other of before.items.map((i) => i.id) as TbId[]) p.press(other);
      p.setCount(id, 12345);
      if (formsNow(p.fit()) !== forms0) grew.push(`${id} gained digits: ${formsNow(p.fit())}, was ${forms0}`);
      const own = p.fit().items.find((i) => i.id === id)!.rect.width;
      const was = before.items.find((i) => i.id === id)!.rect.width;
      if (own < was + 34) grew.push(`${id} did not grow (${own} from ${was})`);
    }
    rows.push(
      await rule("A count gaining digits after the presses makes that group longer and reshapes no other form", (ok) => grew.forEach((m) => ok(false, m))),
    );
    // The control: solved afresh (no previous), the same state does reshape, at some length: the case is real.
    let flipped = 0;
    for (let l = 700; l >= 340; l -= 10) {
      p.reset();
      p.setLength(l);
      const base = formsNow(p.fit());
      for (const id of ["views", "tools", "zoom", "mark"] as const) p.press(id);
      p.setCount("views", 12345);
      if (formsNow(fitStack(p.input())) !== base) flipped++;
    }
    rows.push(await rule("Without previous the same presses and count do reshape the bar at some length", (ok) => ok(flipped > 0, "no length flips without previous")));
    return rows;
  },
};

const n2: Scenario<Page> = {
  name: "N2: a press, then a count losing a digit, reshapes nothing else",
  modes: ["bar"],
  async run(p) {
    const rows = [];
    const ids = ["views", "tools", "zoom", "mark"] as const;
    const start = (l: number, id: TbId): StackFit => {
      p.reset();
      p.setLength(l);
      p.setCount(id, 12345);
      return p.fit();
    };
    // A length and a group where some group has given way and a fresh solve, after the presses and the count losing a digit,
    // would give way differently (the ages changed): the case the check is for. The kept forms must not follow it.
    let pick: { l: number; id: TbId } | null = null;
    for (let l = 740; l >= 300 && !pick; l -= 2) {
      for (const id of ids) {
        const f0 = start(l, id);
        if (!f0.items.some((i) => i.form > 0) || f0.menu) continue;
        for (const other of ids) p.press(other);
        p.setCount(id, 1234);
        if (formsNow(p.fit()) === formsNow(f0) && formsNow(fitStack(p.input())) !== formsNow(f0)) {
          pick = { l, id };
          break;
        }
      }
    }
    const { l, id } = pick ?? { l: 500, id: "views" as TbId };
    const before = start(l, id);
    const forms0 = formsNow(before);
    const failures: string[] = [];
    for (const other of ids) {
      await press(p, other);
      await release(p);
      if (formsNow(p.fit()) !== forms0) failures.push(`pressing ${other} reshaped the bar: ${formsNow(p.fit())}`);
    }
    p.setCount(id, 1234);
    const after = p.fit();
    const was = before.items.find((i) => i.id === id)!.rect.width;
    const own = after.items.find((i) => i.id === id)!.rect.width;
    rows.push(
      await rule("After pressing every group, a count that loses a digit makes its group 7 px shorter and moves no other form, though a fresh solve would give way differently", (ok) => {
        ok(pick !== null, "no length and group found where a fresh solve differs");
        failures.forEach((m) => ok(false, m));
        ok(formsNow(after) === forms0, `forms ${formsNow(after)}, were ${forms0}`);
        ok(Math.abs(was - own - 7) < 0.5, `the group went from ${was} to ${own} px`);
        ok(formsNow(fitStack(p.input())) !== forms0, "a fresh solve doesn't differ here, so the check proves nothing");
      }),
    );
    // Room that really is a pure gain is still taken: the bar long enough for every row again.
    p.reset();
    p.setLength(300);
    const small = p.fit();
    p.setLength(740);
    rows.push(await rule("A large room gain still restores every form", (ok) => ok(small.items.some((i) => i.form > 0) && p.fit().items.every((i) => i.form === 0), `at 740: ${formsNow(p.fit())}`)));
    return rows;
  },
};

// --- G2: room comes back in the reverse of give-way order ----------------------------------------------------------

const g2: Scenario<Page> = {
  name: "G2: shrink, then grow under previous: room comes back in the reverse of give-way order",
  modes: ["bar"],
  async run(p) {
    const rows = [];
    // The solver's repro: b used earlier than a gives way first, then a. At 90 a can't open (130), so nothing does.
    const two = [item("a", 2, [form("row", 100), form("fold", 30)]), item("b", 1, [form("row", 50), form("fold", 30)])];
    const flat = { gap: 0, pad: { start: 0, end: 0 } };
    const shrunk = fitStack(bar(two, 60, flat));
    const grown = fitStack(bar(two, 90, flat), { previous: shrunk });
    rows.push(
      await rule("Repro: both fold at 60; at 90 under previous both stay folded (b doesn't open ahead of a), as a fresh solve says", (ok) => {
        ok(kinds(shrunk).join() === "fold,fold", `at 60: ${kinds(shrunk).join()}`);
        ok(kinds(grown).join() === "fold,fold", `at 90 with previous: ${kinds(grown).join()}`);
        ok(kinds(fitStack(bar(two, 90, flat))).join() === "fold,fold", `fresh at 90: ${kinds(fitStack(bar(two, 90, flat))).join()}`);
      }),
    );
    // A trailing group whose menu step is an ordinary one (row, then the menu, taken alone): b goes in first, then a folds.
    // From 80 to 129 a can't open, so b stays in the menu.
    const viaMenu = [item("a", 2, [form("row", 100), form("fold", 30)]), item("b", 1, [form("row", 50), form("menu", 0)])];
    const entry = { ...flat, menu: { main: 30 } };
    const inMenu = fitStack(bar(viaMenu, 60, entry));
    const left: string[] = [];
    for (let l = 80; l <= 129; l++) {
      const g = fitStack(bar(viaMenu, l, entry), { previous: inMenu });
      if (kinds(g).join() !== "fold,menu") left.push(`${l}: ${kinds(g).join()}`);
    }
    rows.push(
      await rule("Repro: a group that went into the menu straight from its row stays there while the one ahead of it can't open", (ok) => {
        ok(kinds(inMenu).join() === "fold,menu", `at 60: ${kinds(inMenu).join()}`);
        left.slice(0, 5).forEach((m) => ok(false, `with previous at ${m}`));
      }),
    );
    // A bar of groups of mixed shapes, some going into the menu straight from the row: shrink, grow under previous. A group
    // that gave way earlier never ends open or drawn while one that gave way later is smaller or in the menu, unless it
    // already was or the fresh fit is a pure gain.
    const shapes: StackForm["kind"][][] = [["row", "menu"], ["row", "fold", "menu"], ["row", "fold"], ["row", "icons", "menu"]];
    const level = (fit: StackFit, id: string): number => (kindOf(fit, id) === "menu" ? 2 : formOf(fit, id) === 0 ? 0 : 1);
    let seed = 7;
    const rand = (): number => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
    const mixed: string[] = [];
    let mixedGrows = 0;
    for (let trial = 0; trial < 300; trial++) {
      const n = 2 + Math.floor(rand() * 4);
      const list = Array.from({ length: n }, (_, i) => {
        const shape = shapes[Math.floor(rand() * shapes.length)]!;
        const len: Record<string, number> = { row: 60 + Math.floor(rand() * 90), fold: 36, icons: 24 + Math.floor(rand() * 20), menu: 0 };
        return item(`g${i}`, n - i + Math.floor(rand() * 3) * 10, shape.map((k) => form(k, len[k]!)));
      });
      const more = { gap: 8, pad: { start: 12, end: 12 }, menu: { main: 28 } };
      const l0 = 80 + Math.floor(rand() * 300);
      const kept = fitStack(bar(list, l0, more));
      for (const d of [10, 30, 60, 120]) {
        const fit = fitStack(bar(list, l0 + d, more), { previous: kept });
        const fresh = fitStack(bar(list, l0 + d, more));
        const gain = fresh.items.every((q, i) => q.form <= kept.items[i]!.form) && fresh.items.some((q, i) => q.form < kept.items[i]!.form);
        if (gain || formsNow(fit) === formsNow(kept)) continue;
        mixedGrows++;
        for (const e of list)
          for (const l of list)
            if (e.used < l.used && level(fit, e.id) < level(fit, l.id) && !(level(kept, e.id) < level(kept, l.id)))
              mixed.push(`trial ${trial} ${l0}→${l0 + d}: ${e.id} is ${kindOf(fit, e.id)} while ${l.id} (gave way after it) is ${kindOf(fit, l.id)}`);
      }
    }
    rows.push(
      await rule("Mixed groups, some going into the menu straight from the row: a group that gave way earlier never grows past one that gave way later", (ok) => {
        ok(mixedGrows > 0, "no grow under previous reshaped a bar, so the check proves nothing");
        mixed.slice(0, 5).forEach((m) => ok(false, m));
      }),
    );
    // The bar: shrink from 740, press every group (the ages change, the forms stay), then grow under previous. A group that
    // gave way earlier (used longer ago) is never open while one that gave way later is folded, unless it already was or
    // the fresh fit is a pure gain.
    const ids = ["views", "tools", "zoom", "mark"] as const;
    const failures: string[] = [];
    let grows = 0;
    for (let l0 = 700; l0 >= 300; l0 -= 20) {
      for (const presses of [[], ["views", "zoom"], ["mark", "views", "tools", "zoom"]] as TbId[][]) {
        p.reset();
        p.setLength(l0);
        for (const id of presses) p.press(id);
        const kept = p.fit();
        const used = p.used;
        const open = (fit: StackFit, id: string): boolean => formOf(fit, id) === 0;
        for (let l1 = l0 + 10; l1 <= Math.min(740, l0 + 240); l1 += 10) {
          const input = { ...p.input(), length: l1 };
          const fit = fitStack(input, { previous: kept });
          const fresh = fitStack(input);
          const gain = fresh.items.every((q, i) => q.form <= kept.items[i]!.form) && fresh.items.some((q, i) => q.form < kept.items[i]!.form);
          if (gain || formsNow(fit) === formsNow(kept)) continue;
          grows++;
          for (const e of ids)
            for (const l of ids)
              if (used[e] < used[l] && open(fit, e) && !open(fit, l) && !(open(kept, e) && !open(kept, l))) failures.push(`${l0}→${l1} after pressing [${presses.join(" ")}]: ${e} opened while ${l} (gave way after it) is ${kindOf(fit, l)}`);
        }
      }
    }
    p.reset();
    rows.push(
      await rule("On the bar, a group that gave way earlier never opens while one that gave way later stays folded", (ok) => {
        ok(grows > 0, "no grow under previous reshaped the bar, so the check proves nothing");
        failures.slice(0, 5).forEach((m) => ok(false, m));
      }),
    );
    return rows;
  },
};

const SCENARIOS = [t1, t2, t3, t5, t6, n1, n2, g2];

install(page, SCENARIOS, () => page.reset(), document.getElementById("tb-run") as HTMLButtonElement, document.getElementById("tb-runs") as HTMLTableSectionElement);
