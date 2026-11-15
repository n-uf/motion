/**
 * The panels' acceptance rows (`fixtures/scene-arrangements.json`): 22 arrangements of three panels plus the anchor
 * (a fixed thumbnail edge), sheet, padding and stored-width scenes, at window widths 280..1279 (window A and window B
 * numbers). A row with no kind is a regression row; `kind: "target"` holds the result the library should reach, its
 * `gap` naming why it once differed; `intended` rows hold the Scene's own result where it differs on purpose (C9 height
 * give-way, C27 floats clear of docked items). Rows whose gap names `float-clear-decision` hold the old result for
 * reference only: the Scene keeps floats clear of columns (C27), so they are skipped.
 *
 * The adapter maps the fixture's intent forms (card, bar, rail) to the library's forms, as `scene-columns.test.ts`
 * does, and declares the hosts' own rules as scene options: an anchor edge (`accepts: []`, a fixed item) lies outside
 * the inset with `outsideInset`, the inset applies only while something is docked (`insetWhen: "docked"`).
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readScene, setSide, solve, storeScene, use, type Edge, type Scene, type SceneItem, type SceneLayout } from "../src/scene";
import type { StackForm } from "../src/stack";

const here = dirname(fileURLToPath(import.meta.url));
const read = (name: string): Fixture => JSON.parse(readFileSync(join(here, "fixtures", name), "utf8")) as Fixture;

type Side = "left" | "right";
interface RawItem {
  kind?: string;
  used?: number;
  forms?: { column: string[] };
  from?: number;
  closed?: boolean;
  kept?: boolean;
  fixed?: boolean;
  width?: { natural: number; min: number; max: number };
}
interface RawEdge {
  id: string;
  side: Side;
  ring: number;
  column?: boolean;
  items: string[];
  size?: number;
  accepts?: string[];
  cross?: { min: number; max: number };
}
interface RawScene {
  extends?: string;
  stage?: { x: number; y: number; w: number; h: number };
  contentMin?: { width: number; height: number };
  handFold?: "bar" | "ride";
  floatKinds?: string[];
  columns?: Record<Side, { accepts: string[]; cross: { min: number; max: number; rail: number }; gap: number }>;
  rails?: Record<Side, { width: number; accepts: string[] }>;
  pad?: { start: number; end: number };
  items?: Record<string, RawItem | null>;
  edges?: RawEdge[];
  floats?: { id: string; rect: { x: number; y: number; w: number; h: number } }[];
}
type XYWH = { x: number; y: number; w: number; h: number };
interface Row {
  stage: { w: number; h: number };
  kind?: "target" | "option";
  gap?: string;
  intended?: boolean;
  press?: string[];
  history?: string | number[];
  layout: {
    columns?: Partial<Record<Side, string[][]>>;
    columnWidths?: Partial<Record<Side, number[]>>;
    rails?: Partial<Record<Side, string[]>>;
    contentWidth?: number;
    contentWidthAtLeast?: number;
    forms?: Record<string, "bar" | "rail">;
    rides?: Record<string, Side>;
    floats?: Record<string, XYWH & { form?: "bar" }>;
    sheetFallback?: boolean;
    columnX?: Partial<Record<Side, number[]>>;
    heights?: Record<string, number>;
    anchorRect?: XYWH;
    railX?: Partial<Record<Side, number>>;
    riderRects?: Record<string, XYWH>;
  };
}
interface Fixture {
  _numbers?: { barMain?: number; floatSize?: { width: number; height: number } };
  scenes: Record<string, { scene: RawScene; expect: Row[]; variants?: { name: string; scene: RawScene; expect: Row[] }[] }>;
}

const files: Record<string, Fixture> = { "window-a.json": read("scene-window-a.json"), "window-b.json": read("scene-window-b.json") };
const rows = read("scene-arrangements.json");

/** A raw scene with its `extends` (`file#scene`) merged: edges and floats replace, items merge by id. */
function flatten(raw: RawScene): { scene: RawScene; file: Fixture; name: string } {
  if (!raw.extends) throw new Error("every row scene extends a window");
  const [name, key] = raw.extends.split("#") as [string, string];
  const file = files[name]!;
  const base = file.scenes[key]!.scene as RawScene;
  const items: Record<string, RawItem | null> = { ...base.items };
  for (const [id, v] of Object.entries(raw.items ?? {})) {
    if (v === null) delete items[id];
    else items[id] = { ...(items[id] ?? {}), ...v };
  }
  return { scene: { ...base, ...raw, items, extends: undefined }, file, name };
}

