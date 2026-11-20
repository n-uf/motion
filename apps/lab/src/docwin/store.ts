/**
 * The document window's stored form: the DockState's own `storeDockState` (edges, floats, every item's state) plus the
 * window's size, which the DockState doesn't store. Reading goes through `readDockState(data, base)` over the default window at
 * the stored size, and never throws: what the library drops is listed.
 */
import { readDockState, storeDockState, type DockState, type StoredDockState } from "@n-uf/docking";
import { DEFAULT_SIZE, defaultState } from "./model";

export interface StoredDocwin {
  readonly v: 1;
  readonly size: { width: number; height: number };
  readonly state: StoredDockState;
}

export function storeDocwin(s: DockState): StoredDocwin {
  return { v: 1, size: { width: s.stage.width, height: s.stage.height }, state: storeDockState(s) };
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const num = (x: unknown, lo: number, hi: number): number | null => (typeof x === "number" && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : null);

/**
 * The state the stored form describes, over the default window at the stored size (within the drawer's limits); never
 * throws. With `base` (a state loaded from elsewhere, a conformance row's), over that state at the stored size.
 */
export function readDocwin(data: unknown, base?: DockState): { state: DockState; dropped: string[] } {
  try {
    if (!isObj(data) || data.v !== 1) return { state: base ?? defaultState(), dropped: ["not a stored document window"] };
    const size = isObj(data.size) ? data.size : {};
    const width = num(size.width, base ? 1 : 560, base ? 10_000 : 2000) ?? DEFAULT_SIZE.width;
    const height = num(size.height, base ? 1 : 320, base ? 10_000 : 1400) ?? DEFAULT_SIZE.height;
    const r = readDockState(data.state, base ? { ...base, stage: { x: 0, y: 0, width, height } } : defaultState({ width, height }));
    return { state: r.state, dropped: [...(r.error ? [r.error] : []), ...r.dropped] };
  } catch (e) {
    return { state: defaultState(), dropped: [`unreadable: ${e instanceof Error ? e.message : typeof e}`] };
  }
}
