/**
 * @n-uf/placement/desk: desk presets as data on `@n-uf/placement/panels`. A preset is options for the panels engine
 * and a start state; it carries no titles, no words and no toolbar wiring (the app names presets and wires its
 * toolbar). It imports only the panels entry's public index, so an app that imports only `./panels` loads none of it.
 *
 * - `docks`: one stack column per side and a bottom band between them (reserved: it shortens the pages); sections at
 *   their natural heights when the defs give `height`; short of width a column folds to its side's rail, short of
 *   height the band folds to a bar. No floats.
 * - `docksFull`: as docks, with the bottom band full width (the columns stand on it).
 * - `dockTear`: as docks, and panels may float (tear-off and dock-back); one panel floats in the start state.
 * - `navigator`: a tabbed column on the left, a stack column on the right. No band, no floats.
 *
 * The bottom band starts with the hint's `bottom` panels, else the last def whose `sides` names "bottom" (a def
 * without `sides` may be dropped there, but doesn't start there).
 */
import {
  createPanels,
  floatSize,
  layoutPanels,
  panelDrop,
  panelTargets,
  showTabs,
  type PanelDef,
  type PanelDrop,
  type PanelPlace,
  type PanelTarget,
  type PanelTargetInput,
  type PanelsLayout,
  type PanelsOptions,
  type PanelsState,
} from "../panels";

export type PresetId = "docks" | "docksFull" | "dockTear" | "navigator";

/** Which panels start on which side (ids in order), and in the bottom band (a preset with one); the others are placed by the preset. */
export interface DeskHint {
  readonly left?: readonly string[];
  readonly right?: readonly string[];
  readonly bottom?: readonly string[];
}

export interface DeskPreset {
  readonly id: PresetId;
  /** The panels options the preset lays out with (the caller's own options go over them). */
  readonly options: Partial<PanelsOptions>;
  /** Whether its panels may float: when not, `presetTargets` offers no float target. */
  readonly floats: boolean;
  /** Its start state for these panels. */
  start(defs: readonly PanelDef[], hint?: DeskHint): PanelsState;
}

type Stage = Parameters<typeof layoutPanels>[2];
type Point = Parameters<typeof panelDrop>[2];

/**
 * Split the panels between the sides: the hint's first, then the rest in order, each to a side it may dock on, the
 * left side taking the first half of them.
 */
function split(defs: readonly PanelDef[], hint: DeskHint = {}): { left: string[]; right: string[] } {
  const known = new Set(defs.map((d) => d.id));
  const left = (hint.left ?? []).filter((id) => known.has(id));
  const right = (hint.right ?? []).filter((id) => known.has(id) && !left.includes(id));
  const rest = defs.filter((d) => !left.includes(d.id) && !right.includes(d.id));
  const half = Math.ceil(defs.length / 2);
  for (const d of rest) {
    const mayL = !d.sides || d.sides.includes("left");
    const mayR = !d.sides || d.sides.includes("right");
    if (mayL && (left.length < half || !mayR)) left.push(d.id);
    else if (mayR) right.push(d.id);
    else left.push(d.id);
  }
  return { left, right };
}

const columns = (ids: readonly string[]): string[][] => (ids.length ? [[...ids]] : []);

/** The bottom band's start: the hint's, else the last def whose `sides` names "bottom". */
function bottomOf(defs: readonly PanelDef[], hint: DeskHint = {}): string[] {
  const known = new Set(defs.map((d) => d.id));
  if (hint.bottom) return hint.bottom.filter((id) => known.has(id));
  const last = [...defs].reverse().find((d) => d.sides?.includes("bottom"));
  return last ? [last.id] : [];
}

/** The defs and hint with the band's panels taken out, so the sides split the rest. */
const sidesOnly = (defs: readonly PanelDef[], hint: DeskHint | undefined, band: readonly string[]): [PanelDef[], DeskHint | undefined] => [
  defs.filter((d) => !band.includes(d.id)),
  hint && { ...hint, left: hint.left?.filter((id) => !band.includes(id)), right: hint.right?.filter((id) => !band.includes(id)) },
];