/** A card's natural width in each window (its columns open at it while the room allows). */
const CARD_NATURAL: Record<string, number> = { "window-a.json": 300, "window-b.json": 280 };
/** A folded panel's bar height in each window. */
const BAR_MAIN: Record<string, number> = { "window-a.json": 30, "window-b.json": 38 };

/**
 * The scene at `width` × `height`: card = an open form that grows and sets the width; bar = a header; rail = a rail
 * segment. The stage padding is an inset on every side (half of it each side). `hosts` declares the hosts' own rules
 * (an anchor outside the inset that gives way, the inset only while docked); the other rows were recorded from the
 * Scene without them, so their scenes leave them out.
 */
function adapt(raw0: RawScene, width: number, height: number, hosts = true): Scene {
  const { scene: raw, file, name: window } = flatten(raw0);
  const left = raw.columns!.left;
  const barMain = file._numbers?.barMain ?? BAR_MAIN[window]!;
  const formOf = (name: string): StackForm =>
    name === "card"
      ? { kind: "open", main: { min: 160, natural: 300, grows: true }, cross: { natural: CARD_NATURAL[window]!, min: left.cross.min } }
      : name === "bar"
        ? { kind: "header", main: { min: barMain, natural: barMain }, cross: { natural: left.cross.min, min: 60 } }
        : { kind: "rail", main: { min: 36, natural: 36 }, cross: { natural: left.cross.rail } };
  const items: Record<string, SceneItem> = {};
  for (const [id, v] of Object.entries(raw.items ?? {})) {
    if (!v) continue;
    if (v.width) {
      // An anchor: a fixed item as wide as its edge, `width` its natural and minimum width.
      items[id] = { id, kind: v.kind ?? "anchor", used: v.used ?? 0, fixed: true, forms: { column: [{ kind: "open", main: { min: 0, natural: 0, grows: true }, cross: { natural: v.width.natural, min: v.width.min }, setsCross: true }] } };
      continue;
    }
    items[id] = {
      id,
      kind: v.kind!,
      used: v.used ?? 0,
      forms: { column: v.forms!.column.map(formOf) },
      ...(v.from !== undefined ? { from: v.from } : {}),
      ...(v.closed ? { closed: true } : {}),
      ...(v.kept ? { kept: true } : {}),
    };
  }
  const edges: Edge[] = raw.edges!.map((e) => {
    const t = raw.columns![e.side];
    if (e.accepts) return { id: e.id, side: e.side, ring: e.ring, items: e.items, accepts: [], cross: { min: e.cross!.min, max: e.cross!.max, rail: e.cross!.min }, ...(hosts ? { outsideInset: true, ...(e.side === "left" ? { giveWay: true } : {}) } : {}) };
    return { id: e.id, side: e.side, ring: e.ring, column: e.column, items: e.items.filter((id) => items[id]), accepts: t.accepts, cross: t.cross, gap: t.gap, ...(e.size !== undefined ? { size: e.size } : {}) };
  });
  const floatSize = rows._numbers?.floatSize ?? { width: 300, height: 300 };
  return {
    stage: { x: 0, y: 0, width, height },
    edges,
    items: Object.fromEntries(Object.entries(items).map(([id, it]) => [id, raw.floats?.some((f) => f.id === id) ? { ...it, floatSize } : it])),
    floats: (raw.floats ?? []).map((f) => ({ id: f.id, rect: { x: f.rect.x, y: f.rect.y, width: f.rect.w, height: f.rect.h } })),
    floatKinds: raw.floatKinds ?? ["panel"],
    columns: raw.columns!,
    rails: raw.rails!,
    contentMin: raw.contentMin!,
    handFold: raw.handFold ?? "bar",
    inset: { left: raw.pad?.start ?? 0, right: raw.pad?.end ?? 0, top: raw.pad?.start ?? 0, bottom: raw.pad?.end ?? 0 },
    ...(hosts ? { insetWhen: "docked" as const } : {}),
    gutter: left.gap,
  };
}

