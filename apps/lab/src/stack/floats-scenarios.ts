/**
 * The Stack · floats page's scenarios, on `window.__motionLab.runAll(filter?)`. Each drives the page with real pointer
 * and key events (the drag intent decides what shows and when, as for a person) and asserts what the page drew:
 * C5 (a float stays put while the pages scroll), C7 (a float never covers a docked item's content: it lands beside
 * it, on the rect the preview showed), C16 (a float has no pinned flag; an old stored one loads as a plain float) and
 * C17 (a drop with the pointer past the stage's edge lands clamped into the stage, never cancels).
 */
import type { Rect } from "@n-uf/motion";
import { overlap, type Point } from "../shared/geometry";
import { aimers, createDriver } from "./drive";
import { FLOAT_SIZE, titleOf, type ItemId } from "./sample";
import { STAGE, DEFAULT_LAYOUT } from "./board";
import { fmt, install, near, rule, type Scenario } from "./run";
import { page, type FloatsPage } from "./floats";

type Page = FloatsPage;
const d = createDriver(page.board.stage);
const STAGE_BOX: Rect = { x: 0, y: 0, width: STAGE.width, height: STAGE.height };

const inStage = (r: Rect, tol = 0.5): boolean => r.x >= -tol && r.y >= -tol && r.x + r.width <= STAGE.width + tol && r.y + r.height <= STAGE.height + tol;
/** The rects of the docked items (and the » entries) as drawn, in stage px. */
const dockedRects = (p: Page): Rect[] => p.board.avoidRects();
const covering = (r: Rect, avoid: readonly Rect[]): Rect[] => avoid.filter((a) => overlap(r, a) > 1);

const aim = aimers(d, page.board);
/** Aim the held item at `to` (stage px, possibly outside the stage) until the float preview shows. */
const aimFloat = (_p: Page, to: Point): Promise<boolean> => aim.float(to);
/** Aim at a docked place until the preview shows and the others have made room. */
const aimDock = (_p: Page, to: Point): Promise<boolean> => aim.dock(to);
/** Press `id` at (`dx`, `dy`) in its grip; returns the grab offset in the item. */
const lift = (_p: Page, id: ItemId, dx: number, dy: number): Promise<Point> => aim.lift(id, dx, dy);
const rawRect = (id: ItemId, to: Point, grab: Point): Rect => ({ x: to.x - grab.x, y: to.y - grab.y, ...FLOAT_SIZE[id] });

// --- C5 ----------------------------------------------------------------------------------------------------------------

