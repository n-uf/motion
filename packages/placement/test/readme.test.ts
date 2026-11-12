/** The README's examples, run as written (their console output checked). */
import { describe, expect, it } from "vitest";
import { DEFAULT_OPTIONS, createDesk, liftOut } from "../src/dock";
import { deskDrop, deskTargets, floatTarget, hostTargets, keyboardStops, paneZone, type PaneZone } from "../src/targets";
import { arrangement, hostOf, layoutHost, readArrangement, storeArrangement, type Place } from "../src/toolbar";

describe("README examples", () => {
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
});
