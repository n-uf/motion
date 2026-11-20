/**
 * Home within half a pitch: on a bar or a toolbar rail, a toolbar whose own place lies near the bar's middle, where a
 * center dock lands beside it. No other spot lands within half a pitch of home, and away and back to the press point
 * lands home.
 */
import { describe, expect, it } from "vitest";
import { lanes, solve, SPOT_PITCH, type Edge, type Scene } from "../src/scene";
import { createLandingModel } from "@n-uf/motion/drag";
import { bar, byId, group } from "./scene-fixture";

type Host = "bar" | "rail";

/** Two start toolbars `a` then `c` on a bar or a left rail, `c` keeping `space` px of free room before it. */
function scene(host: Host, space: number): Scene {
  const edge: Edge =
    host === "bar"
      ? bar("top", "top", 0, ["a", "c"])
      : { id: "rail", side: "left", ring: 0, accepts: ["group"], items: ["a", "c"], cross: { min: 30, max: 30, rail: 30 }, compact: true, gap: 4, pad: { start: 4, end: 4 } };
  return {
    stage: { x: 0, y: 0, width: 1000, height: 700 },
    edges: [edge, bar("bottom", "bottom", 0, ["g"])],
    items: byId([group("a", 1), { ...group("c", 2), space }, group("g", 3)]),
    floats: [],
    floatKinds: ["group"],
  };
}

const lo = (r: { x: number; y: number }, ax: "x" | "y"): number => r[ax];

describe("home within half a pitch", () => {
  for (const host of ["bar", "rail"] as const)
    for (let space = 150; space <= 330; space += 12)
      it(`${host}: a toolbar ${space} px from its neighbor, near the middle, away and back is home`, () => {
        const s = scene(host, space);
        const seen = solve(s);
        const ax = host === "bar" ? "x" : "y";
        const edge = host === "bar" ? "top" : "rail";
        const own = seen.items.c!.rect;
        if (seen.items.c!.edge !== edge) return;
        const grab = { x: own.width / 2, y: own.height / 2 };
        const rs = lanes(s, "c", { previous: seen, grab });
        const lane = rs.lanes.find((l) => l.id === edge)!;
        const home = lane.spots.find((sp) => sp.home)!;
        for (const sp of lane.spots) if (!sp.home) expect(Math.abs(lo(sp.landing, ax) - lo(home.landing, ax)), sp.id).toBeGreaterThanOrEqual(SPOT_PITCH / 2);
        const press = { x: own.x + grab.x, y: own.y + grab.y };
        const away = ax === "x" ? { x: press.x - 220, y: press.y } : { x: press.x, y: press.y - 220 };
        const m = createLandingModel({ regions: rs, regionsFor: (spot) => lanes(s, "c", { previous: seen, grab, spot }), home: { lane: edge, spot: home.id } });
        let t = 0;
        m.update(press, t);
        for (const [a, b] of [
          [press, away],
          [away, press],
        ] as const) {
          const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.3 / 8);
          for (let i = 1; i <= n; i++) m.update({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }, (t += 8));
        }
        for (let i = 0; i < 30; i++) m.update(press, (t += 8));
        expect(m.release()).toEqual({ kind: "spot", lane: edge, spot: home.id, home: true });
      });
});