const c5: Scenario<Page> = {
  name: "C5: floats stay put while the pages scroll",
  modes: ["scroll the pages", "scroll during a drag"],
  async run(p, mode) {
    const b = p.board;
    p.scrollTo(0);
    await d.frames(2);
    const rows = [];
    if (mode === "scroll the pages") {
      const el = b.itemEl("findings")!;
      const float0 = d.domRect(el);
      const stored0 = b.floats.find((f) => f.id === "findings")!.rect;
      const docked0 = b.seen().filter((s) => s.where.kind === "dock");
      const mark0 = b.sheetMark();
      const stuck: string[] = [];
      const pages: string[] = [];
      const bars: string[] = [];
      let scrolled = 0;
      for (const y of [120, 400, 100000, 0]) {
        const sy = p.scrollTo(y);
        await d.frames(2);
        scrolled = Math.max(scrolled, sy);
        const f = d.domRect(el);
        if (!near(f, float0)) stuck.push(`scrolled to ${Math.round(sy)}: the float is at ${fmt(f)}, it was ${fmt(float0)}`);
        for (const s of b.seen().filter((x) => x.where.kind === "dock")) {
          const was = docked0.find((x) => x.id === s.id)!;
          if (!near(s.rect, was.rect)) bars.push(`scrolled to ${Math.round(sy)}: ${titleOf(s.id)} is at ${fmt(s.rect)}, it was ${fmt(was.rect)}`);
        }
        const m = b.sheetMark();
        if (Math.abs(mark0.y - m.y - sy) > 1) pages.push(`scrolled to ${Math.round(sy)}: the sheet moved ${Math.round(mark0.y - m.y)} px`);
      }
      rows.push(
        await rule("The pages really scroll: the sheet moves by the scroll offset", (ok) => {
          ok(scrolled > 200, `the pages could scroll only ${Math.round(scrolled)} px`);
          for (const m of pages) ok(false, m);
        }),
      );
      rows.push(await rule("The float is where it was at every scroll offset, and back at 0", (ok) => stuck.forEach((m) => ok(false, m))));
      rows.push(await rule("The bar's and the column's items stay too", (ok) => bars.forEach((m) => ok(false, m))));
      rows.push(
        await rule("The float is in the stage's px: its stored rect never changed, and it isn't inside the scrolling pages", (ok) => {
          const now = b.floats.find((f) => f.id === "findings")!.rect;
          ok(near(now, stored0, 0), `stored rect ${fmt(now)}, it was ${fmt(stored0)}`);
          ok(!b.scroller.contains(el), "the float's element is inside the scrolling pages");
        }),
      );
    } else {
      const grab = await lift(p, "findings", 20, 12);
      const to = { x: 560, y: 250 };
      const shown = await aimFloat(p, to);
      const before = d.domRect(b.ind);
      const sy = p.scrollTo(300);
      await d.frames(3);
      const after = d.domRect(b.ind);
      await d.release();
      const drop = b.lastDrop!;
      p.scrollTo(0);
      await d.frames(2);
      const home = d.domRect(b.itemEl("findings")!);
      rows.push(
        await rule("Scrolling the pages mid-drag doesn't move the preview: it is in the stage's px", (ok) => {
          ok(shown, "the preview never showed");
          ok(sy > 100, `the pages scrolled only ${Math.round(sy)} px`);
          ok(near(before, after), `the preview was ${fmt(before)}, then ${fmt(after)}`);
        }),
      );
      rows.push(
        await rule("The release lands on the preview's rect, wherever the pages are scrolled", (ok) => {
          ok(drop.landed?.kind === "float", `landed ${JSON.stringify(drop.landed)}`);
          ok(!!drop.landedDom && near(drop.landedDom, after), `landed ${fmt(drop.landedDom)}, previewed ${fmt(after)}`);
          ok(near(home, after), `after scrolling back the float is at ${fmt(home)}, not ${fmt(after)}`);
          ok(near(after, { x: to.x - grab.x, y: to.y - grab.y, ...FLOAT_SIZE.findings }), `the preview ${fmt(after)} isn't where the pointer holds the float`);
        }),
      );
    }
    return rows;
  },
};

// --- C7 ----------------------------------------------------------------------------------------------------------------

interface Snap {
  /** Press the float's header here, in the float. */
  readonly grab: Point;
  /** Where the pointer ends (stage px). */
  readonly to: Point;
  /** What its body would cover with no fit. */
  readonly over: string;
}
const SNAPS: Record<string, Snap> = {
  // The pointer is just right of the column's zone, holding the float's right side: its body lies over the column.
  "beside the column, the body over it": { grab: { x: 205, y: 12 }, to: { x: 262, y: 220 }, over: "column" },
  // The pointer is just below the bar's zone, holding the float's top: its body lies over the bar.
  "just under the bar, the body over it": { grab: { x: 40, y: 24 }, to: { x: 500, y: 46 }, over: "bar" },
};

