/**
 * `lanes()` for a landing model's guides and gates: which spots move another item, the guide marks in the layout as
 * drawn (never over an item), refused stretches at least the item's length, and pitched spots on a toolbar rail.
 */
import { describe, expect, it } from "vitest";
import type { Rect } from "../src/geometry";
import { lanes, solve, SPOT_PITCH, type Scene, type SceneItem } from "../src/scene";
import { WINDOW_A, winScene } from "../src/scene/cases/windows";
import { modelScene } from "./model-scene";
import { bar, byId, group } from "./scene-fixture";

const scenes = (): [string, Scene][] => [
  ["window A", winScene(WINDOW_A, { size: 300 })],
  ...[1, 2, 3, 4, 5, 6].map((seed): [string, Scene] => [`model ${seed}`, modelScene(seed, seed % 2 === 0, seed % 3 === 0, false)]),
];
const movable = (s: Scene): string[] => Object.keys(s.items).filter((k) => !s.items[k]!.fixed && !s.items[k]!.closed).slice(0, 4);
const overlaps = (a: Rect, b: Rect): boolean => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1e-6 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1e-6;
const len = (r: Rect, axis: "x" | "y"): number => (axis === "x" ? r.width : r.height);

/** A 1200 px top bar with a start item a; g held from the bottom bar. */
const barWin = (): Scene => ({
  stage: { x: 0, y: 0, width: 1200, height: 700 },
  edges: [bar("top", "top", 0, ["a"]), bar("bottom", "bottom", 0, ["g"])],
  items: byId([group("a", 1), group("g", 2)]),
  floats: [],
  floatKinds: ["group"],
});

describe("lanes(): where a spot's drop draws the other items", () => {
  it("before the bar's first item moves it; after it, at the end, or at a pitch past it, the others stay alike", () => {
    const s = barWin();
    const top = lanes(s, "g", { previous: solve(s) }).lanes.find((l) => l.id === "top")!;
    const after = top.spots.filter((sp) => sp.id.startsWith("top/start/a|") || sp.id.startsWith("top/end/"));
    expect(after.length).toBeGreaterThan(3);
    expect(new Set(after.map((sp) => sp.others)).size).toBe(1);
    expect(top.spots.find((sp) => sp.id === "top/start/^|a")!.others).not.toBe(after[0]!.others);
  });

  it("the bar's only item moved along it: every pitched spot draws the others alike", () => {
    const s = barWin();
    const top = lanes(s, "a", { previous: solve(s) }).lanes.find((l) => l.id === "top")!;
    const pitched = top.spots.filter((sp) => sp.pitched);
    expect(pitched.length).toBeGreaterThan(5);
    expect(new Set(pitched.map((sp) => sp.others)).size).toBe(1);
  });

  it("two spots with one key draw every other item alike", () => {
    for (const [name, s] of scenes().slice(0, 3))
      for (const id of movable(s)) {
        const spots = lanes(s, id, { previous: solve(s) }).lanes.flatMap((l) => l.spots.filter((sp) => !sp.home));
        const first = new Map<string, (typeof spots)[number]>();
        for (const sp of spots) {
          const a = first.get(sp.others);
          if (!a) {
            first.set(sp.others, sp);
            continue;
          }
          const la = a.target.after({ x: 0, y: 0 }, { x: 0, y: 0 }).layout;
          const lb = sp.target.after({ x: 0, y: 0 }, { x: 0, y: 0 }).layout;
          for (const [k, it] of Object.entries(la.items)) {
            const other = lb.items[k];
            if (k === id || !other || it.inMenu || other.inMenu) continue;
            const d = Math.max(Math.abs(it.rect.x - other.rect.x), Math.abs(it.rect.y - other.rect.y), Math.abs(it.rect.width - other.rect.width), Math.abs(it.rect.height - other.rect.height));
            expect(d, `${name} ${id} ${sp.id} ${k}`).toBeLessThan(1);
          }
        }
      }
  });
});

