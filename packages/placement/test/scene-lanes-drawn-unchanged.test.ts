/**
 * Rule B predicts only an empty lane's guide. A lane that already holds items (drawn as seen) keeps the marks it had, and
 * with a spot held every lane's marks are those of that spot's layout, as before. Pinned against the marks `lanes()` gave
 * before the rule (`fixtures/lanes-drawn-marks.txt`), over the windows of the guide-continuity sweep.
 */
import { describe, expect, it } from "vitest";
import type { Rect } from "../src/geometry";
import { solve, type Regions } from "../src/scene";
import { dragOf, windows } from "./lift-windows";

const r = (v: number): string => (Math.round(v * 100) / 100).toString();
const fmt = (x: Rect): string => `${r(x.x)},${r(x.y)} ${r(x.width)}x${r(x.height)}`;
const marksOf = (regions: Regions, keep: (id: string) => boolean): string[] => regions.lanes.filter((l) => keep(l.id)).flatMap((l) => l.marks.map((m) => `  ${l.id} ${m.id} ${m.kind} ${fmt(m.rect)}`));

describe("lanes that hold items keep their marks; a held spot's marks are unchanged", () => {
  it("as seen, every lane drawn; with each empty lane's spot held, every lane", async () => {
    const out: string[] = [];
    for (const w of windows()) {
      const d = dragOf(w);
      if (!d) continue;
      const seen = solve(w.scene, { previous: d.options.previous! });
      const isEdge = (id: string): boolean => w.scene.edges.some((e) => e.id === id);
      const drawn = (id: string): boolean => isEdge(id) && (seen.edges[id]?.cross ?? 0) > 1e-6;
      out.push(`${w.name}: as seen`, ...marksOf(d.regions, drawn));
      for (const l of d.regions.lanes)
        if (isEdge(l.id) && !drawn(l.id) && l.spots.length === 1) out.push(`${w.name}: ${l.spots[0]!.id} held`, ...marksOf(d.regionsFor(l.spots[0]!.id), () => true));
    }
    expect(out.length).toBeGreaterThan(500);
    await expect(out.join("\n") + "\n").toMatchFileSnapshot("./fixtures/lanes-drawn-marks.txt");
  });
});