const c7: Scenario<Page> = {
  name: "C7: a float never covers a docked item's content",
  modes: [...Object.keys(SNAPS), "a column that grows under a float", "a float dropped where it doesn't cover"],
  async run(p, mode) {
    const b = p.board;
    const rows = [];
    if (mode === "a column that grows under a float") {
      // Pages floats away, the column is empty (a rail), Findings floats close to its left edge.
      b.setLayout({
        column: [],
        bar: ["views", "tools", "zoom"],
        floats: [
          { id: "findings", rect: { x: 40, y: 100, width: 220, height: 190 } },
          { id: "pages", rect: { x: 560, y: 110, width: 200, height: 170 } },
        ],
      });
      await d.frames(2);
      const before = d.domRect(b.itemEl("findings")!);
      await lift(p, "pages", 20, 12);
      const shown = await aimDock(p, { x: 100, y: 280 });
      await d.release();
      await d.frames(2);
      const drop = b.lastDrop!;
      const after = d.domRect(b.itemEl("findings")!);
      const column = b.fits().column;
      rows.push(
        await rule("Docking Pages opens the column to its width", (ok) => {
          ok(shown, "the preview never showed with the room made");
          ok(drop.landed?.kind === "dock" && drop.landed.side === "column", `landed ${JSON.stringify(drop.landed)}`);
          ok(column.cross > 150, `the column is ${column.cross} px wide`);
          ok(before.x < column.cross, "the float wasn't under the column's new width, so nothing is proved");
        }),
      );
      rows.push(
        await rule("The float that lay under the grown column moved clear of it, inside the stage", (ok) => {
          ok(after.x >= column.cross - 0.5, `Findings is at ${fmt(after)}, the column is ${column.cross} wide`);
          ok(covering(after, dockedRects(p)).length === 0, `Findings covers ${covering(after, dockedRects(p)).map(fmt).join(", ")}`);
          ok(inStage(after), `Findings is at ${fmt(after)}, outside the stage`);
          ok(near(after, b.floats.find((f) => f.id === "findings")!.rect, 0.01), "the drawn float isn't its stored rect");
        }),
      );
      return rows;
    }
    if (mode === "a float dropped where it doesn't cover") {
      const grab = await lift(p, "findings", 20, 12);
      const to = { x: 600, y: 300 };
      const shown = await aimFloat(p, to);
      const pv = d.domRect(b.ind);
      await d.release();
      const drop = b.lastDrop!;
      rows.push(
        await rule("Where nothing is covered the float lands exactly where the pointer holds it, unmoved", (ok) => {
          ok(shown, "the preview never showed");
          ok(near(pv, rawRect("findings", to, grab)), `the preview ${fmt(pv)} isn't where the pointer holds it`);
          ok(!!drop.landedDom && near(drop.landedDom, pv), `landed ${fmt(drop.landedDom)}, previewed ${fmt(pv)}`);
          ok(!b.indLabel.textContent?.includes("clear"), `the label says "${b.indLabel.textContent}"`);
        }),
      );
      return rows;
    }
    const c = SNAPS[mode]!;
    const orders = JSON.stringify(b.orders);
    const el = b.itemEl("findings")!;
    const home = d.domRect(el);
    await d.press(b.gripOf("findings")!, c.grab.x, c.grab.y);
    const grab = { x: d.at.x - home.x, y: d.at.y - home.y };
    const raw = rawRect("findings", c.to, grab);
    const avoid = dockedRects(p);
    const shown = await aimFloat(p, c.to);
    const pv = d.domRect(b.ind);
    const label = b.indLabel.textContent ?? "";
    await d.release();
    const drop = b.lastDrop!;
    rows.push(
      await rule(`With no fit the float would cover the ${c.over} (the case is real)`, (ok) => {
        ok(covering(raw, avoid).length > 0, `the unfitted float ${fmt(raw)} covers nothing`);
      }),
    );
    rows.push(
      await rule("Held there, the preview shows the float beside the docked items, inside the stage", (ok) => {
        ok(shown, "the preview never showed");
        ok(covering(pv, avoid).length === 0, `the preview ${fmt(pv)} covers ${covering(pv, avoid).map(fmt).join(", ")}`);
        ok(inStage(pv), `the preview ${fmt(pv)} is outside the stage`);
        ok(label.includes("moved clear"), `the label says "${label}"`);
        ok(pv.width === FLOAT_SIZE.findings.width && pv.height === FLOAT_SIZE.findings.height, `the float was resized to ${fmt(pv)}`);
      }),
    );
    rows.push(
      await rule("The drop lands on the preview's rect, covering nothing; no docked item moved", (ok) => {
        ok(drop.landed?.kind === "float", `landed ${JSON.stringify(drop.landed)}`);
        ok(!!drop.landedDom && near(drop.landedDom, pv), `landed ${fmt(drop.landedDom)}, previewed ${fmt(pv)}`);
        ok(!!drop.landedDom && covering(drop.landedDom, dockedRects(p)).length === 0, "the landed float covers docked content");
        ok(JSON.stringify(b.orders) === orders, `the stacks changed: ${JSON.stringify(b.orders)}`);
      }),
    );
    return rows;
  },
};

