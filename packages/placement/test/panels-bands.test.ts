/** @n-uf/placement/panels: edge bands (top and bottom docks) and the reserved room along the pages' edges. */
import { describe, expect, it } from "vitest";
import { overlap, type Rect } from "../src/geometry";
import {
  BAND_SIZE,
  close,
  createPanels,
  dock,
  dockBand,
  float,
  homePlace,
  keep,
  layoutPanels,
  liftPanel,
  open,
  panelDrop,
  panelTargets,
  readPanels,
  resizeBand,
  samePlaces,
  storePanels,
  toggleFold,
  whereIs,
  type BandOption,
  type PanelDef,
  type PanelsLayout,
  type PanelsOptions,
  type PanelsState,
} from "../src/panels";
import { keyboardStops } from "../src/targets";

const w = (min: number, natural: number, max: number) => ({ min, natural, max });
const DEFS: PanelDef[] = [
  { id: "files", width: w(180, 220, 360) },
  { id: "outline", width: w(160, 200, 320), height: { min: 80, natural: 160 } },
  { id: "notes", width: w(200, 260, 420) },
  { id: "inspector", width: w(220, 280, 400), sides: ["right"] },
  { id: "history", width: w(200, 240, 360), band: { min: 100, max: 400, natural: 180 } },
  { id: "comments", width: w(180, 220, 320), band: { min: 140, max: 300, natural: 220 } },
  { id: "navigator", width: w(160, 180, 280), sides: ["left", "right", "top"], float: { min: { width: 160, height: 120 }, natural: { width: 180, height: 140 } } },
];
const STAGE = { width: 1400, height: 800 };

/** The sample desk: two left columns, one right, History in the bottom band, Navigator in the top band. */
const desk = (): PanelsState => createPanels(DEFS, { left: [["files", "outline"], ["notes"]], right: [["inspector"]], top: ["navigator"], bottom: ["history"] });

const MODES: BandOption["mode"][] = ["reserved", "overlay"];
const SPANS: BandOption["span"][] = ["between", "full"];
const both = (mode: BandOption["mode"], span: BandOption["span"]): Partial<PanelsOptions> => ({ bands: { top: { mode, span }, bottom: { mode, span } } });
const codes = (l: PanelsLayout): string[] => l.notes.map((n) => n.code);
const E = 1e-6;
const inside = (r: Rect, W: number, H: number): boolean => r.x >= -E && r.y >= -E && r.x + r.width <= W + E && r.y + r.height <= H + E;

/** The rects that must never overlap: open columns, rails, reserved bands, the reserves, and the pages. */
function solid(l: PanelsLayout): [string, Rect][] {
  const out: [string, Rect][] = [];
  for (const c of l.columns) if (c.folded === null && c.rides === undefined) out.push([`column ${c.side}:${c.index}`, c.rect]);
  for (const r of Object.values(l.rails)) out.push([`rail ${r!.side}`, r!.rect]);
  for (const b of Object.values(l.bands)) if (b!.mode === "reserved") out.push([`band ${b!.edge}`, b!.rect]);
  for (const [k, r] of Object.entries(l.reserved)) out.push([`reserve ${k}`, r!]);
  out.push(["pages", l.pages]);
  return out.filter(([, r]) => r.width > E && r.height > E);
}

