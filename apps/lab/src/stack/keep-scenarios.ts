/**
 * The Stack · store, freeze, no jump page's scenarios, on `window.__motionLab.runAll(filter?)`. Each drives the page
 * with real pointer and key events and asserts what the page drew:
 * C13 (a page reload, and a rebuild in the page, restore every item's place and form from the stored form, and bad
 * stored data never throws),
 * C14 (frozen: grips hidden and nothing moves; holding Alt shows them and everything works, stacked headers too),
 * C15 (a count or a phase changing moves no other item more than 0.5 px; a size measured from the content does jump),
 * and the click that opens a collapsed panel (a header's caret or a rail icon), which a drag never fires.
 */
import type { Rect } from "@n-uf/motion";
import { routeHash } from "../shell/api";
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

type Child = Window & { __stackKeep?: KeepPage; __labReady?: boolean };
/** Load this page in a frame of its own (a frame can be reloaded without ending the run) and wait for it to be ready. */
async function ready(frame: HTMLIFrameElement, notOrigin?: number): Promise<Child> {
  for (let i = 0; i < 300; i++) {
    await new Promise((r) => setTimeout(r, 50));
    const w = frame.contentWindow as Child | null;
    try {
      if (w?.__labReady && w.__stackKeep && (notOrigin === undefined || w.performance.timeOrigin !== notOrigin)) return w;
    } catch {
      // Mid-navigation: not readable yet.
    }
  }
  throw new Error("the frame's page didn't load");
}

