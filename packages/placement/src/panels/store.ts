/**
 * The panels' stored form: `storePanels(state)` gives plain JSON-safe data (`{ v: 1, … }`); `readPanels(data, defs?)`
 * reads parsed data back and never throws. As with the toolbar's `readArrangement`: anything but an object of
 * version 1 is `{ ok: false, error }`. Inside one, it is lenient: an unknown id (with `defs`), a repeated one or a
 * malformed entry is dropped and listed in `dropped`; widths and float sizes are clamped to the defs. A panel the
 * consumer has but the stored state lacks is no error: the consumer places it (`open` with a place, say).
 *
 * Version 1 only gains optional fields. A field this reader doesn't know (a newer writer's, say) is no error either:
 * it is skipped and reported in `dropped` (`"<field>"` at the top, `"sides.<key>"`, `"column.<field>"`,
 * `"float.<field>"`; a clock entry for a panel that isn't placed as `"clock.<id>"`), so a consumer can tell that
 * something was left out. A column's `show` ("tabs") and `active` are such optional fields: an unknown `show` is
 * dropped as `"column.show"`, an `active` that isn't one of the column's panels as `"column.active:<id>"`.
 *
 * `bands` (26.11.10) is such an optional field too: `{ top?, bottom? }`, each `{ panels, height }`. An unknown edge is
 * dropped as `"bands.<key>"`, a band that isn't an object with a panels list and a numeric height (or whose panels are
 * all dropped) as `"bands.<edge>"`, an unknown field in one as `"band.<field>"`. Heights are clamped to the defs.
 */
import type { Rect } from "../geometry";
import { EDGES, SIDES, bandSize, defOf, floatSize, type Band, type Clock, type Column, type Edge, type FloatAt, type PanelDef, type PanelsState, type Side } from "./model";

export interface StoredPanels {
  readonly v: 1;
  /** A column's `show` and `active` only when it is tabbed / has one (optional fields of v1). */
  readonly sides: Record<Side, { panels: string[]; width: number; show?: "tabs"; active?: string }[]>;
  /** The bands, only when the state has one (an optional field of v1). */
  readonly bands?: Partial<Record<Edge, { panels: string[]; height: number }>>;
  readonly floats: { id: string; rect: Rect; pinned: boolean }[];
  readonly folded: string[];
  readonly kept: string[];
  readonly closed: string[];
  readonly clock: Record<string, Clock>;
}

export type PanelsRead = { readonly ok: true; readonly state: PanelsState; readonly dropped: readonly string[] } | { readonly ok: false; readonly error: string };