describe("bands: layout", () => {
  it("keeps its invariants with every mode and span, at many stage sizes", () => {
    const states = [desk(), keep(desk(), "history", true), toggleFold(desk(), "history"), dockBand(desk(), "comments", "bottom", 0, DEFS), toggleFold(desk(), "notes")];
    const reserves = [{}, { top: 40, bottom: 32, left: 24, right: 16 }];
    let n = 0;
    for (const mode of MODES) {
      for (const span of SPANS) {
        for (const reserve of reserves) {
          for (const s of states) {
            for (let W = 2 * 36 + 320 + 40; W <= 2000; W += 89) {
              for (const H of [160, 300, 480, 620, 900]) {
                const opt = { ...both(mode, span), reserve };
                const l = layoutPanels(DEFS, s, { width: W, height: H }, opt);
                const rs = solid(l);
                for (let i = 0; i < rs.length; i++) {
                  expect(inside(rs[i]![1], W, H), `${rs[i]![0]} inside ${W}×${H}`).toBe(true);
                  for (let j = i + 1; j < rs.length; j++) expect(overlap(rs[i]![1], rs[j]![1]), `${rs[i]![0]} vs ${rs[j]![0]} at ${W}×${H} ${mode} ${span}`).toBeLessThan(E);
                }
                // Overlay bands lie over the pages only: never over a column, a rail or a reserve.
                for (const b of Object.values(l.bands)) {
                  expect(inside(b!.rect, W, H)).toBe(true);
                  if (b!.mode !== "overlay") continue;
                  for (const [k, r] of rs) if (k !== "pages") expect(overlap(b!.rect, r), `overlay ${b!.edge} vs ${k}`).toBeLessThan(E);
                }
                // A band's panels tile it, left to right, side by side.
                for (const b of Object.values(l.bands)) {
                  const ps = b!.panels.map((id) => l.items.get(id)!.rect);
                  expect(ps.reduce((a, r) => a + r.width, 0)).toBeCloseTo(b!.rect.width, 6);
                  ps.forEach((r, i) => {
                    expect(r.height).toBeCloseTo(b!.rect.height, 6);
                    expect(r.y).toBeCloseTo(b!.rect.y, 6);
                    if (i > 0) expect(r.x).toBeCloseTo(ps[i - 1]!.x + ps[i - 1]!.width, 6);
                  });
                }
                // A between band spans the pages' width (before the side reserves); a full one the stage.
                for (const b of Object.values(l.bands)) {
                  if (b!.span === "full") expect([b!.rect.x, b!.rect.width]).toEqual([0, W]);
                  else expect(b!.rect.x).toBeCloseTo(l.pages.x - ((reserve as { left?: number }).left ?? 0), 6);
                }
                expect(l.pages.width).toBeGreaterThanOrEqual(Math.min(320, W) - 1e-9 - (l.notes.some((x) => x.code === "pages-under-min") ? 1e9 : 0));
                n++;
              }
            }
          }
        }
      }
    }
    expect(n).toBeGreaterThan(3000);
  });

  it("a band's height is its stored height clamped to its panels' limits; its panels share its width", () => {
    const s = dockBand(desk(), "comments", "bottom", 1, DEFS);
    // History (100–400) and Comments (140–300): 140–300; stored 180.
    const l = layoutPanels(DEFS, resizeBand(s, "bottom", 999), STAGE, both("reserved", "between"));
    const b = l.bands.bottom!;
    expect([b.min, b.max, b.height, b.rect.height]).toEqual([140, 300, 300, 300]);
    expect(b.panels).toEqual(["history", "comments"]);
    const [h, c] = [l.items.get("history")!, l.items.get("comments")!];
    expect([h.kind, h.edge, h.index, c.index]).toEqual(["band", "bottom", 0, 1]);
    expect(h.rect.width).toBeCloseTo(c.rect.width, 6);
    expect(c.rect.x).toBeCloseTo(h.rect.x + h.rect.width, 6);
  });

  it("reserved shortens the pages; overlay lies over them (layer 5) and keeps the pages' rect", () => {
    const none = layoutPanels(DEFS, liftPanel(liftPanel(desk(), "history"), "navigator"), STAGE, both("reserved", "between"));
    const res = layoutPanels(DEFS, desk(), STAGE, both("reserved", "between"));
    const ov = layoutPanels(DEFS, desk(), STAGE, both("overlay", "between"));
    expect(res.pages.height).toBe(STAGE.height - 180 - BAND_SIZE.natural);
    expect(res.pages.y).toBe(BAND_SIZE.natural);
    expect(ov.pages).toEqual(none.pages);
    expect([res.items.get("history")!.layer, ov.items.get("history")!.layer]).toEqual([0, 5]);
    expect(overlap(ov.bands.bottom!.rect, ov.pages)).toBeGreaterThan(0);
  });

  it("full span shortens the columns and rails; between runs between the innermost columns", () => {
    const full = layoutPanels(DEFS, desk(), STAGE, both("reserved", "full"));
    const between = layoutPanels(DEFS, desk(), STAGE, both("reserved", "between"));
    const files = full.items.get("files")!.rect;
    expect(files.y).toBe(BAND_SIZE.natural);
    expect(full.columns[0]!.rect.height).toBe(STAGE.height - 200 - 180);
    expect(between.columns[0]!.rect).toMatchObject({ y: 0, height: STAGE.height });
    const inner = between.columns.find((c) => c.side === "left" && c.index === 1)!.rect;
    expect(between.bands.bottom!.rect.x).toBe(inner.x + inner.width);
    expect(between.bands.bottom!.rect.x + between.bands.bottom!.rect.width).toBe(between.columns.find((c) => c.side === "right")!.rect.x);
    // With a rail and no open column on a side, a between band starts at the rail.
    const railed = layoutPanels(DEFS, toggleFold(desk(), "inspector"), STAGE, both("reserved", "between"));
    expect(railed.bands.bottom!.rect.x + railed.bands.bottom!.rect.width).toBe(STAGE.width - 36);
    // Full span: the rails stand on the band too.
    const fr = layoutPanels(DEFS, toggleFold(desk(), "inspector"), STAGE, both("reserved", "full"));
    expect(fr.rails.right!.rect).toMatchObject({ y: 200, height: STAGE.height - 380 });
    expect(fr.items.get("inspector")!.rect.y).toBe(200 + 4);
  });

  it("height give-way: bands shrink to their min, then fold to a bar; a taller stage brings them back", () => {
    const opt = both("reserved", "between");
    // Room for the pages: 240. Bands natural 200 (top) + 180 (bottom) = 380 → 620 needed.
    expect(codes(layoutPanels(DEFS, desk(), { width: 1400, height: 620 }, opt))).toEqual([]);
    const shrunk = layoutPanels(DEFS, desk(), { width: 1400, height: 560 }, opt);
    // The older used (Navigator is the top band: older than History) shrinks first.
    expect(shrunk.notes).toEqual([{ code: "band-shrunk", edge: "top", items: ["navigator"], from: 200, to: 140 }]);
    expect(shrunk.pages.height).toBe(240);
    expect(shrunk.bands.top!.shrunk).toBe(true);
    // 440: top at its min (120) leaves 80 short: top folds (28), bottom keeps 172.
    const folded = layoutPanels(DEFS, desk(), { width: 1400, height: 440 }, opt);
    expect(codes(folded)).toEqual(["band-shrunk", "band-folded"]);
    expect(folded.bands.top!.folded).toBe("auto");
    expect(folded.items.get("navigator")!).toMatchObject({ kind: "bar", folded: "auto", rect: { height: 28 } });
    expect(folded.bands.bottom!.rect.height).toBe(440 - 240 - 28);
    // Both folded and still short: pages-short.
    const short = layoutPanels(DEFS, desk(), { width: 1400, height: 200 }, opt);
    expect(short.notes.filter((x) => x.code === "band-folded").length).toBe(2);
    expect(short.notes.at(-1)).toEqual({ code: "pages-short", height: 200 - 56, min: 240 });
    // Give-way never writes folded: taller, both are back.
    expect(layoutPanels(DEFS, desk(), { width: 1400, height: 900 }, opt).bands.top!.folded).toBeNull();
  });

  it("ties go bottom first; a kept band gives way last, with kept-folded and its edge", () => {
    const tie = { ...desk(), clock: { ...desk().clock, navigator: { opened: 1, used: 1 }, history: { opened: 1, used: 1 } } };
    const opt = { ...both("reserved", "between"), pagesMinHeight: 500 };
    expect(layoutPanels(DEFS, tie, STAGE, opt).notes).toEqual([{ code: "band-shrunk", edge: "bottom", items: ["history"], from: 180, to: 100 }]);
    const k = keep(desk(), "navigator", true);
    const l = layoutPanels(DEFS, k, { width: 1400, height: 300 }, both("reserved", "between"));
    expect(l.notes.filter((x) => x.code.endsWith("folded")).map((x) => [x.code, "edge" in x ? x.edge : ""])).toEqual([
      ["band-folded", "bottom"],
      ["kept-folded", "top"],
    ]);
    expect(l.bands.top!.kept).toBe(true);
  });

  it("overlay bands give way until they leave pagesMinHeight of the pages uncovered; the pages keep their rect", () => {
    // 620: 200 + 180 cover the pages, 240 left: nothing gives way.
    const tall = layoutPanels(DEFS, desk(), { width: 1400, height: 620 }, both("overlay", "between"));
    expect([codes(tall), tall.pages.height]).toEqual([[], 620]);
    // 600: 360 may be covered; the older (top) band lowers by 20.
    const l = layoutPanels(DEFS, desk(), { width: 1400, height: 600 }, both("overlay", "between"));
    expect(l.notes).toEqual([{ code: "band-shrunk", edge: "top", items: ["navigator"], from: 200, to: 180 }]);
    expect(l.pages.height).toBe(600);
    // Together, never meeting: at 440 the top folds and the bottom lowers to what is left.
    const short = layoutPanels(DEFS, desk(), { width: 1400, height: 440 }, both("overlay", "between"));
    expect(short.bands.top!.folded).toBe("auto");
    expect(short.bands.bottom!.rect.height).toBe(440 - 240 - 28);
    expect(overlap(short.bands.top!.rect, short.bands.bottom!.rect)).toBe(0);
    expect(codes(short)).not.toContain("pages-short");
  });

  it("mixed modes: reserved bands budget against the pages, an overlay band against what they leave", () => {
    const defs: PanelDef[] = [
      { id: "files", width: w(180, 220, 360) },
      { id: "e", width: w(200, 240, 360), band: { min: 60, max: 250, natural: 100 } },
      { id: "f", width: w(180, 220, 320), band: { min: 150, max: 500, natural: 300 } },
    ];
    const s = createPanels(defs, { left: [["files"]], top: ["e"], bottom: ["f"] });
    const opt: Partial<PanelsOptions> = { bands: { top: { mode: "reserved", span: "between" }, bottom: { mode: "overlay", span: "between" } } };
    // 450: the reserved top band fits (100 + 240); the overlay may cover 350 − 240 = 110, under its min: it folds.
    const l = layoutPanels(defs, s, { width: 1200, height: 450 }, opt);
    expect([l.bands.top!.rect.height, l.bands.top!.shrunk, l.pages.height]).toEqual([100, false, 350]);
    expect(l.bands.bottom!).toMatchObject({ folded: "auto", rect: { height: 28 } });
    expect(codes(l)).toEqual(["band-folded"]);
    // 600: the overlay may cover 260: it shrinks to that; the top band is untouched.
    const m = layoutPanels(defs, s, { width: 1200, height: 600 }, opt);
    expect([m.bands.top!.rect.height, m.bands.bottom!.rect.height, m.pages.height]).toEqual([100, 260, 500]);
    // pages-short measures the pages' rect: an overlay band never makes it.
    // 200: both fold; the pages are 200 − 28 tall (the folded overlay doesn't count).
    expect(codes(layoutPanels(defs, s, { width: 1200, height: 200 }, opt))).toEqual(["band-folded", "band-folded", "pages-short"]);
    expect(layoutPanels(defs, s, { width: 1200, height: 200 }, opt).notes.at(-1)).toEqual({ code: "pages-short", height: 172, min: 240 });
  });

  it("options passed as undefined fall back to the defaults", () => {
    const o = { bands: undefined, reserve: undefined, pagesMinHeight: undefined } as unknown as Partial<PanelsOptions>;
    const a = layoutPanels(DEFS, desk(), STAGE, o);
    expect([a.items, a.pages, a.notes]).toEqual([layoutPanels(DEFS, desk(), STAGE).items, layoutPanels(DEFS, desk(), STAGE).pages, layoutPanels(DEFS, desk(), STAGE).notes]);
    expect(() => panelTargets({ defs: DEFS, state: desk(), id: "files", stage: STAGE, options: o })).not.toThrow();
  });

  it("a hand fold folds the whole band to one bar; unfolding brings it all back", () => {
    const s = toggleFold(dockBand(desk(), "comments", "bottom", 9, DEFS), "comments");
    expect([...s.folded].sort()).toEqual(["comments", "history"]);
    const l = layoutPanels(DEFS, s, STAGE, both("reserved", "between"));
    expect(l.bands.bottom!).toMatchObject({ folded: "hand", rect: { height: 28, y: STAGE.height - 28 } });
    expect(["history", "comments"].map((id) => l.items.get(id)!.kind)).toEqual(["bar", "bar"]);
    const back = toggleFold(s, "history");
    expect(back.folded).toEqual([]);
    expect(back.clock.history!.used).toBeGreaterThan(s.clock.comments!.used);
    // Unfolded by give-way's rules, never written: a short stage folds it "auto".
    expect(layoutPanels(DEFS, back, { width: 1400, height: 300 }, both("reserved", "between")).bands.bottom!.folded).toBe("auto");
  });

  it("a band on an edge the options don't enable is left out, with band-off", () => {
    const l = layoutPanels(DEFS, desk(), STAGE, { bands: { top: { mode: "reserved", span: "between" } } });
    expect(l.items.has("history")).toBe(false);
    expect(l.bands.bottom).toBeUndefined();
    expect(l.notes).toContainEqual({ code: "band-off", edge: "bottom", items: ["history"] });
    expect(layoutPanels(DEFS, desk(), STAGE).notes.map((x) => x.code)).toEqual(["band-off", "band-off"]);
    // A closed band panel isn't shown; a band of closed panels isn't laid out.
    expect(layoutPanels(DEFS, close(desk(), "history"), STAGE, both("reserved", "between")).bands.bottom).toBeUndefined();
  });

  it("with no band options and no bands in the state nothing changes: no band notes, no bands, no reserves", () => {
    const s = createPanels(DEFS, { left: [["files"], ["outline"]], right: [["inspector"]] });
    for (const H of [100, 240, 800]) {
      const a = layoutPanels(DEFS, s, { width: 1200, height: H });
      const b = layoutPanels(DEFS, s, { width: 1200, height: H }, both("overlay", "full"));
      expect([a.bands, a.reserved]).toEqual([{}, {}]);
      expect([b.items, b.columns, b.rails, b.notes, b.pages]).toEqual([a.items, a.columns, a.rails, a.notes, a.pages]);
    }
  });
});

