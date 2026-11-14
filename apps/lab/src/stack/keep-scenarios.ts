/**
 * The Stack · store, freeze, no jump page's scenarios, on `window.__motionLab.runAll(filter?)`. Each drives the page
 * with real pointer and key events and asserts what the page drew:
 * C13 (a reload rebuilds every item's place and form from the stored form, and bad stored data never throws),
 * C14 (frozen: grips hidden and nothing moves; holding Alt shows them and everything works, stacked headers too),
 * C15 (a count or a phase changing moves no other item more than 0.5 px).
 */
import type { Rect } from "@n-uf/motion";
import type { Point } from "../shared/geometry";
import { DEFAULT_LAYOUT, type Layout, type Seen } from "./board";
import { aimers, createDriver } from "./drive";
import { ALL, PHASES, badgeOf, titleOf, type ItemId } from "./sample";
import { fmt, install, near, rule, type Scenario } from "./run";
import { page, type KeepPage } from "./keep";

type Page = KeepPage;
const b = page.board;
const d = createDriver(b.stage);
const aim = aimers(d, b);

const place = (s: Seen): string => (s.where.kind === "float" ? "float" : `${s.where.side}:${s.where.at}`);
/** What differs between two looks at the items: place, form, kind, and a rect over `tol` px. */
function differences(a: readonly Seen[], c: readonly Seen[], tol: number): string[] {
  const out: string[] = [];
  for (const x of a) {
    const y = c.find((s) => s.id === x.id);
    if (!y) out.push(`${titleOf(x.id)} is gone`);
    else if (place(x) !== place(y)) out.push(`${titleOf(x.id)}: was ${place(x)}, is ${place(y)}`);
    else if (x.kind !== y.kind || x.form !== y.form) out.push(`${titleOf(x.id)}: was form ${x.form} (${x.kind}), is ${y.form} (${y.kind})`);
    else if (!near(x.rect, y.rect, tol)) out.push(`${titleOf(x.id)}: was ${fmt(x.rect)}, is ${fmt(y.rect)}`);
  }
  for (const y of c) if (!a.some((x) => x.id === y.id)) out.push(`${titleOf(y.id)} appeared`);
  return out;
}
/** How far each item other than `except` moved or resized, over `tol` px. */
function moved(a: readonly Seen[], c: readonly Seen[], except: ItemId | null, tol: number): { id: ItemId; by: number }[] {
  const out: { id: ItemId; by: number }[] = [];
  for (const x of a) {
    if (x.id === except) continue;
    const y = c.find((s) => s.id === x.id);
    const by = y ? Math.max(Math.abs(x.rect.x - y.rect.x), Math.abs(x.rect.y - y.rect.y), Math.abs(x.rect.width - y.rect.width), Math.abs(x.rect.height - y.rect.height)) : Infinity;
    if (by > tol) out.push({ id: x.id, by });
  }
  return out;
}
/** Each stack's items from oldest used to newest: the give-way order. */
const ages = (): string => {
  const used = b.used;
  const o = b.orders;
  return JSON.stringify({ column: [...o.column].sort((x, y) => used[x] - used[y]), bar: [...o.bar].sort((x, y) => used[x] - used[y]) });
};
const rectsOf = (fl: readonly { id: string; rect: Rect }[]): string => JSON.stringify(fl.map((f) => [f.id, f.rect.x, f.rect.y, f.rect.width, f.rect.height]));
const gapCentre = (id: ItemId, side: "column" | "bar", at: number): Point => {
  const t = b.targetsFor(id).find((x) => x.kind === "dock" && x.side === side && x.at === at)!;
  return { x: t.hit.x + t.hit.width / 2, y: t.hit.y + t.hit.height / 2 };
};
const dblclick = (el: Element, alt = false): void => void el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, altKey: alt }));
const setStored = (k: "column" | "bar" | "floats", text: string): void => localStorage.setItem(b.storageKeys[k], text);

// --- C13 -----------------------------------------------------------------------------------------------------------

const TIGHT: Layout = { column: ["pages", "annotations", "findings", "views", "tools"], bar: ["zoom"], floats: [] };

