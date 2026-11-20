/**
 * A bar the held item is too thick for refuses it as `too-thick`, not `no-room`: no form of the item that is not the »
 * menu fits across the bar (every one sets no cross size and its `cross.min` is over the bar's thickness), so no
 * length, however long, would make room. `no-room` stays for lack of length.
 */
import { describe, expect, it } from "vitest";
import { refusals, solve, type Scene, type SceneItem } from "../src/scene";
import { group, windowScene } from "./scene-fixture";

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
