/**
 * What a held frame draws, pinned (`fixtures/lanes-drawn-marks.txt`) over the windows of the guide-continuity sweep:
 * the guides `guides(frame)` gives under "all" (every lane named with the frame's held place), as seen (at rest) for the
 * lanes drawn there, and with each empty lane's one spot held for every lane. These are the marks a host draws: a lane
 * the screen doesn't draw appears in the layout that creates it, and nothing that no host draws is pinned.
 */
import { describe, expect, it } from "vitest";
import type { Rect } from "@n-uf/placement";
import { solve, type DockDrag, type DockHeld } from "../src";
import { dragOf, windows } from "./lift-windows";

const r = (v: number): string => (Math.round(v * 100) / 100).toString();
const fmt = (x: Rect): string => `${r(x.x)},${r(x.y)} ${r(x.width)}x${r(x.height)}`;
/** The guides a frame holding `held` draws under "all", of the lanes `keep` names. */
const guidesOf = (drag: DockDrag, held: DockHeld | null, keep: (id: string) => boolean): string[] =>
  drag
    .guides({ held, room: held !== null, guides: drag.regions.lanes.map((l) => ({ lane: l.id, held })) })
    .filter((g) => keep(g.lane))
    .map((g) => `  ${g.lane} ${g.id} ${g.kind} ${fmt(g.rect)}`);

describe("the guides a held frame draws, pinned", () => {
  it("as seen, every lane drawn; with each empty lane's spot held, every lane", async () => {
    const out: string[] = [];
    for (const w of windows()) {
      const d = dragOf(w);
      if (!d) continue;
      const seen = solve(w.state, { previous: d.options.previous! });
      const isEdge = (id: string): boolean => w.state.edges.some((e) => e.id === id);
      const drawn = (id: string): boolean => isEdge(id) && (seen.edges[id]?.cross ?? 0) > 1e-6;
      out.push(`${w.name}: as seen`, ...guidesOf(d.drag, null, drawn));
      for (const l of d.regions.lanes)
        if (isEdge(l.id) && !drawn(l.id) && l.spots.length === 1) {
          const sp = l.spots[0]!;
          const held: DockHeld = { kind: "spot", spot: sp.id, point: { x: sp.landing.x + d.grab.x, y: sp.landing.y + d.grab.y } };
          out.push(`${w.name}: ${sp.id} held`, ...guidesOf(d.drag, held, () => true));
        }
    }
    expect(out.length).toBeGreaterThan(500);
    await expect(out.join("\n") + "\n").toMatchFileSnapshot("./fixtures/lanes-drawn-marks.txt");
  });
});
