/**
 * A float resize's preview is its commit: over random scenes and random resizes (every edge and corner, growing and
 * shrinking), `solve(resize(s, id, asked, moving))` draws the float exactly at `fitResize(s, id, asked, moving).rect`.
 */
import { describe, expect, it } from "vitest";
import { fitResize, resize, solve, type Edge, type Scene, type SceneItem } from "../src/scene";
import type { ResizeEdges } from "../src/scene";
import { bar, byId, column, controls, group, panel, readout, seeded, title } from "./scene-fixture";

/** Random windows: bars, columns (static or dynamic, with rails), panels and groups, floats and chrome. */
export function randomScene(seed: number): Scene {
  const rnd = seeded(seed);
  const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  const items: SceneItem[] = [];
  const edges: Edge[] = [];
  let n = 0;
  const g = (): string => {
    const id = `g${n++}`;
    items.push(group(id, Math.floor(rnd() * 50), { ...(rnd() < 0.3 ? { align: pick(["center", "end"] as const) } : {}), ...(rnd() < 0.15 ? { kept: true } : {}), ...(rnd() < 0.1 ? { closed: true } : {}) }));
    return id;
  };
  const p = (): string => {
    const id = `p${n++}`;
    items.push(panel(id, Math.floor(rnd() * 50), { ...(rnd() < 0.25 ? { from: 1 } : {}), ...(rnd() < 0.1 ? { closed: true } : {}), ...(rnd() < 0.15 ? { kept: true } : {}) }, 200 + Math.floor(rnd() * 120)));
    return id;
  };
  if (rnd() < 0.6) {
    items.push(title(), controls());
    edges.push({ id: "titlebar", side: "top", ring: 0, accepts: [], items: ["title", "controls"], cross: { min: 32, max: 32, rail: 32 } });
  }
  const tops = Math.floor(rnd() * 3);
  for (let i = 0; i < tops; i++) edges.push(bar(`top${i}`, "top", i + 1, Array.from({ length: Math.floor(rnd() * 4) }, g), { span: rnd() < 0.3 ? "between" : "full", mode: rnd() < 0.2 ? "overlay" : "reserved" }));
  if (rnd() < 0.7) {
    const ids = Array.from({ length: Math.floor(rnd() * 3) }, g);
    if (rnd() < 0.5) {
      items.push(readout());
      ids.push("readout");
    }
    edges.push(bar("bottom", "bottom", 0, ids, { span: rnd() < 0.5 ? "between" : "full" }));
  }
  for (const side of ["left", "right"] as const) {
    const cols = Math.floor(rnd() * 3);
    for (let i = 0; i < cols; i++) {
      const accepts = rnd() < 0.3 ? ["panel"] : ["panel", "group"];
      const ids = Array.from({ length: Math.floor(rnd() * 3) }, () => (rnd() < 0.75 || accepts.length === 1 ? p() : g()));
      edges.push(column(`${side}${i}`, side, i, ids, { accepts, ...(rnd() < 0.2 ? { size: 150 + rnd() * 400 } : {}), ...(rnd() < 0.2 ? { railShowsClosed: true } : {}), ...(rnd() < 0.15 ? { mode: "overlay" as const } : {}) }));
    }
  }
  const W = 500 + Math.floor(rnd() * 1100);
  const H = 360 + Math.floor(rnd() * 600);
  const floats = Array.from({ length: Math.floor(rnd() * 3) }, () => {
    const id = rnd() < 0.5 ? p() : g();
    return { id, rect: { x: rnd() * W - 50, y: rnd() * H - 50, width: 120 + rnd() * 200, height: 60 + rnd() * 200 }, ...(rnd() < 0.2 ? { anchor: "content-top-right" as const } : {}) };
  });
  const chrome = rnd() < 0.4 ? [{ x: rnd() * W, y: rnd() * H, width: 40 + rnd() * 100, height: 20 + rnd() * 40 }] : [];
  const base: Scene = { stage: { x: 0, y: 0, width: W, height: H }, edges, items: byId(items), floats, floatKinds: ["panel", "group"], chrome };
  if (rnd() < 0.5) return base;
  const template = { accepts: ["panel", "group"], cross: { min: 160, max: 480, rail: 30 } };
  return {
    ...base,
    edges: edges.map((e) => (e.side === "left" || e.side === "right" ? { ...e, column: true, accepts: template.accepts } : e)),
    columns: { left: template, right: template },
    rails: { left: { width: 30, accepts: ["panel"] }, right: { width: 30, accepts: ["panel"] } },
    contentMin: { width: 200 + Math.floor(rnd() * 200), height: 200 },
    handFold: rnd() < 0.5 ? "ride" : "bar",
    gutter: rnd() < 0.5 ? 0 : 8,
    ...(rnd() < 0.3 ? { inset: { left: 6, right: 6, top: 4, bottom: 4 } } : {}),
  };
}

