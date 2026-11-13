/** @n-uf/placement/panels: the layout's invariants, give-way, floats, targets, keyboard stops and the stored form. */
import { describe, expect, it } from "vitest";
import { overlap, type Rect } from "../src/geometry";
import {
  DEFAULT_PANELS_OPTIONS,
  close,
  createPanels,
  dock,
  float,
  focus,
  homePlace,
  keep,
  layoutPanels,
  open,
  panelDrop,
  panelTargets,
  pin,
  readPanels,
  resizeColumn,
  storePanels,
  toggleFold,
  whereIs,
  type PanelDef,
  type PanelsState,
} from "../src/panels";
import { keyboardStops } from "../src/targets";

const w = (min: number, natural: number, max: number) => ({ min, natural, max });
const DEFS: PanelDef[] = [
  { id: "files", title: "Files", width: w(180, 220, 360) },
  { id: "outline", title: "Outline", width: w(160, 200, 320) },
  { id: "notes", title: "Notes", width: w(200, 260, 420) },
  { id: "inspector", title: "Inspector", width: w(220, 280, 400), sides: ["right"] },
  { id: "history", title: "History", width: w(200, 240, 360), float: { min: { width: 220, height: 160 }, natural: { width: 280, height: 300 } } },
  { id: "search", title: "Search", width: w(200, 240, 360), floats: false },
  { id: "preview", title: "Preview", width: w(200, 240, 360), float: { min: { width: 300, height: 200 }, natural: { width: 320, height: 240 } } },
];

/** The lab's desk: three left columns, two right, a float and a pinned float. */
const desk = (): PanelsState =>
  createPanels(DEFS, {
    left: [["files"], ["outline"], ["notes"]],
    right: [["inspector"], ["search"]],
    floats: [
      { id: "history", x: 500, y: 120 },
      { id: "preview", x: 40, y: 380, pinned: true },
    ],
  });

const docked = (l: ReturnType<typeof layoutPanels>): Rect[] => [...l.columns.filter((c) => c.folded === null).map((c) => c.rect), ...Object.values(l.rails).map((r) => r!.rect), l.pages];
const codes = (l: ReturnType<typeof layoutPanels>): string[] => l.notes.map((n) => n.code);

describe("layoutPanels", () => {
  it("keeps its invariants at many stage sizes", () => {
    const states = [desk(), toggleFold(desk(), "outline"), toggleFold(toggleFold(desk(), "files"), "inspector"), keep(desk(), "files", true), close(desk(), "notes")];
    const opt = DEFAULT_PANELS_OPTIONS;
    let n = 0;
    for (const s of states) {
      for (let W = 2 * opt.rail + opt.pagesMin; W <= 2200; W += 23) {
        for (const H of [240, 480, 900]) {
          const l = layoutPanels(DEFS, s, { width: W, height: H });
          const rs = docked(l);
          for (let i = 0; i < rs.length; i++) {
            const r = rs[i]!;
            expect(r.x).toBeGreaterThanOrEqual(-1e-9);
            expect(r.x + r.width).toBeLessThanOrEqual(W + 1e-9);
            for (let j = i + 1; j < rs.length; j++) expect(overlap(r, rs[j]!)).toBeLessThan(1e-6);
          }
          expect(l.pages.width).toBeGreaterThanOrEqual(opt.pagesMin - 1e-9);
          for (const c of l.columns) {
            if (c.folded) continue;
            expect(c.rect.width).toBeLessThanOrEqual(c.max + 1e-9);
            expect(c.rect.width).toBeGreaterThanOrEqual(c.min - 1e-9);
            // Its panels tile it top to bottom.
            const ps = c.panels.map((id) => l.items.get(id)!.rect);
            expect(ps.reduce((a, r) => a + r.height, 0)).toBeCloseTo(H, 6);
            ps.forEach((r) => expect(r.width).toBeCloseTo(c.rect.width, 6));
          }
          // Pages fit without give-way: nothing shrank or folded.
          if (codes(l).length === 0) expect(l.columns.every((c) => !c.shrunk && c.folded !== "auto")).toBe(true);
          n++;
        }
      }
    }
    expect(n).toBeGreaterThan(500);
  });

  it("shrinks before it folds, and folds the fewest columns", () => {
    const s = desk();
    const wide = layoutPanels(DEFS, s, { width: 2000, height: 700 });
    expect(codes(wide)).toEqual([]);
    const need = wide.columns.reduce((a, c) => a + c.rect.width, 0) + DEFAULT_PANELS_OPTIONS.pagesMin;
    const tight = layoutPanels(DEFS, s, { width: need - 30, height: 700 });
    expect(codes(tight)).toEqual(["column-shrunk"]);
    expect(tight.notes[0]).toMatchObject({ side: "left", column: 0, items: ["files"], to: 220 - 30 });
    const narrow = layoutPanels(DEFS, s, { width: 900, height: 700 });
    expect(codes(narrow).filter((c) => c === "column-folded").length).toBeGreaterThan(0);
    expect(narrow.pages.width).toBeGreaterThanOrEqual(320);
  });

  it("lays out folded bars and rails", () => {
    const s = toggleFold(desk(), "outline");
    const l = layoutPanels(DEFS, s, { width: 2000, height: 600 });
    expect(l.items.get("outline")).toMatchObject({ kind: "segment", hidden: true, folded: "hand", side: "left" });
    expect(l.rails.left!.segments.map((x) => x.id)).toEqual(["outline"]);
    const stacked = dock(desk(), "outline", "left", 0, { into: true });
    const bar = layoutPanels(DEFS, toggleFold(stacked, "outline"), { width: 2000, height: 600 });
    expect(bar.items.get("outline")).toMatchObject({ kind: "bar", folded: "hand" });
    expect(bar.items.get("outline")!.rect.height).toBe(DEFAULT_PANELS_OPTIONS.bar);
    expect(bar.items.get("files")!.rect.height).toBe(600 - DEFAULT_PANELS_OPTIONS.bar);
    // Chrome sizes are options.
    const big = layoutPanels(DEFS, toggleFold(stacked, "outline"), { width: 2000, height: 600 }, { bar: 40, rail: 50 });
    expect(big.items.get("outline")!.rect.height).toBe(40);
    const all = layoutPanels(DEFS, ["files", "outline", "notes"].reduce(toggleFold, desk()), { width: 2000, height: 600 }, { rail: 50 });
    expect(all.rails.left!.rect.width).toBe(50);
    expect(all.rails.left!.segments.map((x) => x.id)).toEqual(["files", "outline", "notes"]);
    expect(all.pages.x).toBe(50);
  });
});

