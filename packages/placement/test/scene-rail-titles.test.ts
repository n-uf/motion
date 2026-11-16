/**
 * Rail titles: a panel's title rail form (`StackForm.title`) before its tile. In a rail whose side shows titles (the
 * default) every item takes its title while the rail fits them all; when it runs short they step down to tiles by the
 * ladder (priority, then the one used longest ago) and come back in exact reverse. With `railModes[side]: "icons"` the
 * titles are passed over. Scenes without title forms lay out as before, whatever the mode.
 */
import { describe, expect, it } from "vitest";
import { readScene, setRailMode, solve, storeScene, type Scene, type SceneItem, type SceneLayout } from "../src/scene";
import type { StackForm } from "../src/stack";
import { byId, column, form, panel, seeded, windowScene } from "./scene-fixture";

const TITLE = 2;
const TILE = 3;

/** A panel whose rail forms are its title (`len` long) and then its 28 px tile. */
const titled = (id: string, used: number, len: number, more: Partial<SceneItem> = {}): SceneItem => ({
  id,
  kind: "panel",
  used,
  forms: {
    column: [form("open", 120, 240, 260, { grows: true, crossMin: 180 }), form("header", 28, 28, 260, { crossMin: 60 }), { ...form("rail", len, len, 30), title: true }, form("rail", 28, 28, 30), form("menu", 0, 0, 0)],
  },
  ...more,
});

/** Both columns folded by hand (every panel at its header), so each is drawn as a rail. */
function railScene(seed: number, height = 900): Scene {
  const rnd = seeded(seed);
  const items: SceneItem[] = [];
  const left: string[] = [];
  const right: string[] = [];
  const n = 3 + Math.floor(rnd() * 4);
  for (let i = 0; i < n; i++) {
    const id = `p${i}`;
    items.push(titled(id, Math.floor(rnd() * 100), 50 + Math.floor(rnd() * 70), { from: 1, ...(rnd() < 0.3 ? { priority: Math.floor(rnd() * 3) } : {}) }));
    (rnd() < 0.5 ? left : right).push(id);
  }
  return {
    stage: { x: 0, y: 0, width: 1000, height },
    edges: [column("left", "left", 0, left, { gap: 4, pad: { start: 4, end: 4 }, menu: { main: 28 } }), column("right", "right", 0, right, { gap: 4, pad: { start: 4, end: 4 }, menu: { main: 28 } })],
    items: byId(items),
    floats: [],
    floatKinds: ["panel"],
  };
}

/** Each item's step: its form index, or 99 in the menu. */
const steps = (s: Scene, l: SceneLayout): Record<string, number> => Object.fromEntries(Object.keys(s.items).map((id) => [id, l.items[id]!.inMenu ? 99 : l.items[id]!.form]));

/** The same panels in dynamic columns folded by hand, so each side's rail strip shows them as segments. */
function stripScene(seed: number, height = 900): Scene {
  const s = railScene(seed, height);
  const template = { accepts: ["panel"], cross: { min: 160, max: 480, rail: 30 } };
  const edges = s.edges.flatMap((e) => e.items.map((id, i) => ({ ...column(`${e.side}-${id}`, e.side as "left" | "right", i, [id]), accepts: ["panel"], column: true })));
  return { ...s, edges, columns: { left: template, right: template }, rails: { left: { width: 30, accepts: ["panel"] }, right: { width: 30, accepts: ["panel"] } } };
}