describe("reserved room", () => {
  it("comes off the pages' edges, inside the pages' area; pagesMin counts after it", () => {
    const s = createPanels(DEFS, { left: [["files"]], right: [["inspector"]] });
    const l = layoutPanels(DEFS, s, { width: 1200, height: 700 }, { reserve: { top: 40, bottom: 30, left: 20, right: 10 } });
    const area = { x: 220, w: 1200 - 220 - 280 };
    expect(l.reserved).toEqual({
      top: { x: area.x, y: 0, width: area.w, height: 40 },
      bottom: { x: area.x, y: 670, width: area.w, height: 30 },
      left: { x: area.x, y: 40, width: 20, height: 630 },
      right: { x: area.x + area.w - 10, y: 40, width: 10, height: 630 },
    });
    expect(l.pages).toEqual({ x: area.x + 20, y: 40, width: area.w - 30, height: 630 });
    // pagesMin after the side reserves: the columns give way 30 px sooner.
    const tight = layoutPanels(DEFS, s, { width: 220 + 280 + 320 + 20, height: 700 }, { reserve: { left: 20, right: 10 } });
    expect(tight.notes[0]).toMatchObject({ code: "column-shrunk" });
    expect(tight.pages.width).toBeGreaterThanOrEqual(320);
    // pagesMinHeight after the top and bottom reserves: a short stage says so.
    expect(layoutPanels(DEFS, s, { width: 1200, height: 300 }, { reserve: { top: 40, bottom: 30 } }).notes).toEqual([{ code: "pages-short", height: 230, min: 240 }]);
  });

  it("an overlay band lies inside the reserve, never over it; a reserved band outside it", () => {
    const reserve = { top: 40, bottom: 30, left: 20 };
    for (const span of SPANS) {
      const ov = layoutPanels(DEFS, desk(), STAGE, { ...both("overlay", span), reserve });
      expect(ov.bands.top!.rect.y).toBe(40);
      expect(ov.bands.bottom!.rect.y + ov.bands.bottom!.rect.height).toBe(STAGE.height - 30);
      expect(ov.reserved.top!.y).toBe(0);
      expect(ov.reserved.left!.y).toBe(40 + 200);
      for (const r of Object.values(ov.reserved)) for (const b of Object.values(ov.bands)) expect(overlap(r!, b!.rect)).toBe(0);
      const re = layoutPanels(DEFS, desk(), STAGE, { ...both("reserved", span), reserve });
      expect(re.reserved.top!.y).toBe(200);
      expect(re.reserved.bottom!.y + 30).toBe(STAGE.height - 180);
    }
  });
});

