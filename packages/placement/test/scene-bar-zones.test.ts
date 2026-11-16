/**
 * A horizontal bar's leading, center and trailing zones are picked by thirds of the bar, the nearest gap
 * within; an empty bar's strip is three zone targets; a title bar is a constrained host (a toolbar fits there in its
 * first form without pushing the title under its natural width, or that zone has no target).
 */
import { describe, expect, it } from "vitest";
import { refusals, solve, targets, type Edge, type Scene, type SceneItem, type SceneTarget } from "../src/scene";
import { zoneExtents } from "../src/scene/targets";
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
    // At 1140 px, 160 + 4 × 200 + 84 leaves 96: even with the four toolbars shrunk to their 180 px rows (which they do
    // before the title gives up any of its natural width) Views fits only by shrinking the title toward its 80 px
    // minimum, which is refused.
    const s = put(windowScene(1140), "titlebar", ["tools", "zoom", "marks", "search"]);
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

  it("a zone whose toolbars run past its third reaches over them: every gap has a slice, none past the zone's last card", () => {
    // A 615 px bar: two leading toolbars (8..208, 212..412) run past its left third (205). The start zone holds the
    // cards seen in it, so it reaches to 412; the centre zone starts there.
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
    const end = l.items.tools!.rect.x + l.items.tools!.rect.width;
    expect(zoneExtents(s, "zoom", "toolbar").find((z) => z.zone === "start")!.b).toBe(end);
    for (const at of [0, 1, 2]) {
      const t = ts.find((x) => x.id === `gap:toolbar:start:${at}`)!;
      expect(t, `gap:toolbar:start:${at}`).toBeDefined();
      expect(t.hit.width * t.hit.height).toBeGreaterThan(0);
      expect(t.hit.x + t.hit.width).toBeLessThanOrEqual(end + 1e-6);
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

  it("every gap target of every bar zone has a hit inside its zone (its third, reaching over its cards), on the dragged item's own bar too", () => {
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
          const z = zoneExtents(s, id, e.id)[k]!;
          const a = k === 0 ? -Infinity : z.a;
          const b = k === 2 ? Infinity : z.b;
          if (!(t.hit.width > 0 && t.hit.height > 0)) throw new Error(`seed ${seed} ${id} ${t.id}: empty hit`);
          if (t.hit.x < a - 1e-6 || t.hit.x + t.hit.width > b + 1e-6) throw new Error(`seed ${seed} ${id} ${t.id}: hit ${t.hit.x}..${t.hit.x + t.hit.width} outside its third ${a}..${b}`);
        }
      }
    }
  });
});

