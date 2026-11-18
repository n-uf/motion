/**
 * `Edge.zones`: the zones an edge has. `zones: ["start"]` makes a side rail one stack along its whole length: a drop
 * anywhere on it inserts at the pointer's place in that stack, nothing on it refuses a kind it takes, and a drop names
 * no zone, so the item keeps its own `align` (lent back to a bar through `showIn`, it is in its own zone there).
 */
import { describe, expect, it } from "vitest";
import { namesZone, readScene, refusals, solve, storeScene, targets, zoneIn, zoneTakes, type Scene } from "../src/scene";
import { bar, byId, controls, group } from "./scene-fixture";

describe("Edge.zones and a fixed item", () => {
  /** A top bar with the given zones holding fixed window controls (`align: "end"`) and a group. */
  const withControls = (zones?: readonly ("start" | "center" | "end")[]): Scene => ({
    stage: { x: 0, y: 0, width: 1000, height: 600 },
    edges: [{ ...bar("top", "top", 0, ["g", "controls"]), ...(zones ? { zones } : {}) }],
    items: byId([group("g", 1), controls()]),
    floats: [],
    floatKinds: ["group"],
  });

  it("lies in its own zone where the edge has it, else in the edge's first zone, its stored align unchanged", () => {
    const one = withControls(["start"]);
    const edge = one.edges[0]!;
    expect(zoneIn(edge, one.items.controls!)).toBe("start");
    expect(zoneIn(withControls(["start", "end"]).edges[0]!, one.items.controls!)).toBe("end");
    expect(zoneIn(withControls().edges[0]!, one.items.controls!)).toBe("end");
    expect(zoneIn(withControls(["center", "end"]).edges[0]!, { ...one.items.controls!, align: undefined })).toBe("center");
    // Laid out in the one zone it lies in: it gets its span, after the group, and keeps `align: "end"`.
    const l = solve(one);
    const c = l.items.controls!.rect;
    expect(c.width).toBe(84);
    expect(c.x).toBeGreaterThanOrEqual(l.items.g!.rect.x + l.items.g!.rect.width);
    expect(one.items.controls!.align).toBe("end");
    expect(storeScene(one).items.controls!.align).toBe("end");
  });
});

const J = (v: unknown): string => JSON.stringify(v, (_k, x) => (typeof x === "function" ? undefined : x));
const inside = (r: { x: number; y: number; width: number; height: number }, p: { x: number; y: number }): boolean => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;

/** A deck bar with three zones and a compact left rail holding two groups, with the zones given. */
const kit = (zones?: readonly ("start" | "center" | "end")[]): Scene => ({
  stage: { x: 0, y: 0, width: 1400, height: 700 },
  edges: [
    bar("deck", "top", 0, ["a", "c", "g"]),
    { id: "rail", side: "left", ring: 0, accepts: ["group"], items: ["t", "u"], cross: { min: 36, max: 36, rail: 36 }, gap: 4, compact: true, ...(zones ? { zones } : {}) },
  ],
  items: byId([group("a", 1), group("c", 2, { align: "center" }), group("g", 3, { align: "end" }), group("t", 4), group("u", 5)]),
  floats: [],
  floatKinds: ["group"],
});
const railHits = (s: Scene, id: string) => {
  const l = solve(s);
  const r = l.edges.rail!.rect;
  return { l, r, ts: targets(s, id).filter((t) => t.id.includes(":rail:")) };
};

