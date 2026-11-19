/** A rail target whose drop pushes what lies beside it opens its room as it shows (`Target.opensRoom`). */
import { createDragIntent, DRAG_DEFAULTS, type DragTarget } from "@n-uf/motion/drag";
import { describe, expect, it } from "vitest";
import type { Rect } from "../src/geometry";
import { EDGE_ROOM_HOLD, solve, targets, type Scene } from "../src/scene";
import { WINDOW_A, winScene } from "../src/scene/cases/windows";
import { modelScene } from "./model-scene";
import { bar, byId, column, group, panel } from "./scene-fixture";

/** A toolbar on top, an empty or filled compact rail at the left, a panel column beside it. */
const win = (rail: readonly string[] = []): Scene => ({
  stage: { x: 0, y: 0, width: 1200, height: 800 },
  edges: [
    bar("top", "top", 0, ["a", "b"]),
    { id: "rail", side: "left", ring: 0, accepts: ["group"], items: [...rail], cross: { min: 36, max: 36, rail: 36 }, gap: 4, compact: true },
    column("left", "left", 1, ["p"]),
  ],
  items: byId([group("a", 1), group("b", 2), group("c", 3), panel("p", 4)]),
  floats: [],
  floatKinds: ["group"],
});

describe("a rail that pushes a column", () => {
  it("marks the targets of an empty rail, whose drop moves the column, and no other", () => {
    const s = win();
    const before = solve(s).items.p!.rect;
    const ts = targets(s, "a");
    const onRail = ts.filter((t) => t.id.includes(":rail:"));
    expect(onRail.length).toBeGreaterThan(0);
    for (const t of onRail) {
      expect(t.opensRoom, t.id).toBe(true);
      expect(t.after({ x: 10, y: 400 }).layout.items.p!.rect.x).toBeGreaterThan(before.x);
    }
    for (const t of ts.filter((x) => x.place.kind === "gap" && x.place.edge === "top")) expect(t.opensRoom, t.id).toBeUndefined();
    expect(ts.find((t) => t.place.kind === "float")?.opensRoom).toBeUndefined();
  });

  it("a rail already drawn at its width moves nothing, so its gaps show as any gap does", () => {
    const s = win(["c"]);
    for (const t of targets(s, "a").filter((x) => x.id.includes(":rail:"))) expect(t.opensRoom, t.id).toBeUndefined();
  });

  it("the rule is the slot over a moved item, on any target; a rail or line against the window's edge gets the short hold", () => {
    // Against the window's edge: the short hold.
    for (const t of targets(win(), "a").filter((x) => x.id.includes(":rail:"))) expect(t.roomHold, t.id).toBe(EDGE_ROOM_HOLD);
    // A panel held, floating elsewhere: a new-column line at the window's edge (the empty rail takes no room) pushes the
    // column, and waits the same short hold.
    const s: Scene = { ...win(), edges: win().edges.map((e) => (e.id === "left" ? { ...e, column: true, accepts: ["panel"] } : e)), items: { ...win().items, q: panel("q", 5) }, floats: [{ id: "q", rect: { x: 600, y: 200, width: 240, height: 300 } }], floatKinds: ["group", "panel"], columns: { left: { accepts: ["panel"], cross: { min: 180, max: 400, rail: 30 } } } };
    const lines = targets(s, "q").filter((t) => t.place.kind === "column" && t.opensRoom);
    expect(lines.length).toBeGreaterThan(0);
    for (const t of lines) expect(t.roomHold, t.id).toBe(EDGE_ROOM_HOLD);
    // An empty rail with nothing beside it to cover: no room to open with it.
    const bare: Scene = { ...win(), edges: win().edges.filter((e) => e.id !== "left"), items: { a: win().items.a!, b: win().items.b! } };
    for (const t of targets(bare, "a").filter((x) => x.id.includes(":rail:"))) expect(t.opensRoom, t.id).toBeUndefined();
  });

  it("a host driving the intent gets the target and its room in one frame", () => {
    const s = win();
    const list = targets(s, "a") as unknown as DragTarget[];
    const home = solve(s).items.a!.rect;
    const intent = createDragIntent<DragTarget>({ home });
    intent.update({ x: home.x + 4, y: home.y + 4 }, 0, list);
    const p = { x: 4, y: 400 };
    let first = null;
    for (let t = 16; t < 400 && !first; t += 16) {
      const f = intent.update(p, t, list);
      if (f.shown) first = f;
    }
    expect(first!.shown!.id).toContain(":rail:");
    expect(first!.room).toBe(true);
  });

  it("so does a new-column line over a column it pushes, after the full room delay", () => {
    const s = winScene(WINDOW_A, { size: 300 });
    const list = targets(s, "findings") as unknown as DragTarget[];
    const line = list.find((t) => t.id.startsWith("column:left:") && t.opensRoom)!;
    expect(line.roomHold).toBeUndefined();
    const home = solve(s).items.findings!.rect;
    const intent = createDragIntent<DragTarget>({ home });
    intent.update({ x: home.x + 4, y: home.y + 4 }, 0, list);
    const p = { x: line.hit.x + line.hit.width / 2, y: line.hit.y + line.hit.height / 2 };
    let first = null;
    let at = 0;
    for (let t = 16; t < 500 && !first; t += 16) {
      const f = intent.update(p, t, list);
      if (f.shown) {
        first = f;
        at = t;
      }
    }
    expect(first!.shown!.id).toBe(line.id);
    expect(first!.room).toBe(true);
    expect(at).toBeGreaterThanOrEqual(DRAG_DEFAULTS.roomAfter);
  });

  it("a rail drop strip's targets are marked too: armed, their room opens at once, and one flag says so", () => {
    let strips = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const s = modelScene(seed, false, false, true);
      for (const id of Object.keys(s.items).filter((k) => s.items[k]!.kind === "panel" && !s.items[k]!.fixed && !s.items[k]!.closed)) {
        for (const t of targets(s, id).filter((x) => x.arm === "dwell")) {
          expect(t.opensRoom, t.id).toBe(true);
          expect(t.roomHold, t.id).toBeUndefined();
          strips++;
        }
      }
    }
    expect(strips).toBeGreaterThan(0);
  });

  describe("the edge the dragged item leaves", () => {
    /** A column of two panels at the left, one panel at the right: new columns open on both sides. */
    const two = (): Scene => ({
      stage: { x: 0, y: 0, width: 1200, height: 800 },
      edges: [column("left-0", "left", 0, ["p", "q"], { column: true, accepts: ["panel"] }), column("right-0", "right", 0, ["r"], { column: true, accepts: ["panel"] })],
      items: byId([panel("p", 1), panel("q", 2), panel("r", 3)]),
      floats: [],
      floatKinds: ["panel"],
      columns: { left: { accepts: ["panel"], cross: { min: 180, max: 400, rail: 30 } }, right: { accepts: ["panel"], cross: { min: 180, max: 400, rail: 30 } } },
    });

    it("an item the drop pushes aside counts, though it lies in that edge", () => {
      const s = two();
      const before = solve(s).items.q!.rect;
      const line = targets(s, "p").find((t) => t.id === "column:left:0")!;
      expect(line.slot!.x).toBeLessThan(before.x + before.width);
      expect(line.after({ x: 10, y: 300 }).layout.items.q!.rect.x).toBeGreaterThan(before.x);
      expect(line.opensRoom).toBe(true);
    });

    it("a new-column line against the window's edge waits the short hold; one further in, the full delay", () => {
      const s = two();
      const lines = [...targets(s, "p"), ...targets(s, "r")].filter((t) => t.place.kind === "column" && t.opensRoom);
      expect(lines.find((t) => t.id === "column:left:0")).toMatchObject({ roomHold: EDGE_ROOM_HOLD });
      for (const t of lines) {
        const atEdge = (t.hits ?? [t.hit]).some((r) => r.x <= 0 || r.x + r.width >= 1200);
        expect(t.roomHold, t.id).toBe(atEdge ? EDGE_ROOM_HOLD : undefined);
      }
    });

    it("an item that only closes up over the dragged item's place doesn't: gaps between a column's cards stay plain", () => {
      const s = two();
      const gaps = targets(s, "p").filter((t) => t.place.kind === "gap");
      expect(gaps.length).toBeGreaterThan(0);
      for (const t of gaps) expect(t.opensRoom, t.id).toBeUndefined();
    });
  });
});