const c13: Scenario<Page> = {
  name: "C13: a reload restores every item's place and form",
  modes: ["after drags, a fold, a keep and a float", "a column too short for its items", "a stored form that is corrupt", "half of the stored form is corrupt"],
  async run(_p, mode) {
    const rows = [];
    if (mode === "after drags, a fold, a keep and a float" || mode === "a column too short for its items") {
      if (mode === "a column too short for its items") {
        // A short window, ages that differ from the defaults and a panel kept: the give-way order is part of what has to come back.
        b.setHeight(250);
        b.setLayout(TIGHT, { used: { findings: 1, views: 2, pages: 3, tools: 4, annotations: 5, zoom: 6 }, kept: ["annotations"] });
      } else {
        // Findings floats; dock it at the end of the column, tear Zoom off the bar, fold Pages by hand, keep Annotations.
        await aim.lift("findings", 20, 12);
        await aim.dock(gapCentre("findings", "column", 2));
        await d.release();
        await aim.lift("zoom", 8, 17);
        await aim.float({ x: 620, y: 260 });
        await d.release();
        const head = b.itemEl("pages")!.querySelector(".st-head")!;
        dblclick(head);
        b.keep("annotations", true);
      }
      await d.frames(2);
      const before = b.seen();
      const agesBefore = ages();
      const floatsBefore = rectsOf(b.floats);
      const handBefore = JSON.stringify([b.kept, b.from]);
      const text0 = b.stored();
      let blank: Seen[] = [];
      b.reload(() => (blank = b.seen()));
      await d.frames(2);
      const after = b.seen();
      const text1 = b.stored();
      rows.push(
        await rule("Reload forgets the arrangement first: everything docked in the column, nothing floating", (ok) => {
          ok(blank.length === ALL.length && blank.every((s) => s.where.kind === "dock" && s.where.side === "column"), `the blank page had ${blank.map(place).join(", ")}`);
          ok(differences(before, blank, 0.5).length > 0, "the arrangement before the reload was already the blank one: nothing is proved");
        }),
      );
      rows.push(
        await rule(`Every item is back in its place and form, at the same rect (${before.length} items)`, (ok) => {
          ok(mode !== "a column too short for its items" || before.filter((s) => s.form > 0).length >= 2, `${before.filter((s) => s.form > 0).length} items had given way: the column wasn't short`);
          for (const m of differences(before, after, 0.5)) ok(false, m);
        }),
      );
      rows.push(
        await rule("The kept and folded items, the use order and the floats' rects are back too", (ok) => {
          ok(JSON.stringify([b.kept, b.from]) === handBefore, `kept and folded: ${JSON.stringify([b.kept, b.from])}, were ${handBefore}`);
          ok(ages() === agesBefore, `the give-way order is ${ages()}, was ${agesBefore}`);
          ok(rectsOf(b.floats) === floatsBefore, `the floats are ${rectsOf(b.floats)}, were ${floatsBefore}`);
        }),
      );
      rows.push(
        await rule("The stored form is plain data and stable: the same text before and after, and in localStorage", (ok) => {
          ok(JSON.stringify(text0) === JSON.stringify(text1), `stored again: ${JSON.stringify(text1)}`);
          ok(localStorage.getItem(b.storageKeys.column) === text0.column && localStorage.getItem(b.storageKeys.floats) === text0.floats, "localStorage isn't the stored form");
          ok(!text0.floats.includes("pinned"), "the stored floats have a pinned key");
        }),
      );
      return rows;
    }
    if (mode === "a stored form that is corrupt") {
      setStored("column", "{not json");
      setStored("bar", JSON.stringify({ v: 2, order: [] }));
      setStored("floats", "[]");
      let threw: string | null = null;
      let rep: ReturnType<typeof b.reload> | null = null;
      try {
        rep = b.reload();
      } catch (e) {
        threw = String(e);
      }
      await d.frames(2);
      rows.push(
        await rule("Reading it never throws: nothing usable is stored, the page keeps its default arrangement", (ok) => {
          ok(threw === null, `reload threw ${threw}`);
          ok(!!rep && !rep.restored && rep.errors.length === 3, `the report: ${JSON.stringify(rep)}`);
          ok(JSON.stringify(b.orders) === JSON.stringify({ column: DEFAULT_LAYOUT.column, bar: DEFAULT_LAYOUT.bar }), `the stacks are ${JSON.stringify(b.orders)}`);
          ok(rectsOf(b.floats) === rectsOf(DEFAULT_LAYOUT.floats), `the floats are ${rectsOf(b.floats)}`);
        }),
      );
      return rows;
    }
    // Half corrupt: the column's stored form is good, the bar's is garbage.
    b.setLayout({ column: ["annotations", "pages"], bar: ["zoom", "views"], floats: [] });
    setStored("bar", "{broken");
    const rep = b.reload();
    await d.frames(2);
    const o = b.orders;
    rows.push(
      await rule("What can be read is restored and the rest is placed by its kind; the error is reported", (ok) => {
        ok(rep.restored, "nothing was restored");
        ok(rep.errors.length === 1 && rep.errors[0]!.startsWith("bar:"), `errors: ${JSON.stringify(rep.errors)}`);
        ok(o.column.join() === "annotations,pages,findings", `the column is ${o.column.join()}`);
        ok(o.bar.join() === "views,tools,zoom", `the bar is ${o.bar.join()}`);
        ok(b.floats.length === 0, "a float appeared");
      }),
    );
    return rows;
  },
};

