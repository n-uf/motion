/**
 * A bar the held item is too thick for refuses it as `too-thick`, not `no-room`: no form of the item that is not the »
 * menu fits across the bar (every one sets no cross size and its `cross.min` is over the bar's thickness), so no
 * length, however long, would make room. `no-room` stays for lack of length.
 */
import { describe, expect, it } from "vitest";
import { refusals, solve, type Scene, type SceneItem } from "../src/scene";
import type { EdgeSpec } from "../src/scene/targets/model";
import type { Ownership } from "../src/scene/targets/ownership";
import { clipTiles } from "../src/scene/targets/tiles";
import { byId, column, group, panel, windowScene } from "./scene-fixture";

const form = (kind: string, main: number, cross: number) => ({ kind, main: { min: main, natural: main }, cross: { natural: cross } });
/** `id` as a group whose every form is `cross` thick (but the » menu's). */
const thick = (s: Scene, id: string, cross: number): Scene => {
  const item: SceneItem = { ...s.items[id]!, forms: { row: [form("row", 100, cross), form("icons", 40, cross), form("menu", 0, 0)], column: group(id, 0).forms.column } } as SceneItem;
  return { ...s, items: { ...s.items, [id]: item } };
};
const on = (s: Scene, id: string, edge: string) => refusals(s, id, { previous: solve(s) }).filter((r) => r.edge === edge);

describe("refusals(): a bar thinner than the item refuses it as too-thick", () => {
  it("the title bar (32 px) against a group 36 px thick in every form: every zone is too-thick, none no-room", () => {
    const s = thick(windowScene(), "zoom", 36);
    const rs = on(s, "zoom", "titlebar");
    expect([...new Set(rs.map((r) => r.zone))].sort()).toEqual(["center", "end", "start"]);
    expect([...new Set(rs.map((r) => r.reason))]).toEqual(["too-thick"]);
  });

  it("an empty bar the item is too thick for refuses its zones as too-thick too", () => {
    const base = windowScene();
    const s = thick({ ...base, edges: base.edges.map((e) => (e.id === "toolbar" ? { ...e, items: [] } : e)) }, "zoom", 60);
    const rs = on(s, "zoom", "toolbar");
    expect(rs.length).toBeGreaterThan(0);
    expect([...new Set(rs.map((r) => r.reason))]).toEqual(["too-thick"]);
  });

  it("an item one form of which fits across the bar is refused for lack of length, not thickness", () => {
    // The thin form of `icons` is 28; only the bar's length is short (the title bar too full), as before.
    const s = windowScene(1140);
    const full = { ...s, edges: s.edges.map((e) => (e.id === "titlebar" ? { ...e, items: ["title", "tools", "zoom", "marks", "search", "controls"] } : { ...e, items: e.items.filter((i) => !["tools", "zoom", "marks", "search"].includes(i)) })) };
    const rs = on(full, "views", "titlebar");
    expect(rs.length).toBeGreaterThan(0);
    expect([...new Set(rs.map((r) => r.reason))]).toEqual(["no-room"]);
  });

  it("a new column's line refuses an item thicker than a column can be as too-thick, as a real column does", () => {
    const base = windowScene();
    const icons = { kind: "icons", main: { min: 84, natural: 84 }, cross: { natural: 400, min: 400 } };
    const zoom = { ...base.items.zoom!, forms: { row: base.items.zoom!.forms.row!, column: [icons, form("menu", 0, 0)] } } as SceneItem;
    const sides = { accepts: ["panel", "group"], cross: { min: 220, max: 300, rail: 32 } };
    const s = { ...base, items: { ...base.items, zoom }, columns: { left: sides, right: sides } } as Scene;
    const rs = refusals(s, "zoom", { previous: solve(s) });
    const lines = rs.filter((r) => r.edge.startsWith("column:"));
    expect(lines.length).toBeGreaterThan(0);
    expect([...new Set(lines.map((r) => r.reason))]).toEqual(["too-thick"]);
    // The drawn columns say the same.
    expect([...new Set(rs.filter((r) => r.edge === "left" || r.edge === "right").map((r) => r.reason))]).toEqual(["too-thick"]);
  });

  it("an item a bar can hold is not refused as too-thick", () => {
    const s = windowScene();
    for (const r of refusals(s, "views", { previous: solve(s) })) expect(r.reason).not.toBe("too-thick");
  });
});

