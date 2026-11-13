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
 * something was left out.
 */
import type { Rect } from "../geometry";
import { SIDES, defOf, floatSize, type Clock, type Column, type FloatAt, type PanelDef, type PanelsState, type Side } from "./model";

export interface StoredPanels {
  readonly v: 1;
  readonly sides: Record<Side, { panels: string[]; width: number }[]>;
  readonly floats: { id: string; rect: Rect; pinned: boolean }[];
  readonly folded: string[];
  readonly kept: string[];
  readonly closed: string[];
  readonly clock: Record<string, Clock>;
}

export type PanelsRead = { readonly ok: true; readonly state: PanelsState; readonly dropped: readonly string[] } | { readonly ok: false; readonly error: string };

export function storePanels(state: PanelsState): StoredPanels {
  const sides = Object.fromEntries(SIDES.map((s) => [s, state.sides[s].map((c) => ({ panels: [...c.panels], width: c.width }))])) as StoredPanels["sides"];
  return {
    v: 1,
    sides,
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
  extra(data, ["v", "sides", "floats", "folded", "kept", "closed", "clock"], "");
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
      extra(c, ["panels", "width"], "column.");
      const panels = (c.panels as unknown[]).map(take).filter((x): x is string => x !== null);
      if (panels.length === 0) continue;
      const ds = defs ? panels.map((id) => defOf(defs, id)!) : [];
      const lo = Math.max(0, ...ds.map((d) => d.width.min));
      const hi = Math.max(lo, Math.min(...ds.map((d) => d.width.max)));
      const natural = ds.length ? Math.max(...ds.map((d) => d.width.natural)) : 0;
      const width = finite(c.width) ? c.width : natural;
      sides[side].push({ panels, width: defs ? Math.min(Math.max(width, lo), hi) : Math.max(0, width) });
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
  return { ok: true, state: { sides, floats, folded: placed("folded"), kept, closed: placed("closed"), clock }, dropped };
}
