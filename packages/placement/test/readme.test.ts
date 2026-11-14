/** The README's examples, run as written (their console output checked). */
import { describe, expect, it } from "vitest";
import { DEFAULT_OPTIONS, createDesk, liftOut } from "../src/dock";
import { deskDrop, deskTargets, floatTarget, hostTargets, keyboardStops, paneZone, type PaneZone } from "../src/targets";
import { arrangement, hostOf, layoutHost, readArrangement, storeArrangement, type Place } from "../src/toolbar";
import { createPanels, homePlace, keep, layoutPanels, panelDrop, panelTargets, readPanels, storePanels, type PanelDef } from "../src/panels";
import { PRESETS, presetLayout, presetTargets } from "../src/desk";
import { fitFloat, fitStack, floatTarget as stackFloatTarget, readFloats, readStack, stackTargets, storeFloats, storeStack, type StackForm, type StackItem } from "../src/stack";

describe("README examples", () => {
  it("desk presets", () => {
    const defs: PanelDef[] = [
      { id: "files", width: { min: 200, natural: 240, max: 360 }, height: { min: 80, natural: 160 } },
      { id: "outline", width: { min: 200, natural: 240, max: 360 }, height: { min: 80, natural: 200 } },
      { id: "history", width: { min: 200, natural: 240, max: 360 } },
    ];
    const nav = PRESETS.navigator;
    const state = nav.start(defs, { left: ["files", "outline"] });
    const layout = presetLayout(nav, defs, state, { width: 1200, height: 600 });
    expect([layout.columns[0]!.strip, layout.items.get("outline")!.hidden]).toEqual([{ x: 0, y: 0, width: 240, height: 28 }, true]);
    const targets = presetTargets(nav, { defs, state, id: "history", stage: { width: 1200, height: 600 } });
    expect(targets.some((t) => t.id === "float")).toBe(false);
  });

  it("a desk", () => {
    const desk = createDesk({
      panels: [
        { id: 1, title: "Files", natural: 160 },
        { id: 2, title: "Outline", natural: 200 },
        { id: 3, title: "History", natural: 160 },
      ],
      start: { left: [1, 2], right: [], bottom: [3] },
    });
    const docks = desk.constructionOf("docks");
    const { items, notes } = docks.layout(docks.initial([1, 2]), { width: 960, height: 420 }, DEFAULT_OPTIONS);
    expect([items.get("panel:3")!.look, notes.map((n) => n.code)]).toEqual(["header", ["bottom-folded"]]);
  });

  it("toolbar groups", () => {
    const a = arrangement({ top: { start: ["file", "edit"], end: ["share"] } });
    const size = (_id: string, _vertical: boolean, collapsed: boolean) => ({ along: collapsed ? 30 : 120, across: 28 });
    const top = layoutHost(a.top, "top", { length: 320, thickness: 34, lead: 8, tail: 8 }, size);
    expect(top.overflow).toEqual(["share"]);
    const kept = layoutHost(a.top, "top", { length: 320, thickness: 34, lead: 8, tail: 8, keep: { share: 1 } }, size);
    expect(kept.overflow).toEqual(["edit"]);
  });

  it("stored arrangements", () => {
    const saved = JSON.stringify(storeArrangement(arrangement({ top: { start: ["file", "edit"] } })));
    expect(saved.startsWith('{"v":1,"hosts":')).toBe(true);
    expect(readArrangement(JSON.parse(saved)).ok).toBe(true);
    expect(readArrangement({ v: 9 })).toEqual({ ok: false, error: "unknown version 9 (this reads version 1)" });
  });

  it("toolbar targets and keyboard stops", () => {
    const a = arrangement({ top: { start: ["file", "edit"], end: ["share"] } });
    const size = (_id: string, _vertical: boolean, collapsed: boolean) => ({ along: collapsed ? 30 : 120, across: 28 });
    const allows = (g: string, place: Place | "float") => g !== "share" || (place !== "float" && place.host === "top");
    const top = { origin: { x: 0, y: 40 }, spec: { length: 800, thickness: 34, lead: 8, tail: 8 } };
    const { targets } = hostTargets({ group: "share", arrangement: a, host: "top", ...top, size, allows });
    expect(targets[0]!.slot).toEqual({ x: 8, y: 43, width: 120, height: 28 });
    const stage = { x: 0, y: 80, width: 800, height: 500 };
    const all = [...targets, ...(allows("share", "float") ? [floatTarget({ group: "share", arrangement: a, stage, width: 120, height: 28 })] : [])];
    expect(all.length === targets.length).toBe(true);
    const stops = keyboardStops(targets, { home: { place: hostOf(a, "share")!, arrangement: a } });
    expect(stops.map((s) => (s.home ? "home" : s.id))).toEqual(["g:top:start:0", "g:top:start:1", "g:top:start:2", "g:top:center:0", "home"]);
  });

  it("drop targets", () => {
    const desk = createDesk({
      panels: [{ id: 1, title: "Files", natural: 160 }, { id: 2, title: "Outline", natural: 200 }],
      start: { left: [1, 2], right: [], bottom: [] },
    });
    const c = desk.constructionOf("dockTear");
    const key = "panel:2";
    const input = { c, s0: liftOut(c.initial([1]), key), key, size: { width: 1200, height: 700 }, opt: DEFAULT_OPTIONS };
    const targets = deskTargets(input);
    const float = targets.find((t) => t.id === "float")!;
    const drop = deskDrop(input, float, { x: 600, y: 300 }, { x: 20, y: 10 });
    expect([drop.label, drop.slot.x, drop.slot.y]).toEqual(["Float here", 580, 290]);
  });

  it("panels", () => {
    const defs: PanelDef[] = [
      { id: "files", width: { min: 180, natural: 220, max: 360 } },
      { id: "outline", width: { min: 160, natural: 200, max: 320 } },
      { id: "notes", width: { min: 200, natural: 260, max: 420 } },
    ];
    const state = createPanels(defs, { left: [["files"], ["outline"]], right: [["notes"]] });
    const narrow = layoutPanels(defs, state, { width: 780, height: 600 });
    expect([narrow.notes.map((n) => n.code), narrow.items.get("files")!.kind]).toEqual([["column-shrunk", "column-folded"], "segment"]);
    const kept = layoutPanels(defs, keep(state, "files", true), { width: 780, height: 600 });
    expect([kept.items.get("files")!.kind, kept.items.get("outline")!.kind]).toEqual(["column", "segment"]);
    const read = readPanels(JSON.parse(JSON.stringify(storePanels(state))), defs);
    expect(read.ok).toBe(true);
  });

  it("panel targets and keyboard stops", () => {
    const defs: PanelDef[] = [
      { id: "files", width: { min: 180, natural: 220, max: 360 } },
      { id: "outline", width: { min: 160, natural: 200, max: 320 }, floats: false },
    ];
    const state = createPanels(defs, { left: [["files"], ["outline"]] });
    const input = { defs, state, id: "outline", stage: { width: 1200, height: 600 } };
    const targets = panelTargets(input);
    expect(targets.map((t) => t.id)).toEqual(["rail:left", "column:left:0", "into:left:0", "column:right:0", "rail:right"]);
    const drop = panelDrop(input, targets[3]!, { x: 1190, y: 300 }, { x: 0, y: 0 });
    expect(drop.slot).toEqual({ x: 1000, y: 0, width: 200, height: 600 });
    const stops = keyboardStops(targets, { home: { place: homePlace(state, "outline")!, state } });
    expect(stops.map((s) => (s.home ? "home" : s.id))).toEqual(["rail:left", "column:left:0", "into:left:0", "home", "column:right:0", "rail:right"]);
  });

  it("bands", () => {
    const defs: PanelDef[] = [
      { id: "files", width: { min: 180, natural: 220, max: 360 } },
      { id: "history", width: { min: 200, natural: 240, max: 360 }, band: { min: 100, max: 400, natural: 180 } },
    ];
    const state = createPanels(defs, { left: [["files"]], bottom: ["history"] });
    const options = { bands: { bottom: { mode: "reserved", span: "between" } } } as const;
    const tall = layoutPanels(defs, state, { width: 1200, height: 700 }, options);
    expect([tall.bands.bottom!.rect, tall.pages]).toEqual([
      { x: 220, y: 520, width: 980, height: 180 },
      { x: 220, y: 0, width: 980, height: 520 },
    ]);
    const short = layoutPanels(defs, state, { width: 1200, height: 300 }, options);
    expect([short.notes.map((n) => n.code), short.items.get("history")!.kind]).toEqual([["band-folded"], "bar"]);
    const targets = panelTargets({ defs, state, id: "files", stage: { width: 1200, height: 700 }, options });
    expect(targets.filter((t) => t.place.kind === "band").map((t) => t.id)).toEqual(["band:bottom:0", "band:bottom:1"]);
  });

  it("reserved room", () => {
    // The bands example's defs and state; without band options the band is off (`band-off`).
    const defs: PanelDef[] = [
      { id: "files", width: { min: 180, natural: 220, max: 360 } },
      { id: "history", width: { min: 200, natural: 240, max: 360 }, band: { min: 100, max: 400, natural: 180 } },
    ];
    const state = createPanels(defs, { left: [["files"]], bottom: ["history"] });
    const l = layoutPanels(defs, state, { width: 1200, height: 700 }, { reserve: { top: 40 } });
    expect([l.reserved.top, l.pages]).toEqual([
      { x: 220, y: 0, width: 980, height: 40 },
      { x: 220, y: 40, width: 980, height: 660 },
    ]);
  });

  it("pane zones", () => {
    const pane = { x: 0, y: 0, width: 200, height: 200 };
    expect([paneZone(pane, { x: 100, y: 100 }), paneZone(pane, { x: 190, y: 100 })]).toEqual(["center", "right"]);
    expect(paneZone(pane, { x: 137, y: 100 }, "center")).toBe("center");
    const canSplit = false;
    const placeOf = (t: { id: string; hit: typeof pane }, p: { x: number; y: number }, previous: string | null): string | null => {
      const zone = paneZone(t.hit, p, (previous?.split(":")[1] as PaneZone | undefined) ?? null);
      return zone === "center" || canSplit ? `${t.id}:${zone}` : null;
    };
    expect([placeOf({ id: "a", hit: pane }, { x: 100, y: 100 }, null), placeOf({ id: "a", hit: pane }, { x: 10, y: 100 }, null)]).toEqual(["a:center", null]);
  });

  it("edge stacks", () => {
    const form = (kind: StackForm["kind"], min: number, natural: number, cross: number, grows = false, crossMin?: number): StackForm => ({
      kind,
      main: { min, natural, ...(grows ? { grows } : {}) },
      cross: { natural: cross, ...(crossMin === undefined ? {} : { min: crossMin }) },
    });
    const panel = (id: string, used: number): StackItem => ({
      id,
      used,
      forms: [form("open", 90, 160, 240, true), form("header", 28, 28, 240, false, 100), form("rail", 24, 24, 30), form("menu", 0, 0, 0)],
    });
    const tools: StackItem = { id: "tools", used: 3, forms: [form("row", 96, 96, 180), form("stacked", 78, 78, 84), form("icons", 72, 72, 28), form("menu", 0, 0, 0)] };
    const column = { axis: "column", length: 250, cross: { min: 120, max: 360 } } as const;

    const fit = fitStack({ ...column, items: [panel("pages", 1), panel("findings", 2), tools] });
    expect([fit.items.map((p) => p.kind), fit.cross, fit.notes]).toEqual([["header", "open", "row"], 240, [{ code: "form-down", id: "pages", from: 0, to: 1 }]]);

    const alone = fitStack({ ...column, items: [tools] });
    expect([alone.items[0]!.kind, alone.cross]).toEqual(["icons", 30]);

    const targets = stackTargets({ ...column, items: [panel("pages", 1), panel("findings", 2)] }, tools);
    expect([targets.map((t) => t.id), targets[1]!.slot, targets[1]!.fit.items[1]!.kind]).toEqual([["gap:0", "gap:1", "gap:2"], { x: 0, y: 28, width: 240, height: 96 }, "row"]);

    const saved = JSON.stringify(storeStack({ order: ["pages", "tools"], kept: ["pages"], closed: [], used: ["pages", "tools"], forms: { tools: 1 } }));
    expect(saved).toBe('{"v":1,"order":["pages","tools"],"kept":["pages"],"closed":[],"used":["pages","tools"],"forms":{"tools":1}}');
    expect([readStack(JSON.parse(saved), ["pages", "tools", "findings"]).ok, readStack({ v: 2 }).ok]).toEqual([true, false]);
  });

  it("edge stack floats", () => {
    const stage = { x: 0, y: 0, width: 900, height: 500 };
    const docked = [{ x: 0, y: 32, width: 240, height: 468 }];

    const fit = fitFloat({ x: 100, y: 200, width: 200, height: 150 }, stage, docked);
    expect([fit.rect, fit.snapped]).toEqual([{ x: 240, y: 200, width: 200, height: 150 }, true]);

    const target = stackFloatTarget({ id: "notes", stage, size: { width: 200, height: 150 }, avoid: docked });
    const drop = target.make({ x: 500, y: -400 }, { x: 20, y: 10 });
    expect([drop.rect, drop.fit.clamped]).toEqual([{ x: 480, y: 0, width: 200, height: 150 }, true]);

    expect(JSON.stringify(storeFloats([{ id: "notes", rect: drop.rect }]))).toBe('{"v":1,"floats":[{"id":"notes","x":480,"y":0,"width":200,"height":150}]}');
    const old = readFloats({ v: 1, floats: [{ id: "notes", x: 480, y: 0, width: 200, height: 150, pinned: true }] });
    expect(old.ok && old.dropped).toEqual(["pinned:notes"]);
  });
});