// --- C14 ---------------------------------------------------------------------------------------------------------------

/** Two panels folded to headers in the column (stacked headers), an open one, groups in the bar and one floating. */
const FROZEN_LAYOUT: Layout = {
  column: ["pages", "annotations", "findings"],
  bar: ["views", "tools"],
  floats: [{ id: "zoom", rect: { x: 560, y: 200, width: 244, height: 34 } }],
};
const FROM = { pages: 1, annotations: 1 };
const FROZEN_START = (): void => b.setLayout(FROZEN_LAYOUT, { from: FROM });

const c14: Scenario<Page> = {
  name: "C14: frozen hides the grips and moves nothing; Alt moves",
  modes: ["frozen: no grip, no drag, no fold", "Alt shows the grips and everything works", "a stacked header moves with Alt", "a drag that began finishes when Alt is let go", "a press that was refused never becomes a drag"],
  async run(_p, mode) {
    const rows = [];
    FROZEN_START();
    await d.frames(2);
    const open = b.visibleGrips();
    if (mode === "frozen: no grip, no drag, no fold") {
      b.setFrozen(true);
      await d.frames(1);
      const shut = b.visibleGrips();
      const snap = b.seen();
      const state = JSON.stringify([b.orders, rectsOf(b.floats), b.from]);
      const tried: string[] = [];
      // A stacked header, a bar group, the float, the open panel: each pressed and dragged to the middle of the pages.
      for (const id of ["pages", "views", "zoom", "findings"] as const) {
        await d.press(b.gripOf(id)!, 8);
        await d.glide({ x: 560, y: 360 }, 14);
        await d.glide({ x: 500, y: 380 }, 2);
        if (b.dragging) tried.push(`${titleOf(id)}: a drag began (${JSON.stringify(b.dragging)})`);
        await d.release();
      }
      dblclick(b.itemEl("pages")!.querySelector(".st-head")!);
      await d.frames(2);
      rows.push(
        await rule("Frozen hides every grip (unfrozen shows them)", (ok) => {
          ok(open > 0, `unfrozen: ${open} grips`);
          ok(shut === 0, `frozen: ${shut} grips show`);
          ok(b.stage.dataset.grips === "hidden", `the stage says grips are ${b.stage.dataset.grips}`);
        }),
      );
      rows.push(
        await rule("Nothing moves: no drag begins from a header, a group, a float or a panel, no drop is made", (ok) => {
          for (const m of tried) ok(false, m);
          ok(b.lastDrop === null, `a drop was made: ${JSON.stringify(b.lastDrop)}`);
          ok(JSON.stringify([b.orders, rectsOf(b.floats), b.from]) === state, "the layout changed");
          for (const m of differences(snap, b.seen(), 0.01)) ok(false, m);
        }),
      );
      rows.push(await rule("Folding a header by double-click is refused too", (ok) => ok(b.from.pages === 1, `Pages' form is ${JSON.stringify(b.from)}`)));
      return rows;
    }
    if (mode === "Alt shows the grips and everything works") {
      b.setFrozen(true);
      d.alt(true);
      await d.frames(1);
      const withAlt = b.visibleGrips();
      // A group from the bar to the end of the column, then the float to another place, then a fold.
      await aim.lift("tools", 8, 17, true);
      const dock = await aim.dock(gapCentre("tools", "column", 3));
      await d.release();
      const landedTools = b.lastDrop?.landed;
      await aim.lift("zoom", 20, 12, true);
      const flt = await aim.float({ x: 600, y: 330 });
      await d.release();
      const landedZoom = b.lastDrop?.landed;
      dblclick(b.itemEl("findings")!.querySelector(".st-head")!, true);
      await d.frames(2);
      d.alt(false);
      await d.frames(1);
      rows.push(
        await rule("Holding Alt shows the grips again, and letting go hides them", (ok) => {
          ok(withAlt === open, `with Alt ${withAlt} grips show, unfrozen ${open}`);
          ok(b.visibleGrips() === 0, `Alt up, frozen: ${b.visibleGrips()} grips show`);
        }),
      );
      rows.push(
        await rule("Everything works while Alt is held: a docked drop, a float drop, a fold", (ok) => {
          ok(dock && landedTools?.kind === "dock" && landedTools.side === "column", `Tools landed ${JSON.stringify(landedTools)}`);
          ok(flt && landedZoom?.kind === "float", `Zoom landed ${JSON.stringify(landedZoom)}`);
          ok(b.from.findings === 1, `Findings was not folded: ${JSON.stringify(b.from)}`);
        }),
      );
      return rows;
    }
    if (mode === "a stacked header moves with Alt") {
      b.setFrozen(true);
      d.alt(true);
      await d.frames(1);
      // Annotations is a folded header between Pages (a header too) and Findings: to the end of the column.
      const isHeader = b.seen().find((s) => s.id === "annotations")!.kind === "header";
      await aim.lift("annotations", 40, 12, true);
      const shown = await aim.dock(gapCentre("annotations", "column", 2));
      const preview = d.domRect(b.ind);
      await d.release();
      d.alt(false);
      const drop = b.lastDrop!;
      rows.push(
        await rule("A header in a stack of headers is grabbed with Alt and dropped at the end of the column", (ok) => {
          ok(isHeader, "Annotations wasn't a stacked header");
          ok(shown, "the preview never showed with the room made");
          ok(drop.landed?.kind === "dock" && drop.landed.side === "column" && drop.landed.at === 2, `landed ${JSON.stringify(drop.landed)}`);
          ok(b.orders.column.join() === "pages,findings,annotations", `the column is ${b.orders.column.join()}`);
          ok(!!drop.landedDom && near(drop.landedDom, preview), `landed ${fmt(drop.landedDom)}, previewed ${fmt(preview)}`);
        }),
      );
      return rows;
    }
    if (mode === "a drag that began finishes when Alt is let go") {
      b.setFrozen(true);
      d.alt(true);
      await aim.lift("findings", 20, 12, true);
      await d.glide({ x: 500, y: 300 }, 14);
      d.alt(false);
      await d.frames(2);
      const still = b.dragging !== null;
      const shown = await aim.float({ x: 560, y: 260 });
      await d.release();
      const drop = b.lastDrop!;
      rows.push(
        await rule("Letting go of Alt mid-drag doesn't cancel it: it aims and drops", (ok) => {
          ok(still, "the drag ended when Alt came up");
          ok(shown, "the preview never showed");
          ok(drop.landed?.kind === "float" && !drop.cancelled, `landed ${JSON.stringify(drop.landed)}`);
          ok(!!drop.landedDom && near(drop.landedDom, { x: 540, y: 248, width: 220, height: 190 }), `landed ${fmt(drop.landedDom)}`);
        }),
      );
      return rows;
    }
    // A press refused while frozen stays refused: holding Alt afterwards, still pressing, starts nothing.
    b.setFrozen(true);
    await d.press(b.gripOf("zoom")!, 20, 12);
    await d.glide({ x: 600, y: 300 }, 14);
    d.alt(true);
    await d.glide({ x: 620, y: 330 }, 4);
    const began = b.dragging !== null;
    await d.release();
    d.alt(false);
    rows.push(
      await rule("The freeze is read at the press: a refused press never becomes a drag, even if Alt comes down", (ok) => {
        ok(!began, "a drag began once Alt came down");
        ok(b.lastDrop === null, "a drop was made");
        ok(b.floats.some((f) => f.id === "zoom" && f.rect.x === 560 && f.rect.y === 200), "Zoom moved");
      }),
    );
    return rows;
  },
};