const MOVES: readonly ResizeEdges[] = [{ left: true }, { right: true }, { top: true }, { bottom: true }, { left: true, top: true }, { right: true, top: true }, { left: true, bottom: true }, { right: true, bottom: true }, {}];
const DELTAS = [-200, -60, -10, 10, 60, 200];
const near = (a: { x: number; y: number; width: number; height: number }, b: typeof a): boolean =>
  Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01 && Math.abs(a.width - b.width) < 0.01 && Math.abs(a.height - b.height) < 0.01;

describe("fitResize is what resize commits", () => {
  it("solve(resize(...)) draws the float at fitResize's rect, over random scenes and resizes", () => {
    let tried = 0;
    let coverMoves = 0;
    const bad: string[] = [];
    for (let seed = 1; seed <= 800; seed++) {
      const s = randomScene(seed);
      const l = solve(s);
      for (const f of s.floats) {
        const drawn = l.items[f.id]?.rect;
        if (!drawn || !l.items[f.id]!.floating) continue;
        for (const m of MOVES)
          for (const d of m.left || m.right || m.top || m.bottom ? DELTAS : [0]) {
            const asked = {
              x: drawn.x + (m.left ? d : 0),
              y: drawn.y + (m.top ? d : 0),
              width: drawn.width + (m.left ? -d : m.right ? d : 0),
              height: drawn.height + (m.top ? -d : m.bottom ? d : 0),
            };
            const fit = fitResize(s, f.id, asked, m);
            if (!fit) continue;
            tried++;
            const got = solve(resize(s, f.id, asked, m)).items[f.id]!.rect;
            // The edges not dragged stay put, for a float drawn clear of what floats keep clear of. One drawn covering
            // something (no clear place at its size) may be moved by the one clamp once its new size has a clear place.
            const covers = l.notes.some((n) => n.code === "float-covers" && n.id === f.id);
            const fixedEdges: [string, number, number][] = [
              ["left", drawn.x, fit.rect.x],
              ["top", drawn.y, fit.rect.y],
              ["right", drawn.x + drawn.width, fit.rect.x + fit.rect.width],
              ["bottom", drawn.y + drawn.height, fit.rect.y + fit.rect.height],
            ];
            if (covers) coverMoves += fixedEdges.some(([edge, was, now]) => !m[edge as keyof ResizeEdges] && Math.abs(was - now) > 0.01) ? 1 : 0;
            else for (const [edge, was, now] of fixedEdges) if (!m[edge as keyof ResizeEdges] && Math.abs(was - now) > 0.01) bad.push(`seed ${seed} ${f.id} ${JSON.stringify(m)} ${d}: ${edge} ${was.toFixed(1)} → ${now.toFixed(1)} (${fit.limits.join(",")})`);
            // Nothing moving changes nothing.
            if (!(m.left || m.right || m.top || m.bottom) && !near(fit.rect, drawn)) bad.push(`seed ${seed} ${f.id}: nothing moving, ${JSON.stringify(drawn)} → ${JSON.stringify(fit.rect)}`);
            if (!near(got, fit.rect)) bad.push(`seed ${seed} ${f.id} ${JSON.stringify(m)} ${d}: fit ${JSON.stringify(fit.rect)} ${fit.limits.join(",")} → drawn ${JSON.stringify(got)}`);
          }
      }
    }
    expect(tried).toBeGreaterThan(1000);
    expect(bad.slice(0, 10), `${bad.length} of ${tried}`).toEqual([]);
    // Only floats with no clear place before the resize: a handful of resizes in the sweep.
    expect(coverMoves).toBeLessThan(200);
  });
});
