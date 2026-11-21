/**
 * The window chrome as a dock state (`@n-uf/docking`): what islands/dock-chrome.ts solves, drags and stores. Pure data, no
 * DOM, so the node tests (scripts/chrome-dock.test.mjs) run it as it is.
 *
 * - **Edges.** Three bars across the window (the title bar, a top bar under it, a bottom bar), each with start, center
 *   and end zones, and a compact rail down each side (icons only). Every edge takes toolbar groups (kind "group").
 * - **Items.** Each toolbar group declares its forms as the page measured them: in a bar its row, then (when its
 *   controls have icons) its icons row, then its grip and », then the bar's » menu; on a side rail its icons, then its
 *   grip and », then the rail's » menu. `solve` steps groups down that ladder as a bar runs out of room, the lowest
 *   `priority` first, then the one used longest ago, and brings them back in reverse order.
 * - **Reserved room.** The title bar's window controls (the lights) at its start and the window's own controls at its
 *   end (the freeze switch, X-ray, ↺ Reset) are fixed items: never dragged, never covered by a target.
 * - **Floats.** A group may float over the content; one floated from the menu follows the content's bottom edge
 *   (`anchor: "content-bottom"`).
 *
 * The arrangement a page declares (`Model`, demos/toolbar.ts: which groups sit in which bar and zone, floating or folded)
 * is the server's first frame; `dockStateOf` turns it into the dock state and `arrangementOf` reads one back.
 */
import { readDockState, zoneIn, type DockEdge, type DockFloat, type DockItem, type DockState, type FloatAnchorAt } from "@n-uf/docking";
import type { StackForm } from "@n-uf/placement/stack";
import { HOSTS, ZONES, type Float, type Host, type Model } from "./toolbar";

/** A group's measured sizes, px: each form it can take, as the page draws it. */
export interface GroupSize {
  /** Its controls in one row, grip first: its width, and its height (a float's frame is drawn around it). */
  readonly row: { readonly width: number; readonly height: number };
  /** Its controls as icons in one row (text buttons show their icon), when that is narrower than the row; else null. */
  readonly iconsRow: number | null;
  /** Its grip and its » in a bar: the width. */
  readonly fold: number;
  /** Its icons stacked down a side rail: the height. Null: it has no icon form (a title, a hint, a slider). */
  readonly icons: number | null;
  /** Its grip over its » down a side rail: the height. */
  readonly foldDown: number;
}

/** The window as the page measured it, px. */
export interface WindowSize {
  /** Its inner size: the stage. */
  readonly width: number;
  readonly height: number;
  /** A bar's thickness, and a side rail's width. */
  readonly bar: number;
  readonly rail: number;
  /** The title bar's reserved room: the lights at its start, the window's own controls at its end. */
  readonly lead: number;
  readonly tail: number;
}

/** A group the page declares: its id, and its give-way priority (higher gives way later; default 0). */
export interface ChromeGroup {
  readonly id: string;
  readonly priority?: number;
}

/** The fixed items of the title bar: the lights, and the window's own controls. */
export const LIGHTS = "win-lights";
export const CONTROLS = "win-controls";
/** The bars' padding at each end and the room between groups; the rails' (styles/chrome.css draws the same). */
const BAR_PAD = 8;
const BAR_GAP = 12;
const RAIL_PAD = 8;
const RAIL_GAP = 6;
/** The length of a bar's » entry, and of a rail's. */
const BAR_MENU = 28;
const RAIL_MENU = 24;
/** A float's frame around the group (padding and border, styles/chrome.css `.group.floating`). */
export const FLOAT_FRAME = { x: 7, y: 5 } as const;
/** Where a float from the menu goes: centered on the content's bottom edge, 12 px above it. */
export const FLOAT_HOME: FloatAnchorAt = { at: "content-bottom", dy: -12 };

const isRail = (h: Host): boolean => h === "left" || h === "right";
const form = (kind: StackForm["kind"], main: number, cross: number, extra: Partial<StackForm> = {}): StackForm => ({
  kind,
  main: { min: main, natural: main },
  cross: { natural: cross },
  ...extra,
});
const MENU = form("menu", 0, 0);