// --- C15 ---------------------------------------------------------------------------------------------------------------

const COUNTS = [0, 7, 99, 100, 12345];

const c15: Scenario<Page> = {
  name: "C15: no jump when a count or a phase changes",
  modes: ["a full column, a bar of one", "the default window: a bar, a column and a float", "a change that resizes an item does move the others"],
  async run(_p, mode) {
    const rows = [];
    b.setLayout(mode === "a full column, a bar of one" || mode.startsWith("a change") ? TIGHT : DEFAULT_LAYOUT);
    await d.frames(2);
    if (mode.startsWith("a change")) {
      const before = b.seen();
      b.fold("pages");
      await d.frames(2);
      const after = b.seen();
      const m = moved(before, after, "pages", 0.5);
      rows.push(
        await rule("Folding Pages by hand changes its size, and the items after it do move (the check can fail)", (ok) => {
          ok(m.length > 0 && Math.max(...m.map((x) => x.by)) > 50, `moved: ${JSON.stringify(m)}`);
        }),
      );
      return rows;
    }
    const jumps: string[] = [];
    const resized: string[] = [];
    const fitMoved: string[] = [];
    let changes = 0;
    const apply = async (id: ItemId, patch: Partial<{ count: number; phase: (typeof PHASES)[number] }>): Promise<void> => {
      const before = b.seen();
      const fits = JSON.stringify(b.fits());
      b.setMeta(id, patch);
      await d.frames(1);
      const after = b.seen();
      changes++;
      const what = `${titleOf(id)} ${JSON.stringify(patch)}`;
      for (const x of moved(before, after, id, 0.5)) jumps.push(`${what}: ${titleOf(x.id)} moved ${x.by.toFixed(2)} px`);
      // The changed item's own size along its stack is what the rule presumes unchanged.
      const own = moved(before, after, null, 0.01).find((x) => x.id === id);
      if (own) resized.push(`${what}: its own rect changed by ${own.by.toFixed(2)} px`);
      if (JSON.stringify(b.fits()) !== fits) fitMoved.push(`${what}: the solver's fit changed`);
    };
    for (const id of ALL) {
      for (const count of COUNTS) await apply(id, { count });
      for (const phase of PHASES) await apply(id, { phase });
    }
    // The badge is a fixed slot: its box doesn't grow with the digits, and a count over 99 says 99+.
    const widths: number[] = [];
    const texts: string[] = [];
    for (const count of COUNTS) {
      b.setMeta("findings", { count });
      await d.frames(1);
      const badge = b.itemEl("findings")?.querySelector<HTMLElement>(".st-num");
      if (badge) {
        widths.push(badge.getBoundingClientRect().width);
        texts.push(badge.textContent ?? "");
      }
    }
    rows.push(
      await rule(`No other item moves more than 0.5 px when one item's count or phase changes (${changes} changes)`, (ok) => {
        ok(changes === ALL.length * (COUNTS.length + PHASES.length), `${changes} changes were made`);
        for (const m of jumps.slice(0, 5)) ok(false, m);
      }),
    );
    rows.push(
      await rule("The changed item keeps its own size, and the solver's answer is the same", (ok) => {
        for (const m of [...resized, ...fitMoved].slice(0, 5)) ok(false, m);
      }),
    );
    rows.push(
      await rule("The count shows in a fixed slot (99+ over 99) and the phase on the item", (ok) => {
        ok(widths.length === COUNTS.length, `the badge showed ${widths.length} of ${COUNTS.length} times`);
        ok(widths.every((w) => Math.abs(w - widths[0]!) < 0.01), `the badge's width changed: ${widths.join(", ")}`);
        ok(texts.join() === COUNTS.map(badgeOf).join(), `the badge said ${texts.join(", ")}`);
        b.setMeta("findings", { phase: "busy" });
        ok(b.itemEl("findings")?.dataset.phase === "busy", "the phase isn't on the item");
      }),
    );
    return rows;
  },
};

const SCENARIOS = [c13, c14, c15];

install(page, SCENARIOS, () => page.reset(), document.getElementById("sk-run") as HTMLButtonElement, document.getElementById("sk-runs") as HTMLTableSectionElement);
