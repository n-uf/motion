/**
 * A guard on the sliding spot's rule: in random bars (a title, toolbars in every zone keeping room, a readout, controls),
 * every start in every listed range commits where the rule puts it (a snap point within the snap distance, else a whole
 * pixel), with the item's length unchanged. No state tried has needed anything beyond one range per stretch.
 */
import { describe, expect, it } from "vitest";
import { lanes, solve, type DockState, type DockItem } from "../src";
import { bar, byId, controls, group, readout, seeded, title } from "./fixture";

/** A top bar of two to four toolbars in random zones keeping random room, with a title, readout or controls at times. */
function randomState(r: () => number): { s: DockState; held: string } {
  const n = 2 + Math.floor(r() * 3);
  const items: DockItem[] = [];
  const ids: string[] = [];
  if (r() < 0.4) {
    items.push(title());
    ids.push("title");
  }
  for (let i = 0; i < n; i++) {
    const zr = r();
    const align = zr < 0.5 ? "start" : zr < 0.7 ? "center" : "end";
    const space = r() < 0.5 ? Math.round(r() * 200 * 10) / 10 : undefined;
    const it = group(`g${i}`, i + 1, { align, ...(space ? { space } : {}) } as Partial<DockItem>);
    items.push(it);
    ids.push(it.id);
  }
  if (r() < 0.3) {
    items.push(readout());
    ids.push("readout");
  }
  if (r() < 0.4) {
    items.push(controls());
    ids.push("controls");
  }
  const width = 400 + Math.round(r() * 1300 * 10) / 10;
  const s: DockState = {
    stage: { x: 0, y: 0, width, height: 700 },
    edges: [bar("top", "top", 0, ids), bar("bottom", "bottom", 0, ["z"])],
    items: byId([...items, group("z", 99)]),
    floats: [],
    floatKinds: ["group"],
  };
  const groups = ids.filter((x) => x.startsWith("g"));
  return { s, held: groups[Math.floor(r() * groups.length)]! };
}

describe("a sliding spot's range", () => {
  it("in random bars, every start in every listed range commits where the rule puts it, and the ids stay unique", () => {
    const r = seeded(7);
    const bad: string[] = [];
    let checked = 0;
    for (let k = 0; k < 160; k++) {
      const { s, held } = randomState(r);
      const seen = solve(s);
      // A held item folded into the bar's menu has no length for a grab to share: skipped.
      const own = seen.items[held]!;
      if (own.inMenu || Math.max(own.rect.width, own.rect.height) <= 1) continue;
      // The grab at the item's start, so the pointer is the start aimed at (the share of its length is 0).
      const grab = { x: 0, y: 0 };
      const regions = lanes(s, held, { previous: seen, grab, stretchPositions: "free" });
      const ids = regions.lanes.flatMap((l) => l.spots.map((sp) => sp.id));
      expect(new Set(ids).size, `state ${k}`).toBe(ids.length);
      for (const lane of regions.lanes)
        for (const spot of lane.spots) {
          const sl = spot.slide;
          if (!sl) continue;
          const w = spot.landing.width;
          for (let x0 = Math.ceil(sl.from); x0 <= sl.to; x0 += 2) {
            const point = { x: x0, y: lane.rect.y + lane.rect.height / 2 };
            const committed = spot.target.after(point, grab).layout.items[held]!.rect;
            // The rule's start: a snap point within the snap distance, else a whole pixel.
            let want = Math.min(sl.to, Math.max(sl.from, x0));
            const near = sl.snaps.filter((q) => Math.abs(q - want) <= sl.snapDistance).sort((p, q) => Math.abs(p - want) - Math.abs(q - want))[0];
            want = near ?? Math.min(sl.to, Math.max(sl.from, Math.round(want)));
            checked++;
            if (Math.abs(committed.x - want) > 1 || Math.abs(committed.width - w) > 1) bad.push(`state ${k} held ${held} ${spot.id} [${sl.from}, ${sl.to}] x0 ${x0}: wanted ${want}, committed ${committed.x}`);
          }
        }
    }
    expect(checked).toBeGreaterThan(500);
    expect(bad.slice(0, 12)).toEqual([]);
  });
});