export function storePanels(state: PanelsState): StoredPanels {
  const column = (c: Column): StoredPanels["sides"]["left"][number] => ({
    panels: [...c.panels],
    width: c.width,
    ...(c.show === "tabs" ? { show: "tabs" as const } : {}),
    ...(c.active !== undefined ? { active: c.active } : {}),
  });
  const sides = Object.fromEntries(SIDES.map((s) => [s, state.sides[s].map(column)])) as StoredPanels["sides"];
  const bands: NonNullable<StoredPanels["bands"]> = {};
  for (const e of EDGES) {
    const b = state.bands?.[e];
    if (b) bands[e] = { panels: [...b.panels], height: b.height };
  }
  return {
    v: 1,
    sides,
    ...(EDGES.some((e) => bands[e]) ? { bands } : {}),
    floats: state.floats.map((f) => ({ id: f.id, rect: { x: f.rect.x, y: f.rect.y, width: f.rect.width, height: f.rect.height }, pinned: !!f.pinned })),
    folded: [...state.folded],
    kept: [...state.kept],
    closed: [...state.closed],
    clock: Object.fromEntries(Object.entries(state.clock).map(([k, c]) => [k, { opened: c.opened, used: c.used }])),
  };
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const finite = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

export function readPanels(data: unknown, defs?: readonly PanelDef[]): PanelsRead {
  try {
    return read(data, defs);
  } catch (e) {
    // A getter that throws, a proxy: still no throw.
    return { ok: false, error: `unreadable: ${e instanceof Error ? e.message : typeof e}` };
  }
}

function read(data: unknown, defs?: readonly PanelDef[]): PanelsRead {
  if (!isObject(data)) return { ok: false, error: "not an object" };
  // Named without serialising it: a BigInt or a circular value must not throw.
  if (data.v !== 1) return { ok: false, error: `unknown version ${typeof data.v === "number" || typeof data.v === "string" ? String(data.v) : typeof data.v} (this reads version 1)` };
  if (!isObject(data.sides)) return { ok: false, error: "sides is missing" };
  const dropped: string[] = [];
  const drop = (what: string): void => {
    if (!dropped.includes(what)) dropped.push(what);
  };
  const seen = new Set<string>();
  // An id the consumer has, not placed yet.
  const take = (x: unknown): string | null => {
    if (typeof x !== "string") {
      drop(`a ${typeof x} where an id goes`);
      return null;
    }
    if ((defs && !defOf(defs, x)) || seen.has(x)) {
      drop(x);
      return null;
    }
    seen.add(x);
    return x;
  };
  // Fields this version doesn't know: skipped, and reported.
  const extra = (o: Record<string, unknown>, known: readonly string[], prefix: string): void => {
    for (const k of Object.keys(o)) if (!known.includes(k)) drop(`${prefix}${k}`);
  };
  extra(data, ["v", "sides", "bands", "floats", "folded", "kept", "closed", "clock"], "");
  extra(data.sides, SIDES, "sides.");
  const sides = { left: [] as Column[], right: [] as Column[] };
  for (const side of SIDES) {
    const cols = data.sides[side];
    if (cols === undefined) continue;
    if (!Array.isArray(cols)) {
      drop(`sides.${side}`);
      continue;
    }
    for (const c of cols as unknown[]) {
      if (!isObject(c) || !Array.isArray(c.panels)) {
        drop(`a column on the ${side}`);
        continue;
      }
      extra(c, ["panels", "width", "show", "active"], "column.");
      const panels = (c.panels as unknown[]).map(take).filter((x): x is string => x !== null);
      if (panels.length === 0) continue;
      const ds = defs ? panels.map((id) => defOf(defs, id)!) : [];
      const lo = Math.max(0, ...ds.map((d) => d.width.min));
      const hi = Math.max(lo, Math.min(...ds.map((d) => d.width.max)));
      const natural = ds.length ? Math.max(...ds.map((d) => d.width.natural)) : 0;
      const width = finite(c.width) ? c.width : natural;
      // `show`: "tabs" or "stack" (a stack is the default, so not kept); `active`: a panel of this column.
      if (c.show !== undefined && c.show !== "tabs" && c.show !== "stack") drop("column.show");
      if (c.active !== undefined && !(typeof c.active === "string" && panels.includes(c.active))) drop(`column.active:${typeof c.active === "string" ? c.active : typeof c.active}`);
      const tabs = c.show === "tabs" ? { show: "tabs" as const } : {};
      const active = typeof c.active === "string" && panels.includes(c.active) ? { active: c.active } : {};
      sides[side].push({ panels, width: defs ? Math.min(Math.max(width, lo), hi) : Math.max(0, width), ...tabs, ...active });
    }
  }
  const bands: Partial<Record<Edge, Band>> = {};
  if (data.bands !== undefined) {
    if (!isObject(data.bands)) drop("bands");
    else {
      extra(data.bands, EDGES, "bands.");
      for (const e of EDGES) {
        const b = data.bands[e];
        if (b === undefined) continue;
        if (!isObject(b) || !Array.isArray(b.panels) || !finite(b.height)) {
          drop(`bands.${e}`);
          continue;
        }
        extra(b, ["panels", "height"], "band.");
        const panels = (b.panels as unknown[]).map(take).filter((x): x is string => x !== null);
        if (panels.length === 0) {
          drop(`bands.${e}`);
          continue;
        }
        const ds = defs ? panels.map((id) => bandSize(defOf(defs, id))) : [];
        const lo = Math.max(0, ...ds.map((d) => d.min));
        const hi = Math.max(lo, Math.min(...ds.map((d) => d.max)));
        bands[e] = { panels, height: defs ? Math.min(Math.max(b.height, lo), hi) : Math.max(0, b.height) };
      }
    }
  }
  const floats: FloatAt[] = [];
  for (const f of Array.isArray(data.floats) ? (data.floats as unknown[]) : []) {
    const r = isObject(f) ? f.rect : undefined;
    if (!isObject(f) || !isObject(r) || !finite(r.x) || !finite(r.y) || !finite(r.width) || !finite(r.height)) {
      drop(isObject(f) && typeof f.id === "string" ? f.id : "a float");
      continue;
    }
    extra(f, ["id", "rect", "pinned"], "float.");
    const id = take(f.id);
    if (id === null) continue;
    const min = defs ? floatSize(defOf(defs, id)).min : { width: 0, height: 0 };
    floats.push({ id, rect: { x: r.x, y: r.y, width: Math.max(min.width, r.width), height: Math.max(min.height, r.height) }, ...(f.pinned === true ? { pinned: true } : {}) });
  }
  if (data.floats !== undefined && !Array.isArray(data.floats)) drop("floats");
  // The lists keep only ids that are placed (a closed panel keeps its place).
  const placed = (key: "folded" | "kept" | "closed"): string[] => {
    const x = data[key];
    if (x === undefined) return [];
    if (!Array.isArray(x)) {
      drop(key);
      return [];
    }
    const out: string[] = [];
    for (const id of x as unknown[]) {
      if (typeof id === "string" && seen.has(id)) {
        if (!out.includes(id)) out.push(id);
      } else drop(typeof id === "string" ? id : `a ${typeof id} in ${key}`);
    }
    return out;
  };
  const floating = new Set(floats.map((f) => f.id));
  // Only a docked panel is kept open.
  const kept = placed("kept").filter((id) => {
    if (floating.has(id)) drop(id);
    return !floating.has(id);
  });
  const clock: Record<string, Clock> = {};
  if (isObject(data.clock)) {
    for (const id of Object.keys(data.clock)) if (!seen.has(id)) drop(`clock.${id}`);
    for (const id of seen) {
      const c = data.clock[id];
      clock[id] = isObject(c) && finite(c.opened) && finite(c.used) ? { opened: c.opened, used: c.used } : { opened: 0, used: 0 };
    }
  }
  const state: PanelsState = { sides, floats, folded: placed("folded"), kept, closed: placed("closed"), clock };
  return { ok: true, state: EDGES.some((e) => bands[e]) ? { ...state, bands } : state, dropped };
}