describe("bands: the model", () => {
  it("createPanels starts bands at their natural height; the clock counts left, right, top, bottom, floats", () => {
    const s = createPanels(DEFS, { left: [["files"]], top: ["navigator"], bottom: ["history", "comments"], floats: [{ id: "notes", x: 0, y: 0 }] });
    expect(s.bands).toEqual({ top: { panels: ["navigator"], height: 200 }, bottom: { panels: ["history", "comments"], height: 220 } });
    expect(["files", "navigator", "history", "comments", "notes"].map((id) => s.clock[id]!.used)).toEqual([1, 2, 3, 4, 5]);
    expect(createPanels(DEFS, { left: [["files"]] })).not.toHaveProperty("bands");
  });

  it("dockBand puts a panel at an index, lifts it from where it was; an emptied band goes", () => {
    const s = dockBand(desk(), "files", "bottom", 0, DEFS);
    expect(s.bands!.bottom!.panels).toEqual(["files", "history"]);
    expect(whereIs(s, "files")).toEqual({ kind: "band", edge: "bottom", index: 0 });
    expect(s.sides.left[0]!.panels).toEqual(["outline"]);
    const t = dockBand(s, "navigator", "bottom", 99, DEFS);
    expect(t.bands).toEqual({ bottom: { panels: ["files", "history", "navigator"], height: 180 } });
    // Out of the band to a side and to a float; the last one out takes the band with it.
    const u = float(dock(dock(t, "files", "left", 0, { width: 220 }), "history", "right", 9), "navigator", { x: 0, y: 0, width: 180, height: 140 });
    expect(u).not.toHaveProperty("bands");
    expect(whereIs(u, "history")).toMatchObject({ kind: "column", side: "right" });
    // A new band takes the panel's natural band height.
    expect(dockBand(u, "comments", "top", 0, DEFS).bands!.top!.height).toBe(220);
    expect(dockBand(u, "comments", "top", 0).bands!.top!.height).toBe(BAND_SIZE.natural);
  });

  it("keeps whether it is kept; open places a panel at an edge; keep works on band panels", () => {
    const s = keep(desk(), "files", true);
    expect(dockBand(s, "files", "bottom", 0, DEFS).kept).toContain("files");
    expect(keep(desk(), "history", true).kept).toEqual(["history"]);
    const nowhere = liftPanel(desk(), "comments");
    const o = open(nowhere, "comments", { edge: "bottom" });
    expect(o.bands!.bottom!.panels).toEqual(["history", "comments"]);
    expect(open(liftPanel(desk(), "navigator"), "navigator", { edge: "top", height: 150 }).bands!.top).toEqual({ panels: ["navigator"], height: 150 });
  });

  it("samePlaces compares bands (heights as laid out), homePlace names a band place", () => {
    const s = desk();
    expect(samePlaces(s, resizeBand(s, "bottom", 180))).toBe(true);
    expect(samePlaces(s, resizeBand(s, "bottom", 190))).toBe(false);
    expect(samePlaces(resizeBand(s, "bottom", 999), resizeBand(s, "bottom", 400), DEFS)).toBe(true);
    expect(samePlaces(s, dockBand(s, "comments", "bottom", 1, DEFS))).toBe(false);
    expect(homePlace(s, "history")).toEqual({ kind: "band", edge: "bottom", index: 0 });
  });
});

