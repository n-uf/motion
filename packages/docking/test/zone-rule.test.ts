/**
 * The item's zone is its own fact, not the edge's. A move sets `align` only when the drop names a zone (a gap in a
 * zone of an edge that offers a choice: more than one of its zones takes the kind); a rail, a new column, home or `moveTo` with no zone keep it. An item lies in its own zone where its edge takes
 * it there, else in the first zone that does (`zoneIn`), the same rule on every edge and for items a hidden edge lends.
 */
import { describe, expect, it } from "vitest";
import { dockHome, moveTo, solve, targets, type DockState } from "../src";
import { bar, byId, column, group, panel } from "./fixture";

const P = { x: 300, y: 200 };

/** A deck bar with items in its start and end zones, and a left column that takes groups in its start zone only. */
const desk = (): DockState => ({
  stage: { x: 0, y: 0, width: 1200, height: 600 },
  edges: [
    bar("deck", "top", 0, ["a", "g"], { zoneAccepts: { start: ["group"], end: ["group"] } }),
    column("rail", "left", 0, ["p"], { accepts: ["panel", "group"], zoneAccepts: { start: ["panel", "group"] } }),
  ],
  items: byId([group("a", 1), group("g", 2, { align: "end" }), panel("p", 3)]),
  floats: [],
  floatKinds: ["group", "panel"],
});

