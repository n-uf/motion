/**
 * The drag feel: per item kind, how a drop into a side's rail works. The geometry goes into the DockState as its rail drop
 * policy (`DockState.railDrop`, from `@n-uf/docking`); the time and the keys go into the drag intent's tuning
 * (`DragTuning`, from `@n-uf/motion/drag`). Panels start with rail docking on; toolbars start at today's values (no rail
 * strip, no dwell, no keys), and tuning one never changes the other. Only the published rules read it (the cases that
 * check the libraries' rail strips set their own); the window's own rules have no panel strip.
 */
import type { DragTuning, ModifierKey } from "@n-uf/motion/drag";
import { DEFAULT_RAIL_MAGNET, type RailDropPolicy, type RailVisibility, type DockState } from "@n-uf/docking";

/** One kind's feel. `railStripWidth` null: the rail's drawn width. */
export interface KindFeel {
  readonly railStripWidth: number | null;
  readonly railVisibility: RailVisibility;
  readonly magnet: number;
  readonly floatNearEdge: boolean;
  readonly armAfter: number;
  readonly modifiers: { readonly on: boolean; readonly floatKey: ModifierKey; readonly armKey: ModifierKey };
}
type FeelKind = "panel" | "group";
export type DragFeel = Readonly<Record<FeelKind, KindFeel>>;

/** A key's name as the page says it: "mod" is ⌘ on macOS and Ctrl elsewhere, either one counts. */
const KEY_NAMES: Readonly<Record<ModifierKey, string>> = { shift: "Shift", alt: "Alt", ctrl: "Control", meta: "Meta", mod: "⌘/Ctrl" };
export const keyName = (k: ModifierKey): string => KEY_NAMES[k];

/**
 * Panels: a strip as wide as the rail, shown while dragging, a 6 px magnet, a 200 ms dwell, Shift floats, ⌘/Ctrl rails
 * (not Alt: Alt unfreezes a frozen layout, and a key has one meaning). A feel that says "alt" stays valid.
 */
const PANEL_FEEL: KindFeel = { railStripWidth: null, railVisibility: "whileDragging", magnet: DEFAULT_RAIL_MAGNET, floatNearEdge: true, armAfter: 200, modifiers: { on: true, floatKey: "shift", armKey: "mod" } };
/** Toolbars: today's values: no rail strip (their icon rails keep their own targets), no dwell, no keys. */
const GROUP_FEEL: KindFeel = { railStripWidth: 0, railVisibility: "never", magnet: 0, floatNearEdge: true, armAfter: 0, modifiers: { on: false, floatKey: "shift", armKey: "mod" } };
export const DEFAULT_FEEL: DragFeel = { panel: PANEL_FEEL, group: GROUP_FEEL };

/** Whether a kind's feel docks into the side's rail at all. */
const docksInRail = (f: KindFeel): boolean => f.railVisibility !== "never" && f.railStripWidth !== 0;

/** The state with the feel's rail drop policies: one per kind that docks into the rail; none for the others. */
export function withFeel(s: DockState, feel: DragFeel): DockState {
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
  return { armAfter: f.armAfter, modifiers: f.modifiers };
};