describe("bands: targets and drops", () => {
  const opt = both("reserved", "between");
  const input = (state: PanelsState, id: string, options: Partial<PanelsOptions> = opt) => ({ defs: DEFS, state, id, stage: STAGE, options });

  it("a band offers a slot at each end and between its panels; its own place is no target", () => {
    const s = dockBand(desk(), "comments", "bottom", 1, DEFS);
    const ids = panelTargets(input(s, "files")).map((t) => t.id);
    expect(ids.filter((x) => x.startsWith("band:"))).toEqual(["band:top:0", "band:top:1", "band:bottom:0", "band:bottom:1", "band:bottom:2"]);
    const own = panelTargets(input(s, "history")).map((t) => t.id);
    expect(own.filter((x) => x.startsWith("band:bottom"))).toEqual(["band:bottom:1"]);
    // The slots cover the band, split at its panels' middles.
    const l = layoutPanels(DEFS, s, STAGE, opt);
    const hits = panelTargets(input(s, "files"))
      .filter((t) => t.id.startsWith("band:bottom"))
      .map((t) => t.hit);
    const lifted = layoutPanels(DEFS, liftPanel(s, "files"), STAGE, opt).bands.bottom!.rect;
    expect(hits.reduce((a, r) => a + r.width, 0)).toBeCloseTo(lifted.width, 6);
    expect(hits[0]!.x).toBe(lifted.x);
    expect(l.bands.bottom!.panels).toEqual(["history", "comments"]);
  });

  it("a drop into a band lands in the slot shown: the panel's share of the width, the band's height", () => {
    const s = desk();
    const t = panelTargets(input(s, "files")).find((x) => x.id === "band:bottom:1")!;
    expect(t.priority).toBe(2);
    const d = panelDrop(input(s, "files"), t, { x: 900, y: 700 }, { x: 0, y: 0 });
    expect(d.state.bands!.bottom!.panels).toEqual(["history", "files"]);
    const band = d.layout.bands.bottom!.rect;
    expect(d.slot).toEqual({ x: band.x + band.width / 2, y: band.y, width: band.width / 2, height: band.height });
    expect(d.hidden).toBe(false);
    // And out to a side again: a new column at its natural width.
    const out = panelTargets(input(d.state, "files")).find((x) => x.id === "column:left:0")!;
    const back = panelDrop(input(d.state, "files"), out, { x: 5, y: 300 }, { x: 0, y: 0 });
    expect(whereIs(back.state, "files")).toEqual({ kind: "column", side: "left", index: 0 });
    expect(back.slot.width).toBe(220);
    expect(back.state.bands!.bottom!.panels).toEqual(["history"]);
  });

  it("an empty enabled edge offers a 2 × bar strip inside the pages; a float dropped there starts a band", () => {
    const s = liftPanel(desk(), "navigator");
    const l = layoutPanels(DEFS, s, STAGE, opt);
    const fl = float(s, "files", { x: 600, y: 200, width: 220, height: 300 });
    const t = panelTargets(input(fl, "files")).find((x) => x.id === "band:top")!;
    expect(t.hit).toEqual({ x: l.pages.x, y: l.pages.y, width: l.pages.width, height: 56 });
    const d = panelDrop(input(fl, "files"), t, { x: 700, y: 10 }, { x: 0, y: 0 });
    expect(d.state.bands!.top).toEqual({ panels: ["files"], height: BAND_SIZE.natural });
    expect(d.state.floats.map((f) => f.id)).toEqual([]);
    expect(d.slot).toMatchObject({ y: 0, height: 200 });
    // With a reserve, the strip lies inside the pages, under it.
    const r = panelTargets(input(fl, "files", { ...opt, reserve: { top: 40 } })).find((x) => x.id === "band:top")!;
    expect(r.hit.y).toBe(40);
  });

  it("allows and the def's sides hold for bands; a disabled edge offers nothing", () => {
    const s = desk();
    // Inspector docks on the right only; Navigator names the top band but not the bottom.
    expect(panelTargets(input(s, "inspector")).some((t) => t.place.kind === "band")).toBe(false);
    expect(panelTargets(input(s, "navigator")).filter((t) => t.place.kind === "band").every((t) => t.place.kind === "band" && t.place.edge === "top")).toBe(true);
    expect(panelTargets(input(s, "files", {})).some((t) => t.place.kind === "band")).toBe(false);
    expect(panelTargets({ ...input(s, "files"), allows: (_id, p) => p.kind !== "band" }).some((t) => t.place.kind === "band")).toBe(false);
  });

  it("full span: the column targets stand on the band; the keyboard stops list the bands after the sides", () => {
    const o = both("reserved", "full");
    const ts = panelTargets(input(desk(), "notes", o));
    for (const t of ts.filter((x) => x.place.kind === "column" || x.place.kind === "rail")) {
      expect(t.hit.y).toBe(200);
      expect(t.hit.y + t.hit.height).toBe(STAGE.height - 180);
    }
    const stops = keyboardStops(ts, { home: { place: homePlace(desk(), "notes")!, state: desk() } });
    const kinds = stops.map((x) => (x.home ? "home" : x.place.kind));
    expect(kinds.lastIndexOf("rail")).toBeLessThan(kinds.indexOf("band"));
  });
});