describe("local targets: home over the item's own place and the gaps beside it, refusals where a zone takes nothing", () => {
  it("a home slot's hit holds the item's own rect, and no other docked target lies over it; refusals never overlap a target", () => {
    // Home's tile is the own interval, and the gaps right beside it (the same move): its pieces in `hits`.
    for (let seed = 1; seed <= 200; seed++) {
      const s = barScene(seed);
      const l = solve(s);
      for (const id of Object.keys(s.items).filter((k) => !s.items[k]!.fixed)) {
        const ts = targets(s, id, { previous: l });
        const mine = l.items[id];
        for (const t of ts) {
          if (t.place.kind !== "home" || !t.id.startsWith("gap:") || !mine) continue;
          const column = s.edges.find((e) => e.id === mine.edge)?.side === "left" || s.edges.find((e) => e.id === mine.edge)?.side === "right";
          const [a, b] = column ? [mine.rect.y, mine.rect.y + mine.rect.height] : [mine.rect.x, mine.rect.x + mine.rect.width];
          const holds = (t.hits ?? [t.hit]).some((h) => (column ? h.y <= a + 1e-6 && h.y + h.height >= b - 1e-6 : h.x <= a + 1e-6 && h.x + h.width >= b - 1e-6));
          if (!holds) throw new Error(`seed ${seed} ${id} ${t.id}: no piece of home's hit holds its place ${a}..${b}`);
          for (const o of ts) {
            if (o.free || o.place.kind === "home" || o.place.kind === "none") continue;
            const over = Math.min(o.hit.x + o.hit.width, mine.rect.x + mine.rect.width) - Math.max(o.hit.x, mine.rect.x) > 1e-6 && Math.min(o.hit.y + o.hit.height, mine.rect.y + mine.rect.height) - Math.max(o.hit.y, mine.rect.y) > 1e-6;
            if (over) throw new Error(`seed ${seed} ${id}: ${o.id} lies over its own rect`);
          }
        }
        const rs = refusals(s, id, { previous: l });
        for (const r of rs) {
          for (const t of ts) {
            if (t.free) continue;
            const o = Math.min(r.hit.x + r.hit.width, t.hit.x + t.hit.width) - Math.max(r.hit.x, t.hit.x) > 1e-6 && Math.min(r.hit.y + r.hit.height, t.hit.y + t.hit.height) - Math.max(r.hit.y, t.hit.y) > 1e-6;
            if (o) throw new Error(`seed ${seed} ${id}: ${r.id} overlaps ${t.id}`);
          }
        }
      }
    }
  });

  it("over every docked item's own centre, home wins: no gap there would move it", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const s = barScene(seed);
      const l = solve(s);
      for (const id of Object.keys(s.items).filter((k) => !s.items[k]!.fixed)) {
        const me = l.items[id];
        if (!me?.edge || me.inMenu || me.floating || me.rail) continue;
        const p = { x: me.rect.x + me.rect.width / 2, y: me.rect.y + me.rect.height / 2 };
        const under = targets(s, id, { previous: l }).filter((t) => !t.free && t.hit.x <= p.x && p.x <= t.hit.x + t.hit.width && t.hit.y <= p.y && p.y <= t.hit.y + t.hit.height);
        const won = under.sort((a, b) => a.priority - b.priority || a.hit.width * a.hit.height - b.hit.width * b.hit.height)[0];
        if (!won || won.place.kind !== "home") throw new Error(`seed ${seed} ${id}: ${won?.id ?? "nothing"} wins over its own centre`);
        // No gap of its own edge lies there (another edge that moves up once it is lifted may, under home).
        for (const t of under) if (t.place.kind === "gap" && t.id.startsWith(`gap:${me.edge}:`)) throw new Error(`seed ${seed} ${id}: ${t.id} ${JSON.stringify(t.hit)} lies over its own centre (${JSON.stringify(me.rect)})`);
      }
    }
  });

  it("the reported state: Views over the title bar's middle gets the center slot there, home beside its own place", () => {
    // A 1200 px title bar: title, Tools and Zoom leading, Views trailing (its home), the controls.
    const base = windowScene(1200, 700);
    const s: Scene = {
      ...base,
      edges: base.edges.map((e) => (e.id === "titlebar" ? { ...e, items: ["title", "tools", "zoom", "views", "controls"] } : { ...e, items: e.items.filter((x) => !["tools", "zoom", "views"].includes(x)) })),
      items: { ...base.items, zoom: { ...base.items.zoom!, align: "start" }, views: { ...base.items.views!, align: "end" } },
    };
    const l = solve(s);
    const v = l.items.views!.rect;
    const ts = targets(s, "views", { previous: l });
    const at = (x: number) => ts.filter((t) => !t.free && (t.hits ?? [t.hit]).some((h) => h.x <= x && x <= h.x + h.width && h.y <= 16 && 16 <= h.y + h.height)).sort((a, b) => a.priority - b.priority || a.hit.width * a.hit.height - b.hit.width * b.hit.height)[0];
    // In the middle third, the center zone's slot, beside the pointer. In the trailing third, the stretch before Views is
    // the gap beside its own place: Views is the zone's only item, so a drop there is the same move as home (no
    // refusal, never handed to another zone's slot).
    const third = 1200 / 3;
    for (let x = 600; x < 2 * third - 1; x += 10) {
      const t = at(x)!;
      expect(t.place.kind, `${x}`).toBe("gap");
      expect((t.place as { zone: string }).zone).toBe("center");
    }
    for (let x = 2 * third + 1; x < v.x; x += 10) expect(at(x)?.place.kind, `${x}`).toBe("home");
    expect(refusals(s, "views", { previous: l }).filter((r) => r.edge === "titlebar" && r.zone === "end")).toEqual([]);
    expect(at(v.x + v.width / 2)!.place.kind).toBe("home");
  });

  it("a title bar too full: its zones are refused for lack of room, a panel's for the kind", () => {
    // At 1140 px even the four toolbars at their least leave Views no room beside the title's natural width.
    const s = put(windowScene(1140), "titlebar", ["tools", "zoom", "marks", "search"]);
    // Each refused slot is refused over its own tile: every zone of the bar is refused, for lack of room.
    const rs = refusals(s, "views").filter((r) => r.edge === "titlebar");
    expect([...new Set(rs.map((r) => r.zone))].sort()).toEqual(["center", "end", "start"]);
    expect(rs.every((r) => r.reason === "no-room")).toBe(true);
    expect(targets(s, "views").some((t) => t.place.kind === "gap" && (t.place as { edge: string }).edge === "titlebar")).toBe(false);
    expect(refusals(s, "notes").filter((r) => r.edge === "titlebar").every((r) => r.reason === "not-accepted")).toBe(true);
  });

  it("home never removes a gap: a gap beside the item's own place meets home's tile, never under it", () => {
    // Two trailing toolbars in the top bar: Zoom can still go before Tools, though that gap lies by Zoom's own place.
    const base = windowScene(1200, 700);
    const s: Scene = { ...base, items: { ...base.items, tools: { ...base.items.tools!, align: "end" } } };
    const l = solve(s);
    const ts = targets(s, "zoom", { previous: l });
    const before = ts.find((t) => t.place.kind === "gap" && t.id.startsWith("gap:toolbar:end:0"));
    expect(before, "the gap before Tools").toBeDefined();
    expect(before!.hit.width).toBeGreaterThan(0);
    // A panel that fills its column above a toolbar: the column's zones are the solver's spans, so the end
    // zone (the toolbar's) keeps its gaps; home still covers the panel's centre.
    const col: Scene = { stage: { x: 0, y: 0, width: 900, height: 600 }, edges: [column("c", "left", 0, ["p", "g"])], items: byId([panel("p", 1), group("g", 2, { align: "end" })]), floats: [], floatKinds: [] };
    const cl = solve(col);
    const ct = targets(col, "p", { previous: cl });
    const g = ct.find((t) => t.id.startsWith("gap:c:end:"));
    expect(g, "end").toBeDefined();
    expect(g!.hit.height).toBeGreaterThan(0);
    const p = cl.items.p!.rect;
    const home = ct.find((t) => t.place.kind === "home" && t.id.startsWith("gap:"))!;
    expect(home.hit.y <= p.y + p.height / 2 && p.y + p.height / 2 <= home.hit.y + home.hit.height).toBe(true);
  });

  it("home covers the item's whole own rect; its own edge's strip there means home, and no sliver of it is left", () => {
    // Seed 154: g3 alone in top0 (268..308 of 260..333). Lifted, the bar is empty: its thirds are 24.3 px each, and
    // the center third (284.3..308.7) lies mostly over g3's own rect. What is left outside it (0.67 px) is no target.
    const s = barScene(154);
    const ts = targets(s, "g3");
    expect(ts.find((t) => t.id === "strip:top0:center")).toBeUndefined();
    expect(ts.find((t) => t.id === "home:g3")!.hit).toMatchObject({ x: 268, width: 40 });
    // The end third lies outside the item and keeps all of its slice.
    expect(ts.find((t) => t.id === "strip:top0:end")!.hit.width).toBeCloseTo(24 + 1 / 3, 6);
  });

  it("no hit along a bar or column is narrower than 1 px (no slivers), gaps and strips alike", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const s = barScene(seed);
      const l = solve(s);
      for (const id of Object.keys(s.items).filter((k) => !s.items[k]!.fixed)) {
        for (const t of [...targets(s, id, { previous: l }), ...targets(s, id)]) {
          if (!t.id.startsWith("gap:") && !t.id.startsWith("strip:")) continue;
          const e = s.edges.find((x) => x.id === t.id.split(":")[1])!;
          const along = e.side === "left" || e.side === "right" ? t.hit.height : t.hit.width;
          if (along < 1) throw new Error(`seed ${seed} ${id}: ${t.id} is ${along} px along its edge`);
        }
      }
    }
  });
});