// --- C16 ---------------------------------------------------------------------------------------------------------------

const OLD_FLOATS = { v: 1, floats: [{ id: "findings", x: 560, y: 110, width: 220, height: 190, pinned: true }] };

const c16: Scenario<Page> = {
  name: "C16: a float has no pinned flag",
  modes: ["a torn-off float has none", "an old stored pinned: true loads as a plain float"],
  async run(p, mode) {
    const b = p.board;
    const rows = [];
    if (mode === "a torn-off float has none") {
      await lift(p, "pages", 20, 12);
      const shown = await aimFloat(p, { x: 640, y: 300 });
      await d.release();
      const f = b.floats.find((x) => x.id === "pages");
      const el = b.itemEl("pages");
      const stored = b.stored().floats;
      rows.push(
        await rule("A panel torn off the column is a float: an id and a rect, nothing else", (ok) => {
          ok(shown, "the preview never showed");
          ok(!!f && Object.keys(f).sort().join() === "id,rect", `its fields are ${f ? Object.keys(f).join() : "none"}`);
          ok(b.lastDrop?.landed?.kind === "float", `landed ${JSON.stringify(b.lastDrop?.landed)}`);
        }),
      );
      rows.push(
        await rule("The stored form writes no pinned, and the float has no pin control", (ok) => {
          ok(!stored.includes("pinned"), `stored: ${stored}`);
          ok(!!el && !("pinned" in el.dataset) && ![...el.classList].some((c) => /pin/.test(c)), "the float's element carries a pin");
          ok(!b.stage.querySelector("[data-pinned], .st-pin, [aria-label*='Pin' i]"), "the stage has a pin control");
        }),
      );
      return rows;
    }
    // An old store: the default layout's stacks, and floats written the old way.
    b.setLayout(DEFAULT_LAYOUT);
    const s = b.stored();
    try {
      localStorage.setItem(b.storageKeys.column, s.column);
      localStorage.setItem(b.storageKeys.bar, s.bar);
      localStorage.setItem(b.storageKeys.floats, JSON.stringify(OLD_FLOATS));
    } catch (e) {
      return [await rule("localStorage is writable", (ok) => ok(false, String(e)))];
    }
    const rep = b.reload();
    await d.frames(2);
    const el = b.itemEl("findings");
    const at = el ? d.domRect(el) : null;
    const want: Rect = { x: 560, y: 110, width: 220, height: 190 };
    const sy = p.scrollTo(300);
    await d.frames(2);
    const scrolled = el ? d.domRect(el) : null;
    const f = b.floats.find((x) => x.id === "findings");
    rows.push(
      await rule("The old store loads: Findings is a float at its stored rect, and the ignored key is listed", (ok) => {
        ok(rep.restored && rep.errors.length === 0, `restored ${rep.restored}, errors ${rep.errors.join("; ")}`);
        ok(!!at && near(at, want), `Findings is at ${fmt(at)}, stored at ${fmt(want)}`);
        ok(rep.floats.includes("pinned:findings"), `the floats' report lists ${JSON.stringify(rep.floats)}`);
        ok(!!f && Object.keys(f).sort().join() === "id,rect", `its fields are ${f ? Object.keys(f).join() : "none"}`);
      }),
    );
    rows.push(
      await rule("It is a plain float: the pages scrolling don't move it, and stored again it has no pinned", (ok) => {
        ok(sy > 100, `the pages scrolled only ${Math.round(sy)} px`);
        ok(!!at && !!scrolled && near(at, scrolled), `after scrolling it is at ${fmt(scrolled)}, it was ${fmt(at)}`);
        ok(!b.stored().floats.includes("pinned"), `stored: ${b.stored().floats}`);
      }),
    );
    return rows;
  },
};

// --- C17 ---------------------------------------------------------------------------------------------------------------