describe("give-way", () => {
  // Two columns; Files opened first but used last, Notes opened second and used before Files.
  const pair = (): PanelsState => ({ ...createPanels(DEFS, { left: [["files"]], right: [["notes"]] }), clock: { files: { opened: 1, used: 4 }, notes: { opened: 2, used: 3 } } });
  const STAGE = { width: 220 + 260 + 320 - 120, height: 500 };
  const folds = (s: PanelsState, giveWay: (typeof DEFAULT_PANELS_OPTIONS)["giveWay"]): string[] =>
    layoutPanels(DEFS, s, STAGE, { giveWay })
      .notes.filter((n) => n.code === "column-folded" || n.code === "kept-folded")
      .flatMap((n) => ("items" in n ? n.items : []));

  it("folds by each order and by", () => {
    expect(folds(pair(), { order: "oldest", by: "used" })).toEqual(["notes"]);
    expect(folds(pair(), { order: "oldest", by: "opened" })).toEqual(["files"]);
    expect(folds(pair(), { order: "newest", by: "used" })).toEqual(["files"]);
    expect(folds(pair(), { order: "newest", by: "opened" })).toEqual(["notes"]);
  });

  it("shrinks the policy's first candidate first", () => {
    const l = layoutPanels(DEFS, pair(), { width: 220 + 260 + 320 - 20, height: 500 });
    expect(l.notes).toEqual([{ code: "column-shrunk", side: "right", column: 0, items: ["notes"], from: 260, to: 240 }]);
  });

  it("takes the newest panel of a column as its age", () => {
    const s = dock(pair(), "outline", "right", 0, { into: true }); // outline is now the newest used, in Notes' column
    expect(folds(s, { order: "oldest", by: "used" })).toEqual(["files"]);
  });

  it("breaks ties outer column first, then the left side", () => {
    const tie = (s: PanelsState): PanelsState => ({ ...s, clock: Object.fromEntries(Object.keys(s.clock).map((k) => [k, { opened: 1, used: 1 }])) });
    const two = tie(createPanels(DEFS, { left: [["files"], ["outline"]] }));
    const l = layoutPanels(DEFS, two, { width: 36 + 200 + 320 + 10, height: 400 });
    expect(l.notes.filter((n) => n.code === "column-folded")).toMatchObject([{ items: ["files"] }]);
    for (const order of ["oldest", "newest"] as const) expect(folds(tie(pair()), { order, by: "used" })).toEqual(["files"]);
  });

  it("skips kept columns in both orders, and pagesMin overrides kept", () => {
    const kept = keep(pair(), "notes", true);
    expect(folds(kept, { order: "oldest", by: "used" })).toEqual(["files"]);
    const kf = keep(pair(), "files", true);
    expect(folds(kf, { order: "newest", by: "used" })).toEqual(["notes"]);
    const both = keep(kept, "files", true);
    const l = layoutPanels(DEFS, both, STAGE);
    expect(codes(l)).toContain("kept-folded");
    expect(l.notes.find((n) => n.code === "kept-folded")).toMatchObject({ items: ["notes"] });
    expect(l.pages.width).toBeGreaterThanOrEqual(320);
    // Kept columns shrink last too.
    const shrink = layoutPanels(DEFS, kept, { width: 220 + 260 + 320 - 20, height: 500 });
    expect(shrink.notes).toMatchObject([{ code: "column-shrunk", items: ["files"] }]);
  });

  it("drops kept when a panel floats or closes", () => {
    const s = keep(pair(), "notes", true);
    expect(float(s, "notes", { x: 0, y: 0, width: 300, height: 200 }).kept).toEqual([]);
    expect(close(s, "notes").kept).toEqual([]);
    expect(keep(float(pair(), "notes", { x: 0, y: 0, width: 300, height: 200 }), "notes", true).kept).toEqual([]);
  });

  it("restores what it folded when the stage widens again", () => {
    const s = desk();
    const narrow = layoutPanels(DEFS, s, { width: 800, height: 500 });
    const auto = narrow.columns.filter((c) => c.folded === "auto");
    expect(auto.length).toBeGreaterThan(0);
    expect(s.folded).toEqual([]);
    const wide = layoutPanels(DEFS, s, { width: 2200, height: 500 });
    expect(wide.columns.every((c) => c.folded === null && !c.shrunk)).toBe(true);
    expect(Object.keys(wide.rails)).toEqual([]);
  });
});

