/**
 * The drag feel: per item kind, how a drop into a side's rail works. The geometry goes into the Scene as its rail drop
 * policy (`Scene.railDrop`, from `@n-uf/placement/scene`); the time and the keys go into the drag intent's tuning
 * (`DragTuning`, from `@n-uf/motion/drag`). Panels start with rail docking on; toolbars start at today's values (no rail
 * strip, no dwell, no keys), and tuning one never changes the other. Stored per viewer.
 */
import type { DragTuning, ModifierKey } from "@n-uf/motion/drag";
import { DEFAULT_RAIL_MAGNET, RAIL_VISIBILITIES, type RailDropPolicy, type RailVisibility, type Scene } from "@n-uf/placement/scene";

/** One kind's feel. `railStripWidth` null: the rail's drawn width. */
export interface KindFeel {
  readonly railStripWidth: number | null;
  readonly railVisibility: RailVisibility;
  readonly magnet: number;
  readonly floatNearEdge: boolean;
  readonly railArmDwellMs: number;
  readonly modifiers: { readonly on: boolean; readonly floatKey: ModifierKey; readonly railKey: ModifierKey };
}
export type FeelKind = "panel" | "group";
export type DragFeel = Readonly<Record<FeelKind, KindFeel>>;

export const MODIFIER_KEYS: readonly ModifierKey[] = ["Shift", "Mod", "Alt", "Control", "Meta"];
/** A key's name as the page says it: "Mod" is ⌘ on macOS and Ctrl elsewhere, either one counts. */
export const keyName = (k: ModifierKey): string => (k === "Mod" ? "⌘/Ctrl" : k);

/**
 * Panels: a strip as wide as the rail, shown while dragging, a 6 px magnet, a 200 ms dwell, Shift floats, ⌘/Ctrl rails
 * (not Alt: Alt unfreezes a frozen layout, and a key has one meaning). A stored feel that says "Alt" stays valid.
 */
const PANEL_FEEL: KindFeel = { railStripWidth: null, railVisibility: "whileDragging", magnet: DEFAULT_RAIL_MAGNET, floatNearEdge: true, railArmDwellMs: 200, modifiers: { on: true, floatKey: "Shift", railKey: "Mod" } };
/** Toolbars: today's values: no rail strip (their icon rails keep their own targets), no dwell, no keys. */
const GROUP_FEEL: KindFeel = { railStripWidth: 0, railVisibility: "never", magnet: 0, floatNearEdge: true, railArmDwellMs: 0, modifiers: { on: false, floatKey: "Shift", railKey: "Mod" } };
export const DEFAULT_FEEL: DragFeel = { panel: PANEL_FEEL, group: GROUP_FEEL };

/** Whether a kind's feel docks into the side's rail at all. */
const docksInRail = (f: KindFeel): boolean => f.railVisibility !== "never" && f.railStripWidth !== 0;

/** The scene with the feel's rail drop policies: one per kind that docks into the rail; none for the others. */
export function withFeel(s: Scene, feel: DragFeel): Scene {
  const railDrop: Record<string, RailDropPolicy> = {};
  for (const kind of ["panel", "group"] as const) {
    const f = feel[kind];
    if (!docksInRail(f)) continue;
    railDrop[kind] = { ...(f.railStripWidth !== null ? { railStripWidth: f.railStripWidth } : {}), railVisibility: f.railVisibility, magnet: f.magnet, floatNearEdge: f.floatNearEdge };
  }
  const { railDrop: _was, ...rest } = s;
  return Object.keys(railDrop).length ? { ...rest, railDrop } : rest;
}

/** The drag intent's tuning for a kind. */
export const tuningOf = (feel: DragFeel, kind: string): Partial<DragTuning> => {
  const f = kind === "panel" ? feel.panel : feel.group;
  return { railArmDwellMs: f.railArmDwellMs, modifiers: f.modifiers };
};

const num = (x: unknown, lo: number, hi: number, fallback: number): number => (typeof x === "number" && Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : fallback);
const key = (x: unknown, fallback: ModifierKey): ModifierKey => (MODIFIER_KEYS.includes(x as ModifierKey) ? (x as ModifierKey) : fallback);

/** A kind's feel read back from stored data, every field checked; what doesn't read falls back to `base`. */
function readKind(data: unknown, base: KindFeel): KindFeel {
  if (typeof data !== "object" || data === null) return base;
  const d = data as Record<string, unknown>;
  const m = (typeof d.modifiers === "object" && d.modifiers !== null ? d.modifiers : {}) as Record<string, unknown>;
  return {
    railStripWidth: d.railStripWidth === null ? null : num(d.railStripWidth, 0, 96, base.railStripWidth ?? 0),
    railVisibility: RAIL_VISIBILITIES.includes(d.railVisibility as RailVisibility) ? (d.railVisibility as RailVisibility) : base.railVisibility,
    magnet: num(d.magnet, 0, 40, base.magnet),
    floatNearEdge: typeof d.floatNearEdge === "boolean" ? d.floatNearEdge : base.floatNearEdge,
    railArmDwellMs: num(d.railArmDwellMs, 0, 1000, base.railArmDwellMs),
    modifiers: { on: typeof m.on === "boolean" ? m.on : base.modifiers.on, floatKey: key(m.floatKey, base.modifiers.floatKey), railKey: key(m.railKey, base.modifiers.railKey) },
  };
}

/** The stored feel, or the defaults; never throws. */
export function readFeel(storageKey: string): DragFeel {
  try {
    const raw = localStorage.getItem(storageKey);
    const data = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    return { panel: readKind(data.panel, PANEL_FEEL), group: readKind(data.group, GROUP_FEEL) };
  } catch {
    return DEFAULT_FEEL;
  }
}

export function storeFeel(storageKey: string, feel: DragFeel): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(feel));
  } catch {
    // No storage: the feel lasts until a reload.
  }
}