/** The layout after the row's history (each width solved under the previous) and its presses. */
function layoutOf(raw: RawScene, row: Row): { s: Scene; l: SceneLayout } {
  let previous: SceneLayout | undefined;
  const widths: number[] = [];
  // The hosts' rules are options: a target row (today's result) declares them, a regression or intended row (the
  // Scene's own result) runs on the defaults.
  const hosts = row.kind === "target";
  if (typeof row.history === "string") {
    const m = /narrowed (\d+) to (\d+) in steps of (\d+)/.exec(row.history);
    if (m) for (let w = Number(m[1]); w >= Number(m[2]); w -= Number(m[3])) widths.push(w);
    else widths.push(Number(row.history));
  } else if (Array.isArray(row.history)) widths.push(...row.history);
  for (const w of widths) previous = solve(adapt(raw, w, row.stage.h, hosts), previous ? { previous } : {});
  let s = adapt(raw, row.stage.w, row.stage.h, hosts);
  let l = solve(s, previous ? { previous } : {});
  for (const id of row.press ?? []) {
    s = use(s, id);
    l = solve(s, { previous: l });
  }
  return { s, l };
}

const near = (a: number, b: number) => Math.abs(a - b) <= 0.5;
const sameXYWH = (r: { x: number; y: number; width: number; height: number } | undefined, w: XYWH) => !!r && near(r.x, w.x) && near(r.y, w.y) && near(r.width, w.w) && near(r.height, w.h);

/** Every difference between the row and the layout, as text (empty when the row holds). */
function diff(s: Scene, l: SceneLayout, row: Row): string[] {
  const out: string[] = [];
  const want = row.layout;
  const open: Record<Side, Edge[]> = { left: [], right: [] };
  const isAnchor = (e: Edge) => e.accepts.length === 0;
  for (const side of ["left", "right"] as const) {
    // Some rows list the panel columns only (no anchor among them): compare those.
    const anchorsListed = (want.columns?.[side] ?? []).some((c) => c.some((id) => s.edges.some((e) => isAnchor(e) && e.items.includes(id))));
    const panelsOnly = !!want.columns?.[side] && !anchorsListed;
    for (const e of s.edges.filter((x) => x.side === side)) {
      const el = l.edges[e.id];
      if (el && !el.folded && !el.rides && el.cross > 0 && !(panelsOnly && isAnchor(e))) open[side].push(e);
    }
    // Outer first: by the drawn position from the side's window edge.
    open[side].sort((a, b) => (side === "left" ? l.edges[a.id]!.rect.x - l.edges[b.id]!.rect.x : l.edges[b.id]!.rect.x - l.edges[a.id]!.rect.x));
  }
  for (const side of ["left", "right"] as const) {
    const cols = open[side].map((e) => e.items.filter((id) => !s.items[id]?.closed));
    if (want.columns?.[side] && JSON.stringify(cols) !== JSON.stringify(want.columns[side])) out.push(`columns.${side} ${JSON.stringify(cols)} want ${JSON.stringify(want.columns[side])}`);
    const widths = open[side].map((e) => Math.round(l.edges[e.id]!.cross * 100) / 100);
    if (want.columnWidths?.[side] && JSON.stringify(widths) !== JSON.stringify(want.columnWidths[side])) out.push(`columnWidths.${side} ${JSON.stringify(widths)} want ${JSON.stringify(want.columnWidths[side])}`);
    const xs = open[side].map((e) => Math.round(l.edges[e.id]!.rect.x * 100) / 100);
    if (want.columnX?.[side] && JSON.stringify(xs) !== JSON.stringify(want.columnX[side])) out.push(`columnX.${side} ${JSON.stringify(xs)} want ${JSON.stringify(want.columnX[side])}`);
    const rail = (l.rails[side]?.segments ?? []).map((x) => x.id);
    if (want.rails?.[side] && JSON.stringify(rail) !== JSON.stringify(want.rails[side])) out.push(`rails.${side} ${JSON.stringify(rail)} want ${JSON.stringify(want.rails[side])}`);
    const rx = want.railX?.[side];
    if (rx !== undefined && !near(l.rails[side]?.rect.x ?? NaN, rx)) out.push(`railX.${side} ${l.rails[side]?.rect.x} want ${rx}`);
  }
  if (want.contentWidth !== undefined && !near(l.content.width, want.contentWidth)) out.push(`contentWidth ${l.content.width} want ${want.contentWidth}`);
  if (want.contentWidthAtLeast !== undefined && l.content.width < want.contentWidthAtLeast - 0.5) out.push(`contentWidth ${l.content.width} want ≥ ${want.contentWidthAtLeast}`);
  for (const [id, f] of Object.entries(want.forms ?? {})) {
    const k = l.items[id]?.formKind;
    if (k !== (f === "bar" ? "header" : "rail")) out.push(`forms.${id} ${k} want ${f}`);
  }
  for (const [id, side] of Object.entries(want.rides ?? {})) {
    const host = l.items[id]?.rides;
    if (!host || l.edges[host]?.side !== side) out.push(`rides.${id} ${host ?? "none"} want ${side}`);
  }
  for (const [id, r] of Object.entries(want.riderRects ?? {})) if (!sameXYWH(l.items[id]?.rect, r)) out.push(`riderRects.${id} ${JSON.stringify(l.items[id]?.rect)} want ${JSON.stringify(r)}`);
  for (const [id, f] of Object.entries(want.floats ?? {})) {
    const it = l.items[id];
    if (!it?.floating || !sameXYWH(it.rect, f) || (f.form === "bar") !== (it.formKind === "header")) out.push(`floats.${id} ${JSON.stringify(it?.rect)} ${it?.formKind} want ${JSON.stringify(f)}`);
  }
  for (const [id, h] of Object.entries(want.heights ?? {})) if (!near(l.items[id]?.rect.height ?? NaN, h)) out.push(`heights.${id} ${l.items[id]?.rect.height} want ${h}`);
  if (want.anchorRect) {
    const anchor = s.edges.find((e) => e.accepts.length === 0 && e.items.length > 0);
    const r = anchor ? l.items[anchor.items[0]!]?.rect : undefined;
    if (!sameXYWH(r, want.anchorRect)) out.push(`anchorRect ${JSON.stringify(r)} want ${JSON.stringify(want.anchorRect)}`);
  }
  if (want.sheetFallback !== undefined && (l.columnRoom === false) !== want.sheetFallback) out.push(`sheetFallback ${l.columnRoom === false} want ${want.sheetFallback}`);
  return out;
}