const c13: Scenario<Page> = {
  name: "C13: a reload restores every item's place and form",
  modes: ["a real page reload", "after drags, a fold, a keep and a float", "a column too short for its items", "a stored form that is corrupt", "half of the stored form is corrupt"],
  async run(_p, mode) {
    const rows = [];
    if (mode === "a real page reload") {
      // The page in a frame: arrange, then `location.reload()` it, and read what the new page drew. The browser
      // session's storage carries a flag across the reload, so the check knows it read the page after it.
      const frame = document.createElement("iframe");
      frame.title = "the page, reloaded";
      Object.assign(frame.style, { position: "fixed", left: "0", top: "0", width: "1600px", height: "1100px", border: "0", opacity: "0", pointerEvents: "none", zIndex: "-1" });
      frame.src = `${location.pathname}${routeHash("stack/keep", { embed: true })}`;
      document.body.append(frame);
      try {
        const w1 = await ready(frame);
        const cb = w1.__stackKeep!.board;
        // Pages folded by hand, Findings a rail icon, Annotations kept and the newest; Zoom and a float.
        cb.setLayout(
          { column: ["pages", "annotations", "findings"], bar: ["views", "tools"], floats: [{ id: "zoom", rect: { x: 540, y: 210, width: 244, height: 34 } }] },
          { used: { findings: 1, pages: 2, annotations: 9, views: 3, tools: 4, zoom: 5 }, kept: ["annotations"], from: { pages: 1, findings: 2 } },
        );
        await d.frames(2);
        const before = JSON.parse(JSON.stringify(cb.seen())) as Seen[];
        const origin = w1.performance.timeOrigin;
        const hand = JSON.stringify([cb.kept, cb.from]);
        const floats = rectsOf(cb.floats);
        w1.sessionStorage.setItem("motion-lab:stack-keep:reloading", "1");
        w1.location.reload();
        const w2 = await ready(frame, origin);
        await d.frames(2);
        const nb = w2.__stackKeep!.board;
        const after = JSON.parse(JSON.stringify(nb.seen())) as Seen[];
        const nav = w2.performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
        rows.push(
          await rule("The page really reloaded: a new document, a reload navigation, the session's flag still set", (ok) => {
            ok(w2.performance.timeOrigin !== origin, "it is the same document");
            ok(nav?.type === "reload", `the navigation was ${nav?.type}`);
            ok(w2.sessionStorage.getItem("motion-lab:stack-keep:reloading") === "1", "the flag set before the reload is gone");
            ok(before.some((s) => s.where.kind === "float") && before.some((s) => s.form > 0), "the arrangement had no float or folded item: nothing is proved");
          }),
        );
        rows.push(
          await rule("After the load every item is in its place and form, at the same rect; kept, folded and floats too", (ok) => {
            for (const m of differences(before, after, 0.5)) ok(false, m);
            ok(JSON.stringify([nb.kept, nb.from]) === hand, `kept and folded: ${JSON.stringify([nb.kept, nb.from])}, were ${hand}`);
            ok(rectsOf(nb.floats) === floats, `the floats are ${rectsOf(nb.floats)}, were ${floats}`);
          }),
        );
        w2.sessionStorage.removeItem("motion-lab:stack-keep:reloading");
      } finally {
        frame.remove();
      }
      return rows;
    }
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
      b.rebuild(() => (blank = b.seen()));
      await d.frames(2);
      const after = b.seen();
      const text1 = b.stored();
      rows.push(
        await rule("Rebuild from the stored form: the page forgets the arrangement first (everything docked in the column, nothing floating)", (ok) => {
          ok(blank.length === ALL.length && blank.every((s) => s.where.kind === "dock" && s.where.side === "column"), `the blank page had ${blank.map(place).join(", ")}`);
          ok(differences(before, blank, 0.5).length > 0, "the arrangement before the rebuild was already the blank one: nothing is proved");
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
      let rep: ReturnType<typeof b.rebuild> | null = null;
      try {
        rep = b.rebuild();
      } catch (e) {
        threw = String(e);
      }
      await d.frames(2);
      rows.push(
        await rule("Reading it never throws: nothing usable is stored, the page keeps its default arrangement", (ok) => {
          ok(threw === null, `the rebuild threw ${threw}`);
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
    const rep = b.rebuild();
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
  modes: [
    "a full column, a bar of one",
    "the default window: a bar, a column and a float",
    "a change that resizes an item does move the others",
    "a size measured from the content does jump (the control)",
  ],
  async run(_p, mode) {
    const rows = [];
    b.setLayout(mode === "a full column, a bar of one" || mode.startsWith("a change") ? TIGHT : DEFAULT_LAYOUT);
    await d.frames(2);
    if (mode.startsWith("a size measured")) {
      // The bar groups' row form is sized from their words and badge, and the badge grows with its digits: the one
      // case where a count reaches the solver. The check must see the jump, or it would pass with this as well.
      b.setMeasured(true);
      await d.frames(2);
      const before = b.seen();
      b.setMeta("views", { count: 12345 });
      await d.frames(2);
      const after = b.seen();
      const grew = after.find((s) => s.id === "views")!.rect.width - before.find((s) => s.id === "views")!.rect.width;
      const m = moved(before, after, "views", 0.5);
      rows.push(
        await rule("With a form measured from its words and badge, a count with more digits resizes the group", (ok) => {
          ok(grew > 10, `Views grew by ${grew.toFixed(1)} px`);
        }),
      );
      rows.push(
        await rule("…and the items after it move by that much: the no-jump check sees it", (ok) => {
          ok(m.map((x) => x.id).join() === "tools,zoom", `moved: ${JSON.stringify(m)}`);
          for (const x of m) ok(Math.abs(x.by - grew) < 1, `${titleOf(x.id)} moved ${x.by.toFixed(1)} px, the group grew ${grew.toFixed(1)}`);
        }),
      );
      return rows;
    }
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
      await rule(`With sizes that don't depend on them (a fixed badge slot), no other item moves more than 0.5 px when one item's count or phase changes (${changes} changes)`, (ok) => {
        ok(changes === ALL.length * (COUNTS.length + PHASES.length), `${changes} changes were made`);
        for (const m of jumps.slice(0, 5)) ok(false, m);
      }),
    );
    rows.push(
      await rule("The changed item keeps its own size, and the solver's answer is the same (nothing it is given depends on a count or a phase)", (ok) => {
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

// --- opening a collapsed panel -------------------------------------------------------------------------------------------

/** What a click presses to open a panel in a form: a header's caret, a rail icon. */
const CLICK_ON: Record<string, string> = { header: ".st-caret", rail: ".st-badge" };
const grabOf = (id: ItemId, kind: string): HTMLElement => b.itemEl(id)!.querySelector<HTMLElement>(CLICK_ON[kind]!)!;

/** After a click: the item's DOM rect and kind are the solver's. */
function matchesSolver(id: ItemId): string[] {
  const s = b.seen().find((x) => x.id === id)!;
  const solved = b.solved().get(id)!;
  const fit = s.where.kind === "dock" ? b.fits()[s.where.side].items.find((x) => x.id === id)! : null;
  const out: string[] = [];
  if (!near(s.rect, solved)) out.push(`${titleOf(id)} is drawn at ${fmt(s.rect)}, the solver's rect is ${fmt(solved)}`);
  if (fit && fit.kind !== s.kind) out.push(`${titleOf(id)} is drawn as ${s.kind}, the solver says ${fit.kind}`);
  return out;
}

const CLICKS: Record<string, { layout: Layout; from: Partial<Record<ItemId, number>>; id: ItemId; kind: string }> = {
  // A header stays a header beside an open panel (it has a small cross.min); alone, a column is a rail.
  "a header in a column": { layout: { column: ["annotations", "pages"], bar: [], floats: [] }, from: { pages: 1 }, id: "pages", kind: "header" },
  "a rail icon in a column": { layout: { column: ["pages"], bar: [], floats: [] }, from: { pages: 2 }, id: "pages", kind: "rail" },
  "a header in a bar": { layout: { column: [], bar: ["annotations"], floats: [] }, from: { annotations: 1 }, id: "annotations", kind: "header" },
  "a rail icon in a bar": { layout: { column: [], bar: ["annotations"], floats: [] }, from: { annotations: 2 }, id: "annotations", kind: "rail" },
};

const click: Scenario<Page> = {
  name: "A click opens a collapsed panel",
  modes: [...Object.keys(CLICKS), "the sequence: fold both by hand, then click each open", "a drag from a rail icon doesn't open it", "frozen refuses it; Alt allows it"],
  async run(_p, mode) {
    const rows = [];
    const c = CLICKS[mode];
    if (c) {
      b.setLayout(c.layout, { from: c.from });
      await d.frames(2);
      const was = b.seen().find((s) => s.id === c.id)!.kind;
      await d.press(grabOf(c.id, c.kind), 6);
      await d.release();
      await d.frames(1);
      const now = b.seen().find((s) => s.id === c.id)!;
      rows.push(
        await rule("The click opens the panel: its form from the first, the newest used, with a real pointer and no drag", (ok) => {
          ok(was === c.kind, `the panel was ${was}, not ${c.kind}`);
          ok(b.from[c.id] === undefined, `its form is still ${b.from[c.id]}`);
          ok(now.kind === "open", `it is ${now.kind}`);
          ok(b.used[c.id] === Math.max(...Object.values(b.used)), "it isn't the newest used");
          ok(b.dragging === null && b.lastDrop === null, "a drag began or a drop was made");
        }),
      );
      rows.push(await rule("Its rect and kind after the click are the solver's", (ok) => matchesSolver(c.id).forEach((m) => ok(false, m))));
      return rows;
    }
    if (mode.startsWith("the sequence")) {
      // The operator's: both panels folded by hand, so nothing open sets the column's width and the headers become rails.
      b.setLayout({ column: ["pages", "annotations"], bar: ["views", "tools", "zoom"], floats: [] });
      await d.frames(2);
      dblclick(b.itemEl("pages")!.querySelector(".st-head")!);
      dblclick(b.itemEl("annotations")!.querySelector(".st-head")!);
      await d.frames(2);
      const kinds = (): string => b.seen().filter((s) => s.where.kind === "dock" && s.where.side === "column").map((s) => s.kind).join();
      const folded = kinds();
      const narrow = b.fits().column.cross;
      await d.press(grabOf("annotations", "rail"), 6);
      await d.release();
      await d.frames(2);
      const afterA = kinds();
      const wide = b.fits().column.cross;
      // Pages is now a header beside the open Annotations: its caret opens it.
      await d.press(grabOf("pages", "header"), 6);
      await d.release();
      await d.frames(2);
      const both = kinds();
      rows.push(
        await rule("Both folded by hand: nothing is open, so the column is a rail and both are icons", (ok) => {
          ok(folded === "rail,rail", `the column is ${folded}`);
          ok(narrow === 30, `the column is ${narrow} px wide`);
        }),
      );
      rows.push(
        await rule("Click Annotations' icon: it opens and the column widens; click Pages' caret: both are open", (ok) => {
          ok(afterA === "header,open", `after the first click the column is ${afterA}`);
          ok(wide > 200, `the column is ${wide} px wide`);
          ok(both === "open,open", `after the second click the column is ${both}`);
          for (const id of ["pages", "annotations"] as const) matchesSolver(id).forEach((m) => ok(false, m));
        }),
      );
      return rows;
    }
    if (mode.startsWith("a drag")) {
      b.setLayout({ column: ["pages"], bar: [], floats: [] }, { from: { pages: 2 } });
      await d.frames(2);
      await d.press(grabOf("pages", "rail"), 6);
      const shown = await aim.float({ x: 620, y: 300 });
      await d.release();
      rows.push(
        await rule("A drag from a rail icon floats the panel and never also opens it", (ok) => {
          ok(shown, "the preview never showed");
          ok(b.lastDrop?.landed?.kind === "float", `landed ${JSON.stringify(b.lastDrop?.landed)}`);
          ok(b.from.pages === 2, `its form is ${b.from.pages}: the click fired too`);
        }),
      );
      return rows;
    }
    // Frozen: a click is refused as a drag is; with Alt it opens.
    b.setLayout({ column: ["pages"], bar: [], floats: [] }, { from: { pages: 2 } });
    b.setFrozen(true);
    await d.frames(2);
    await d.press(grabOf("pages", "rail"), 6);
    await d.release();
    const refused = b.from.pages === 2 && b.status.includes("Frozen");
    d.alt(true);
    await d.press(grabOf("pages", "rail"), 6);
    await d.release();
    d.alt(false);
    rows.push(
      await rule("Frozen, a click on an icon is refused with the freeze's status line; with Alt held it opens the panel", (ok) => {
        ok(refused, `refused ${b.from.pages === 2}, status "${b.status}"`);
        ok(b.from.pages === undefined, `with Alt its form is ${b.from.pages}`);
        ok(b.seen().find((s) => s.id === "pages")!.kind === "open", "it didn't open");
      }),
    );
    return rows;
  },
};

const SCENARIOS = [c13, c14, c15, click];

install(page, SCENARIOS, () => page.reset(), document.getElementById("sk-run") as HTMLButtonElement, document.getElementById("sk-runs") as HTMLTableSectionElement);