describe("a target that changes an edge's thickness holds in its hit and landing rect once open (roomHit)", () => {
  const contentMoves = (a: Rect, b: Rect) => Math.abs(a.x - b.x) > 1e-6 || Math.abs(a.y - b.y) > 1e-6 || Math.abs(a.x + a.width - (b.x + b.width)) > 1e-6 || Math.abs(a.y + a.height - (b.y + b.height)) > 1e-6;

  const hull = (a: Rect, b: Rect): Rect => {
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    return { x, y, width: Math.max(a.x + a.width, b.x + b.width) - x, height: Math.max(a.y + a.height, b.y + b.height) - y };
  };

  it("an empty rail's targets: their hit and landing rect, so the rail at its drawn width", () => {
    const s = win();
    const onRail = targets(s, "a").filter((t) => t.id.includes(":rail:"));
    expect(onRail.length).toBeGreaterThan(0);
    for (const t of onRail) {
      const rail = t.after({ x: 10, y: 400 }).layout.edges.rail!.rect;
      expect(t.roomHit, t.id).toEqual(hull(t.hit, t.slot!));
      expect([t.roomHit!.x, t.roomHit!.width], t.id).toEqual([rail.x, rail.width]);
      // Entered over its drawn width already: the room holds no more across than the hit.
      expect(t.roomHit!.width, t.id).toBeGreaterThanOrEqual(t.hit.width);
    }
  });

  it("exactly the targets that open their room and move an edge of the content: rails, new-column lines and bars' strips", () => {
    const kinds = new Set<string>();
    let without = 0;
    let bars = 0;
    for (let seed = 1; seed <= 30; seed++)
      for (const s of [modelScene(seed, false, false, seed % 2 === 0), modelScene(seed, true, seed % 3 === 0, false)]) {
        const l = solve(s);
        for (const id of Object.keys(s.items).filter((k) => !s.items[k]!.fixed && !s.items[k]!.closed).slice(0, 3))
          for (const t of targets(s, id, { previous: l })) {
            if (!t.opensRoom || t.arm === "dwell") {
              expect(t.roomHit, t.id).toBeUndefined();
              continue;
            }
            const moves = contentMoves(t.after({ x: 0, y: 0 }).layout.content, l.content);
            expect(!!t.roomHit, t.id).toBe(moves);
            if (t.roomHit) {
              expect(t.roomHit, t.id).toEqual(hull(t.hit, t.slot!));
              kinds.add(t.place.kind);
              const side = t.place.kind === "gap" ? s.edges.find((e) => e.id === (t.place as { edge: string }).edge)?.side : undefined;
              if (side === "top" || side === "bottom") bars++;
            } else without++;
          }
      }
    expect(kinds.has("column")).toBe(true);
    expect(kinds.has("gap")).toBe(true);
    expect(bars).toBeGreaterThan(0);
    // A gap that only pushes items along its own edge changes no thickness.
    expect(without).toBeGreaterThan(0);
  });

  it("a host driving the intent keeps the rail target and its room across the drawn rail, and loses it past it", () => {
    const s = win();
    const list = targets(s, "a") as unknown as DragTarget[];
    const home = solve(s).items.a!.rect;
    const rail = list.find((t) => t.id.includes(":rail:") && t.hit.y <= 400 && t.hit.y + t.hit.height >= 400)!;
    const intent = createDragIntent<DragTarget>({ home });
    let t = 0;
    intent.update({ x: home.x + 4, y: home.y + 4 }, t, list);
    for (let k = 0; k < 25; k++) intent.update({ x: 4, y: 400 }, (t += 16), list);
    for (let x = 4; x < rail.roomHit!.x + rail.roomHit!.width; x += 2) {
      const f = intent.update({ x, y: 400 }, (t += 16), list);
      expect([x, f.shown?.id, f.room]).toEqual([x, rail.id, true]);
    }
    let f = intent.update({ x: rail.roomHit!.x + rail.roomHit!.width + 30, y: 400 }, (t += 16), list);
    f = intent.update({ x: rail.roomHit!.x + rail.roomHit!.width + 30, y: 400 }, (t += 16), list);
    expect(f.shown?.id ?? null).not.toBe(rail.id);
  });
});