describe("bands: the stored form", () => {
  it("round-trips bands; a state without them stores no bands field", () => {
    const s = keep(dockBand(desk(), "comments", "bottom", 0, DEFS), "comments", true);
    const data = JSON.parse(JSON.stringify(storePanels(s)));
    expect(data.bands).toEqual({ top: { panels: ["navigator"], height: 200 }, bottom: { panels: ["comments", "history"], height: 180 } });
    const r = readPanels(data, DEFS);
    expect(r.ok && r.dropped).toEqual([]);
    if (r.ok) {
      expect(samePlaces(r.state, s)).toBe(true);
      expect(layoutPanels(DEFS, r.state, STAGE, both("reserved", "between")).items).toEqual(layoutPanels(DEFS, s, STAGE, both("reserved", "between")).items);
    }
    expect(storePanels(createPanels(DEFS, { left: [["files"]] }))).not.toHaveProperty("bands");
  });

  it("bad band data is dropped and listed, never thrown", () => {
    const bad = {
      v: 1,
      sides: { left: [{ panels: ["files"], width: 220 }] },
      bands: { top: { panels: ["ghost", 7], height: 100 }, bottom: { panels: ["history", "files", "comments"], height: "tall" }, side: { panels: ["notes"], height: 1 } },
      clock: {},
    };
    const r = readPanels(bad, DEFS);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state).not.toHaveProperty("bands");
    expect(r.dropped).toEqual(expect.arrayContaining(["bands.side", "ghost", "a number where an id goes", "bands.top", "bands.bottom"]));
    const odd = readPanels({ v: 1, sides: {}, bands: { bottom: { panels: ["history", "history"], height: 9999, extra: 1 } } }, DEFS);
    expect(odd.ok && odd.state.bands).toEqual({ bottom: { panels: ["history"], height: 400 } });
    expect(odd.ok && odd.dropped).toEqual(expect.arrayContaining(["band.extra", "history"]));
    expect(readPanels({ v: 1, sides: {}, bands: [] }, DEFS)).toMatchObject({ ok: true, dropped: ["bands"] });
    expect(readPanels({ v: 1, sides: {}, bands: { top: null } })).toMatchObject({ ok: true, dropped: ["bands.top"] });
  });
});

