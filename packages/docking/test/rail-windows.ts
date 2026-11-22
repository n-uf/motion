/** Kit-shaped windows with a declared side rail, shared by the rail tests and the one-layout sweep. */
import type { DockItem, DockState } from "../src";

export interface RailWindowOptions {
  readonly rails: boolean;
  readonly folded?: boolean;
  readonly one?: boolean;
  readonly right?: string[];
  readonly outer?: string[];
  readonly width?: number;
  readonly hand?: string[];
}

/** Four panels in a kit-shaped window: Pages and Notes on the left, `right` folded on the right (a rail's tiles). */
export function railWindow(o: RailWindowOptions): DockState {
  const right = o.right ?? ["findings", "annotations"];
  // A second folded column, outside the first on the same side: its tiles follow the first column's in the one rail.
  const outer = o.outer ?? [];
  const card = { min: 200, max: 560, natural: 280 };
  const items: Record<string, DockItem> = {};
  for (const [i, id] of ["pages", "notes", ...right, ...outer].entries())
    items[id] = {
      id,
      kind: "panel",
      used: i + 1,
      ...((o.hand ?? [...right, ...outer]).includes(id) ? { from: 2 } : {}),
      forms: {
        column: [
          { kind: "open", main: { min: 120, natural: 300, grows: true }, cross: { natural: card.natural, min: card.min } },
          { kind: "header", main: { min: 34, natural: 34 }, cross: { natural: card.natural, min: 32 } },
          { kind: "rail", main: { min: 36, natural: 36 }, cross: { natural: 32 } },
        ],
      },
      floatSizes: { column: { width: card.natural, height: 440 } },
    } as DockItem;
  const template = { accepts: ["panel"], cross: { min: card.min, max: card.max, rail: 32 }, gap: 0 };
  return {
    stage: { x: 0, y: 0, width: o.width ?? 1440, height: 900 },
    edges: [
      { id: "left-0", side: "left", ring: 0, column: true, items: ["pages", "notes"], ...template },
      { id: "right-0", side: "right", ring: 0, column: true, items: right, ...template },
      ...(outer.length ? [{ id: "right-1", side: "right" as const, ring: 1, column: true, items: outer, ...template }] : []),
    ],
    items,
    floats: [],
    floatKinds: ["panel"],
    columns: { left: template, right: template },
    ...(o.rails ? { rails: { left: { width: 32, accepts: ["panel"] }, right: { width: 32, accepts: ["panel"] } } } : {}),
    contentMin: { width: 320, height: 240 },
    ...(o.one ? { sideColumns: "one" as const } : {}),
    ...(o.folded ? { foldedColumnDrop: "end" as const } : {}),
    gutter: 0,
  } as DockState;
}

/**
 * `railWindow` with a tray of toolbars (the groups `tray`, in the right column's end zone) and the panels' use ages
 * arranged so the right column is the least used: in a narrow window it folds into the rail by width, its toolbars tiles of
 * it too, and the left column stays open.
 */
export function railTrayWindow(o: RailWindowOptions, tray: readonly string[] = ["tools"]): DockState {
  const base = railWindow(o);
  const group = (id: string, used: number): DockItem => ({ id, kind: "group", used, forms: { column: [{ kind: "icons", main: { min: 84, natural: 84 }, cross: { natural: 28 } }] } }) as DockItem;
  const right = o.right ?? ["findings", "annotations"];
  const items = { ...base.items };
  for (const id of ["pages", "notes"]) items[id] = { ...items[id]!, used: 47 + (id === "notes" ? 1 : 0) };
  for (const id of right) items[id] = { ...items[id]!, used: 22 };
  tray.forEach((id, i) => (items[id] = group(id, 43 + i)));
  return {
    ...base,
    items,
    edges: base.edges.map((e) => (e.id === "right-0" ? { ...e, accepts: ["panel", "group"], zoneAccepts: { start: ["panel"], end: ["group"] }, items: [...e.items, ...tray] } : e)),
    floatKinds: ["panel", "group"],
    // The right side's columns and rail take the toolbars too, so one held has its column's gaps like a panel.
    columns: { ...base.columns, right: { ...base.columns!.right!, accepts: ["panel", "group"], zoneAccepts: { start: ["panel", "group"], end: ["group"] } } },
    ...(base.rails ? { rails: { ...base.rails, right: { ...base.rails.right!, accepts: ["panel", "group"] } } } : {}),
  };
}
