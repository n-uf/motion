/**
 * A float resize's preview is its commit: over random scenes and random resizes (every edge and corner, growing and
 * shrinking), `solve(resize(s, id, asked, moving))` draws the float exactly at `fitResize(s, id, asked, moving).rect`.
 */
import { describe, expect, it } from "vitest";
import { fitResize, resize, solve, type Edge, type Scene, type SceneItem, type SceneLayout } from "../src/scene";
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

  it("no float overlaps a bar, the chrome or a docked item after a resize (unless the layout says it covers: no clear place)", () => {
    let tried = 0;
    const bad: string[] = [];
    const over = (a: { x: number; y: number; width: number; height: number }, b: typeof a): number =>
      Math.min(Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x), Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
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
            if (!fitResize(s, f.id, asked, m)) continue;
            tried++;
            const after = solve(resize(s, f.id, asked, m));
            const me = after.items[f.id]!.rect;
            // What floats keep clear of: docked items (» entries included), bars and their » menus, the chrome.
            const keepClear: [string, { x: number; y: number; width: number; height: number }][] = [];
            for (const [k, it] of Object.entries(after.items)) if (k !== f.id && !it.floating && it.rect.width > 0 && it.rect.height > 0) keepClear.push([`item ${k}`, it.rect]);
            for (const [k, e] of Object.entries(after.edges)) {
              if ((e.side === "top" || e.side === "bottom") && e.cross > 0) keepClear.push([`bar ${k}`, e.rect]);
              if (e.menu) keepClear.push([`menu of ${k}`, e.menu.rect]);
            }
            (s.chrome ?? []).forEach((c, i) => keepClear.push([`chrome ${i}`, c]));
            // A float with no clear place at its size says so (`float-covers`) before or after; it is not this property's.
            const covers = l.notes.some((n) => n.code === "float-covers" && n.id === f.id) || after.notes.some((n) => n.code === "float-covers" && n.id === f.id);
            if (covers) continue;
            for (const [what, r] of keepClear) if (over(me, r) > 0.01) bad.push(`seed ${seed} ${f.id} ${JSON.stringify(m)} ${d}: ${JSON.stringify(me)} overlaps ${what} ${JSON.stringify(r)} by ${over(me, r).toFixed(2)}`);
          }
      }
    }
    expect(tried).toBeGreaterThan(1000);
    expect(bad.slice(0, 10), `${bad.length} of ${tried}`).toEqual([]);
  });
});

/**
 * A window a float has no clear place in: a title bar and a toolbar (68 px), chrome in the corner, and a float whose floor
 * (160 px) is 8 px more than the room under the toolbar. It covers the toolbar by 8 px, and a resize may not grow that.
 */
function shortWindow(room: number, floor: number): Scene {
  return {
    stage: { x: 0, y: 0, width: 900, height: 68 + room },
    edges: [{ id: "titlebar", side: "top", ring: 0, accepts: [], items: ["title", "controls"], cross: { min: 32, max: 32, rail: 32 } }, bar("tools", "top", 1, ["g"])],
    items: byId([title(), controls(), group("g", 1), panel("q", 5, { floatMin: { width: 200, height: floor } }, 260)]),
    floats: [{ id: "q", rect: { x: 300, y: 68, width: 260, height: floor } }],
    floatKinds: ["panel"],
    chrome: [{ x: 700, y: 0, width: 120, height: 36 }],
  };
}