describe("bands: desk presets", () => {
  const P_DEFS: PanelDef[] = DEFS.map((d) => (d.id === "history" ? { ...d, sides: ["left", "right", "bottom"] } : d));

  it("docks starts the bottom band with the last def that names it, or the hint's", async () => {
    const { PRESETS, presetLayout, presetTargets, presetDrop } = await import("../src/desk");
    const s = PRESETS.docks.start(P_DEFS);
    expect(s.bands).toEqual({ bottom: { panels: ["history"], height: 180 } });
    expect(whereIs(s, "history").kind).toBe("band");
    expect(PRESETS.docks.start(DEFS, { bottom: ["comments"] }).bands!.bottom!.panels).toEqual(["comments"]);
    // Without one, no band panel: the layout is the 26.11.9 one.
    expect(PRESETS.docks.start(DEFS)).not.toHaveProperty("bands");
    const l = presetLayout(PRESETS.docks, P_DEFS, s, STAGE);
    expect(l.bands.bottom).toMatchObject({ mode: "reserved", span: "between" });
    const full = presetLayout(PRESETS.docksFull, P_DEFS, PRESETS.docksFull.start(P_DEFS), STAGE);
    expect(full.bands.bottom!.rect).toMatchObject({ x: 0, width: STAGE.width });
    const tear = PRESETS.dockTear.start(P_DEFS);
    expect([tear.bands!.bottom!.panels, tear.floats.length]).toEqual([["history"], 1]);
    expect(PRESETS.navigator.start(P_DEFS)).not.toHaveProperty("bands");
    // The band's targets and drops go through the preset.
    const inp = { defs: P_DEFS, state: s, id: "files", stage: STAGE };
    const t = presetTargets(PRESETS.docks, inp).find((x) => x.id === "band:bottom:1")!;
    expect(presetDrop(PRESETS.docks, inp, t, { x: 900, y: 700 }, { x: 0, y: 0 }).state.bands!.bottom!.panels).toEqual(["history", "files"]);
    expect(presetTargets(PRESETS.navigator, { ...inp, state: PRESETS.navigator.start(P_DEFS) }).some((x) => x.place.kind === "band")).toBe(false);
  });
});

