/**
 * The window's side, swept across by a floating panel: the rail stop holds the outer 10 px from the window's edge (an
 * inset's strip included), and the outermost column line follows it inward, with the side empty or holding a column,
 * flush or inset, left and right alike.
 */
import { targetAt } from "@n-uf/motion/drag";
import { describe, expect, it } from "vitest";
import { refusals, targets, type DockState, type DockDrop } from "../src";
import { byId, column, panel } from "./fixture";

const W = 1440;
const tpl = { accepts: ["panel"], cross: { min: 220, max: 640, rail: 32 } };
const stateOf = (inset: number, rightOpen: boolean): DockState => ({
  stage: { x: 0, y: 0, width: W, height: 900 },
  edges: [
    { ...column("left-0", "left", 0, ["pages", "notes"]), column: true, accepts: ["panel"], cross: tpl.cross, size: 300 },
    ...(rightOpen ? [{ ...column("right-0", "right", 0, ["findings"]), column: true, accepts: ["panel"], cross: tpl.cross, size: 300 }] : []),
  ],
  items: byId([panel("pages", 1, {}, 300), panel("notes", 2, {}, 300), panel("findings", 3, {}, 300), panel("x", 4, {}, 300)]),
  floats: [...(rightOpen ? [] : [{ id: "findings", rect: { x: 600, y: 200, width: 300, height: 300 } }]), { id: "x", rect: { x: 700, y: 100, width: 200, height: 200 } }],
  floatKinds: ["panel"],
  columns: { left: tpl, right: tpl },
  rails: { left: { width: 32, accepts: ["panel"] }, right: { width: 32, accepts: ["panel"] } },
  contentMin: { width: 320, height: 240 },
  gutter: 12,
  inset: { left: inset, right: inset, top: inset, bottom: inset },
});

/** What the pointer picks at each px from the side's window edge, as runs: `[kind, from, to]`. */
function bands(s: DockState, side: "left" | "right", y = 450, n = 50): [string, number, number][] {
  const ts = targets(s, "x");
  const rs = refusals(s, "x");
  const out: [string, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const x = side === "left" ? i + 0.5 : W - i - 0.5;
    const t = targetAt(ts, { x, y }) as DockDrop | null;
    const r = !t || t.free ? rs.find((q) => x >= q.hit.x && x < q.hit.x + q.hit.width && y >= q.hit.y && y < q.hit.y + q.hit.height) : undefined;
    const kind = t && !t.free ? t.place.kind : r ? "refused" : (t?.place.kind ?? "none");
    const last = out[out.length - 1];
    if (last && last[0] === kind) last[2] = i;
    else out.push([kind, i, i]);
  }
  return out;
}

describe("the rail stop at the window's edge", () => {
  it("rail 0–9 px from the window's edge, the column line from 10 to at least 33, inset or flush, both sides", () => {
    for (const inset of [0, 12])
      for (const open of [false, true]) {
        const s = stateOf(inset, open);
        // The left side holds a column; the right one too when `open`, else it is empty.
        for (const side of ["left", "right"] as const) {
          const b = bands(s, side);
          const tag = `inset ${inset}, right ${open ? "open" : "empty"}, ${side}: ${JSON.stringify(b)}`;
          expect(b[0], tag).toEqual(["rail", 0, 9]);
          expect(b[1]![0], tag).toBe("column");
          expect(b[1]![1], tag).toBe(10);
          expect(b[1]![2], tag).toBeGreaterThanOrEqual(33);
        }
      }
  });
});