describe("a float that already covers a bar does not grow over it", () => {
  it("a top-edge resize upward leaves the float's top where it is drawn, and says what stopped it", () => {
    const s = shortWindow(152, 160);
    const l = solve(s);
    const drawn = l.items.q!.rect;
    expect(l.notes.some((n) => n.code === "float-covers" && n.id === "q")).toBe(true);
    // The toolbar ends at 68; the float's top is 8 px above that, covering the bar by 8 px, as `solve` could do no better.
    expect(drawn.y).toBe(60);
    for (const dy of [-200, -40, -8]) {
      const asked = { x: drawn.x, y: drawn.y + dy, width: drawn.width, height: drawn.height - dy };
      const fit = fitResize(s, "q", asked, { top: true })!;
      expect(fit.rect.y, `dy ${dy}`).toBe(60);
      expect(fit.limits).toContain("docked");
      expect(solve(resize(s, "q", asked, { top: true })).items.q!.rect).toEqual(fit.rect);
    }
  });

  it("a float clear of the bar stops at the bar, as before", () => {
    const s = shortWindow(400, 160);
    const drawn = solve(s).items.q!.rect;
    expect(drawn.y).toBe(68);
    const fit = fitResize(s, "q", { ...drawn, y: drawn.y - 40, height: drawn.height + 40 }, { top: true })!;
    expect(fit.rect.y).toBe(68);
    expect(fit.limits).toContain("docked");
  });

  it("over short windows, floors, chrome and every edge, a resize never covers more than the float did", () => {
    let tried = 0;
    let covering = 0;
    const bad: string[] = [];
    const area = (a: { x: number; y: number; width: number; height: number }, b: typeof a): number =>
      Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    const covered = (l: SceneLayout, s: Scene, me: { x: number; y: number; width: number; height: number }): number => {
      const keep = [...Object.entries(l.edges).filter(([, e]) => (e.side === "top" || e.side === "bottom") && e.cross > 0).map(([, e]) => e.rect), ...(s.chrome ?? []), ...Object.entries(l.items).filter(([k, it]) => k !== "q" && !it.floating).map(([, it]) => it.rect)];
      return keep.reduce((sum, r) => sum + area(me, r), 0);
    };
    for (let seed = 1; seed <= 300; seed++) {
      const rnd = seeded(seed);
      const floor = 80 + Math.floor(rnd() * 200);
      const room = 60 + Math.floor(rnd() * 260);
      const base = shortWindow(room, floor);
      const s: Scene = { ...base, floats: [{ id: "q", rect: { x: 200 + rnd() * 300, y: rnd() * (68 + room), width: 240, height: floor + rnd() * 100 } }], chrome: rnd() < 0.5 ? [{ x: 100 + rnd() * 500, y: rnd() * 80, width: 120, height: 30 }] : [] };
      const l = solve(s);
      const drawn = l.items.q?.rect;
      if (!drawn) continue;
      const before = covered(l, s, drawn);
      if (before > 0) covering++;
      for (const m of MOVES)
        for (const d of [-300, -100, -40, -8, 8, 40]) {
          const asked = { x: m.left ? drawn.x + d : drawn.x, y: m.top ? drawn.y + d : drawn.y, width: m.left ? drawn.width - d : m.right ? drawn.width + d : drawn.width, height: m.top ? drawn.height - d : m.bottom ? drawn.height + d : drawn.height };
          const fit = fitResize(s, "q", asked, m);
          if (!fit) continue;
          tried++;
          const after = solve(resize(s, "q", asked, m));
          const now = covered(after, s, after.items.q!.rect);
          if (now > before + 1) bad.push(`seed ${seed} ${JSON.stringify(m)} ${d}: covers ${before.toFixed(0)} → ${now.toFixed(0)} px² (${JSON.stringify(drawn)} → ${JSON.stringify(after.items.q!.rect)})`);
        }
    }
    expect(tried).toBeGreaterThan(5000);
    expect(covering).toBeGreaterThan(50);
    expect(bad.slice(0, 10), `${bad.length} of ${tried}`).toEqual([]);
  });
});

/** A 900 x 600 window with a title bar and a toolbar at the top, a status bar across the bottom, and a float stored `h` tall. */
function storedTall(h: number, floorHeight?: number): Scene {
  return {
    stage: { x: 0, y: 0, width: 900, height: 600 },
    edges: [
      { id: "titlebar", side: "top", ring: 0, accepts: [], items: ["title", "controls"], cross: { min: 32, max: 32, rail: 32 } },
      bar("tools", "top", 1, ["g"]),
      bar("status", "bottom", 0, ["s"], { span: "full" }),
    ],
    items: byId([title(), controls(), group("g", 1), group("s", 2), panel("q", 5, floorHeight === undefined ? {} : { floatMin: { width: 200, height: floorHeight } }, 260)]),
    floats: [{ id: "q", rect: { x: 300, y: 0, width: 260, height: h } }],
    floatKinds: ["panel"],
  };
}

/** The room between the bars across the top and the bar across the bottom, as `solve` draws them. */
function between(l: SceneLayout): { top: number; bottom: number } {
  const rows = Object.values(l.edges).filter((e) => (e.side === "top" || e.side === "bottom") && e.cross > 0);
  return { top: Math.max(...rows.filter((e) => e.side === "top").map((e) => e.rect.y + e.rect.height)), bottom: Math.min(...rows.filter((e) => e.side === "bottom").map((e) => e.rect.y)) };
}

describe("a float stored taller than the clear stage is drawn between the bars", () => {
  it("stored at the stage's height, it is drawn from the top bars' end to the bottom bar's start, covering nothing", () => {
    const l = solve(storedTall(600));
    const { top, bottom } = between(l);
    expect(top).toBeGreaterThan(0);
    expect(bottom).toBeLessThan(600);
    const r = l.items.q!.rect;
    expect(r.y).toBe(top);
    expect(r.y + r.height).toBe(bottom);
    expect(l.notes.some((n) => n.code === "float-covers" && n.id === "q")).toBe(false);
  });

  it("a floor taller than the clear room keeps the floor and covers, and says so", () => {
    const s = storedTall(600, 580);
    const l = solve(s);
    const { top, bottom } = between(l);
    expect(580).toBeGreaterThan(bottom - top);
    expect(l.items.q!.rect.height).toBe(580);
    expect(l.notes.some((n) => n.code === "float-covers" && n.id === "q")).toBe(true);
  });

  it("a resize of the stored oversize float previews what it commits", () => {
    const s = storedTall(600);
    const drawn = solve(s).items.q!.rect;
    for (const m of [{ top: true }, { bottom: true }, { right: true }] as ResizeEdges[]) {
      const asked = { x: drawn.x, y: m.top ? drawn.y - 40 : drawn.y, width: m.right ? drawn.width + 40 : drawn.width, height: drawn.height + (m.right ? 0 : 40) };
      const fit = fitResize(s, "q", asked, m)!;
      expect(solve(resize(s, "q", asked, m)).items.q!.rect, JSON.stringify(m)).toEqual(fit.rect);
      expect(fit.rect.height).toBeLessThanOrEqual(drawn.height);
    }
  });
});
