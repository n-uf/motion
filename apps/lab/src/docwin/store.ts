/**
 * The document window's stored form: the Scene's own `storeScene` (edges, floats, every item's state) plus the
 * window's size, which the Scene doesn't store. Reading goes through `readScene(data, base)` over the default window at
 * the stored size, and never throws: what the library drops is listed.
 */
import { readScene, storeScene, type Scene, type StoredScene } from "@n-uf/placement/scene";
import { DEFAULT_SIZE, defaultScene } from "./model";

export interface StoredDocwin {
  readonly v: 1;
  readonly size: { width: number; height: number };
  readonly scene: StoredScene;
}

export function storeDocwin(s: Scene): StoredDocwin {
  return { v: 1, size: { width: s.stage.width, height: s.stage.height }, scene: storeScene(s) };
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const num = (x: unknown, lo: number, hi: number): number | null => (typeof x === "number" && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : null);

/**
 * The scene the stored form describes, over the default window at the stored size (within the drawer's limits); never
 * throws. With `base` (a scene loaded from elsewhere, a conformance row's), over that scene at the stored size.
 */
export function readDocwin(data: unknown, base?: Scene): { scene: Scene; dropped: string[] } {
  try {
    if (!isObj(data) || data.v !== 1) return { scene: base ?? defaultScene(), dropped: ["not a stored document window"] };
    const size = isObj(data.size) ? data.size : {};
    const width = num(size.width, base ? 1 : 560, base ? 10_000 : 2000) ?? DEFAULT_SIZE.width;
    const height = num(size.height, base ? 1 : 320, base ? 10_000 : 1400) ?? DEFAULT_SIZE.height;
    const r = readScene(data.scene, base ? { ...base, stage: { x: 0, y: 0, width, height } } : defaultScene({ width, height }));
    return { scene: r.scene, dropped: [...(r.error ? [r.error] : []), ...r.dropped] };
  } catch (e) {
    return { scene: defaultScene(), dropped: [`unreadable: ${e instanceof Error ? e.message : typeof e}`] };
  }
}
