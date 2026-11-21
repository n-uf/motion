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
  return out;
}