describe("floats", () => {
  const VIEW = { width: 1200, height: 700 };
  const at = (s: PanelsState, id: string, size = VIEW, o = {}) => layoutPanels(DEFS, s, size, o).items.get(id)!;

  it("clamps a float into the view, and the stored rect brings it back", () => {
    const s = createPanels(DEFS, { floats: [{ id: "history", x: 1000, y: 500 }] });
    const small = at(s, "history");
    expect(small.rect).toMatchObject({ x: 1200 - 280, y: 700 - 300, width: 280, height: 300 });
    expect(small.clamped).toBe(true);
    // The viewport shrinks: the size clamps to the view, down to its minimum.
    const tiny = at(s, "history", { width: 250, height: 200 });
    expect(tiny.rect).toMatchObject({ x: 0, y: 0, width: 250, height: 200 });
    // And grows back: where it was stored.
    expect(at(s, "history", { width: 1600, height: 900 }).rect).toEqual({ x: 1000, y: 500, width: 280, height: 300 });
    expect(s.floats[0]!.rect).toEqual({ x: 1000, y: 500, width: 280, height: 300 });
  });

  it("keeps the title bar and floatVisible px of a float bigger than the view", () => {
    const far = createPanels(DEFS, { floats: [{ id: "preview", x: 900, y: 600 }] });
    const l = layoutPanels(DEFS, far, { width: 250, height: 150 });
    const r = l.items.get("preview")!.rect;
    expect([r.width, r.height]).toEqual([300, 200]);
    expect(r.x).toBe(250 - 48);
    expect(r.y).toBe(150 - DEFAULT_PANELS_OPTIONS.bar);
    expect(codes(l)).toEqual(["pages-under-min", "float-resized", "float-clamped"]);
    const left = createPanels(DEFS, { floats: [{ id: "preview", x: -900, y: -50 }] });
    const q = at(left, "preview", { width: 250, height: 150 }, { floatVisible: 60 }).rect;
    expect([q.x, q.y]).toEqual([60 - 300, 0]);
  });

  it("leaves floats alone when free", () => {
    const s = createPanels(DEFS, { floats: [{ id: "history", x: 3000, y: -400 }] });
    const p = at(s, "history", VIEW, { floats: "free" });
    expect(p.rect).toEqual({ x: 3000, y: -400, width: 280, height: 300 });
    expect(p.clamped).toBeUndefined();
  });

  it("moves an unpinned float with the page, never a pinned one", () => {
    const s = createPanels(DEFS, { floats: [{ id: "history", x: 100, y: 100 }, { id: "preview", x: 40, y: 380, pinned: true }] });
    const view = { x: -60, y: -30, scale: 1.5 };
    const l = layoutPanels(DEFS, s, VIEW, { view });
    expect(l.items.get("history")!.rect).toMatchObject({ x: -60 + 150, y: -30 + 150, width: 280, height: 300 });
    expect(l.items.get("preview")!.rect).toMatchObject({ x: 40, y: 380 });
    expect(l.items.get("preview")!.pinned).toBe(true);
    // Pinning converts, so it doesn't jump.
    const pinned = pin(s, "history", true, view);
    expect(layoutPanels(DEFS, pinned, VIEW, { view: { x: 0, y: 0, scale: 1 } }).items.get("history")!.rect).toMatchObject({ x: 90, y: 120 });
    expect(pin(pinned, "history", false, view).floats[0]!.rect).toMatchObject({ x: 100, y: 100 });
  });
});

