/** Sample items for the stack tests: panels (open, header, rail, menu) and groups (row, stacked, icons, menu). */
import type { StackForm, StackInput, StackItem } from "../src/stack";

const form = (kind: StackForm["kind"], min: number, natural: number, cross: number, extra: { grows?: boolean; setsCross?: boolean; crossMin?: number } = {}): StackForm => ({
  kind,
  main: { min, natural, ...(extra.grows ? { grows: true } : {}) },
  cross: { natural: cross, ...(extra.crossMin !== undefined ? { min: extra.crossMin } : {}) },
  ...(extra.setsCross !== undefined ? { setsCross: extra.setsCross } : {}),
});

/** A panel: open (min 90, natural `natural`, grows, `wide` across), a 28 header (fits a column 100 wide), a 24 rail icon, the menu. */
export const panel = (id: string, used: number, natural = 160, kept = false, wide = 240): StackItem => ({
  id,
  used,
  kept,
  forms: [form("open", 90, natural, wide, { grows: true }), form("header", 28, 28, wide, { crossMin: Math.min(wide, 100) }), form("rail", 24, 24, 30), form("menu", 0, 0, 0)],
});

/** A group in a column: words in a block (never sets the cross size), stacked words, icons, the menu. */
export const group = (id: string, used: number, kept = false): StackItem => ({
  id,
  used,
  kept,
  forms: [form("row", 96, 96, 180), form("stacked", 78, 78, 84), form("icons", 72, 72, 28), form("menu", 0, 0, 0)],
});

/** The same group laid along a row (a bar): the sizes swap. */
export const barGroup = (id: string, used: number, kept = false): StackItem => ({
  id,
  used,
  kept,
  forms: [form("row", 200, 220, 26), form("stacked", 110, 120, 44), form("icons", 84, 84, 28), form("menu", 0, 0, 0)],
});

export const limits = { min: 120, max: 360, rail: 30 };

export const stack = (items: readonly StackItem[], length: number, axis: StackInput["axis"] = "column"): StackInput => ({ axis, length, cross: limits, items });

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

/** A mix of panels and groups in a random order, with random use ages and kept flags. */
export function mix(rand: () => number, n: number): StackItem[] {
  return Array.from({ length: n }, (_, i) => {
    const used = Math.floor(rand() * 6);
    const kept = rand() < 0.25;
    if (rand() < 0.55) {
      const p = panel(`p${i}`, used, 100 + Math.floor(rand() * 120), kept);
      // Some are folded by hand: they start at their header.
      return rand() < 0.15 ? { ...p, from: 1 } : p;
    }
    return group(`g${i}`, used, kept);
  });
}
