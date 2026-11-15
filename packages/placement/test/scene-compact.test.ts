/** `Edge.compact`: an icons-only edge, a thin rail of vertical toolbars along a window side. */
import { describe, expect, it } from "vitest";
import { ZONES, refusals, solve, targets, type Scene } from "../src/scene";
import { byId, column, form, group, panel } from "./scene-fixture";

const r = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

function scene(): Scene {
  return {
    stage: r(0, 0, 1000, 600),
    edges: [
      { id: "rail", side: "left", ring: 0, accepts: ["group"], items: ["a", "b"], cross: { min: 30, max: 30, rail: 30 }, compact: true },
      column("col", "left", 1, ["p"]),
    ],
    items: byId([group("a", 1), group("b", 2), group("c", 3), panel("p", 4)]),
    floats: [{ id: "c", rect: r(500, 100, 200, 40) }],
    floatKinds: ["group"],
  };
}

describe("a compact edge", () => {
  it("lays its items out in their icons form only, stacked, one thin rail outside the column", () => {
    const l = solve(scene());
    expect(l.edges.rail!.rect).toEqual(r(0, 0, 30, 600));
    expect(l.items.a).toMatchObject({ formKind: "icons", rect: r(0, 0, 30, 84) });
    expect(l.items.b).toMatchObject({ formKind: "icons", rect: r(0, 84, 30, 84) });
    expect(l.edges.col!.rect.x).toBe(30);
  });

  it("leaves out an item with no icons form, with a note", () => {
    const s = scene();
    const words = { ...s.items.b!, forms: { ...s.items.b!.forms, column: [s.items.b!.forms.column![0]!, form("menu", 0, 0, 0)] } };
    const l = solve({ ...s, items: { ...s.items, b: words } });
    expect(l.items.b).toBeUndefined();
    expect(l.notes).toContainEqual({ code: "no-icons-form", id: "b", edge: "rail" });
  });

  it("an empty side's strips, by thirds, per the zones that take the kind: a group gets the rail's three and the column tray's third, a panel the column's top third", () => {
    const s = scene();
    const zoneAccepts = { start: ["panel"], end: ["group"] };
    const empty: Scene = { ...s, edges: s.edges.map((e) => ({ ...e, items: [], ...(e.id === "col" ? { zoneAccepts } : {}) })), floats: [{ id: "a", rect: r(500, 100, 200, 40) }, { id: "p", rect: r(500, 200, 200, 200) }], floatKinds: ["group", "panel"] };
    const strips = (id: string) => targets(empty, id).map((t) => t.id).filter((x) => x.startsWith("strip:"));
    expect(strips("a").sort()).toEqual(["strip:col:end", "strip:rail:center", "strip:rail:end", "strip:rail:start"]);
    expect(strips("p")).toEqual(["strip:col:start"]);
    // The rail's thirds run down its own rect at the window edge (0..600), and each lands the group in its zone: top,
    // middle, bottom; the slot is the landing.
    ZONES.forEach((zone, k) => {
      const t = targets(empty, "a").find((x) => x.id === `strip:rail:${zone}`)!;
      expect(t.hit.y, zone).toBeCloseTo(k * 200, 6);
      expect(t.hit.height, zone).toBeCloseTo(200, 6);
      const a = t.after({ x: 0, y: 0 }).layout;
      const me = a.items.a!;
      expect(me, zone).toMatchObject({ edge: "rail", zone, formKind: "icons" });
      expect(t.slot, zone).toEqual(me.rect);
      // Aligned in its third: at the top, centred, at the bottom.
      const mid = me.rect.y + me.rect.height / 2;
      if (zone === "start") expect(me.rect.y).toBe(0);
      if (zone === "center") expect(mid).toBeCloseTo(300, 6);
      if (zone === "end") expect(me.rect.y + me.rect.height).toBeCloseTo(600, 6);
    });
    // An empty tray column alone at its side: its thirds that take no group (start, center) are refused for a group, and
    // its end third is a strip. (Beside a rail, the rail's inward reach covers the column's strip.)
    const beside: Scene = { ...empty, edges: empty.edges.filter((e) => e.id !== "rail") };
    expect(targets(beside, "a").some((x) => x.id === "strip:col:end")).toBe(true);
    const rs = refusals(beside, "a").filter((x) => x.edge === "col");
    expect(rs.map((x) => [x.zone, x.reason])).toEqual([
      ["start", "not-accepted"],
      ["center", "not-accepted"],
    ]);
  });

  it("a group dropped in takes its icons form, and the preview is the landing", () => {
    const s = scene();
    const ts = targets(s, "c").filter((t) => t.place.kind === "gap" && t.place.edge === "rail");
    expect(ts.length).toBeGreaterThan(0);
    for (const t of ts) {
      const a = t.after({ x: 0, y: 0 });
      expect(a.layout.items.c).toMatchObject({ formKind: "icons", rect: t.slot });
      expect(solve(a.scene)).toEqual(a.layout);
    }
  });
});