describe("changes", () => {
  it("open, close, focus and fold move the clock", () => {
    let s = desk();
    const t = Math.max(...Object.values(s.clock).map((c) => c.used));
    s = focus(s, "files");
    expect(s.clock.files!.used).toBe(t + 1);
    s = close(s, "files");
    expect(layoutPanels(DEFS, s, { width: 2000, height: 500 }).items.has("files")).toBe(false);
    s = open(s, "files");
    expect(s.clock.files).toEqual({ opened: t + 2, used: t + 2 });
    expect(whereIs(s, "files")).toEqual({ kind: "column", side: "left", index: 0 });
    s = toggleFold(s, "files");
    expect(s.folded).toEqual(["files"]);
    s = toggleFold(s, "files");
    expect(s.clock.files!.used).toBe(t + 3);
    const lone = open(createPanels(DEFS, {}), "notes", { side: "right", width: 300 });
    expect(lone.sides.right).toEqual([{ panels: ["notes"], width: 300 }]);
    expect(resizeColumn(desk(), "left", 1, 280).sides.left[1]!.width).toBe(280);
  });
});

describe("targets", () => {
  const STAGE = { width: 1600, height: 700 };
  const input = (id: string, state = desk(), more = {}) => ({ defs: DEFS, state, id, stage: STAGE, ...more });

  it("offers the places a panel may take, in reading order", () => {
    const ts = panelTargets(input("outline"));
    // Lifted out, the left side is Files | Notes: the line between them (column:left:1) is Outline's own place.
    expect(ts.map((t) => t.id)).toEqual(["rail:left", "column:left:0", "into:left:0", "into:left:1", "column:left:2", "column:right:2", "into:right:1", "column:right:1", "into:right:0", "column:right:0", "rail:right", "float"]);
    expect(ts.find((t) => t.id === "float")).toMatchObject({ priority: 3, free: true });
    expect(ts.find((t) => t.id === "rail:left")!.priority).toBe(1);
    // Its own place (a column of its own between Files and Notes) is no target.
    expect(ts.some((t) => samePlace(t.make({ x: 0, y: 0 }, { x: 0, y: 0 }), desk()))).toBe(false);
  });

  it("filters out what a panel may not take", () => {
    const inspector = panelTargets(input("inspector"));
    expect(inspector.some((t) => t.id.includes("left"))).toBe(false);
    expect(panelTargets(input("search")).some((t) => t.id === "float")).toBe(false);
    const noRails = panelTargets(input("files", desk(), { allows: (_id: string, p: { kind: string }) => p.kind !== "rail" }));
    expect(noRails.some((t) => t.place.kind === "rail")).toBe(false);
  });

  it("drops where it showed, with the panel's own width", () => {
    const s = resizeColumn(desk(), "left", 1, 290); // Outline's column is 290 wide
    const inp = input("outline", s);
    const ts = panelTargets(inp);
    const t = ts.find((x) => x.id === "column:right:0")!;
    const d = panelDrop(inp, t, { x: t.hit.x + t.hit.width / 2, y: 300 }, { x: 20, y: 10 });
    expect(d.slot.width).toBe(290);
    expect(d.layout.items.get("outline")).toMatchObject({ kind: "column", side: "right", column: 0 });
    expect(d.slot).toEqual(d.layout.items.get("outline")!.rect);
    const into = ts.find((x) => x.id === "into:left:0")!;
    const di = panelDrop(inp, into, { x: 100, y: 300 }, { x: 0, y: 0 });
    expect(di.state.sides.left[0]!.panels).toEqual(["files", "outline"]);
    const rail = panelDrop(inp, ts.find((x) => x.id === "rail:right")!, { x: 1590, y: 20 }, { x: 0, y: 0 });
    expect([rail.hidden, rail.layout.items.get("outline")!.kind]).toEqual([true, "segment"]);
    const fl = ts.find((x) => x.id === "float")!;
    const f = panelDrop(inp, fl, { x: 700, y: 300 }, { x: 30, y: 12 });
    expect([f.slot.x, f.slot.y, f.free, f.key]).toEqual([670, 288, true, "float:670,288"]);
    // Let go past the view's edge: stored where the clamp shows it.
    const edge = panelDrop(inp, fl, { x: 1590, y: 690 }, { x: 0, y: 0 });
    expect(edge.state.floats.at(-1)!.rect).toEqual(edge.slot);
    expect(edge.slot.x + edge.slot.width).toBe(1600);
    const freeInput = { ...inp, options: { floats: "free" as const } };
    const freeFloat = panelTargets(freeInput).find((x) => x.id === "float")!;
    const free = panelDrop(freeInput, freeFloat, { x: 1590, y: 690 }, { x: 0, y: 0 });
    expect(free.slot).toMatchObject({ x: 1590, y: 690 });
  });

  it("gives keyboard stops in reading order, with home", () => {
    const s = desk();
    const ts = panelTargets(input("outline", s));
    const stops = keyboardStops(ts, { home: { place: homePlace(s, "outline")!, state: s } });
    expect(stops.map((x) => x.id)).toEqual(["rail:left", "column:left:0", "into:left:0", "home", "into:left:1", "column:left:2", "column:right:2", "into:right:1", "column:right:1", "into:right:0", "column:right:0", "rail:right"]);
    const floats = keyboardStops(ts, { floats: { at: { x: 600, y: 200 } } });
    expect(floats.at(-1)!.place.kind).toBe("float");
    expect(floats.at(-1)!.state.floats.at(-1)).toMatchObject({ id: "outline", rect: { x: 600, y: 200 } });
  });
});