/** A group's forms along a bar: row, icons (when it has them), grip and », the bar's » menu. */
function rowForms(s: GroupSize, bar: number): StackForm[] {
  return [form("row", s.row.width, bar), ...(s.iconsRow !== null ? [form("icons", s.iconsRow, bar)] : []), form("fold", s.fold, bar), MENU];
}
/** A group's forms down a side rail (a compact edge takes only compact forms): icons, grip and », the rail's » menu. */
function columnForms(s: GroupSize, rail: number): StackForm[] {
  return [...(s.icons !== null ? [form("icons", s.icons, rail)] : []), form("fold", s.foldDown, rail, { compact: true }), MENU];
}
/** A group's size as a float: its row inside the float's frame. */
const floatSize = (s: GroupSize): { width: number; height: number } => ({ width: s.row.width + 2 * FLOAT_FRAME.x, height: s.row.height + 2 * FLOAT_FRAME.y });

/** A group as a dock item, at `used` (its age) and `align` (its zone), with the forms its sizes give. */
function groupItem(g: ChromeGroup, s: GroupSize, win: WindowSize, used: number): DockItem {
  return {
    id: g.id,
    kind: "group",
    forms: { row: rowForms(s, win.bar), column: columnForms(s, win.rail) },
    floatSizes: { row: floatSize(s) },
    used,
    ...(g.priority ? { priority: g.priority } : {}),
  };
}

/** An edge of the chrome: a bar across the window, or a compact rail down a side. */
function edgeOf(h: Host, items: string[], win: WindowSize): DockEdge {
  if (isRail(h)) {
    return { id: h, side: h as "left" | "right", ring: 0, accepts: ["group"], items, cross: { min: win.rail, max: win.rail, rail: win.rail }, compact: true, gap: RAIL_GAP, pad: { start: RAIL_PAD, end: RAIL_PAD }, menu: { main: RAIL_MENU } };
  }
  const side = h === "bottom" ? "bottom" : "top";
  return { id: h, side, ring: h === "top" ? 1 : 0, accepts: ["group"], items, cross: { min: win.bar, max: win.bar, rail: win.bar }, gap: BAR_GAP, pad: { start: BAR_PAD, end: BAR_PAD }, menu: { main: BAR_MENU } };
}

/** A page's float (in the body's px, or "bottom") as a dock float that follows the content. */
function floatOf(f: Float, size: { width: number; height: number }): DockFloat {
  const anchor: FloatAnchorAt = f.anchor === "bottom" ? FLOAT_HOME : { at: "content-top-left", dx: f.x, dy: f.y };
  return { id: f.id, rect: { x: 0, y: 0, ...size }, anchor };
}

/**
 * The dock state of an arrangement: `groups` (in the page's order, with their priorities), each at the size the page
 * measured, in a window of `win`. Groups age in reading order, so among equal priorities the trailing ones give way
 * first; folded groups are folded by hand.
 */
export function dockStateOf(m: Model, groups: readonly ChromeGroup[], sizes: Readonly<Record<string, GroupSize>>, win: WindowSize): DockState {
  const known = new Map(groups.map((g) => [g.id, g]));
  const reading = [...HOSTS.flatMap((h) => ZONES.flatMap((z) => m[h][z])), ...m.float.map((f) => f.id)].filter((id) => known.has(id) && sizes[id]);
  // The title bar's reserved room, where the window has it (a sample window may have no controls of its own).
  const items: Record<string, DockItem> = {};
  if (win.lead > 0) items[LIGHTS] = { id: LIGHTS, kind: "chrome", forms: { row: [form("row", win.lead, win.bar)] }, used: 0, fixed: true };
  if (win.tail > 0) items[CONTROLS] = { id: CONTROLS, kind: "chrome", forms: { row: [form("row", win.tail, win.bar)] }, used: 0, fixed: true, align: "end" };
  reading.forEach((id, i) => (items[id] = groupItem(known.get(id)!, sizes[id]!, win, reading.length - i)));
  for (const h of HOSTS) for (const z of ZONES) for (const id of m[h][z]) if (items[id] && z !== "start") items[id] = { ...items[id]!, align: z };
  for (const id of m.collapsed) if (items[id]) items[id] = { ...items[id]!, from: 1 };
  const placed = (h: Host): string[] => ZONES.flatMap((z) => m[h][z]).filter((id) => items[id] && !items[id]!.fixed);
  const reserved = (id: string): string[] => (items[id] ? [id] : []);
  const edges = HOSTS.map((h) => edgeOf(h, h === "title" ? [...reserved(LIGHTS), ...placed(h), ...reserved(CONTROLS)] : placed(h), win));
  return {
    stage: { x: 0, y: 0, width: win.width, height: win.height },
    edges,
    items,
    floats: m.float.filter((f) => items[f.id]).map((f) => floatOf(f, floatSize(sizes[f.id]!))),
    floatKinds: ["group"],
  };
}

/**
 * `s` measured again: the stage, the bars and every group's forms from new sizes, everything a person changed (order,
 * zones, folds, ages, floats) kept. A group with no new size keeps its forms.
 */
