/** `Edge.zoneAccepts`: a panel column with panels at its start and a tray of toolbars at its foot. */
import { describe, expect, it } from "vitest";
import { moveTo, readScene, solve, storeScene, targets, type Scene } from "../src/scene";
import { byId, column, group, panel } from "./scene-fixture";

const r = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });
const zoneAccepts = { start: ["panel"], end: ["group"] } as const;

function scene(height = 600): Scene {
  return {
    stage: r(0, 0, 1000, height),
    edges: [column("col", "left", 0, ["p", "q", "g"], { zoneAccepts })],
    items: byId([panel("p", 1), panel("q", 2), group("g", 0, { align: "end" }), group("h", 3)]),
    floats: [{ id: "h", rect: r(500, 100, 200, 40) }],
    floatKinds: ["group"],
  };
}

describe("a column's tray", () => {
  it("sits at the column's foot, one toolbar per row, below the panels", () => {
    const l = solve(scene());
    expect(l.items.g).toMatchObject({ formKind: "wrap", zone: "end" });
    expect(l.items.g!.rect.y + l.items.g!.rect.height).toBe(600);
    expect(l.items.q!.rect.y + l.items.q!.rect.height).toBeLessThanOrEqual(l.items.g!.rect.y);
  });

  it("takes groups only in its end zone and panels only in its start zone (deny by default)", () => {
    const s = scene();
    const groupGaps = targets(s, "h").filter((t) => t.place.kind === "gap");
    expect(groupGaps.length).toBeGreaterThan(0);
    for (const t of groupGaps) expect(t.place).toMatchObject({ zone: "end" });
    for (const t of targets(s, "p").filter((x) => x.place.kind === "gap")) expect(t.place).toMatchObject({ zone: "start" });
    expect(moveTo(s, "h", { edge: "col", zone: "start", at: 0 })).toBe(s);
    expect(moveTo(s, "h", { edge: "col", at: 0 }).items.h!.align).toBe("end");
  });

  it("the panels give way first; a toolbar in the tray takes wrap or icons, never the menu", () => {
    // Even used longest ago, the tray's group keeps its words while the panels fold to headers.
    const l = solve(scene(200));
    expect(l.items.g!.formKind).toBe("wrap");
    expect([l.items.p!.formKind, l.items.q!.formKind]).toContain("header");
    const tiny = solve(scene(80));
    expect(["wrap", "icons"]).toContain(tiny.items.g!.formKind);
  });

  it("the tray's gap never reaches up over the panels: a group over a panel's body gets no gap", () => {
    const s = scene();
    const l = solve(s);
    const p = l.items.p!.rect;
    const mid = { x: p.x + p.width / 2, y: p.y + p.height / 2 };
    const over = targets(s, "h").filter((t) => t.place.kind === "gap" && mid.x >= t.hit.x && mid.x <= t.hit.x + t.hit.width && mid.y >= t.hit.y && mid.y <= t.hit.y + t.hit.height);
    expect(over).toEqual([]);
  });

  it("a drop into the tray: its after shows the tray as it lands, the preview equal to the landing", () => {
    const s = scene();
    for (const t of targets(s, "h").filter((x) => x.place.kind === "gap")) {
      const a = t.after({ x: 0, y: 0 });
      expect(a.layout.items.h).toMatchObject({ zone: "end", rect: t.slot });
      expect(solve(a.scene)).toEqual(a.layout);
    }
  });

  it("the column template carries zoneAccepts; a group never opens such a column, a panel does", () => {
    const s: Scene = { ...scene(), columns: { right: { accepts: ["panel", "group"], cross: { min: 160, max: 480, rail: 30 }, zoneAccepts } }, rails: undefined };
    // No column target and no column place for a group: its start zone takes panels only.
    expect(moveTo(s, "h", { kind: "column", side: "right", ring: 0 })).toBe(s);
    expect(targets(s, "h").some((t) => t.place.kind === "column")).toBe(false);
    const withPanel: Scene = { ...s, items: { ...s.items, r: panel("r", 9) }, floats: [...s.floats, { id: "r", rect: r(400, 300, 200, 200) }], floatKinds: ["group", "panel"] };
    const m = moveTo(withPanel, "r", { kind: "column", side: "right", ring: 0 });
    const col = m.edges.find((e) => e.side === "right")!;
    expect(col.zoneAccepts).toEqual(zoneAccepts);
    expect(col.items).toEqual(["r"]);
    expect(targets(withPanel, "r").some((t) => t.place.kind === "column")).toBe(true);
  });

  it("a tray column the template made is the same column read back from the store: its solve and its targets", () => {
    const s: Scene = { ...scene(), columns: { right: { accepts: ["panel", "group"], cross: { min: 160, max: 480, rail: 30 }, zoneAccepts, hitBand: "middle" } }, rails: undefined };
    const withPanel: Scene = { ...s, items: { ...s.items, r: panel("r", 9) }, floats: [...s.floats, { id: "r", rect: r(400, 300, 200, 200) }], floatKinds: ["group", "panel"] };
    const made = moveTo(withPanel, "r", { kind: "column", side: "right", ring: 0 });
    const col = made.edges.find((e) => e.side === "right")!;
    const tray = moveTo(made, "h", { kind: "gap", edge: col.id, zone: "end", at: 0 });
    expect(tray.edges.find((e) => e.id === col.id)!.items).toEqual(["r", "h"]);
    // Read back against the scene before the column was made: the column comes from the template again.
    const read = readScene(JSON.parse(JSON.stringify(storeScene(tray))), withPanel);
    expect(read.dropped).toEqual([]);
    expect(read.scene.edges.find((e) => e.id === col.id)).toEqual(tray.edges.find((e) => e.id === col.id));
    expect(solve(read.scene)).toEqual(solve(tray));
    for (const id of ["r", "h", "p"]) {
      const want = targets(tray, id).map((t) => [t.id, t.hit, t.hits ?? null, t.slot ?? null]);
      expect(targets(read.scene, id).map((t) => [t.id, t.hit, t.hits ?? null, t.slot ?? null]), id).toEqual(want);
    }
  });
});
