/**
 * The windows the one-layout sweep lifts a toolbar in: every guide-continuity window (`./lift-windows`) and the windows
 * captured at a lift in `fixtures/one-layout-windows.json` (the libraries lab's document window and two host kits'
 * layouts, five and six), each with the host's own `previous` layout and drag options.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { solve, type DockLaneOptions, type DockLayout, type DockState } from "../src";
import { windows as liftWindows, type Window } from "./lift-windows";

const here = dirname(fileURLToPath(import.meta.url));

/** A window of the sweep: the guide-continuity window, and the layout the host held before the lift. */
export interface SweepWindow extends Window {
  readonly previous: DockLayout;
}

/** Every window the sweep lifts in, each with its `previous` (solved without one where the capture keeps none). */
export function sweepWindows(): SweepWindow[] {
  const out: SweepWindow[] = liftWindows().map((w) => ({ ...w, previous: solve(w.state) }));
  const captured = JSON.parse(readFileSync(join(here, "fixtures", "one-layout-windows.json"), "utf8")) as {
    windows: { name: string; dragged: string; state: DockState; options: DockLaneOptions; previous: DockLayout }[];
  };
  for (const w of captured.windows) out.push({ name: `captured ${w.name}`, state: w.state, dragged: w.dragged, options: w.options, previous: w.previous });
  return [...out, ...panelWindows(), ...twoColumnWindows()];
}

/**
 * Two columns on one side (no `sideColumns: "one"`): `fixtures/columns-corner.json` with an empty second left column, at
 * ring 0 (outside the first) and at ring 2 (inside it), each panel dragged.
 */
function twoColumnWindows(): SweepWindow[] {
  const { sideColumns: _one, ...base } = JSON.parse(readFileSync(join(here, "fixtures", "columns-corner.json"), "utf8")) as DockState;
  const out: SweepWindow[] = [];
  const add = (name: string, s: DockState): void => {
    for (const p of Object.keys(s.items).filter((k) => s.items[k]!.kind === "panel" && !s.items[k]!.fixed))
      out.push({ name: `${name}, panel ${p}`, state: s, dragged: p, options: { endReach: 24, emptyLanes: "real" }, previous: solve(s) });
  };
  /** `s` with a second column beside `id` at `ring`, holding `items` (taken off the other columns). */
  const second = (s: DockState, id: string, ring: number, items: readonly string[] = []): DockState => {
    const first = s.edges.find((e) => e.id === id)!;
    const rest = s.edges.filter((e) => e !== first).map((e) => (e.column ? { ...e, items: e.items.filter((i) => !items.includes(i)) } : e));
    return { ...s, edges: [...rest, { ...first, id: `${id}-2`, ring, items: [...items] }, { ...first, items: first.items.filter((i) => !items.includes(i)) }] };
  };
  add("columns per side free", base);
  add("columns per side free, 640 px wide", { ...base, stage: { ...base.stage, width: 640 } });
  for (const ring of [0, 2]) {
    add(`two left columns, ring ${ring} empty`, second(base, "col-left", ring));
    add(`two right columns, ring ${ring} empty`, second(base, "col-right", ring));
    add(`two left columns, ring ${ring} holding p2`, second(base, "col-left", ring, ["p2"]));
    add(`two right columns, ring ${ring} holding p1`, second(base, "col-right", ring, ["p1"]));
  }
  add("two columns a side, the second ones empty", second(second(base, "col-left", 0), "col-right", 0));
  add("two left columns, the right one emptied", second(base, "col-left", 2, ["p3"]));
  return out;
}

/** Panel drags: each panel of `fixtures/columns-corner.json` held on the spots of both columns (a column is no drawn bar). */
function panelWindows(): SweepWindow[] {
  const s = JSON.parse(readFileSync(join(here, "fixtures", "columns-corner.json"), "utf8")) as DockState;
  const panels = Object.keys(s.items).filter((k) => s.items[k]!.kind === "panel" && !s.items[k]!.fixed);
  return panels.map((p) => ({ name: `columns-corner.json, panel ${p}`, state: s, dragged: p, options: { endReach: 24, emptyLanes: "real" }, previous: solve(s) }));
}
