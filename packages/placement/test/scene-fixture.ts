/**
 * Scenes for the scene tests. `windowScene()` is shaped like a document window: a title bar (a fixed title that grows
 * and fixed window controls), a toolbar and a bottom bar, left and right columns, three panels, four groups and a
 * float. The names are generic.
 */
import type { StackForm } from "../src/stack";
import type { Edge, Scene, SceneItem } from "../src/scene";

export const form = (kind: StackForm["kind"], min: number, natural: number, cross: number, extra: { grows?: boolean; setsCross?: boolean; crossMin?: number; rank?: number } = {}): StackForm => ({
  kind,
  main: { min, natural, ...(extra.grows ? { grows: true } : {}) },
  cross: { natural: cross, ...(extra.crossMin !== undefined ? { min: extra.crossMin } : {}) },
  ...(extra.setsCross !== undefined ? { setsCross: extra.setsCross } : {}),
  ...(extra.rank !== undefined ? { rank: extra.rank } : {}),
});

/** A panel: open (grows, sets the column's width), header, rail tab, menu. Along a row it's a header-sized entry. */
export const panel = (id: string, used: number, more: Partial<SceneItem> = {}, wide = 260): SceneItem => ({
  id,
  kind: "panel",
  used,
  forms: {
    column: [form("open", 120, 240, wide, { grows: true, crossMin: 180 }), form("header", 28, 28, wide, { crossMin: 60 }), form("rail", 28, 28, 30), form("menu", 0, 0, 0)],
    row: [form("header", 120, 160, 28), form("menu", 0, 0, 0)],
  },
  ...more,
});

/** A control group: along a row words, icons, menu; along a column stacked words, icons, menu. */
export const group = (id: string, used: number, more: Partial<SceneItem> = {}): SceneItem => ({
  id,
  kind: "group",
  used,
  forms: {
    row: [form("row", 180, 200, 28), form("icons", 84, 84, 28), form("menu", 0, 0, 0)],
    column: [form("stacked", 96, 96, 84), form("icons", 84, 84, 28), form("menu", 0, 0, 0)],
  },
  ...more,
});

/** A fixed title that shrinks to 80 and grows. */
export const title = (id = "title"): SceneItem => ({ id, kind: "title", used: 0, fixed: true, forms: { row: [form("row", 80, 160, 32, { grows: true })] } });
/** Fixed window controls, 84 wide, at the end of their bar. */
export const controls = (id = "controls"): SceneItem => ({ id, kind: "controls", used: 0, fixed: true, align: "end", forms: { row: [form("row", 84, 84, 32)] } });
/** A fixed page readout, 72 wide, centred in its bar. */
export const readout = (id = "readout"): SceneItem => ({ id, kind: "readout", used: 0, fixed: true, align: "center", forms: { row: [form("row", 72, 72, 28)] } });

export const bar = (id: string, side: "top" | "bottom", ring: number, items: string[], more: Partial<Edge> = {}): Edge => ({
  id,
  side,
  ring,
  accepts: ["group"],
  items,
  cross: { min: 36, max: 36, rail: 36 },
  gap: 4,
  pad: { start: 8, end: 8 },
  ...more,
});

export const column = (id: string, side: "left" | "right", ring: number, items: string[], more: Partial<Edge> = {}): Edge => ({
  id,
  side,
  ring,
  accepts: ["panel", "group"],
  items,
  cross: { min: 160, max: 480, rail: 30 },
  ...more,
});

export const byId = (items: readonly SceneItem[]): Record<string, SceneItem> => Object.fromEntries(items.map((it) => [it.id, it]));

export function windowScene(width = 1200, height = 800): Scene {
  return {
    stage: { x: 0, y: 0, width, height },
    edges: [
      // The title bar takes groups beside its fixed title and controls.
      { id: "titlebar", side: "top", ring: 0, accepts: ["group"], items: ["title", "controls"], cross: { min: 32, max: 32, rail: 32 } },
      bar("toolbar", "top", 1, ["views", "tools", "zoom"]),
      bar("status", "bottom", 0, ["readout", "search"], { span: "between", cross: { min: 28, max: 28, rail: 28 } }),
      column("left", "left", 0, ["pages"]),
      column("right", "right", 0, ["findings", "marks"]),
    ],
    items: byId([
      title(),
      controls(),
      readout(),
      panel("pages", 1),
      panel("findings", 2),
      panel("notes", 3),
      group("views", 4),
      group("tools", 5),
      group("zoom", 6, { align: "end" }),
      group("search", 7, { align: "end" }),
      group("marks", 8),
    ]),
    floats: [{ id: "notes", rect: { x: 500, y: 200, width: 280, height: 320 } }],
    floatKinds: ["panel", "group"],
  };
}

/** A small seeded generator, so the sweeps are the same on every run. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A `StoredScene` v1 as a host would keep it for `windowScene()`: the toolbar reordered, the left column wider, notes folded and floating. */
export const STORED_WINDOW = {
  v: 1,
  edges: [
    { id: "titlebar", side: "top", ring: 0, items: ["title", "controls"] },
    { id: "toolbar", side: "top", ring: 1, items: ["tools", "views", "zoom"] },
    { id: "status", side: "bottom", ring: 0, items: ["readout", "search"] },
    { id: "left", side: "left", ring: 0, items: ["pages"], size: 320 },
    { id: "right", side: "right", ring: 0, items: ["findings", "marks"] },
  ],
  floats: [{ id: "notes", x: 520, y: 180, width: 300, height: 340 }],
  items: {
    title: { used: 0 },
    controls: { used: 0 },
    readout: { used: 0 },
    pages: { used: 9 },
    findings: { used: 2 },
    notes: { used: 10, from: 1, floatSize: { width: 300, height: 340 } },
    views: { used: 4 },
    tools: { used: 11 },
    zoom: { used: 6, align: "end" },
    search: { used: 7, align: "end" },
    marks: { used: 8, kept: true },
  },
} as const;