describe("lanes(): guide marks", () => {
  it("never lie over an item drawn on the lane, as seen or with a spot held, and a box fits the item", () => {
    for (const [name, s] of scenes())
      for (const id of movable(s)) {
        const prev = solve(s);
        const seen = lanes(s, id, { previous: prev });
        const check = (ls: typeof seen.lanes, drawn: ReturnType<typeof solve>, spot: string): void => {
          for (const l of ls) {
            const items = Object.values(drawn.items).filter((it) => it.edge === l.id && !it.inMenu && !it.floating && it.rect.width > 0 && it.rect.height > 0);
            const itemLen = Math.min(...l.spots.map((sp) => len(sp.landing, l.axis)));
            for (const m of l.marks) {
              for (const it of items) expect(overlaps(m.rect, it.rect), `${name} ${id} ${spot} ${l.id} ${m.kind}`).toBe(false);
              if (m.kind === "box") expect(len(m.rect, l.axis) + 1e-6, `${name} ${id} ${l.id}`).toBeGreaterThanOrEqual(itemLen);
            }
          }
        };
        check(seen.lanes, prev, "seen");
        for (const l of seen.lanes.slice(0, 3)) {
          const sp = l.spots[Math.floor(l.spots.length / 2)]!;
          const held = lanes(s, id, { previous: prev, spot: sp.id });
          check(held.lanes.filter((x) => x.id === l.id), sp.target.after({ x: 0, y: 0 }, { x: 0, y: 0 }).layout, sp.id);
        }
      }
  });

  it("a bar with room shows a box over its free stretch, and lines between items that touch", () => {
    const s: Scene = { ...barWin(), edges: [bar("top", "top", 0, ["a", "b"]), bar("bottom", "bottom", 0, ["g"])], items: byId([group("a", 1), group("b", 3), group("g", 2)]) };
    const top = lanes(s, "g", { previous: solve(s) }).lanes.find((l) => l.id === "top")!;
    expect(top.marks.filter((m) => m.kind === "box").length).toBeGreaterThan(0);
    expect(top.marks.filter((m) => m.kind === "line").map((m) => m.id)).toContain("top/line/a|b");
  });

  it("have ids unique per lane, and lines keep theirs while the window grows", () => {
    for (const [name, s] of scenes())
      for (const id of movable(s)) {
        const ids = (sc: Scene): Map<string, string[]> => new Map(lanes(sc, id).lanes.map((l) => [l.id, l.marks.map((m) => m.id)]));
        const before = ids(s);
        for (const [lane, list] of before) expect(new Set(list).size, `${name} ${id} ${lane}`).toBe(list.length);
        const after = ids({ ...s, stage: { ...s.stage, width: s.stage.width + 120 } });
        // An edge's lines (a virtual lane's line is its box while the held item is drawn over it).
        for (const [lane, list] of before) if (!lane.includes(":")) for (const m of list.filter((x) => x.includes("/line/"))) expect(after.get(lane) ?? [], `${name} ${id} ${m}`).toContain(m);
      }
  });

  it("lie inside their lane's rect", () => {
    for (const [name, s] of [...scenes(), ...[9, 10, 11, 12, 13, 14].map((seed): [string, Scene] => [`model ${seed}`, modelScene(seed, seed % 2 === 0, seed % 3 === 0, false)])])
      for (const id of movable(s))
        for (const l of lanes(s, id, { previous: solve(s) }).lanes) {
          if (l.id.includes(":")) continue;
          for (const m of l.marks) {
            const r = m.rect;
            const inside = r.x >= l.rect.x - 0.5 && r.y >= l.rect.y - 0.5 && r.x + r.width <= l.rect.x + l.rect.width + 0.5 && r.y + r.height <= l.rect.y + l.rect.height + 0.5;
            expect(inside, `${name} ${id} ${m.id}`).toBe(true);
          }
        }
  });

  it("a column with one panel gets lines at its ends, so its lane shows guides", () => {
    const s = winScene(WINDOW_A, { size: 300 });
    const right = lanes(s, "pages", { previous: solve(s) }).lanes.find((l) => l.id === "right-0")!;
    expect(right.marks.length).toBeGreaterThan(0);
  });

  it("every refused stretch in a lane is at least the item's length", () => {
    for (const [name, s] of scenes())
      for (const id of movable(s))
        for (const l of lanes(s, id).lanes) {
          const itemLen = Math.min(...l.spots.map((sp) => len(sp.landing, l.axis)));
          for (const f of l.refused) expect(f.along[1] - f.along[0] + 1e-6, `${name} ${id} ${l.id}`).toBeGreaterThanOrEqual(itemLen);
        }
  });
});