export function withSizes(s: DockState, sizes: Readonly<Record<string, GroupSize>>, win: WindowSize): DockState {
  const items: Record<string, DockItem> = {};
  for (const [id, it] of Object.entries(s.items)) {
    const size = sizes[id];
    if (id === LIGHTS || id === CONTROLS) items[id] = { ...it, forms: { row: [form("row", id === LIGHTS ? win.lead : win.tail, win.bar)] } };
    else items[id] = size ? { ...it, forms: { row: rowForms(size, win.bar), column: columnForms(size, win.rail) }, floatSizes: { row: floatSize(size) } } : it;
  }
  return {
    ...s,
    stage: { x: 0, y: 0, width: win.width, height: win.height },
    edges: s.edges.map((e) => ({ ...e, cross: isRail(e.id as Host) ? { min: win.rail, max: win.rail, rail: win.rail } : { min: win.bar, max: win.bar, rail: win.bar } })),
    items,
    floats: s.floats.map((f) => (sizes[f.id] ? { ...f, rect: { ...f.rect, ...floatSize(sizes[f.id]!) } } : f)),
  };
}

const empty = (): Record<"start" | "center" | "end", string[]> => ({ start: [], center: [], end: [] });

/** The arrangement a dock state shows: groups per bar and zone, floats, folded by hand. */
export function arrangementOf(s: DockState): Model {
  const m: Model = { title: empty(), top: empty(), bottom: empty(), left: empty(), right: empty(), float: [], collapsed: [] };
  for (const e of s.edges) {
    if (!HOSTS.includes(e.id as Host)) continue;
    for (const id of e.items) {
      const it = s.items[id];
      if (!it || it.fixed) continue;
      m[e.id as Host][zoneIn(e, it)].push(id);
    }
  }
  for (const f of s.floats) {
    const a = f.anchor;
    if (a && typeof a !== "string" && a.at === "content-top-left") m.float.push({ id: f.id, x: a.dx ?? 0, y: a.dy ?? 0 });
    else if (a && (typeof a === "string" ? a : a.at) === "content-bottom") m.float.push({ id: f.id, x: 0, y: 0, anchor: "bottom" });
    else m.float.push({ id: f.id, x: Math.round(f.rect.x), y: Math.round(f.rect.y) });
  }
  m.collapsed = Object.values(s.items).filter((it) => !it.fixed && (it.from ?? 0) >= 1).map((it) => it.id).sort();
  return m;
}

/** The group ids an arrangement places, sorted. */
const idsOf = (m: Model): string[] => [...HOSTS.flatMap((h) => ZONES.flatMap((z) => m[h][z])), ...m.float.map((f) => f.id)].sort();

/** Whether `v` is an arrangement as the chrome stored it before the dock state (a `Model`, by bar and zone). */
function isOldArrangement(v: unknown): v is Model {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return false;
  const o = v as Record<string, unknown>;
  const zones = (x: unknown): boolean => typeof x === "object" && x !== null && ZONES.every((z) => Array.isArray((x as Record<string, unknown>)[z]) && ((x as Record<string, unknown[]>)[z] ?? []).every((id) => typeof id === "string"));
  const floats = Array.isArray(o.float) && o.float.every((f) => typeof f === "object" && f !== null && typeof (f as Float).id === "string" && typeof (f as Float).x === "number" && typeof (f as Float).y === "number");
  return HOSTS.every((h) => zones(o[h])) && floats && Array.isArray(o.collapsed);
}

/** What a stored value gave: the state to start from, and whether it was the old form (store it again in the new one). */
export interface StoredRead {
  readonly state: DockState;
  readonly migrated: boolean;
}

/**
 * The stored arrangement read over `base` (the page's default, measured), or null when there is nothing usable (then
 * the page forgets it). The dock state's own stored form (`storeDockState`) is read by `readDockState`; an arrangement
 * stored before the chrome ran on docking is migrated once (`rebuild` makes its dock state) when it places exactly the
 * groups the page has, and dropped otherwise.
 */
export function readStored(data: unknown, base: DockState, rebuild: (m: Model) => DockState): StoredRead | null {
  if (typeof data === "object" && data !== null && "v" in data) {
    const r = readDockState(data, base);
    return r.error ? null : { state: r.state, migrated: false };
  }
  if (!isOldArrangement(data)) return null;
  if (JSON.stringify(idsOf(data)) !== JSON.stringify(idsOf(arrangementOf(base)))) return null;
  return { state: rebuild(data), migrated: true };
}
