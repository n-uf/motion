/**
 * Revision 8: a horizontal bar's leading, center and trailing zones are picked by thirds of the bar, the nearest gap
 * within; an empty bar's strip is three zone targets; a title bar is a constrained host (a toolbar fits there in its
 * first form without pushing the title under its natural width, or that zone has no target).
 */
import { describe, expect, it } from "vitest";
import { solve, targets, type Edge, type Scene, type SceneItem, type SceneTarget } from "../src/scene";
import { bar, byId, column, controls, group, panel, seeded, title, windowScene } from "./scene-fixture";

/** Random bars: a title bar (title, toolbars, controls), one or two top bars, a bottom bar, columns maybe. */
function barScene(seed: number): Scene {
  const rnd = seeded(seed);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  const items: SceneItem[] = [];
  const edges: Edge[] = [];
  let n = 0;
  const g = (): string => {
    const id = `g${n++}`;
    const w = 60 + Math.floor(rnd() * 200);
    items.push({
      ...group(id, Math.floor(rnd() * 50), { ...(rnd() < 0.5 ? { align: pick(["start", "center", "end"] as const) } : {}) }),
      forms: { row: [{ kind: "row", main: { min: w, natural: w }, cross: { natural: 28 } }, { kind: "icons", main: { min: 40, natural: 40 }, cross: { natural: 28 } }, { kind: "menu", main: { min: 0, natural: 0 }, cross: { natural: 0 } }], column: group(id, 0).forms.column },
    });
    return id;
  };
  const tw = 60 + Math.floor(rnd() * 200);
  items.push({ ...title(), forms: { row: [{ kind: "row", main: { min: 40, natural: tw, grows: true }, cross: { natural: 32 } }] } }, controls());
  const tb = ["title", ...Array.from({ length: Math.floor(rnd() * 4) }, g), "controls"];
  edges.push({ id: "titlebar", side: "top", ring: 0, accepts: ["group"], items: tb, cross: { min: 32, max: 32, rail: 32 }, ...(rnd() < 0.5 ? { gap: 4 } : {}) });
  const tops = Math.floor(rnd() * 2) + 1;
  for (let i = 0; i < tops; i++) edges.push(bar(`top${i}`, "top", i + 1, Array.from({ length: Math.floor(rnd() * 4) }, g), { span: rnd() < 0.3 ? "between" : "full" }));
  edges.push(bar("bottom", "bottom", 0, Array.from({ length: Math.floor(rnd() * 3) }, g), { span: rnd() < 0.5 ? "between" : "full" }));
  for (const side of ["left", "right"] as const) {
    if (rnd() < 0.5) {
      const id = `p${n++}`;
      items.push(panel(id, Math.floor(rnd() * 50)));
      edges.push(column(`${side}0`, side, 0, [id]));
    }
  }
  const W = 500 + Math.floor(rnd() * 1100);
  const H = 400 + Math.floor(rnd() * 400);
  return { stage: { x: 0, y: 0, width: W, height: H }, edges, items: byId(items), floats: [], floatKinds: ["panel", "group"] };
}

const inside = (h: { x: number; y: number; width: number; height: number }, p: { x: number; y: number }) => p.x >= h.x - 1e-6 && p.x <= h.x + h.width + 1e-6 && p.y >= h.y - 1e-6 && p.y <= h.y + h.height + 1e-6;
const zoneAt = (ts: SceneTarget[], edge: string, p: { x: number; y: number }): string | undefined => {
  const t = ts.filter((x) => x.place.kind === "gap" && (x.place as { edge: string }).edge === edge && inside(x.hit, p)).sort((a, b) => a.hit.width * a.hit.height - b.hit.width * b.hit.height)[0];
  return t ? (t.place as { zone: string }).zone : undefined;
};
/** The window with `ids` moved into the edge `to` (taken out of the others), fixed items kept around them. */
function put(s: Scene, to: string, ids: string[]): Scene {
  return {
    ...s,
    edges: s.edges.map((e) => {
      const rest = e.items.filter((x) => !ids.includes(x));
      if (e.id !== to) return { ...e, items: rest };
      const fixed = rest.filter((x) => s.items[x]?.fixed);
      return { ...e, items: [...fixed.filter((x) => s.items[x]!.align !== "end"), ...ids, ...fixed.filter((x) => s.items[x]!.align === "end")] };
    }),
  };
}
const align = (s: Scene, id: string, a: "start" | "center" | "end"): Scene => ({ ...s, items: { ...s.items, [id]: { ...s.items[id]!, align: a } } });