describe("Edge.zones", () => {
  it("a one-zone rail offers only its start zone's gaps, ordered along it, and refuses nothing it takes", () => {
    const s = kit(["start"]);
    const { r, ts } = railHits(s, "g");
    expect(ts.length).toBeGreaterThan(0);
    for (const t of ts) expect(t.place).toMatchObject({ kind: "gap", edge: "rail", zone: "start" });
    // The gaps, top to bottom, insert at 0, 1, 2…: ordered by position along the rail.
    const down = [...ts].sort((p, q) => p.hit.y - q.hit.y).map((t) => (t.place.kind === "gap" ? t.place.at : -1));
    expect(down).toEqual([...down].sort((p, q) => p - q));
    expect(new Set(down).size).toBe(down.length);
    // Every point along the rail is a gap; none is refused.
    expect(refusals(s, "g").filter((x) => x.edge === "rail")).toEqual([]);
    for (let y = r.y + 2; y < r.y + r.height - 2; y += 10) {
      const p = { x: r.x + r.width / 2, y };
      expect(ts.some((t) => inside(t.hit, p)), `y ${y}`).toBe(true);
    }
    // Three zones (the default): the rail's lower thirds are center and end.
    expect(targets(kit(), "g").some((t) => t.place.kind === "gap" && t.place.edge === "rail" && t.place.zone !== "start")).toBe(true);
  });

  it("a drop near the rail's bottom inserts last and keeps align end; its marker and preview are the landing", () => {
    const s = kit(["start"]);
    const { r, ts } = railHits(s, "g");
    const bottom = { x: r.x + r.width / 2, y: r.y + r.height - 4 };
    const t = ts.find((x) => inside(x.hit, bottom))!;
    expect(t).toBeDefined();
    const a = t.after(bottom);
    expect(a.scene.edges.find((e) => e.id === "rail")!.items).toEqual(["t", "u", "g"]);
    expect(a.scene.items.g!.align).toBe("end");
    expect(J(solve(a.scene))).toBe(J(a.layout));
    const landed = a.layout.items.g!;
    expect(landed).toMatchObject({ edge: "rail", zone: "start" });
    // The marker lies on the landed item's leading line.
    expect(Math.abs(t.marker!.y - landed.rect.y)).toBeLessThan(0.5 + 4);
    expect(t.slot && Math.abs(t.slot.y - landed.rect.y)).toBeLessThan(0.5);
  });

  it("lent back: g dropped on the one-zone rail, the rail hidden later with showIn to the deck, is in the deck's end zone", () => {
    const s = kit(["start"]);
    const { r, ts } = railHits(s, "g");
    const wide = ts.find((x) => inside(x.hit, { x: r.x + r.width / 2, y: r.y + r.height - 4 }))!.after({ x: 0, y: 0 }).scene;
    const narrow: Scene = { ...wide, edges: wide.edges.map((e) => (e.id === "rail" ? { ...e, hidden: true, showIn: "deck" } : e)) };
    const l = solve(narrow);
    expect(l.items.g).toMatchObject({ edge: "deck", zone: "end" });
    expect(l.items.t).toMatchObject({ edge: "deck", zone: "start" });
  });

  it("zoneTakes, zoneIn and namesZone read the zones an edge has; bad entries are ignored", () => {
    const rail = kit(["start"]).edges[1]!;
    expect(zoneTakes(rail, "end", "group")).toBe(false);
    expect(namesZone(rail, "group")).toBe(false);
    expect(zoneIn(rail, kit().items.g!)).toBe("start");
    const two = { ...rail, zones: ["end", "start", "start"] as const };
    expect(namesZone(two, "group")).toBe(true);
    expect(zoneIn(two, kit().items.c!)).toBe("start");
    const none = { ...rail, zones: ["nowhere" as "start"] };
    expect(namesZone(none, "group")).toBe(true);
    // With zoneAccepts, both must say so.
    expect(zoneTakes({ ...rail, zones: ["start", "end"], zoneAccepts: { end: ["group"] } }, "start", "group")).toBe(false);
  });

  it("two zones split the rail between them: a drop in the end half sets end", () => {
    const s = kit(["start", "end"]);
    const { r, ts } = railHits(s, "a");
    expect(ts.every((t) => t.place.kind === "gap" && t.place.zone !== "center")).toBe(true);
    const low = ts.find((x) => inside(x.hit, { x: r.x + r.width / 2, y: r.y + r.height - 4 }))!;
    expect(low.place).toMatchObject({ zone: "end" });
    expect(low.after({ x: 0, y: 0 }).scene.items.a!.align).toBe("end");
    expect(refusals(s, "a").filter((x) => x.edge === "rail")).toEqual([]);
  });

  it("zones is a declaration: never stored, read back from base", () => {
    const s = kit(["start"]);
    const stored = storeScene(s);
    expect(J(stored.edges.find((e) => e.id === "rail"))).not.toContain("zones");
    expect(readScene(JSON.parse(J(stored)), s).scene.edges.find((e) => e.id === "rail")!.zones).toEqual(["start"]);
  });
});
