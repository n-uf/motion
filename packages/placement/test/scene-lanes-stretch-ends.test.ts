/**
 * A free stretch's ends: on a bar or a toolbar rail, two toolbars with free room between them (at least a pitch), either
 * one moved toward the other is offered the spot flush against it (the other stays where it is), and a release there
 * lands there. Away and back to the press point still lands home. Over bars and rails, start and end zones, gaps from
 * one pitch up, the held item before or after its neighbor.
 */
import { describe, expect, it } from "vitest";
import { lanes, solve, SPOT_PITCH, type Edge, type Scene } from "../src/scene";
import { createLandingModel } from "@n-uf/motion/drag";
import { bar, byId, group } from "./scene-fixture";

type Host = "bar" | "rail";
type Zone = "start" | "end";
const O = { x: 0, y: 0 };

/** Two toolbars `a` then `c` on a bar or a left rail, `gap` px of free room between them, both in `zone`. */
function scene(host: Host, zone: Zone, gap: number): Scene {
  const edge: Edge =
    host === "bar"
      ? bar("top", "top", 0, ["a", "c"])
      : { id: "rail", side: "left", ring: 0, accepts: ["group"], items: ["a", "c"], cross: { min: 30, max: 30, rail: 30 }, compact: true, gap: 4, pad: { start: 4, end: 4 } };
  const align = zone === "end" ? { align: "end" as const } : {};
  // The room between them is kept by the one on its open side: before `c` in a start zone, after `a` in an end zone.
  return {
    stage: { x: 0, y: 0, width: 1000, height: 700 },
    edges: [edge, bar("bottom", "bottom", 0, ["g"])],
    items: byId([{ ...group("a", 1), ...align, ...(zone === "end" ? { space: gap } : {}) }, { ...group("c", 2), ...align, ...(zone === "start" ? { space: gap } : {}) }, group("g", 3)]),
    floats: [],
    floatKinds: ["group"],
  };
}

const lo = (r: { x: number; y: number }, ax: "x" | "y"): number => r[ax];
const ln = (r: { width: number; height: number }, ax: "x" | "y"): number => (ax === "x" ? r.width : r.height);

describe("a free stretch's ends", () => {
  for (const host of ["bar", "rail"] as const)
    for (const zone of ["start", "end"] as const)
      for (const gap of [SPOT_PITCH, 55, 90, 130, 200])
        for (const [held, other] of [
          ["a", "c"],
          ["c", "a"],
        ] as const)
          it(`${host}, ${zone} zone, ${gap} px apart: ${held} moved toward ${other} is offered the spot flush against it, and lands there`, () => {
            const s = scene(host, zone, gap);
            const seen = solve(s);
            const ax = host === "bar" ? "x" : "y";
            const edge = host === "bar" ? "top" : "rail";
            const own = seen.items[held]!.rect;
            const nb = seen.items[other]!.rect;
            // The room as seen: what the held item has to cover to touch its neighbor.
            const room = held === "a" ? lo(nb, ax) - (lo(own, ax) + ln(own, ax)) - 4 : lo(own, ax) - (lo(nb, ax) + ln(nb, ax)) - 4;
            expect(room).toBeGreaterThan(SPOT_PITCH - 1);
            const grab = { x: own.width / 2, y: own.height / 2 };
            const previous = seen;
            const rs = lanes(s, held, { previous, grab });
            const lane = rs.lanes.find((l) => l.id === edge)!;
            const flushAt = held === "a" ? lo(nb, ax) - 4 - ln(own, ax) : lo(nb, ax) + ln(nb, ax) + 4;
            const flush = lane.spots.find((sp) => Math.abs(lo(sp.landing, ax) - flushAt) <= 1);
            expect(flush, `flush spot at ${flushAt}: ${lane.spots.map((sp) => `${sp.id}@${Math.round(lo(sp.landing, ax))}`).join(" ")}`).toBeDefined();
            // The neighbor stays where it is.
            const after = flush!.target.after(O, O).layout;
            expect(Math.abs(lo(after.items[other]!.rect, ax) - lo(nb, ax))).toBeLessThanOrEqual(1);
            expect(Math.abs(lo(after.items[held]!.rect, ax) - flushAt)).toBeLessThanOrEqual(1);
            // A slow move from the press point to where the item is held over that spot, held still: it lands there.
            const home = { lane: edge, spot: lane.spots.find((sp) => sp.home)!.id };
            const press = { x: own.x + grab.x, y: own.y + grab.y };
            const to = ax === "x" ? { x: flushAt + grab.x, y: press.y } : { x: press.x, y: flushAt + grab.y };
            const drive = (path: { x: number; y: number }[]) => {
              const m = createLandingModel({ regions: rs, regionsFor: (spot) => lanes(s, held, { previous, grab, spot }), home });
              let t = 0;
              m.update(path[0]!, t);
              for (let k = 1; k < path.length; k++) {
                const a = path[k - 1]!;
                const b = path[k]!;
                const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 0.3 / 8));
                for (let i = 1; i <= n; i++) m.update({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }, (t += 8));
              }
              for (let i = 0; i < 30; i++) m.update(path.at(-1)!, (t += 8));
              return m.release();
            };
            expect(drive([press, to])).toEqual({ kind: "spot", lane: edge, spot: flush!.id, home: false });
            // Away and back to the press point is home.
            expect(drive([press, to, press])).toEqual({ kind: "spot", lane: edge, spot: home.spot, home: true });
          });

  // Home within half a pitch: a toolbar whose own place lies near the bar's middle, where a center dock lands beside
  // it. No other spot lands within half a pitch of home, and away and back to the press point lands home.
  for (const host of ["bar", "rail"] as const)
    for (let space = 150; space <= 330; space += 12)
      it(`${host}: a toolbar ${space} px from its neighbor, near the middle, away and back is home`, () => {
        const s = scene(host, "start", space);
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