describe("an item's zone is its own", () => {
  it("an end-zone group docked on a rail, then lent back to the deck, lands in the deck's end zone", () => {
    const s = desk();
    expect(solve(s).items.g).toMatchObject({ edge: "deck", zone: "end" });
    // Docked on the left rail (the column drawn as one): it lies in the rail's start zone, its own zone kept.
    const railed = moveTo(s, "g", { kind: "rail", side: "left", ring: 0 });
    expect(railed.edges.find((e) => e.id === "rail")!.items).toContain("g");
    expect(railed.items.g!.align).toBe("end");
    expect(solve(railed).items.g).toMatchObject({ edge: "rail", zone: "start" });
    // At a narrow width the rail is hidden and shows in the deck: g is back in the deck's end zone, after a.
    const narrow: DockState = { ...railed, edges: railed.edges.map((e) => (e.id === "rail" ? { ...e, hidden: true, showIn: "deck" } : e)) };
    const l = solve(narrow);
    expect(l.items.g).toMatchObject({ edge: "deck", zone: "end" });
    expect(l.items.g!.rect.x).toBeGreaterThan(l.items.a!.rect.x + l.items.a!.rect.width + 100);
    // Shown again: in the rail, as before.
    expect(solve(railed).items.g).toMatchObject({ edge: "rail", zone: "start" });
  });

  it("the rail target keeps the zone too, as do a new column and home", () => {
    const s = desk();
    for (const t of targets(s, "g").filter((x) => x.place.kind === "rail" || x.place.kind === "column" || x.place.kind === "home" || x.place.kind === "float")) {
      expect(t.after(P).state.items.g!.align, t.id).toBe("end");
    }
    const away = moveTo(s, "g", { edge: "rail", at: 0 });
    expect(away.items.g!.align).toBe("end");
    expect(dockHome(away, "g", s).items.g!.align).toBe("end");
  });

  it("a gap drop into a named zone still sets that zone", () => {
    const s = desk();
    const start = targets(s, "g").find((t) => t.place.kind === "gap" && t.place.edge === "deck" && t.place.zone === "start")!;
    expect(start).toBeDefined();
    const a = start.after(P).state;
    expect(a.items.g!.align).toBeUndefined();
    expect(solve(a).items.g).toMatchObject({ edge: "deck", zone: "start" });
    expect(moveTo(s, "a", { edge: "deck", zone: "end", at: 0 }).items.a!.align).toBe("end");
    // A gap in the rail, whose start zone is its only one for groups, names no choice: g keeps its own (end).
    const inRail = targets(s, "g").find((t) => t.place.kind === "gap" && t.place.edge === "rail")!;
    expect(inRail.after(P).state.items.g!.align).toBe("end");
  });

  /** The kits' shape: a deck bar, and a compact left rail drawn at a wide width, hidden at a narrow one lending to the deck. */
  const kit = (railZones?: Partial<Record<"start" | "center" | "end", string[]>>): DockState => ({
    stage: { x: 0, y: 0, width: 1400, height: 700 },
    edges: [
      bar("deck", "top", 0, ["a", "c", "g"], { zoneAccepts: { start: ["group"], center: ["group"], end: ["group"] } }),
      { id: "rail", side: "left", ring: 0, accepts: ["group"], items: ["t"], cross: { min: 36, max: 36, rail: 36 }, compact: true, ...(railZones ? { zoneAccepts: railZones } : {}) },
    ],
    items: byId([group("a", 1), group("c", 2, { align: "center" }), group("g", 3, { align: "end" }), group("t", 4)]),
    floats: [],
    floatKinds: ["group"],
  });
  const hide = (s: DockState): DockState => ({ ...s, edges: s.edges.map((e) => (e.id === "rail" ? { ...e, hidden: true, showIn: "deck" } : e)) });

  it("the kits' case: an end-zone group moved onto a one-zone rail (a rail gap, or a move naming its start) keeps its zone and, the rail hidden later, lends back to the deck's end zone", () => {
    const s = kit({ start: ["group"] });
    const byGap = targets(s, "g").filter((t) => t.place.kind === "gap" && t.place.edge === "rail");
    expect(byGap.length).toBeGreaterThan(0);
    const byMove = moveTo(s, "g", { edge: "rail", zone: "start", at: Number.MAX_SAFE_INTEGER });
    for (const wide of [...byGap.map((t) => t.after(P).state), byMove]) {
      expect(wide.edges.find((e) => e.id === "rail")!.items).toContain("g");
      expect(wide.items.g!.align).toBe("end");
      expect(solve(wide).items.g).toMatchObject({ edge: "rail", zone: "start" });
      const l = solve(hide(wide));
      expect(l.items.g).toMatchObject({ edge: "deck", zone: "end" });
      expect(l.edges.deck!.items.filter((x) => l.items[x]?.zone === "end").at(-1)).toBe("g");
    }
  });

  it("on a rail whose start and end zones both take groups, a drop names the zone: end sets end, start sets start", () => {
    const s = kit({ start: ["group"], end: ["group"] });
    const gaps = targets(s, "g").filter((t) => t.place.kind === "gap" && t.place.edge === "rail");
    const end = gaps.find((t) => t.place.kind === "gap" && t.place.zone === "end")!;
    const start = gaps.find((t) => t.place.kind === "gap" && t.place.zone === "start")!;
    expect(end.after(P).state.items.g!.align).toBe("end");
    expect(start.after(P).state.items.g!.align).toBeUndefined();
    expect(moveTo(s, "g", { edge: "rail", zone: "start", at: 0 }).items.g!.align).toBeUndefined();
    expect(moveTo(s, "a", { edge: "rail", zone: "end", at: 0 }).items.a!.align).toBe("end");
    // So does a rail with no zoneAccepts (every zone takes groups, as the kits' rails declare today).
    const open = kit();
    expect(moveTo(open, "g", { edge: "rail", zone: "start", at: Number.MAX_SAFE_INTEGER }).items.g!.align).toBeUndefined();
  });

  it("an item stored in a zone its edge doesn't take lies in the first that does; its stored zone is unchanged", () => {
    const s: DockState = { ...desk(), items: { ...desk().items, a: { ...desk().items.a!, align: "center" } } };
    expect(solve(s).items.a).toMatchObject({ edge: "deck", zone: "start" });
    expect(s.items.a!.align).toBe("center");
    // A drop of another item leaves it as it was.
    for (const t of targets(s, "p")) expect(t.after(P).state.items.a!.align, t.id).toBe("center");
  });
});