describe("the other paths that read the thickness test", () => {
  const tpl = { accepts: ["panel"], cross: { min: 220, max: 640, rail: 32 } };
  /** A left column of two panels, a 32 px rail on each side, and `x` floating. */
  const withRail = (x: SceneItem): Scene =>
    ({
      stage: { x: 0, y: 0, width: 1440, height: 900 },
      edges: [{ ...column("left-0", "left", 0, ["pages", "notes"]), column: true, accepts: ["panel"], cross: tpl.cross, size: 300 }],
      items: byId([panel("pages", 1, {}, 300), panel("notes", 2, {}, 300), x]),
      floats: [{ id: "x", rect: { x: 700, y: 100, width: 200, height: 200 } }],
      floatKinds: ["panel"],
      columns: { left: tpl, right: tpl },
      rails: { left: { width: 32, accepts: ["panel"] }, right: { width: 32, accepts: ["panel"] } },
      contentMin: { width: 320, height: 240 },
      gutter: 12,
      inset: { left: 0, right: 0, top: 0, bottom: 0 },
    }) as Scene;
  /** Every form of `x` across a column asks 60 px (a rail is 32 wide), but the » menu's. */
  const wide: SceneItem = { id: "x", kind: "panel", used: 4, forms: { column: [{ ...form("icons", 28, 60), cross: { natural: 60, min: 60 } }, form("menu", 0, 0)], row: [form("header", 120, 28)] } } as SceneItem;

  it("a rail stop refuses an item thicker than the rail as too-thick, not no-room", () => {
    const s = withRail(wide);
    const stop = refusals(s, "x", { previous: solve(s) }).filter((r) => r.edge === "rail:right");
    expect(stop.length).toBeGreaterThan(0);
    expect([...new Set(stop.map((r) => r.reason))]).toEqual(["too-thick"]);
  });

  it("a rail stop is not too-thick for an item with a form that fits across it", () => {
    const s = withRail(panel("x", 4, {}, 300));
    for (const r of refusals(s, "x", { previous: solve(s) })) if (r.edge.startsWith("rail:")) expect(r.reason).not.toBe("too-thick");
  });

  /** A tile of a bar's slot, as the tiler hands it to clipping, and what one other tile's owner leaves of it. */
  const slotTile = (reason: "too-thick" | null) => {
    const spec = { refuse: () => reason } as unknown as EdgeSpec;
    const tile = { edge: "top", spec, edgeKind: "bar" as const, vertical: false, zone: "start" as const, id: "gap:top:start:0", priority: 2 as const, order: 1, kind: "slot" as const, hit: { x: 0, y: 0, width: 100, height: 36 }, keep: { x: 50, y: 18 } };
    // The owner of the bar's own band takes all but the last 0.5 px of the tile along it.
    const own: Ownership = { owners: [], taken: new Map([[spec, [{ x: 0, y: 0, width: 99.5, height: 36 }]]]), cutsOf: () => ({ cuts: [], bodies: [] }), bodies: () => [], solid: [], drawnBesides: () => [] };
    return clipTiles([tile], own, [], []);
  };

  it("a slot whose cut-off sliver is under 1 px is refused over it as too-thick for a too-thick item", () => {
    const placed = slotTile("too-thick");
    expect(placed.map((t) => [t.kind, t.reason])).toEqual([["refuse", "too-thick"]]);
    expect(placed[0]!.hit).toEqual({ x: 99.5, y: 0, width: 0.5, height: 36 });
  });

  it("and as no-room where the zone is only too short", () => {
    expect(slotTile(null).map((t) => [t.kind, t.reason])).toEqual([["refuse", "no-room"]]);
  });

  /** `zoom` alone on the toolbar, folded into its » menu, whose entry is 0 px wide: the item has no rect on the bar. */
  const folded = (cross: number): Scene => {
    const base = windowScene();
    const zoom = { ...base.items.zoom!, forms: { row: [form("row", 5000, cross), form("icons", 5000, cross), form("menu", 0, 0)], column: group("zoom", 0).forms.column } } as SceneItem;
    return { ...base, items: { ...base.items, zoom }, edges: base.edges.map((e) => (e.id === "toolbar" ? { ...e, items: ["zoom"], menu: { main: 0 } } : { ...e, items: e.items.filter((i) => i !== "zoom") })) };
  };
  const zones = (s: Scene) => Object.fromEntries(on(s, "zoom", "toolbar").map((r) => [r.zone, r.reason]));

  it("the stretch beside a lone item is own-place, though the zone is too thick", () => {
    const s = folded(60);
    expect(solve(s).items.zoom).toMatchObject({ edge: "toolbar", zone: "end", inMenu: true });
    // Its own zone has the item alone (its » entry is the zone's one place); the other zones say the bar is too thin.
    expect(zones(s)).toEqual({ start: "too-thick", center: "too-thick", end: "own-place" });
  });

  it("and the same where the zone is only too short", () => {
    expect(zones(folded(28))).toEqual({ start: "no-room", center: "no-room", end: "own-place" });
  });
});
