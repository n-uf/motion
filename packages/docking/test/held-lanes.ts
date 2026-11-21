/**
 * A drag's lanes with one spot held, as a held frame draws them: every lane's marks from `after({ spot })` (the one
 * layout of that state; a sliding spot at its listed landing), the held lane's stretches from `spotsOf`, the rest of the
 * regions as seen. What the tests of a held frame read, through the one-layout API.
 */
import { dockDrag, type DockLaneOptions, type DockRegions, type DockState } from "../src";

export function heldLanes(state: DockState, dragged: string, options: Omit<DockLaneOptions, "spot">, spot: string): DockRegions {
  const d = dockDrag(state, dragged, options);
  const lane = d.regions.lanes.find((l) => l.spots.some((s) => s.id === spot));
  const sp = lane?.spots.find((s) => s.id === spot);
  if (!lane || !sp) return d.regions;
  // A sliding spot held at its listed landing: the pointer there, holding the item where the press did.
  const g = options.grab ?? { x: sp.landing.width / 2, y: sp.landing.height / 2 };
  const a = d.after({ kind: "spot", spot, point: { x: sp.landing.x + g.x, y: sp.landing.y + g.y } });
  const spots = d.spotsOf(spot);
  return { ...d.regions, lanes: d.regions.lanes.map((l) => ({ ...l, ...(l.id === lane.id && spots ? { spots } : {}), marks: a.marks.filter((m) => m.lane === l.id).map(({ lane: _lane, ...m }) => m) })) };
}