describe("bands: review fixes", () => {
  const opt = both("reserved", "between");

  it("open into a band folded by hand unfolds it as a whole; toggleFold reads the band as the layout does", () => {
    const s = toggleFold(liftPanel(desk(), "comments"), "history");
    expect(s.folded).toEqual(["history"]);
    const o = open(s, "comments", { edge: "bottom" });
    expect(o.folded).toEqual([]);
    expect(layoutPanels(DEFS, o, STAGE, opt).bands.bottom!.folded).toBeNull();
    // Folding it again folds both.
    expect([...toggleFold(o, "history").folded].sort()).toEqual(["comments", "history"]);
    // A partial fold (say, from the stored form) reads as open: toggleFold folds the band, not unfolds it.
    const partial = { ...dockBand(desk(), "comments", "bottom", 9, DEFS), folded: ["history"] };
    expect(layoutPanels(DEFS, partial, STAGE, opt).bands.bottom!.folded).toBeNull();
    expect([...toggleFold(partial, "history").folded].sort()).toEqual(["comments", "history"]);
    // A closed panel doesn't count: the shown ones folded means folded.
    const closedOne = close({ ...partial, folded: ["history"] }, "comments");
    expect(toggleFold(closedOne, "history").folded).toEqual([]);
  });

  it("a band's only panel, resized, is not offered its own emptied edge", () => {
    const s = resizeBand(desk(), "bottom", 300);
    const ids = panelTargets({ defs: DEFS, state: s, id: "history", stage: STAGE, options: opt }).map((t) => t.id);
    expect(ids.some((x) => x.startsWith("band:bottom"))).toBe(false);
    expect(ids).toContain("band:top:0");
  });

  it("a side with no open column offers its new-column line at the stage side of the reserve", () => {
    // Outline floats; no column on either side.
    const s = createPanels(DEFS, { floats: [{ id: "outline", x: 500, y: 100 }] });
    const ts = panelTargets({ defs: DEFS, state: s, id: "outline", stage: STAGE, options: { reserve: { left: 30, right: 20 } } });
    const left = ts.find((t) => t.id === "column:left:0")!;
    const right = ts.find((t) => t.id === "column:right:0")!;
    // From the line inward, 2 × reach; the outer 10 px are the rail's.
    expect([left.hit.x, left.hit.width]).toEqual([10, 34]);
    expect([right.hit.x, right.hit.x + right.hit.width]).toEqual([STAGE.width - 44, STAGE.width - 10]);
  });
});