/** Gaps still to close (each its revision); their rows are listed, not asserted. */
const PENDING = new Set<string>([]);
/**
 * Rows that disagree with another row of the file or with the revision's rule, listed (not asserted) until ruled:
 * `scene` (with its variant), the stage width, and why.
 */
const QUESTIONS: { scene: string; w: number; why: string }[] = [
  ...[
    ["floating", 700],
    ["floating", 400],
    ["floatingFolded", 700],
    ["floatingFolded", 400],
    ["floatingOverColumn", 400],
    ["floatingAtEdge", 1120],
    ["floatingAtEdge", 700],
    ["floatingAtEdge", 300],
  ].map(([scene, w]) => ({ scene: scene as string, w: w as number, why: "float x 12 px left of the stage less the inset: the row clamps into [0, W − 24], the rule into [12, W − 12]" })),
  { scene: "padding-always", w: 1000, why: "a regression row with every panel open in a scene whose panels are all closed" },
  { scene: "anchor-keeps-its-side", w: 1200, why: "the right anchor inside the inset (x 1116) while the left one lies outside it (x 0, anchor-outside-the-padding)" },
  { scene: "anchor-keeps-its-side", w: 900, why: "the right anchor inside the inset (x 816) while the left one lies outside it" },
  { scene: "anchorRiderOverAnchor (anchor-right-no-open-column)", w: 600, why: "recorded with the anchor outside the rail; 7b makes the rail the side's outermost edge" },
];
/** Kept on purpose (C27): the Scene moves a float clear of docked items; the row holds the old result for reference. */
const REFERENCE = "float-clear-decision";

describe("panel arrangements: the acceptance rows", () => {
  for (const [name, sc] of Object.entries(rows.scenes)) {
    const sets = [{ label: name, scene: sc.scene, expect: sc.expect }, ...(sc.variants ?? []).map((v) => ({ label: `${name} (${v.name})`, scene: v.scene, expect: v.expect }))];
    for (const set of sets) {
      for (const row of set.expect) {
        const tag = `${set.label} at ${row.stage.w}×${row.stage.h}${row.kind ? ` [${row.kind}${row.gap ? `: ${row.gap}` : ""}]` : row.intended ? " [intended]" : ""}`;
        const gaps = (row.gap ?? "").split("+").filter(Boolean);
        if (gaps.includes(REFERENCE)) continue;
        const q = QUESTIONS.find((x) => x.scene === set.label && x.w === row.stage.w && (set.label !== "padding-always" || !row.kind));
        if (gaps.some((g) => PENDING.has(g)) || q) {
          it.todo(`${tag}${q ? `: ${q.why}` : ""}`);
          continue;
        }
        it(tag, () => {
          const { s, l } = layoutOf(set.scene, row);
          expect(diff(s, l, row)).toEqual([]);
        });
      }
    }
  }
});