const samePlace = (a: PanelsState, b: PanelsState): boolean => JSON.stringify(storePanels({ ...a, clock: {} })) === JSON.stringify(storePanels({ ...b, clock: {} }));

describe("store and read", () => {
  it("round-trips, kept and pinned included", () => {
    const s = keep(toggleFold(close(desk(), "search"), "notes"), "files", true);
    const r = readPanels(JSON.parse(JSON.stringify(storePanels(s))), DEFS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.dropped).toEqual([]);
    expect(storePanels(r.state)).toEqual(storePanels(s));
    expect(r.state.kept).toEqual(["files"]);
    expect(r.state.floats[1]!.pinned).toBe(true);
  });

  it("drops unknown ids and clamps to the defs", () => {
    const data = {
      v: 1,
      sides: { left: [{ panels: ["files", "ghost"], width: 9999 }, { panels: ["ghost2"], width: 100 }], right: [{ panels: ["files"], width: 300 }] },
      floats: [{ id: "history", rect: { x: 1, y: 2, width: 10, height: 10 } }, { id: "nope", rect: {} }],
      folded: ["ghost", "files"],
      kept: ["history"],
      closed: 5,
      clock: { files: { opened: 3, used: "x" } },
    };
    const r = readPanels(data, DEFS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.sides).toEqual({ left: [{ panels: ["files"], width: 360 }], right: [] });
    expect(r.state.floats).toEqual([{ id: "history", rect: { x: 1, y: 2, width: 220, height: 160 } }]);
    expect(r.state.folded).toEqual(["files"]);
    expect(r.state.kept).toEqual([]);
    expect(r.state.clock.files).toEqual({ opened: 0, used: 0 });
    expect(r.dropped).toEqual(expect.arrayContaining(["ghost", "ghost2", "files", "nope", "closed", "history"]));
  });

  it("never throws on bad data", () => {
    const circular: Record<string, unknown> = { v: 1 };
    circular.sides = circular;
    const hostile = { v: 1, get sides(): never { throw new Error("no"); } };
    for (const bad of [null, undefined, 3, "x", [], { v: 2 }, { v: 1n }, { v: 1 }, { v: 1, sides: [] }, { v: 1, sides: { left: "x", right: [null, 1, { panels: 3 }] } }, circular, hostile]) {
      expect(() => readPanels(bad, DEFS)).not.toThrow();
    }
    expect(readPanels({ v: 9 })).toEqual({ ok: false, error: "unknown version 9 (this reads version 1)" });
    expect(readPanels({ v: 1, sides: { left: "x" } }).ok).toBe(true);
    expect(readPanels(hostile).ok).toBe(false);
  });
});
