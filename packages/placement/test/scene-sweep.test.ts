/** Property sweeps over random scenes: several edges, rings, spans and modes, fixed items, zones, floats and kinds. */
import { describe, expect, it } from "vitest";
import { solve, targets, use, type Edge, type Scene, type SceneItem } from "../src/scene";
import { bar, byId, column, controls, group, panel, readout, seeded, title } from "./scene-fixture";

type R = { x: number; y: number; width: number; height: number };
const overlaps = (a: R, b: R) => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1e-3 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1e-3;
const inside = (a: R, b: R) => a.x >= b.x - 1e-6 && a.y >= b.y - 1e-6 && a.x + a.width <= b.x + b.width + 1e-6 && a.y + a.height <= b.y + b.height + 1e-6;

function randomScene(seed: number): Scene {
  const rnd = seeded(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
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
  // Kinds may only sit where they're accepted.
  for (const e of edges) e.items.forEach((id) => expect([...e.accepts, "title", "controls", "readout"]).toContain(items.find((i) => i.id === id)!.kind));
  const W = 500 + Math.floor(rnd() * 1100);
  const H = 360 + Math.floor(rnd() * 600);
  const floats = Array.from({ length: Math.floor(rnd() * 3) }, () => {
    const id = rnd() < 0.5 ? p() : g();
    return { id, rect: { x: rnd() * W - 50, y: rnd() * H - 50, width: 120 + rnd() * 200, height: 60 + rnd() * 200 }, ...(rnd() < 0.2 ? { anchor: "content-top-right" as const } : {}) };
  });
  const chrome = rnd() < 0.4 ? [{ x: rnd() * W, y: rnd() * H, width: 40 + rnd() * 100, height: 20 + rnd() * 40 }] : [];
  return { stage: { x: 0, y: 0, width: W, height: H }, edges, items: byId(items), floats, floatKinds: ["panel", "group"], chrome };
}

const SEEDS = Array.from({ length: 400 }, (_, i) => i + 1);

describe("scene sweeps", () => {
  it("no docked items overlap (so none covers a fixed item), each lies in its edge and each edge in the stage", () => {
    for (const seed of SEEDS) {
      const s = randomScene(seed);
      const l = solve(s);
      const overflowing = new Set(l.notes.flatMap((n) => ("edge" in n && (n.code === "overflow" || n.code === "too-wide") ? [n.edge] : [])));
      const docked = Object.entries(l.items).filter(([, it]) => it.edge && !it.inMenu && !overflowing.has(it.edge) && it.rect.width > 1e-6 && it.rect.height > 1e-6);
      for (let i = 0; i < docked.length; i++) {
        for (let j = i + 1; j < docked.length; j++) {
          const [a, ia] = docked[i]!;
          const [b, ib] = docked[j]!;
          if (overlaps(ia.rect, ib.rect)) throw new Error(`seed ${seed}: ${a} and ${b} overlap: ${JSON.stringify([ia.rect, ib.rect])}`);
        }
      }
      // Every docked item is inside its edge, and every edge inside the stage.
      for (const [id, it] of docked) if (!inside(it.rect, l.edges[it.edge!]!.rect)) throw new Error(`seed ${seed}: ${id} outside its edge`);
      for (const [id, e] of Object.entries(l.edges)) if (!inside(e.rect, s.stage)) throw new Error(`seed ${seed}: edge ${id} outside the stage`);
    }
  });

  it("floats lie inside the stage, and clear of bars, docked items, fixed items and chrome when room exists", () => {
    for (const seed of SEEDS) {
      const s = randomScene(seed);
      const l = solve(s);
      const avoid = [...Object.values(l.items).filter((it) => it.edge).map((it) => it.rect), ...Object.values(l.edges).filter((e) => e.side === "top" || e.side === "bottom").map((e) => e.rect), ...(s.chrome ?? [])];
      for (const id of l.floats) {
        const f = l.items[id]!.rect;
        if (f.width <= s.stage.width && f.height <= s.stage.height && !inside(f, s.stage)) throw new Error(`seed ${seed}: float ${id} outside the stage`);
        if (l.notes.some((n) => n.code === "float-covers" && n.id === id)) continue;
        for (const a of avoid) if (overlaps(f, a)) throw new Error(`seed ${seed}: float ${id} covers ${JSON.stringify(a)}`);
      }
    }
  });

  it("a use under previous changes no rect (C23)", () => {
    for (const seed of SEEDS) {
      const s = randomScene(seed);
      const before = solve(s);
      const ids = Object.keys(s.items);
      const id = ids[seed % ids.length]!;
      const after = solve(use(s, id), { previous: before });
      for (const k of Object.keys(before.items)) if (JSON.stringify(after.items[k]?.rect) !== JSON.stringify(before.items[k]!.rect)) throw new Error(`seed ${seed}: using ${id} moved ${k}`);
    }
  });

  it("every target: the item lands in an edge that accepts it, the hit covers no fixed item or chrome, and after = solve(after.scene)", () => {
    for (const seed of SEEDS.slice(0, 120)) {
      const s = randomScene(seed);
      const previous = solve(s);
      const fixed = Object.values(previous.items).filter((it) => it.fixed).map((it) => it.rect);
      for (const id of Object.keys(s.items)) {
        for (const t of targets(s, id, { previous, endReach: 8 })) {
          const a = t.after({ x: s.stage.width / 2, y: s.stage.height / 2 });
          if (JSON.stringify(solve(a.scene, { previous })) !== JSON.stringify(a.layout)) throw new Error(`seed ${seed}: ${t.id} preview != result`);
          if (t.place.kind !== "gap") continue;
          const me = a.layout.items[id]!;
          const edge = s.edges.find((e) => e.id === me.edge)!;
          expect(edge.accepts).toContain(s.items[id]!.kind);
          expect(me.inMenu).toBeUndefined();
          for (const f of [...fixed, ...(s.chrome ?? [])]) if (overlaps(t.hit, f)) throw new Error(`seed ${seed}: ${t.id} covers ${JSON.stringify(f)}`);
        }
      }
    }
  });
});