interface Edge {
  readonly id: ItemId;
  readonly grab: Point;
  readonly to: Point;
}
const EDGES: Record<string, Edge> = {
  "above the stage": { id: "findings", grab: { x: 20, y: 12 }, to: { x: 600, y: -90 } },
  "below the stage": { id: "findings", grab: { x: 20, y: 12 }, to: { x: 600, y: STAGE.height + 140 } },
  "past the right edge": { id: "findings", grab: { x: 20, y: 12 }, to: { x: STAGE.width + 130, y: 260 } },
  "past the left edge": { id: "findings", grab: { x: 20, y: 12 }, to: { x: -130, y: 330 } },
  "a docked group, past the bottom edge": { id: "zoom", grab: { x: 8, y: 17 }, to: { x: 640, y: STAGE.height + 120 } },
  "a docked panel, past the top edge": { id: "annotations", grab: { x: 40, y: 12 }, to: { x: 560, y: -100 } },
};

const c17: Scenario<Page> = {
  name: "C17: a float dropped past the stage's edge is clamped, never cancelled",
  modes: [...Object.keys(EDGES), "Escape still cancels"],
  async run(p, mode) {
    const b = p.board;
    const rows = [];
    const e = mode === "Escape still cancels" ? EDGES["above the stage"]! : EDGES[mode]!;
    const before = JSON.stringify({ o: b.orders, f: b.floats });
    const grab = await lift(p, e.id, e.grab.x, e.grab.y);
    const raw = rawRect(e.id, e.to, grab);
    const shown = await aimFloat(p, e.to);
    const pv = d.domRect(b.ind);
    const avoid = dockedRects(p);
    if (mode === "Escape still cancels") {
      d.escape();
      await d.frames(2);
      const drop = b.lastDrop!;
      rows.push(
        await rule("Escape is the one way to cancel: nothing moved", (ok) => {
          ok(shown, "the preview never showed");
          ok(drop.cancelled && drop.landed === null, `cancelled ${drop.cancelled}, landed ${JSON.stringify(drop.landed)}`);
          ok(JSON.stringify({ o: b.orders, f: b.floats }) === before, "the layout changed");
        }),
      );
      return rows;
    }
    await d.release();
    const drop = b.lastDrop!;
    const where = b.floats.find((f) => f.id === e.id);
    rows.push(
      await rule("The pointer is past the stage's edge, and the float would be too (the case is real)", (ok) => {
        ok(!inStage(raw, 0), `the unclamped float ${fmt(raw)} is inside the stage`);
        ok(e.to.x < 0 || e.to.y < 0 || e.to.x > STAGE.width || e.to.y > STAGE.height, "the pointer is inside the stage");
      }),
    );
    rows.push(
      await rule("Held past the edge, the preview shows the float clamped into the stage, clear of the docked items", (ok) => {
        ok(shown, "no preview showed with the pointer past the edge");
        ok(inStage(pv), `the preview ${fmt(pv)} isn't inside the stage ${fmt(STAGE_BOX)}`);
        ok(covering(pv, avoid).length === 0, `the preview covers ${covering(pv, avoid).map(fmt).join(", ")}`);
        ok(pv.width === FLOAT_SIZE[e.id].width && pv.height === FLOAT_SIZE[e.id].height, `the float was resized to ${fmt(pv)}`);
        ok(b.indLabel.textContent?.includes("Float here") ?? false, `the label says "${b.indLabel.textContent}"`);
      }),
    );
    rows.push(
      await rule("The release never cancels: it lands a float on the preview's rect", (ok) => {
        ok(!drop.cancelled, "the drop was cancelled");
        ok(drop.landed?.kind === "float", `landed ${JSON.stringify(drop.landed)}`);
        ok(!!drop.landedDom && near(drop.landedDom, pv), `landed ${fmt(drop.landedDom)}, previewed ${fmt(pv)}`);
        ok(!!where && inStage(where.rect, 0.01), `the stored rect ${where ? fmt(where.rect) : "none"} isn't inside the stage`);
        ok(!!drop.landedDom && covering(drop.landedDom, dockedRects(p)).length === 0, "the landed float covers docked content");
      }),
    );
    return rows;
  },
};

const SCENARIOS = [c5, c7, c16, c17];

install(page, SCENARIOS, () => page.reset(), document.getElementById("fl-run") as HTMLButtonElement, document.getElementById("fl-runs") as HTMLTableSectionElement);
