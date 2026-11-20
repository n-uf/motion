/**
 * Two document windows of the same shape (a pages area and three side panels: pages, annotations, findings) and the
 * numbers each is pinned to. Window A has wide cards, a 12 px gap between columns and 12 px of stage padding on each
 * side; window B has narrower cards and is flush (no gap, no padding). A third spec is the bare arithmetic of A: no gap,
 * no padding, a 36 px rail.
 *
 * A panel's forms here are plain intent: a card (open: it grows and sets the column's width at its minimum), a bar (a
 * header 30 px long, taking the column's width) and a rail segment. `winState` builds the `DockState`: dynamic columns, a
 * rail on each side, `contentMin`, and the padding and gap as `inset` and `gutter`.
 *
 * A window row's stage (`CaseSettings.stage`, a `resize` to `point.x` by `point.y`, the state's own `stage`) is the
 * window's BODY: the content area inside any canvas padding. Window A's 12 px padding on each side lies inside it
 * (808 = 12 + 220 + 12 + 320 + 12 + 220 + 12), so a host whose own stage leaves its padding out sets its body to the row's
 * stage and needs no table of its own. A row's pointer `point`s are body px too.
 */
import type { StackForm } from "@n-uf/placement/stack";
import type { DockEdge, DockState, DockItem } from "../index";

export interface WinSpec {
  readonly card: { readonly min: number; readonly max: number };
  /** Space after each side edge and rail, toward the content. */
  readonly gap: number;
  /** Space kept clear at the stage's left and right edges. */
  readonly pad: number;
  readonly rail: number;
  readonly contentMin: { readonly width: number; readonly height: number };
  /** The folded bar's length. */
  readonly barMain: number;
}

/** Window A: wide cards, a 12 px gap and 12 px of padding each side; its stage is the window's body, padding inside. */
export const WINDOW_A: WinSpec = { card: { min: 220, max: 640 }, gap: 12, pad: 12, rail: 32, contentMin: { width: 320, height: 240 }, barMain: 30 };
/** Window B: narrower cards, flush (no gap, no padding); its stage is the window's body, as A's. */
export const WINDOW_B: WinSpec = { card: { min: 200, max: 560 }, gap: 0, pad: 0, rail: 32, contentMin: { width: 320, height: 240 }, barMain: 30 };
export const WINDOW_BARE: WinSpec = { ...WINDOW_A, gap: 0, pad: 0, rail: 36 };

export interface WinOptions {
  /** The stage's width (default 1120) and height (default 800). */
  readonly width?: number;
  readonly height?: number;
  /** The panels' ids per column, outer column first: `{ left: [["pages", "annotations"]], right: [["findings"]] }` (the default). */
  readonly columns?: { readonly left?: readonly (readonly string[])[]; readonly right?: readonly (readonly string[])[] };
  /** Ages (default pages 1, annotations 2, findings 3); a panel left out of every column isn't in the state. */
  readonly used?: Readonly<Record<string, number>>;
  /** First forms allowed: 1 folds a panel by hand. */
  readonly from?: Readonly<Record<string, number>>;
  readonly handFold?: "bar" | "ride";
  /** The user's column width, for every column (stored sizes). */
  readonly size?: number;
  /** Panels that float, with their rects. */
  readonly floats?: readonly { readonly id: string; readonly rect: { x: number; y: number; width: number; height: number } }[];
}

const DEFAULT_COLUMNS = { left: [["pages", "annotations"]], right: [["findings"]] } as const;
const DEFAULT_USED: Record<string, number> = { pages: 1, annotations: 2, findings: 3 };

/** A window: dynamic columns on both sides, a rail on each, `contentMin`, padding and gap. */
export function winState(spec: WinSpec, o: WinOptions = {}): DockState {
  const card: StackForm = { kind: "open", main: { min: 120, natural: 300, grows: true }, cross: { natural: spec.card.min, min: spec.card.min } };
  const bar: StackForm = { kind: "header", main: { min: spec.barMain, natural: spec.barMain }, cross: { natural: spec.card.min, min: 60 } };
  const rail: StackForm = { kind: "rail", main: { min: 32, natural: 32 }, cross: { natural: spec.rail } };
  const template = { accepts: ["panel"], cross: { min: spec.card.min, max: spec.card.max, rail: spec.rail }, gap: spec.gap };
  const cols = o.columns ?? DEFAULT_COLUMNS;
  const used = { ...DEFAULT_USED, ...o.used };
  const edges: DockEdge[] = [];
  const items: Record<string, DockItem> = {};
  const add = (id: string): void => {
    items[id] = { id, kind: "panel", used: used[id] ?? 0, forms: { column: [card, bar, rail] }, ...(o.from?.[id] ? { from: o.from[id]! } : {}) };
  };
  for (const side of ["left", "right"] as const) {
    (cols[side] ?? []).forEach((members, ring) => {
      members.forEach(add);
      edges.push({ id: `${side}-${ring}`, side, ring, column: true, items: [...members], accepts: template.accepts, cross: template.cross, gap: template.gap, ...(o.size !== undefined ? { size: o.size } : {}) });
    });
  }
  for (const f of o.floats ?? []) add(f.id);
  return {
    stage: { x: 0, y: 0, width: o.width ?? 1120, height: o.height ?? 800 },
    edges,
    items,
    floats: (o.floats ?? []).map((f) => ({ id: f.id, rect: { ...f.rect } })),
    floatKinds: ["panel"],
    columns: { left: template, right: template },
    rails: { left: { width: spec.rail, accepts: ["panel"] }, right: { width: spec.rail, accepts: ["panel"] } },
    contentMin: spec.contentMin,
    handFold: o.handFold ?? "bar",
    inset: { left: spec.pad, right: spec.pad },
    gutter: spec.gap,
  };
}