describe("rail titles in a side's rail strip", () => {
  it("titles fit, step down to tiles by the ladder, and come back in exact reverse", () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s0 = stripScene(seed);
      const l0 = solve(s0);
      for (const id of Object.keys(s0.items)) {
        expect(l0.items[id]!.rail, `seed ${seed}: ${id}`).toBeDefined();
        expect(l0.items[id]!.form).toBe(TITLE);
        expect(l0.items[id]!.railTitle).toBe(l0.items[id]!.rail);
      }
      let previous = l0;
      const heights: number[] = [];
      for (let h = 900; h >= 80; h -= 17) heights.push(h);
      const down = new Map<number, Record<string, number>>();
      for (const h of heights) {
        const s = { ...s0, stage: { ...s0.stage, height: h } };
        const l = solve(s, { previous });
        const st = steps(s, l);
        for (const side of ["left", "right"] as const) {
          const ids = l.rails[side]?.segments.map((x) => x.id) ?? [];
          for (const a of ids)
            for (const b of ids) {
              const pa = s.items[a]!.priority ?? 0;
              const pb = s.items[b]!.priority ?? 0;
              if ((pa < pb || (pa === pb && s.items[a]!.used < s.items[b]!.used)) && st[b]! > TITLE) expect(st[a]!, `seed ${seed} at ${h}: ${b} before ${a}`).toBeGreaterThan(TITLE);
            }
        }
        down.set(h, st);
        previous = l;
      }
      for (const h of [...heights].reverse()) {
        const s = { ...s0, stage: { ...s0.stage, height: h } };
        const l = solve(s, { previous });
        expect(steps(s, l), `seed ${seed} at ${h} growing back`).toEqual(down.get(h));
        previous = l;
      }
    }
  });

  it('"icons" draws the tiles exactly as panels with no title form', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = setRailMode(setRailMode(stripScene(seed), "left", "icons"), "right", "icons");
      const plain: Scene = { ...s, items: Object.fromEntries(Object.entries(s.items).map(([id, it]) => [id, { ...it, forms: { column: it.forms.column!.filter((f) => !f.title) } }])) };
      const l = solve(s);
      const lp = solve(plain);
      for (const id of Object.keys(s.items)) {
        expect(l.items[id]!.rect, `seed ${seed}: ${id}`).toEqual(lp.items[id]!.rect);
        expect(l.items[id]!.railTitle).toBeUndefined();
      }
      expect(l.rails.left?.stack).toBeUndefined();
    }
  });
});

