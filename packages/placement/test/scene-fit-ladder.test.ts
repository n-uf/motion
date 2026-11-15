/**
 * Toolbars that don't fit: per item the ladder row → icons → the edge's » menu, lowest `priority` first (ties: used
 * longest ago); room coming back brings them up in reverse; no item leaves its edge; the menu lists exactly what it
 * holds. Swept over random bars, the stage shrinking then growing back under `previous`.
 */
import { describe, expect, it } from "vitest";
import { solve, type Edge, type Scene, type SceneItem, type SceneLayout } from "../src/scene";
import { byId, seeded } from "./scene-fixture";

function barScene(seed: number): Scene {
  const rnd = seeded(seed);
  const items: SceneItem[] = [];
  const edges: Edge[] = [];
  let n = 0;
  const group = (priority: number): string => {
    const id = `g${n++}`;
    const w = 80 + Math.floor(rnd() * 180);
    items.push({
      id,
      kind: "group",
      used: Math.floor(rnd() * 50),
      priority,
      forms: { row: [{ kind: "row", main: { min: w, natural: w }, cross: { natural: 32 } }, { kind: "icons", main: { min: 40 + Math.floor(rnd() * 40), natural: 40 + Math.floor(rnd() * 40) }, cross: { natural: 32 } }, { kind: "menu", main: { min: 0, natural: 0 }, cross: { natural: 0 } }] },
    });
    return id;
  };
  for (const [i, side] of (["top", "top", "bottom"] as const).entries()) {
    const count = 2 + Math.floor(rnd() * 4);
    // Distinct priorities within an edge, in a random order; the first bar's default priority is lower (a title bar's).
    const ps = Array.from({ length: count }, (_, k) => k).sort(() => rnd() - 0.5);
    edges.push({ id: `bar${i}`, side, ring: i, accepts: ["group"], items: ps.map((p) => group(p)), cross: { min: 32, max: 32, rail: 32 }, gap: 4, pad: { start: 8, end: 8 }, menu: { main: 28 }, ...(i === 0 ? { priority: -10 } : {}) });
  }
  return { stage: { x: 0, y: 0, width: 1400, height: 600 }, edges, items: byId(items), floats: [], floatKinds: ["group"] };
}

/** Each item's step: its form index, or past the last form while in the menu. */
const steps = (s: Scene, l: SceneLayout): Record<string, number> =>
  Object.fromEntries(Object.keys(s.items).map((id) => [id, l.items[id]!.inMenu ? 99 : l.items[id]!.form]));

describe("the fit ladder", () => {
  it("steps down monotonically, lowest priority first, never leaving its edge; the menu holds exactly its items; growing back restores the start", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const s0 = barScene(seed);
      const start = solve(s0);
      const startSteps = steps(s0, start);
      let previous = start;
      let last = startSteps;
      const widths: number[] = [];
      for (let w = 1400; w >= 200; w -= 40) widths.push(w);
      const check = (s: Scene, l: SceneLayout, w: number, shrinking: boolean): void => {
        for (const e of s.edges) {
          // The menu lists exactly the items it holds, in the edge's order.
          const held = e.items.filter((id) => l.items[id]?.inMenu);
          expect(l.edges[e.id]!.menu?.items ?? [], `seed ${seed} at ${w}: ${e.id}'s menu`).toEqual(held);
          for (const id of e.items) expect(l.items[id]!.edge, `seed ${seed} at ${w}: ${id} left its edge`).toBe(e.id);
          // Lowest priority first: an item is down only while every lower-priority item of its edge is in the menu, shrinking
          // and, growing back in the strict reverse order, growing too (a higher-priority item is back at its form before a
          // lower one leaves the menu).
          void shrinking;
          const st = steps(s, l);
          for (const id of e.items) {
            if (st[id]! === startSteps[id]!) continue;
            for (const other of e.items) {
              if (s.items[other]!.priority! < s.items[id]!.priority!) expect(st[other], `seed ${seed} at ${w}: ${id} stepped down before ${other}`).toBe(99);
            }
          }
        }
      };
      const downAt = new Map<number, Record<string, number>>();
      for (const w of widths) {
        const s = { ...s0, stage: { ...s0.stage, width: w } };
        const l = solve(s, { previous });
        const st = steps(s, l);
        for (const id of Object.keys(st)) expect(st[id]!, `seed ${seed} at ${w}: ${id} stepped up while shrinking`).toBeGreaterThanOrEqual(last[id]!);
        check(s, l, w, true);
        downAt.set(w, st);
        previous = l;
        last = st;
      }
      for (const w of [...widths].reverse()) {
        const s = { ...s0, stage: { ...s0.stage, width: w } };
        const l = solve(s, { previous });
        const st = steps(s, l);
        for (const id of Object.keys(st)) expect(st[id]!, `seed ${seed} at ${w}: ${id} stepped down while growing`).toBeLessThanOrEqual(last[id]!);
        // Exactly the reverse: at every width the way back holds what the way down held.
        expect(st, `seed ${seed} at ${w}: growing back`).toEqual(downAt.get(w));
        check(s, l, w, false);
        previous = l;
        last = st;
      }
      expect(last, `seed ${seed}: back at 1400`).toEqual(startSteps);
    }
  });
});
