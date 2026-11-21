/**
 * Reach only adds, over whole scenes with panel bodies: no target offered at `endReach: 0` is missing at a larger
 * reach. Pinned on a column holding two open panels with an empty bar across its foot: the footer gap, between the last
 * panel and the bar, keeps its own tile, as the ownership's room and the tiler place its line at the column's drawn end.
 */
import { describe, expect, it } from "vitest";
import { targets, type Edge, type Scene } from "../src/scene";
import { byId, column, panel } from "./scene-fixture";

type Bar = "empty" | "holding" | "absent";
interface Case {
  readonly w: number;
  readonly h: number;
  readonly side: "left" | "right";
  readonly panels: 1 | 2;
  readonly foot: Bar;
  readonly head: Bar;
  readonly inset: number;
}

const cols = { accepts: ["panel"], cross: { min: 220, max: 640, rail: 32 } };
const word = (id: string) => ({
  id,
  kind: "group",
  used: 1,
  forms: { row: [{ kind: "row", main: { min: 120, natural: 120 }, cross: { natural: 28 } }, { kind: "menu", main: { min: 0, natural: 0 }, cross: { natural: 0 } }] },
});

function sceneOf(c: Case): Scene {
  const bar = (id: string, side: "top" | "bottom", state: Bar): Edge[] =>
    state === "absent" ? [] : [{ id, side, ring: 0, accepts: ["group", "panel"], items: state === "holding" ? [`${id}-w`] : [], cross: { min: 28, max: 28, rail: 28 } } as Edge];
  const inCol = c.panels === 2 ? ["p1", "p2"] : ["p1"];
  return {
    stage: { x: 0, y: 0, width: c.w, height: c.h },
    edges: [...bar("foot", "bottom", c.foot), ...bar("head", "top", c.head), { ...column("col0", c.side, 0, inCol), column: true, accepts: ["panel"], cross: cols.cross, size: 290 }],
    items: { ...byId([panel("p1", 1, {}, 290), panel("p2", 2, {}, 290), panel("x", 3, {}, 290)]), "foot-w": word("foot-w"), "head-w": word("head-w"), g: word("g") },
    floats: [
      { id: "x", rect: { x: c.w / 2 - 145, y: 100, width: 290, height: 300 } },
      { id: "g", rect: { x: c.w / 2 - 64, y: 40, width: 128, height: 34 } },
    ],
    floatKinds: ["panel", "group"],
    columns: { left: cols, right: cols },
    contentMin: { width: 320, height: 240 },
    inset: { top: c.inset, right: c.inset, bottom: c.inset, left: c.inset },
  } as unknown as Scene;
}

const ids = (s: Scene, dragged: string, endReach: number): string[] => targets(s, dragged, { endReach }).map((t) => t.id);

describe("endReach on a column with panel bodies and a bar across its foot", () => {
  for (const r of [8, 24])
    it(`the footer gap keeps its own tile (endReach ${r})`, () => {
      const s = sceneOf({ w: 1275, h: 580, side: "right", panels: 2, foot: "empty", head: "absent", inset: 0 });
      const at0 = targets(s, "x", { endReach: 0 }).find((t) => t.id === "gap:col0:start:2");
      expect(at0).toBeDefined();
      const now = targets(s, "x", { endReach: r }).find((t) => t.id === "gap:col0:start:2");
      expect(now, `endReach ${r}`).toBeDefined();
      // Its tile at reach 0, between the last panel and the bar, is all still its own.
      const [h] = at0!.hits ?? [at0!.hit];
      const cx = h!.x + h!.width / 2;
      const cy = h!.y + h!.height / 2;
      expect((now!.hits ?? [now!.hit]).some((p) => cx >= p.x && cx < p.x + p.width && cy >= p.y && cy < p.y + p.height), JSON.stringify(now!.hits ?? [now!.hit])).toBe(true);
    });
});

describe("property: no target present at endReach 0 is missing at a larger reach", () => {
  const cases: Case[] = [];
  for (const [w, h] of [
    [1275, 580],
    [1024, 700],
    [800, 600],
  ] as const)
    for (const side of ["left", "right"] as const)
      for (const panels of [1, 2] as const)
        for (const foot of ["empty", "holding", "absent"] as const)
          for (const head of ["empty", "absent"] as const) for (const inset of [0, 12]) cases.push({ w, h, side, panels, foot, head, inset });

  it(`a panel and a toolbar held, ${cases.length} scenes, endReach 8, 24 and 60`, () => {
    for (const c of cases) {
      const s = sceneOf(c);
      for (const dragged of ["x", "g"]) {
        const base = ids(s, dragged, 0);
        for (const r of [8, 24, 60]) {
          const now = new Set(ids(s, dragged, r));
          expect(
            base.filter((id) => !now.has(id)),
            `${JSON.stringify(c)} ${dragged} endReach ${r}`,
          ).toEqual([]);
        }
      }
    }
  });
});