describe("the options the rows need", () => {
  const anchorLeft = rows.scenes["anchor-outside-the-padding"]!.scene;
  const anchorRight = rows.scenes["anchor-keeps-its-side"]!.scene;

  it("setSide moves an anchor to the other side as its outermost edge, the same layout as declaring it there; the store keeps it", () => {
    const moved = setSide(adapt(anchorLeft, 1200, 800), "anchor:thumbs", "right");
    expect(moved.edges.find((e) => e.id === "anchor:thumbs")).toMatchObject({ side: "right", ring: 0 });
    const declared = adapt(anchorRight, 1200, 800);
    const a = solve(moved);
    const b = solve(declared);
    expect(a.content).toEqual(b.content);
    expect(a.items.thumbs!.rect).toEqual(b.items.thumbs!.rect);
    expect(a.items.findings!.rect).toEqual(b.items.findings!.rect);
    // Read back over the left-hand base, the stored side wins.
    const back = readScene(JSON.parse(JSON.stringify(storeScene(moved))), adapt(anchorLeft, 1200, 800));
    expect(back.scene.edges.find((e) => e.id === "anchor:thumbs")!.side).toBe("right");
    expect(solve(back.scene).items.thumbs!.rect).toEqual(a.items.thumbs!.rect);
    // Unchanged for its own side, an unknown edge, and a side across its axis.
    expect(setSide(moved, "anchor:thumbs", "right")).toBe(moved);
    expect(setSide(moved, "nope", "left")).toBe(moved);
    expect(setSide(moved, "anchor:thumbs", "top")).toBe(moved);
  });

  it("an anchor outside the inset lies at the window's side, full height, the inset after it; inside the side's rail when one shows", () => {
    const l = solve(adapt(anchorLeft, 1200, 800));
    expect(l.items.thumbs!.rect).toEqual({ x: 0, y: 0, width: 72, height: 800 });
    expect(l.edges["left-0"]!.rect.x).toBe(84);
    const railed = rows.scenes.anchorRailOrder!.scene;
    const r = solve(adapt(railed, 675, 800));
    expect(r.rails.right!.rect.x).toBe(631);
    expect(r.items.thumbs!.rect).toEqual({ x: 559, y: 0, width: 72, height: 800 });
  });

  it("no-column-room: columnRoom false with a note once one column at its minimum no longer fits beside contentMin", () => {
    const three = rows.scenes.three!.scene;
    expect(solve(adapt(three, 576, 800)).columnRoom).toBe(true);
    const narrow = solve(adapt(three, 575, 800));
    expect(narrow.columnRoom).toBe(false);
    expect(narrow.notes).toContainEqual({ code: "no-column-room", width: 551, need: 552 });
  });

  it("insetWhen docked: no inset while nothing is docked beside the content", () => {
    const none = rows.scenes.none!.scene;
    const s = adapt(none, 1000, 800, false);
    expect(solve(s).content.width).toBe(976);
    expect(solve({ ...s, insetWhen: "docked" }).content).toEqual({ x: 0, y: 0, width: 1000, height: 800 });
  });

  it("a float larger than the stage less the inset is shrunk to fit it", () => {
    const s = adapt(rows.scenes.floatingAtEdge!.scene, 300, 800);
    expect(solve(s).items.findings!.rect.width).toBe(276);
  });

  it("a panel's rail form shows only in a column drawn as a rail: an open column steps open → header, then is drawn as a rail", () => {
    const three = rows.scenes.heightSweepThreeInOne!.scene;
    for (let h = 900; h >= 120; h -= 7) {
      const l = solve(adapt(three, 1120, h));
      const col = Object.values(l.edges).find((e) => e.side === "left" && e.cross > 0);
      if (!col) continue;
      const kinds = ["pages", "annotations", "findings"].map((id) => l.items[id]?.formKind);
      if (kinds.includes("rail")) expect(kinds.every((k) => k === "rail")).toBe(true);
    }
  });
});
