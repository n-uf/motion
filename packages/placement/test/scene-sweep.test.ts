/** Property sweeps over random scenes: several edges, rings, spans and modes, fixed items, zones, floats and kinds. */
import { describe, expect, it } from "vitest";
import { solve, targets, use, type Edge, type Scene, type SceneItem, type SceneLayout } from "../src/scene";
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
  const base: Scene = { stage: { x: 0, y: 0, width: W, height: H }, edges, items: byId(items), floats, floatKinds: ["panel", "group"], chrome };
  if (rnd() < 0.5) return base;
  // Dynamic columns: templates, rails, give-way by contentMin, hand folds that ride or rail.
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

const SEEDS = Array.from({ length: 400 }, (_, i) => i + 1);

/** What a host draws: every item's rect and how, the edges' rects and folds, the rails and the content. No notes, no fits. */
const drawn = (l: SceneLayout) => ({
  items: Object.fromEntries(Object.entries(l.items).map(([id, it]) => [id, [it.rect, it.form, it.formKind, it.edge, it.rail, it.rides, it.folded, it.inMenu]])),
  edges: Object.fromEntries(Object.entries(l.edges).map(([id, e]) => [id, [e.rect, e.folded, e.rides]])),
  rails: l.rails,
  content: l.content,
});

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
      for (const [id, it] of docked) {
        // A rail segment lies in its side's rail; a riding bar on its host column; the rest in their own edge.
        if (it.rides) {
          const host = l.edges[it.rides]!.rect;
          if (it.rect.x !== host.x || it.rect.width !== host.width || it.rect.y + it.rect.height > host.y + 1e-6) throw new Error(`seed ${seed}: ${id} doesn't ride on top of ${it.rides}`);
          continue;
        }
        const box = it.rail ? l.rails[it.rail]!.rect : l.edges[it.edge!]!.rect;
        if (!inside(it.rect, box)) throw new Error(`seed ${seed}: ${id} outside its edge`);
      }
      for (const [side, r] of Object.entries(l.rails)) if (!inside(r!.rect, s.stage)) throw new Error(`seed ${seed}: the ${side} rail outside the stage`);
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

  it("no press, of any item, after a chain of presses, ever changes a rect or unfolds a column (C23)", () => {
    for (const seed of SEEDS) {
      let s = randomScene(seed);
      let previous = solve(s);
      const ids = Object.keys(s.items);
      for (let step = 0; step < Math.min(ids.length, 6); step++) {
        const id = ids[(seed * 7 + step * 3) % ids.length]!;
        s = use(s, id);
        const next = solve(s, { previous });
        for (const k of Object.keys(previous.items)) if (JSON.stringify(next.items[k]?.rect) !== JSON.stringify(previous.items[k]!.rect)) throw new Error(`seed ${seed} step ${step}: using ${id} moved ${k}`);
        previous = next;
      }
    }
  });

  it("every target: the item lands in an edge that accepts it, the hit covers no fixed item or chrome, and after = solve(after.scene)", () => {
    for (const seed of SEEDS.slice(0, 120)) {
      const s = randomScene(seed);
      const previous = solve(s);
      // No hit covers what a fixed item reserves: its rect, or for a title that grows (start zone), its natural length.
      const fixed = Object.entries(previous.items)
        .filter(([, it]) => it.fixed)
        .map(([fid, it]) => {
          const f = s.items[fid]!.forms.row?.[it.form];
          return f?.main.grows ? { ...it.rect, width: Math.min(it.rect.width, f.main.natural) } : it.rect;
        });
      for (const id of Object.keys(s.items)) {
        for (const t of targets(s, id, { previous, endReach: 8 })) {
          const a = t.after({ x: s.stage.width / 2, y: s.stage.height / 2 });
          if (JSON.stringify(solve(a.scene, { previous })) !== JSON.stringify(a.layout)) throw new Error(`seed ${seed}: ${t.id} preview != result`);
          // Stable: solving the committed scene again from its own layout changes nothing.
          if (JSON.stringify(drawn(solve(a.scene, { previous: a.layout }))) !== JSON.stringify(drawn(a.layout))) throw new Error(`seed ${seed}: ${t.id} not stable on re-solve`);
          if (t.place.kind === "gap" || t.place.kind === "column" || t.place.kind === "rail") {
            // The whole scene's fixed items keep their form and are never squeezed under their min; no chrome under the slot.
            for (const [fid, f] of Object.entries(previous.items)) {
              if (!f.fixed) continue;
              const g = a.layout.items[fid];
              const side = s.edges.find((e) => e.id === g?.edge)?.side;
              const form = s.items[fid]!.forms[side === "left" || side === "right" ? "column" : "row"]?.[f.form];
              const len = side === "left" || side === "right" ? g?.rect.height : g?.rect.width;
              if (!g || g.form !== f.form || len! < form!.main.min - 0.5) throw new Error(`seed ${seed}: ${t.id} squeezes ${fid}`);
            }
            for (const c of s.chrome ?? []) if (overlaps(a.layout.items[id]!.rect, c)) throw new Error(`seed ${seed}: ${t.id} lands on chrome`);
          }
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
