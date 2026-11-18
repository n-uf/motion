/** The window's edge belongs only to the targets drawn against it, and a target beats a refusal where they meet. */
import { REFUSAL_RANK as MOTION_REFUSAL_RANK, pickRank as motionPickRank, targetAt } from "@n-uf/motion/drag";
import { describe, expect, it } from "vitest";
import { REFUSAL_RANK, pickRank } from "../index";
import { CASES } from "../src/scene/cases";
import { pickTarget } from "../src/scene/cases/host";
import { refusalTargets, refusals, solve, targets, type Scene } from "../src/scene";
import { modelScene } from "./model-scene";

const row = (id: string): Scene => CASES.find((c) => c.id === id)!.scene!;
/** Every target and refusal for a drag of `item`, as a host passes them to the pick. */
const pickList = (s: Scene, item: string) => {
  const previous = solve(s);
  return [...targets(s, item, { previous, endReach: 24 }), ...refusalTargets(refusals(s, item, { previous, endReach: 24 }))];
};
const ids = (s: Scene, item: string, p: { x: number; y: number }) => [targetAt(pickList(s, item), p)?.id ?? null, pickTarget(pickList(s, item), p)?.id ?? null];

describe("refusals and the window's edge", () => {
  it("every refusal and the float carry the stage as `bounds`; no gap or slot does", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = modelScene(seed, seed % 2 === 0);
      const item = Object.keys(s.items).find((k) => !s.items[k]!.fixed && !s.items[k]!.closed)!;
      for (const r of refusals(s, item)) expect(r.bounds).toEqual(s.stage);
      for (const r of refusalTargets(refusals(s, item))) expect(r.bounds).toEqual(s.stage);
      for (const t of targets(s, item)) expect(t.bounds === undefined ? "none" : t.place.kind, t.id).toBe(t.bounds === undefined ? "none" : "float");
      expect(targets(s, item).find((t) => t.place.kind === "float")?.bounds).toEqual(s.stage);
    }
  });

  it("a refusal ranks after every target of priority 1 and 2, before the float: one rank in both packages", () => {
    expect(REFUSAL_RANK).toBe(2.5);
    expect(REFUSAL_RANK).toBe(MOTION_REFUSAL_RANK);
    for (const t of [{ priority: 1 as const, refuse: true as const }, { priority: 2 as const }, { priority: 3 as const }, { priority: 2 as const, refuse: true as const }]) expect(pickRank(t)).toBe(motionPickRank(t));
    expect(pickRank({ priority: 1, refuse: true })).toBe(REFUSAL_RANK);
    expect(pickRank({ priority: 2 })).toBe(2);
  });

  it("a point on the window's edge picks a gap that reaches it, else nothing: never a refusal, never the float", () => {
    // P7-end-reach, at the point the runner clamps (958, 814) to: the right column's last gap.
    expect(ids(row("P7-end-reach"), "pages", { x: 958, y: 800 })).toEqual(["gap:right-0:start:1", "gap:right-0:start:1"]);
    // Over open content at the bottom edge: nothing (it was the float).
    expect(ids(row("P7-end-reach"), "pages", { x: 560, y: 800 })).toEqual([null, null]);
    expect(ids(row("P7-end-reach"), "pages", { x: 560, y: 799 })).toEqual(["float:pages", "float:pages"]);
    // Past a refused status line: on it the refusal, on the edge below it nothing.
    const bar = row("P7-past-a-refused-bar");
    expect(ids(bar, "findings", { x: 700, y: 796 })).toEqual(["refuse:statusbar:start", "refuse:statusbar:start"]);
    expect(ids(bar, "findings", { x: 700, y: 800 })).toEqual([null, null]);
    expect(ids(bar, "findings", { x: 700, y: 840 })).toEqual([null, null]);
  });

  it("where a target meets a refusal, the target wins", () => {
    const s = row("P7-target-meets-a-refusal");
    const list = pickList(s, "pages");
    const col = list.find((t) => t.id === "column:right:0")!;
    const rim = list.find((t) => t.id === "refuse:statusbar:start")!;
    // The column line is the larger zone; on the line they share, it wins all the same.
    expect(col.hit.width * col.hit.height).toBeGreaterThan(rim.hit.width * rim.hit.height);
    expect(col.hit.y + col.hit.height).toBe(rim.hit.y);
    expect(ids(s, "pages", { x: 1098, y: rim.hit.y })).toEqual(["column:right:0", "column:right:0"]);
    expect(ids(s, "pages", { x: 1098, y: rim.hit.y + 1 })).toEqual(["refuse:statusbar:start", "refuse:statusbar:start"]);
  });
});