describe("rail titles", () => {
  it("every item takes its title while the rail fits them all, reported with its side", () => {
    const s = railScene(1);
    const l = solve(s);
    for (const e of s.edges)
      for (const id of e.items) {
        expect(l.items[id]!.form, id).toBe(TITLE);
        expect(l.items[id]!.formKind).toBe("rail");
        expect(l.items[id]!.tab).toBe(true);
        expect(l.items[id]!.railTitle).toBe(e.side);
        expect(l.items[id]!.rect.height).toBe(s.items[id]!.forms.column![TITLE]!.main.natural);
      }
  });

  it("a shrink steps titles down to tiles by the ladder, and growing back is the exact reverse", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const s0 = railScene(seed);
      let previous = solve(s0);
      let last = steps(s0, previous);
      const heights: number[] = [];
      for (let h = 900; h >= 60; h -= 13) heights.push(h);
      const down = new Map<number, Record<string, number>>();
      for (const h of heights) {
        const s = { ...s0, stage: { ...s0.stage, height: h } };
        const l = solve(s, { previous });
        const st = steps(s, l);
        for (const id of Object.keys(st)) expect(st[id]!, `seed ${seed} at ${h}: ${id} stepped up while shrinking`).toBeGreaterThanOrEqual(last[id]!);
        // The ladder: within an edge, an item is still a title only while every item that gives way before it (lower
        // priority, else used longer ago) has stepped down from its title already, unless that one is a title too.
        for (const e of s.edges) {
          for (const a of e.items)
            for (const b of e.items) {
              const pa = s.items[a]!.priority ?? 0;
              const pb = s.items[b]!.priority ?? 0;
              const before = pa < pb || (pa === pb && s.items[a]!.used < s.items[b]!.used);
              if (before && st[b]! > TITLE) expect(st[a]!, `seed ${seed} at ${h}: ${b} left its title before ${a}`).toBeGreaterThan(TITLE);
            }
          for (const id of e.items) expect(l.items[id]!.railTitle === e.side, `seed ${seed} at ${h}: ${id}'s railTitle`).toBe(st[id] === TITLE);
        }
        down.set(h, st);
        previous = l;
        last = st;
      }
      for (const h of [...heights].reverse()) {
        const s = { ...s0, stage: { ...s0.stage, height: h } };
        const l = solve(s, { previous });
        expect(steps(s, l), `seed ${seed} at ${h} growing back`).toEqual(down.get(h));
        previous = l;
      }
    }
  });

  it('"icons" passes the titles over, per side', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = setRailMode(railScene(seed), "left", "icons");
      const l = solve(s);
      for (const id of s.edges.find((e) => e.id === "left")!.items) {
        expect(l.items[id]!.form, `seed ${seed}: ${id}`).toBeGreaterThanOrEqual(TILE);
        expect(l.items[id]!.railTitle).toBeUndefined();
      }
      // The same as the panels with no title form at all, rect for rect.
      const plain: Scene = { ...s, items: Object.fromEntries(Object.entries(s.items).map(([id, it]) => [id, { ...it, forms: { column: it.forms.column!.filter((f) => !f.title) } }])) };
      const lp = solve(plain);
      for (const id of s.edges.find((e) => e.id === "left")!.items) expect(l.items[id]!.rect, `seed ${seed}: ${id}`).toEqual(lp.items[id]!.rect);
      // The right side keeps its titles while they fit.
      const r0 = solve(railScene(seed));
      for (const id of s.edges.find((e) => e.id === "right")!.items) expect(l.items[id]!.form).toBe(r0.items[id]!.form);
    }
  });

  it("switching the mode under `previous` takes the titles back or gives them up at once", () => {
    const s = railScene(3);
    const l = solve(s);
    const icons = setRailMode(s, "left", "icons");
    const li = solve(icons, { previous: l });
    for (const id of s.edges[0]!.items) expect(li.items[id]!.form).toBe(TILE);
    const back = solve(setRailMode(icons, "left", "titles"), { previous: li });
    for (const id of s.edges[0]!.items) expect(back.items[id]!.form).toBe(TITLE);
  });

  it("a column that isn't a rail never takes a title form", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s0 = railScene(seed);
      // Every panel open: the columns set their width, so they are no rails.
      const s: Scene = { ...s0, items: Object.fromEntries(Object.entries(s0.items).map(([id, it]) => [id, { ...it, from: 0 }])) };
      for (let h = 900; h >= 100; h -= 50) {
        const l = solve({ ...s, stage: { ...s.stage, height: h } });
        // A title only in a rail (a column whose panels all gave way to their headers is drawn as one).
        for (const id of Object.keys(s.items)) if (l.items[id]!.form === TITLE) expect(l.items[id]!.tab, `seed ${seed} at ${h}: ${id}`).toBe(true);
        for (const e of s.edges) if (l.edges[e.id]!.tabs.length === 0) for (const id of e.items) expect(l.items[id]!.form, `seed ${seed} at ${h}: ${id}`).not.toBe(TITLE);
      }
    }
  });

  it("setRailMode changes only left and right, and only to a known mode", () => {
    const s = railScene(1);
    expect(setRailMode(s, "left", "titles")).toBe(s);
    expect(setRailMode(s, "top" as "left", "icons")).toBe(s);
    expect(setRailMode(s, "left", "bogus" as "icons")).toBe(s);
    expect(setRailMode(s, "right", "icons").railModes).toEqual({ right: "icons" });
  });

  it("storeScene / readScene keep each side's mode", () => {
    const base = railScene(2);
    const s = setRailMode(base, "right", "icons");
    const stored = storeScene(s);
    expect(stored.railModes).toEqual({ right: "icons" });
    const back = readScene(JSON.parse(JSON.stringify(stored)), base);
    expect(back.dropped).toEqual([]);
    expect(back.scene.railModes).toEqual({ right: "icons" });
    expect(storeScene(base).railModes).toBeUndefined();
    const bad = readScene({ ...stored, railModes: { right: "tiles", top: "icons" } }, base);
    expect(bad.dropped).toEqual(["railModes:right", "railModes:top"]);
    expect(bad.scene.railModes).toBeUndefined();
  });

  it("a scene without title forms lays out the same in either mode", () => {
    const scenes: Scene[] = [windowScene(), { ...windowScene(), items: { ...windowScene().items, pages: panel("pages", 1, { from: 1 }) } }];
    for (let seed = 1; seed <= 20; seed++) {
      const s = railScene(seed);
      const strip = (f: readonly StackForm[]): StackForm[] => f.filter((x) => !x.title);
      scenes.push({ ...s, items: Object.fromEntries(Object.entries(s.items).map(([id, it]) => [id, { ...it, forms: { column: strip(it.forms.column!) } }])) });
    }
    for (const s of scenes) {
      const l = solve(s);
      expect(solve(setRailMode(setRailMode(s, "left", "icons"), "right", "icons"))).toEqual(l);
      expect(solve(setRailMode(s, "left", "titles"))).toEqual(l);
    }
  });
});