describe("lanes(): pitched spots on a toolbar rail", () => {
  it("a compact rail gets spots at the pitch over its free stretch, like a bar", () => {
    const s: Scene = {
      stage: { x: 0, y: 0, width: 1000, height: 700 },
      edges: [bar("bottom", "bottom", 0, ["g"]), { id: "rail-left", side: "left", ring: 0, accepts: ["group"], items: ["t"], cross: { min: 30, max: 30, rail: 30 }, compact: true }],
      items: byId([group("t", 1), group("g", 2)]),
      floats: [],
      floatKinds: ["group"],
    };
    const rail = lanes(s, "g", { previous: solve(s) }).lanes.find((l) => l.id === "rail-left")!;
    expect(rail.axis).toBe("y");
    const pitched = rail.spots.filter((sp) => sp.pitched);
    expect(pitched.length).toBeGreaterThan(3);
    for (let i = 1; i < pitched.length; i++) expect(pitched[i]!.landing.y - pitched[i - 1]!.landing.y).toBeGreaterThanOrEqual(SPOT_PITCH / 2);
  });
});

describe("lanes(): spots beside kept space and over a growing item", () => {
  /** A 1200 px top bar with `items`; g held from the bottom bar. */
  const win = (items: string[], more: Record<string, Partial<SceneItem>>): Scene => ({
    stage: { x: 0, y: 0, width: 1200, height: 700 },
    edges: [bar("top", "top", 0, items), bar("bottom", "bottom", 0, ["g"])],
    items: byId([...items.map((id, i) => ({ ...group(id, i + 1), ...more[id] }) as SceneItem), group("g", 9)]),
    floats: [],
    floatKinds: ["group"],
  });

  it("beside an end item keeping space after it, a dock keeping none lands at the bar's end", () => {
    // e at the end keeps 160 px after it; the dock after e takes that space, and one more keeps none, at the end.
    const s = win(["a", "e"], { e: { align: "end", space: 160 } });
    const top = lanes(s, "g", { previous: solve(s) }).lanes.find((l) => l.id === "top")!;
    const end = solve(s).edges.top!.rect;
    expect(top.spots.some((sp) => Math.abs(sp.landing.x + sp.landing.width - (end.x + end.width - 8)) < 1)).toBe(true);
  });

  it("a growing item's length past its natural one gets pitched spots, as a free stretch does", () => {
    // t (a start item after a) grows to fill the bar: docks after a can still land along t's grown part.
    const grows: Partial<SceneItem> = { fixed: true, forms: { row: [{ kind: "row", main: { min: 80, natural: 160, grows: true }, cross: { natural: 28 } }] } };
    const s = win(["a", "t"], { t: grows });
    const t = solve(s).items.t!.rect;
    const top = lanes(s, "g", { previous: solve(s) }).lanes.find((l) => l.id === "top")!;
    const inside = top.spots.filter((sp) => sp.pitched && sp.landing.x > t.x + 1 && sp.landing.x < t.x + t.width - 160);
    expect(inside.length).toBeGreaterThan(3);
  });

  it("before a growing item there are none: a dock there keeps no space (the growing item takes all that is spare)", () => {
    const grows: Partial<SceneItem> = { forms: { row: [{ kind: "row", main: { min: 80, natural: 160, grows: true }, cross: { natural: 28 } }] } };
    const s = win(["t", "a"], { t: grows });
    const top = lanes(s, "g", { previous: solve(s) }).lanes.find((l) => l.id === "top")!;
    expect(top.spots.filter((sp) => sp.pitched && sp.id.includes("^|t"))).toEqual([]);
  });
});
