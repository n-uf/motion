/**
 * The windows the guide-continuity sweeps lift a toolbar in: the libraries lab's document window and its preset layouts
 * (`fixtures/lab-windows.json`), the library windows of the rail-entry tests, the corner fixtures, and windows captured
 * from two host kits at a toolbar's lift (`fixtures/kit-windows-lift.json`), with the drag's regions for each.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { type Point } from "@n-uf/placement";
import { dockDrag, lanes, solve, type DockDrag, type DockLaneOptions, type DockRegions, type DockState } from "../src";
import { heldLanes } from "./held-lanes";
import { libraryState, realState } from "./rail-entry-windows";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): unknown => JSON.parse(readFileSync(join(here, "fixtures", name), "utf8"));

/**
 * A window as the two capture fixtures keep it: under `scene`, with the rects it keeps clear of under `chrome` (the
 * captures predate this package's names), read as a dock state.
 */
const captured = (w: { readonly scene: DockState & { readonly chrome?: DockState["keepClear"] } }): DockState => {
  const { chrome, ...rest } = w.scene;
  return chrome === undefined ? rest : { ...rest, keepClear: chrome };
};

export interface Window {
  readonly name: string;
  readonly state: DockState;
  readonly dragged: string;
  readonly options: DockLaneOptions;
}

const GROUPS = ["tools", "zoom", "views", "review"];

/** Every window swept, each with the toolbar it lifts. */
export function windows(): Window[] {
  const out: Window[] = [];
  const kit = fixture("kit-windows-lift.json") as { windows: { name: string; dragged: string; scene: DockState; options: DockLaneOptions & { previous?: unknown } }[] };
  for (const w of kit.windows) {
    // The lab's capture runs pitched stretches; guide continuity is stated for the default, free stretches (one sliding spot per empty lane).
    const { previous: _p, stretchPositions: _s, pitch: _pitch, snapDistance: _d, ...rest } = w.options as DockLaneOptions & { pitch?: number };
    out.push({ name: `kit: ${w.name}`, state: captured(w), dragged: w.dragged, options: { ...rest, emptyLanes: "real" } });
  }
  const lab = fixture("lab-windows.json") as { windows: { name: string; scene: DockState }[] };
  for (const w of lab.windows) {
    const state = captured(w);
    for (const g of GROUPS) if (state.items[g] && !state.items[g]!.fixed) out.push({ name: `lab: ${w.name}, ${g}`, state, dragged: g, options: { endReach: 8, emptyLanes: "real" } });
  }
  out.push({ name: "library window, 30 px rails", state: libraryState(30), dragged: "tools", options: { emptyLanes: "real" } });
  out.push({ name: "library window, 21 px rails", state: libraryState(21), dragged: "zoom", options: { emptyLanes: "real" } });
  out.push({ name: "real window, empty side rails", state: realState(), dragged: "panels", options: { emptyLanes: "real" } });
  for (const f of ["empty-corners.json", "columns-corner.json"]) {
    const s = fixture(f) as DockState;
    const held = Object.keys(s.items).filter((k) => s.items[k]!.kind === "group" && !s.items[k]!.fixed);
    for (const g of held.slice(-2)) out.push({ name: `${f}, ${g}`, state: s, dragged: g, options: { endReach: 24, emptyLanes: "real" } });
  }
  return out;
}

/** One drag of a window: its regions, the regions per spot, the grab and the item's size. */
export interface Drag {
  readonly w: Window;
  /** The drag: its regions as seen and the one layout of each state. */
  readonly drag: DockDrag;
  readonly regions: DockRegions;
  readonly regionsFor: (spot: string) => DockRegions;
  readonly grab: Point;
  readonly size: { readonly width: number; readonly height: number };
  readonly press: Point;
  readonly home?: { readonly lane: string; readonly spot: string };
  readonly options: DockLaneOptions;
}

export function dragOf(w: Window): Drag | null {
  const previous = solve(w.state);
  const own = previous.items[w.dragged];
  if (!own || own.inMenu || own.rect.width <= 0 || own.rect.height <= 0) return null;
  const given = (w.options as { grab?: Point }).grab;
  const grab = given && given.x < own.rect.width && given.y < own.rect.height ? given : { x: own.rect.width / 2, y: own.rect.height / 2 };
  const options: DockLaneOptions = { ...w.options, previous, grab };
  const regions = lanes(w.state, w.dragged, options);
  // A held frame's lanes, through the one-layout API (`after({ spot })`'s marks, `spotsOf`'s stretches).
  const regionsFor = (spot: string): DockRegions => heldLanes(w.state, w.dragged, options, spot);
  const home = regions.lanes.flatMap((l) => l.spots.filter((x) => x.home).map((x) => ({ lane: l.id, spot: x.id })))[0];
  return { w, drag: dockDrag(w.state, w.dragged, options), regions, regionsFor, grab, size: { width: own.rect.width, height: own.rect.height }, press: { x: own.rect.x + grab.x, y: own.rect.y + grab.y }, ...(home ? { home } : {}), options };
}
