/**
 * @n-uf/placement/desk: desk presets as data on `@n-uf/placement/panels`. A preset is options for the panels engine
 * and a start state; it carries no titles, no words and no toolbar wiring (the app names presets and wires its
 * toolbar). It imports only the panels entry's public index, so an app that imports only `./panels` loads none of it.
 *
 * - `docks`: one stack column per side; sections at their natural heights when the defs give `height`; short of width a
 *   column folds to its side's rail. No floats.
 * - `dockTear`: as docks, and panels may float (tear-off and dock-back); one panel floats in the start state.
 * - `navigator`: a tabbed column on the left, a stack column on the right. No floats.
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

export type PresetId = "docks" | "dockTear" | "navigator";

/** Which panels start on which side (ids in order); the others are placed by the preset. */
export interface DeskHint {
  readonly left?: readonly string[];
  readonly right?: readonly string[];
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

const docksStart = (defs: readonly PanelDef[], hint?: DeskHint): PanelsState => {
  const { left, right } = split(defs, hint);
  return createPanels(defs, { left: columns(left), right: columns(right) });
};

const docks: DeskPreset = { id: "docks", options: { fold: "rail" }, floats: false, start: docksStart };

const dockTear: DeskPreset = {
  id: "dockTear",
  options: { fold: "rail", floats: "clamp" },
  floats: true,
  // As docks, with the right side's last panel that may float torn off, next to the left column.
  start(defs, hint) {
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
  },
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

export const PRESETS: Readonly<Record<PresetId, DeskPreset>> = { docks, dockTear, navigator };

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
