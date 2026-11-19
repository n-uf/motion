/**
 * Refusals in the pick: `refusalTargets` passed to `@n-uf/motion/drag`'s intent with the targets. Wherever the pick
 * under the pointer is a refusal, the intent shows nothing, or a target whose own zone holds the pointer (with its room
 * open, its `roomHit`: the refusal lies under the drawn room): no held target's band or gap grace reaches over a refusal. Swept slowly across every edge of the model windows, in every mode
 * (plain, flush, card halves, rail drop strips), and of the lab's two windows.
 */
import { createDragIntent, targetAt, type DragTarget } from "@n-uf/motion/drag";
import { describe, expect, it } from "vitest";
import { refusalTargets, refusals, solve, targets, type Scene } from "../src/scene";
import { WINDOW_A, WINDOW_B, winScene } from "../src/scene/cases";
import { modelScene } from "./model-scene";

type R = { x: number; y: number; width: number; height: number };
const inRect = (r: R, p: { x: number; y: number }): boolean => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
/** In a target's own zone: its pieces, or its armed zone (a strip that armed acts by its magnet). */
const inZone = (t: DragTarget, p: { x: number; y: number }): boolean => [...(t.hits ?? [t.hit]), ...(t.armedHit ? [t.armedHit] : [])].some((r) => inRect(r, p));

/** The sweeps over one scene: every movable item, every seen edge, slow lines across it. Returns the failures. */
function sweep(s: Scene, label: string): { samples: number; refused: number; overFloat: number; failures: string[] } {
  const now = solve(s);
  const failures: string[] = [];
  let samples = 0;
  let refused = 0;
  // Refused samples where the float target is in the list too (so the refusal had to win over it).
  let overFloat = 0;
  for (const id of Object.keys(s.items)) {
    const it = s.items[id]!;
    if (it.fixed || it.closed || !now.items[id]) continue;
    const rs = refusalTargets(refusals(s, id));
    if (rs.length === 0) continue;
    const list: DragTarget[] = [...targets(s, id), ...rs];
    const own = now.items[id]!.rect;
    const home = now.items[id]!.floating ? { x: -1e6, y: -1e6, width: 0, height: 0 } : own;
    for (const [eid, e] of Object.entries(now.edges)) {
      if (e.rect.width < 1 || e.rect.height < 1) continue;
      const v = e.rect.height > e.rect.width;
      const lines = [0.25, 0.5, 0.75].map((f): { from: { x: number; y: number }; to: { x: number; y: number } } =>
        v
          ? { from: { x: e.rect.x - 40, y: e.rect.y + e.rect.height * f }, to: { x: e.rect.x + e.rect.width + 40, y: e.rect.y + e.rect.height * f } }
          : { from: { x: e.rect.x + e.rect.width * f, y: e.rect.y - 40 }, to: { x: e.rect.x + e.rect.width * f, y: e.rect.y + e.rect.height + 40 } },
      );
      // The x-sweep along the edge as well (a bar's length, a column's width), both ways.
      lines.push({ from: { x: e.rect.x - 20, y: e.rect.y + e.rect.height / 2 }, to: { x: e.rect.x + e.rect.width + 20, y: e.rect.y + e.rect.height / 2 } });
      lines.push({ from: { x: e.rect.x + e.rect.width + 20, y: e.rect.y + e.rect.height / 2 }, to: { x: e.rect.x - 20, y: e.rect.y + e.rect.height / 2 } });
      for (const { from, to } of lines) {
        const intent = createDragIntent<DragTarget>({ home, lift: { x: own.x + 5, y: own.y + 5 } });
        const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y));
        let t = 0;
        for (let k = 0; k <= steps; k++) {
          const p = { x: from.x + ((to.x - from.x) * k) / steps, y: from.y + ((to.y - from.y) * k) / steps };
          if (!inRect(s.stage, p)) continue;
          t += 30;
          const f = intent.update(p, t, list);
          samples++;
          if (inRect(home, p)) continue;
          const raw = targetAt(list, p);
          if (!raw?.refuse) continue;
          refused++;
          // A target shown with its room open holds its `roomHit` too: a refusal there lies under the drawn room.
          const inRoom = !!f.shown?.roomHit && f.room && inRect(f.shown.roomHit, p);
          if (f.shown && !inZone(f.shown, p) && !inRoom) failures.push(`${label} drag ${id} over ${eid} at ${p.x.toFixed(1)},${p.y.toFixed(1)}: ${raw.id} under ${f.shown.id}'s band`);
          // The float (priority 3, everywhere) never shows over a refusal: the refusal wins the pick.
          if (f.shown?.free) failures.push(`${label} drag ${id} over ${eid} at ${p.x.toFixed(1)},${p.y.toFixed(1)}: the float shows over ${raw.id}`);
          if (list.some((x) => x.free)) overFloat++;
          // Nothing shown over a refusal: the frame says which refusal it is.
          if (!f.shown && f.refused?.id !== raw.id) failures.push(`${label} drag ${id} over ${eid} at ${p.x.toFixed(1)},${p.y.toFixed(1)}: refused ${f.refused?.id ?? "nothing"}, the pick ${raw.id}`);
        }
      }
    }
  }
  return { samples, refused, overFloat, failures };
}

describe("refusals in the pick", () => {
  it("over a refusal nothing shows but a target whose own zone holds the pointer, in every mode", () => {
    let samples = 0;
    let refused = 0;
    let overFloat = 0;
    const failures: string[] = [];
    for (const [flush, middle, railDrop] of [
      [false, false, false],
      [true, false, false],
      [false, true, false],
      [true, true, false],
      [false, false, true],
      [true, false, true],
    ] as const)
      for (let seed = 1; seed <= 24; seed++) {
        const r = sweep(modelScene(seed, flush, middle, railDrop), `seed ${seed}${flush ? " flush" : ""}${middle ? " middle" : ""}${railDrop ? " strip" : ""}`);
        samples += r.samples;
        refused += r.refused;
        overFloat += r.overFloat;
        failures.push(...r.failures);
      }
    for (const [name, spec] of [["A", WINDOW_A], ["B", WINDOW_B]] as const)
      for (const width of [560, 720, 1200]) {
        const r = sweep(winScene(spec, { width }), `window ${name} at ${width}`);
        samples += r.samples;
        refused += r.refused;
        overFloat += r.overFloat;
        failures.push(...r.failures);
      }
    expect(failures.slice(0, 10)).toEqual([]);
    expect(refused).toBeGreaterThan(1000);
    // Most of them with the float in the list: the refusal won over it there.
    expect(overFloat).toBeGreaterThan(500);
    expect(samples).toBeGreaterThan(50000);
  });
});