describe("a bar's zones by thirds", () => {
  it("the title bar: left third leading (right after the title's natural width), middle centred, right trailing (before the controls)", () => {
    const s = put(windowScene(), "toolbar", ["tools", "zoom"]);
    const ts = targets(s, "views");
    const y = 16;
    for (let x = 0; x < 1110; x += 6) expect(zoneAt(ts, "titlebar", { x, y })).toBe(x < 400 ? "start" : x <= 800 ? "center" : "end");
    const slot = (zone: string) => ts.find((t) => t.place.kind === "gap" && (t.place as { edge: string }).edge === "titlebar" && (t.place as { zone: string }).zone === zone)!.after({ x: 0, y: 0 }).layout;
    expect(slot("start").items.views!.rect.x).toBe(160);
    expect(slot("start").items.title!.rect.width).toBe(160);
    const c = slot("center").items.views!.rect;
    expect(c.x + c.width / 2).toBe(600);
    const e = slot("end").items.views!.rect;
    expect(e.x + e.width).toBe(1116);
  });

  it("center: centred in the free span when the bar's true centre isn't clear of the leading items", () => {
    // Three leading toolbars end at 760, past the bar's middle: the center toolbar sits centred between them and the controls.
    const s = align(align(put(windowScene(), "titlebar", ["tools", "zoom", "marks", "search"]), "search", "center"), "zoom", "start");
    const l = solve(s);
    const lo = l.items.marks!.rect.x + l.items.marks!.rect.width;
    const hi = l.items.controls!.rect.x;
    const r = l.items.search!.rect;
    expect(lo).toBeGreaterThan(600 - r.width / 2);
    expect(r.x + r.width / 2).toBeCloseTo((lo + hi) / 2, 6);
  });

  it("a title bar too full offers no zone: a toolbar may not push the title under its natural width", () => {
    // 160 + 4 × 200 + 84 leaves 156: Views fits only by shrinking the title toward its 80 px minimum, which is refused.
    const s = put(windowScene(), "titlebar", ["tools", "zoom", "marks", "search"]);
    const ts = targets(s, "views");
    expect(ts.filter((t) => (t.place as { edge?: string }).edge === "titlebar")).toEqual([]);
    expect(solve(s).items.title!.rect.width).toBeGreaterThanOrEqual(160);
  });

  it("a bar with a toolbar at its start takes others to its right too: middle and right thirds are center and trailing", () => {
    const s = align(put(windowScene(), "toolbar", ["zoom"]), "zoom", "start");
    const ts = targets(s, "views");
    const bar = solve(s).edges.toolbar!.rect;
    const y = bar.y + bar.height / 2;
    expect(zoneAt(ts, "toolbar", { x: bar.width / 6, y })).toBe("start");
    expect(zoneAt(ts, "toolbar", { x: bar.width / 2, y })).toBe("center");
    expect(zoneAt(ts, "toolbar", { x: (5 * bar.width) / 6, y })).toBe("end");
    // The gap after Zoom has a point of its own in the leading third.
    const after = ts.find((t) => t.id === "gap:toolbar:start:1")!;
    expect(after.hit.width).toBeGreaterThan(0);
  });

  it("a zone whose toolbars run past its third still offers every gap a slice of the third (the last one too)", () => {
    // A 615 px bar: two leading toolbars (8..208, 212..412) run past its left third (205).
    const base = windowScene(615, 600);
    const s: Scene = {
      ...base,
      edges: base.edges.map((e) => (e.id === "toolbar" ? { ...e, items: ["views", "tools"] } : e.id === "titlebar" ? e : { ...e, items: e.items.filter((x) => x !== "views" && x !== "tools") })),
      floats: [{ id: "zoom", rect: { x: 300, y: 300, width: 200, height: 36 } }],
      items: { ...base.items, zoom: { ...base.items.zoom!, align: "start" } },
    };
    const l = solve(s);
    expect(l.items.tools!.rect.x + l.items.tools!.rect.width).toBeGreaterThan(615 / 3);
    const ts = targets(s, "zoom");
    for (const at of [0, 1, 2]) {
      const t = ts.find((x) => x.id === `gap:toolbar:start:${at}`)!;
      expect(t, `gap:toolbar:start:${at}`).toBeDefined();
      expect(t.hit.width * t.hit.height).toBeGreaterThan(0);
      expect(t.hit.x + t.hit.width).toBeLessThanOrEqual(615 / 3 + 1e-6);
    }
    // Every bar gap target of every zone has an area.
    for (const t of ts) if (t.id.startsWith("gap:toolbar:")) expect(t.hit.width * t.hit.height).toBeGreaterThan(0);
  });

  it("every target's slot is its landing, and a title bar's slot never covers the title's natural rect or the controls", () => {
    for (const s of [put(windowScene(), "toolbar", ["tools", "zoom"]), align(put(windowScene(), "titlebar", ["tools"]), "tools", "center"), align(put(windowScene(), "titlebar", ["tools"]), "tools", "end")]) {
      for (const t of targets(s, "views")) {
        if (t.place.kind !== "gap" || (t.place as { edge: string }).edge !== "titlebar") continue;
        const a = t.after({ x: 0, y: 0 }).layout;
        expect(t.slot).toEqual(a.items.views!.rect);
        const v = a.items.views!.rect;
        expect(v.x).toBeGreaterThanOrEqual(160);
        expect(v.x + v.width).toBeLessThanOrEqual(a.items.controls!.rect.x);
        expect(a.items.title!.rect.width).toBeGreaterThanOrEqual(160);
      }
    }
  });

  it("the spread of a zone's lines stays clear of the edge's solid items: the gap before the controls keeps its slice", () => {
    // The title bar: title, g0 and g1 trailing, then the controls at 562; dragging g3.
    const s = barScene(168);
    const l = solve(s);
    const ctl = l.items.controls!.rect;
    const t = targets(s, "g3").find((x) => x.id === "gap:titlebar:end:2");
    expect(t).toBeDefined();
    expect(t!.hit.width).toBeGreaterThan(0);
    expect(t!.hit.x + t!.hit.width).toBeLessThanOrEqual(ctl.x + 1e-6);
  });

  it("every gap target of every bar zone has a hit inside its third", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const s = barScene(seed);
      const l = solve(s);
      for (const id of Object.keys(s.items).filter((k) => s.items[k]!.kind === "group")) {
        for (const t of targets(s, id)) {
          // Gaps (an empty bar's strips are thirds of the content, not of the bar).
          if (t.place.kind !== "gap" || !t.id.startsWith("gap:")) continue;
          const e = s.edges.find((x) => x.id === (t.place as { edge: string }).edge)!;
          if (e.side !== "top" && e.side !== "bottom") continue;
          const r = l.edges[e.id]?.rect;
          if (!r || r.width <= 0) continue;
          const k = { start: 0, center: 1, end: 2 }[(t.place as { zone: "start" | "center" | "end" }).zone];
          const a = k === 0 ? -Infinity : r.x + (r.width * k) / 3;
          const b = k === 2 ? Infinity : r.x + (r.width * (k + 1)) / 3;
          if (!(t.hit.width > 0 && t.hit.height > 0)) throw new Error(`seed ${seed} ${id} ${t.id}: empty hit`);
          if (t.hit.x < a - 1e-6 || t.hit.x + t.hit.width > b + 1e-6) throw new Error(`seed ${seed} ${id} ${t.id}: hit ${t.hit.x}..${t.hit.x + t.hit.width} outside its third ${a}..${b}`);
        }
      }
    }
  });
});
