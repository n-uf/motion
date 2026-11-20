/**
 * A spot's `target.place` is the dock at the spot's listed landing. A sliding spot commits through
 * `after(point, grab)` (the landing model's release says where, by `home` and `at`), but its place is still the dock a
 * drop at its listed landing makes: the zone and index of that dock, the item's own on its own stretch.
 */
import { describe, expect, it } from "vitest";
import { lanes, moveTo, solve, type DockPlace, type Scene } from "../src/scene";
import { bar, byId, group } from "./scene-fixture";

const scene = (items: ReturnType<typeof group>[]): Scene => ({
  stage: { x: 0, y: 0, width: 1200, height: 700 },
  edges: [bar("top", "top", 0, items.map((i) => i.id)), bar("bottom", "bottom", 0, ["z"])],
  items: byId([...items, group("z", 9)]),
  floats: [],
  floatKinds: ["group"],
});

const CASES: [string, string, ReturnType<typeof group>[]][] = [
  ["end-zone item between a start and an end item", "e", [group("s", 1), group("e", 2, { align: "end", space: 100 }), group("c", 3, { align: "end" })]],
  ["start item keeping room before an end item", "s", [group("s", 1, { space: 60 }), group("e", 2, { align: "end" })]],
  ["end item after a start item", "e", [group("s", 1), group("e", 2, { align: "end" })]],
  ["start item between two", "b", [group("a", 1), group("b", 2, { space: 40 }), group("c", 3)]],
  ["end item among end items", "n", [group("m", 1, { align: "end" }), group("n", 2, { align: "end", space: 30 }), group("o", 3, { align: "end" })]],
];

describe("a spot's place is the dock at its listed landing", () => {
  for (const [name, held, items] of CASES)
    it(`${name}: ${held}'s sliding and home spots' places land where the spot is listed`, () => {
      const s = scene(items);
      const seen = solve(s);
      const own = seen.items[held]!.rect;
      const grab = { x: own.width / 2, y: own.height / 2 };
      let checked = 0;
      for (const l of lanes(s, held, { previous: seen, grab, stretchPositions: "free" }).lanes)
        for (const sp of l.spots) {
          if (!sp.slide || sp.target.place.kind !== "gap") continue;
          const at = solve(moveTo(s, held, sp.target.place as DockPlace), { previous: seen }).items[held]!;
          expect(Math.abs(at.rect.x - sp.landing.x), `${sp.id} place ${JSON.stringify(sp.target.place)}`).toBeLessThanOrEqual(1);
          if (sp.home) expect(sp.target.place, sp.id).toMatchObject({ zone: seen.items[held]!.zone });
          checked++;
        }
      expect(checked).toBeGreaterThan(0);
    });
});