const banded = (start: (defs: readonly PanelDef[], hint?: DeskHint) => PanelsState) => (defs: readonly PanelDef[], hint?: DeskHint): PanelsState => {
  const bottom = bottomOf(defs, hint);
  const [rest, h] = sidesOnly(defs, hint, bottom);
  const s = start(rest, h);
  return bottom.length ? createPanels(defs, { ...startOf(s), bottom }) : s;
};

/** A plain start back from a state (columns, floats and lists; the clock is rebuilt in listing order). */
function startOf(s: PanelsState): Parameters<typeof createPanels>[1] {
  return {
    left: s.sides.left.map((c) => c.panels),
    right: s.sides.right.map((c) => c.panels),
    floats: s.floats.map((f) => ({ id: f.id, x: f.rect.x, y: f.rect.y, width: f.rect.width, height: f.rect.height, ...(f.pinned ? { pinned: true } : {}) })),
    folded: s.folded,
    kept: s.kept,
    closed: s.closed,
  };
}

const docksStart = (defs: readonly PanelDef[], hint?: DeskHint): PanelsState => {
  const { left, right } = split(defs, hint);
  return createPanels(defs, { left: columns(left), right: columns(right) });
};

const BOTTOM = { mode: "reserved", span: "between" } as const;

const docks: DeskPreset = { id: "docks", options: { fold: "rail", bands: { bottom: BOTTOM } }, floats: false, start: banded(docksStart) };

const docksFull: DeskPreset = { id: "docksFull", options: { fold: "rail", bands: { bottom: { ...BOTTOM, span: "full" } } }, floats: false, start: banded(docksStart) };

const dockTear: DeskPreset = {
  id: "dockTear",
  options: { fold: "rail", floats: "clamp", bands: { bottom: BOTTOM } },
  floats: true,
  // As docks, with the right side's last panel that may float torn off, next to the left column.
  start: banded((defs, hint) => {
    const { left, right } = split(defs, hint);
    const can = (id: string): boolean => defs.find((d) => d.id === id)?.floats !== false;
    const torn = [...right].reverse().find(can) ?? [...left].reverse().find(can);
    const keep = (ids: readonly string[]): string[] => ids.filter((id) => id !== torn);
    const leftW = Math.max(0, ...keep(left).map((id) => defs.find((d) => d.id === id)!.width.natural));
    const size = floatSize(defs.find((d) => d.id === torn));
    return createPanels(defs, {
      left: columns(keep(left)),
      right: columns(keep(right)),
      ...(torn ? { floats: [{ id: torn, x: leftW + 24, y: 24, width: size.natural.width, height: size.natural.height }] } : {}),
    });
  }),
};

const navigator: DeskPreset = {
  id: "navigator",
  options: { fold: "rail" },
  floats: false,
  start(defs, hint) {
    const s = docksStart(defs, hint);
    return s.sides.left.length ? showTabs(s, "left", 0, true) : s;
  },
};

export const PRESETS: Readonly<Record<PresetId, DeskPreset>> = { docks, docksFull, dockTear, navigator };

/** `layoutPanels` with the preset's options under the caller's. */
export function presetLayout(preset: DeskPreset, defs: readonly PanelDef[], state: PanelsState, stage: Stage, options: Partial<PanelsOptions> = {}): PanelsLayout {
  return layoutPanels(defs, state, stage, { ...preset.options, ...options });
}

/** The target input with the preset's options under the caller's, and only the places the preset allows. */
export function presetInput(preset: DeskPreset, input: PanelTargetInput): PanelTargetInput {
  const allows = (id: string, place: PanelPlace): boolean => (place.kind !== "float" || preset.floats) && (input.allows?.(id, place) ?? true);
  return { ...input, options: { ...preset.options, ...input.options }, allows };
}

/** `panelTargets` with the preset's options under the caller's, and only the places the preset allows. */
export function presetTargets(preset: DeskPreset, input: PanelTargetInput): PanelTarget[] {
  return panelTargets(presetInput(preset, input));
}

/** `panelDrop` laid out with the preset's options (so the slot is where the preset lays the panel). */
export function presetDrop(preset: DeskPreset, input: PanelTargetInput, target: PanelTarget, point: Point, grab: Point): PanelDrop {
  return panelDrop(presetInput(preset, input), target, point, grab);
}
