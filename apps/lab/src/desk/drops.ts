/**
 * Each construction's drop targets, as pure functions: from the state with the dragged item lifted out, a list of
 * zones with a priority (see intent.ts), each able to make the state with the item dropped there.
 *
 * - Edge docks (A, A2, F3): a rail (priority 1) takes the panel at the end of its dock (a folded dock keeps it in
 *   the rail); a slot between sections (2) and the bottom dock (2) take it at that place; F3's documents area (3)
 *   tears it off to float there.
 * - Tiling tree (B): each slot an insertion produces (2), a side column's row or a dwindle region of the centre;
 *   an empty side column's edge (2).
 * - Strip (D): between two columns (2) makes a new column; a gap inside a column (2) puts it there.
 * - Navigator, drawers (C, E): a tab strip (1) at the tab under the pointer, a folded side's rail (1), a side's
 *   panel (3); the panel becomes the side's showing one.
 * - Palettes (F1, F2): a corner stack's column (2) at the place under the pointer; anywhere else in the area (3),
 *   snapped to the area's edges (F1 also to other palettes' edges).
 */
import type { Rect } from "@n-uf/motion";
import { overlap, type Point } from "../shared/geometry";
import type { Target } from "./intent";
import {
  DOCK,
  OVER_MARGIN,
  PALETTE_NARROW,
  TORN_W,
  dockGeometry,
  paletteArea,
  paletteHeight,
  paletteWidth,
  stripColumns,
  stripGeometry,
  tornHeight,
  TREE_COLUMN,
  treeArea,
  treeFloats,
  treeRails,
  treeShown,
  treeTiles,
  type Construction,
} from "./layouts";
import { BAR, G, RAIL, TITLE, idOf, isDocKey, isPanelKey, panelKey, titleOf, touch, type DeskState, type Layout, type Options, type Side, type Size } from "./model";

/** A target's drop for a pointer: the state with the item there, a label, and a key (same key, same place). */
export interface Made {
  readonly state: DeskState;
  readonly label: string;
  readonly key: string;
}

export interface DropTarget extends Target {
  /** The drop with the pointer at `p`, holding the item at `grab` from its top-left corner. */
  readonly make: (p: Point, grab: Point) => Made;
  /** Where the keyboard stops in this target, in order (default: its zone's centre). */
  readonly stops?: readonly Point[];
}

/** A made drop, laid out. */
export interface Drop extends Made {
  readonly target: string;
  readonly layout: Layout;
  /** Where the item lands. */
  readonly slot: Rect;
  /** It lands hidden (folded into a rail). */
  readonly hidden: boolean;
  /** It floats where it is dropped: no room is made for it. */
  readonly free: boolean;
}

/** How close (stage px) a free drop has to come to an edge to snap to it. */
export const SNAP = 18;

/** Which items a construction lets the pointer drag. */
export const draggable = (c: Construction, key: string): boolean => isPanelKey(key) || (isDocKey(key) && (c.id === "tree" || c.id === "strip"));

/** The state with `key` lifted out of wherever it is. */
export function without(s: DeskState, key: string): DeskState {
  const dropK = (l: readonly string[]): string[] => l.filter((k) => k !== key);
  const base: DeskState = { ...s, tree: { L: dropK(s.tree.L), R: dropK(s.tree.R), C: dropK(s.tree.C) }, cols: s.cols.map(dropK).filter((c) => c.length > 0) };
  if (!isPanelKey(key)) return base;
  const id = idOf(key);
  const drop = (l: readonly number[]): number[] => l.filter((x) => x !== id);
  return {
    ...base,
    left: drop(s.left),
    right: drop(s.right),
    bottom: drop(s.bottom),
    torn: s.torn.filter((f) => f.id !== id),
    free: s.free.filter((f) => f.id !== id),
    stacks: { left: drop(s.stacks.left), right: drop(s.stacks.right) },
    active: { left: s.active.left === id ? null : s.active.left, right: s.active.right === id ? null : s.active.right },
  };
}

const insert = <T>(list: readonly T[], i: number, x: T): T[] => [...list.slice(0, i), x, ...list.slice(i)];
const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), Math.max(lo, hi));
const centre = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });
const Cap = (s: Side): string => (s === "left" ? "Left" : "Right");
const fixed = (state: DeskState, label: string) => (): Made => ({ state, label, key: label });

/** Zones `count + 1` slots split between items at `mids` (their centres), from `lo` to `hi`: slot i's span. */
const slotSpan = (mids: readonly number[], lo: number, hi: number, i: number): [number, number] => [i === 0 ? lo : mids[i - 1]!, i === mids.length ? hi : mids[i]!];

export interface TargetInput {
  readonly c: Construction;
  /** The state with the dragged item lifted out. */
  readonly s0: DeskState;
  readonly key: string;
  readonly size: Size;
  readonly opt: Options;
}

// --- edge docks ----------------------------------------------------------------------------------------------------

function dockTargets({ c, s0, key, size, opt }: TargetInput): DropTarget[] {
  const out: DropTarget[] = [];
  const id = idOf(key);
  const mode = c.id === "docksFull" ? "full" : "between";
  const d = dockGeometry(s0, size, opt, mode);
  const l0 = c.layout(s0, size, opt);
  const W = size.width;
  const H = size.height;
  for (const side of ["left", "right"] as const) {
    const rail = l0.items.get(`rail:${side}`);
    if (!rail) continue;
    const label = `${Cap(side)} rail: into the ${side} dock`;
    out.push({ id: `rail:${side}`, prio: 1, hit: rail.rect, make: fixed(touch({ ...s0, [side]: [...s0[side], id] }, id), label) });
    if (side === "left" ? !d.lOpen : !d.rOpen) continue;
    // The dock's slots: each section's halves belong to the slots above and below it.
    const shown = side === "left" ? s0.left : d.right;
    const mids = shown.map((p) => centre(l0.items.get(panelKey(p))!.rect).y);
    const x = side === "left" ? RAIL : W - RAIL - DOCK;
    for (let i = 0; i <= shown.length; i++) {
      const [y0, y1] = slotSpan(mids, 0, d.h, i);
      // Past the side list (the bottom dock is off and its panels show here): into the bottom list.
      const state = i <= s0[side].length ? { ...s0, [side]: insert(s0[side], i, id) } : { ...s0, bottom: insert(s0.bottom, i - s0[side].length, id) };
      const label = `${Cap(side)} dock · slot ${i + 1}`;
      out.push({ id: `dock:${side}:${i}`, prio: 2, hit: rect(x, y0, DOCK, y1 - y0), make: fixed(touch(state, id), label) });
    }
  }
  if (opt.bottom !== "off") {
    const b = d.bottomRect ?? rect(d.x0, H - 40 - G, d.x1 - d.x0, 40);
    const mids = s0.bottom.map((p) => centre(l0.items.get(panelKey(p))!.rect).x);
    for (let i = 0; i <= s0.bottom.length; i++) {
      const [x0, x1] = slotSpan(mids, b.x, b.x + b.width, i);
      const label = `Bottom dock · slot ${i + 1}`;
      out.push({ id: `bottom:${i}`, prio: 2, hit: rect(x0, b.y - 24, x1 - x0, H - b.y + 24), make: fixed(touch({ ...s0, bottom: insert(s0.bottom, i, id) }, id), label) });
    }
  }
  if (c.id === "dockTear") {
    // Torn off, floating where it is dropped; snapped to the documents' edges, kept on the stage.
    out.push({
      id: "float",
      prio: 3,
      free: true,
      hit: rect(d.x0, 0, d.x1 - d.x0, H),
      make: (p, grab) => {
        let x = p.x - grab.x;
        let y = p.y - grab.y;
        if (Math.abs(x - d.x0) < SNAP) x = d.x0;
        if (Math.abs(x + TORN_W - d.x1) < SNAP) x = d.x1 - TORN_W;
        if (Math.abs(y - G) < SNAP) y = G;
        x = clamp(x, 0, W - TORN_W);
        y = clamp(y, 0, H - Math.min(tornHeight(id), H));
        return { state: touch({ ...s0, torn: [...s0.torn, { id, at: { x, y } }] }, id), label: "Float here", key: `float:${Math.round(x)},${Math.round(y)}` };
      },
    });
  }
  return out;
}

// --- tiling tree ---------------------------------------------------------------------------------------------------

/**
 * The tree's targets are the slots an insertion produces: inserting at place i of a side column gives row i of its
 * n + 1 rows, inserting at place i of the centre gives dwindle's region i of n + 1. Those regions tile the column and
 * the centre, so a zone is where the item lands (unless that makes the newest tile float, which reshapes the rest);
 * the label says where it lands in the tree as laid out, and what floats.
 */
function treeTargets({ s0, key, size }: TargetInput): DropTarget[] {
  const out: DropTarget[] = [];
  const area = treeArea(size, s0);
  // The tree as tiled: a column folded to its rail offers its rail instead of its rows.
  const t = treeShown(s0);
  const rails = treeRails(s0);
  // A side column is narrower than a document's minimum: a document dropped into one would only float.
  const sides = !isDocKey(key);
  for (const [side, group] of [["left", "L"], ["right", "R"]] as const) {
    if (!sides || !rails[side]) continue;
    const hit = rect(side === "left" ? 0 : size.width - RAIL, BAR, RAIL, size.height - BAR);
    out.push({ id: `rail:${side}`, prio: 1, hit, make: fixed({ ...s0, tree: { ...s0.tree, [group]: [...s0.tree[group], key] } }, `${Cap(side)} rail: into the ${side} column`) });
  }
  if (sides && s0.tree.L.length === 0) out.push({ id: "edge:L", prio: 2, hit: rect(area.x, area.y, 30, area.height), make: fixed({ ...s0, tree: { ...s0.tree, L: [key] } }, "New left column") });
  if (sides && s0.tree.R.length === 0) out.push({ id: "edge:R", prio: 2, hit: rect(area.x + area.width - 30, area.y, 30, area.height), make: fixed({ ...s0, tree: { ...s0.tree, R: [key] } }, "New right column") });
  const x0 = area.x + (t.L.length ? TREE_COLUMN + G : 0);
  const x1 = area.x + area.width - (t.R.length ? TREE_COLUMN + G : 0);
  const centre = rect(x0, area.y, x1 - x0, area.height);
  const NAME = { L: "Left column", R: "Right column", C: "Centre" } as const;
  const seen: { label: string; hit: Rect }[] = [];
  const sameZone = (a: Rect, b: Rect): boolean => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.width - b.width), Math.abs(a.height - b.height)) < 0.5;
  for (const group of ["L", "R", "C"] as const) {
    const list = t[group];
    if (group !== "C" && list.length === 0) continue;
    if (group !== "C" && !sides) continue;
    for (let i = 0; i <= list.length; i++) {
      const state = { ...s0, tree: { ...s0.tree, [group]: insert(list, i, key) } };
      const shown = treeShown(state);
      // The slot as laid out once the tiles that break a minimum have floated (as laid out without them if it floats).
      const tiled = treeFloats(shown, area);
      const zone = treeTiles(tiled.floats.includes(key) ? shown : tiled.tree, area).get(key)!;
      const label = `${NAME[group]}, ${landing(shown, area, key, group, centre)}`;
      // Places that come out the same (around a floating tile) are one target: the keyboard stops there once.
      if (seen.some((o) => o.label === label && sameZone(o.hit, zone))) continue;
      seen.push({ label, hit: zone });
      out.push({ id: `tile:${group}:${i}`, prio: 2, hit: zone, make: fixed(state, label) });
    }
  }
  return out;
}

/**
 * Where `key` lands in the tree as laid out (after the newest tiles that break a minimum float): its row of its
 * column, or its region of the centre; or that it floats, or what floats because of it.
 */
function landing(tree: DeskState["tree"], area: Rect, key: string, group: "L" | "R" | "C", centre: Rect): string {
  const { tree: tiled, floats } = treeFloats(tree, area);
  if (floats.includes(key)) return "it floats there (too small)";
  const others = floats.length ? `; ${floats.map(titleOf).join(", ")} ${floats.length > 1 ? "float" : "floats"}` : "";
  if (group !== "C") return `row ${tiled[group].indexOf(key) + 1} of ${tiled[group].length}${others}`;
  const x0 = tiled.L.length ? centre.x : area.x;
  const x1 = tiled.R.length ? centre.x + centre.width : area.x + area.width;
  return `${regionName(treeTiles(tiled, area).get(key)!, rect(x0, area.y, x1 - x0, area.height))}${others}`;
}

/** Where a region lies in `whole`, in words: "all of it", "left half", "top right"… */
function regionName(r: Rect, whole: Rect): string {
  const near = (a: number, b: number): boolean => Math.abs(a - b) < 1;
  const h = near(r.width, whole.width) ? "" : near(r.x, whole.x) ? "left" : near(r.x + r.width, whole.x + whole.width) ? "right" : "middle";
  const v = near(r.height, whole.height) ? "" : near(r.y, whole.y) ? "top" : near(r.y + r.height, whole.y + whole.height) ? "bottom" : "middle";
  if (!h && !v) return "all of it";
  if (!v) return `${h} part`;
  if (!h) return `${v} part`;
  return `${v} ${h}`;
}

// --- scrolling strip -----------------------------------------------------------------------------------------------

function stripTargets({ c, s0, key, size, opt }: TargetInput): DropTarget[] {
  const out: DropTarget[] = [];
  const g = stripGeometry(s0, size);
  const l0 = c.layout(s0, size, opt);
  // The laid-out columns, each with the state column it comes from and where in it it starts.
  const parts: { owner: number; start: number; keys: string[] }[] = [];
  s0.cols.forEach((col, owner) => {
    let start = 0;
    for (const keys of stripColumns([col], g.h)) {
      parts.push({ owner, start, keys });
      start += keys.length;
    }
  });
  const newColumn = (at: number, label: string): Made => ({ state: { ...s0, cols: insert(s0.cols, at, [key]) }, label, key: label });
  if (parts.length === 0) return [{ id: "strip", prio: 3, hit: rect(0, g.y, size.width, g.h), make: () => newColumn(0, "The strip") }];
  // Between columns: a band across each boundary where a state column starts or ends.
  for (let k = 0; k <= parts.length; k++) {
    if (k < parts.length && parts[k]!.start !== 0) continue;
    const x = k < parts.length ? g.xs[k]! - G / 2 : g.xs[parts.length - 1]! + g.widths[parts.length - 1]! + G / 2;
    const at = k < parts.length ? parts[k]!.owner : s0.cols.length;
    const label = k === 0 ? "New column at the start" : k === parts.length ? "New column at the end" : `New column before ${titleOf(parts[k]!.keys[0]!)}`;
    out.push({ id: `between:${at}`, prio: 2, hit: rect(x - 28, g.y, 56, g.h), make: () => newColumn(at, label) });
  }
  // Inside a column: each item's halves belong to the gaps above and below it.
  parts.forEach((part, k) => {
    const mids = part.keys.map((pk) => centre(l0.items.get(pk)!.rect).y);
    for (let j = 0; j <= part.keys.length; j++) {
      const [y0, y1] = slotSpan(mids, g.y, g.y + g.h, j);
      const at = part.start + j;
      const cols = s0.cols.map((col, ci) => (ci === part.owner ? insert(col, at, key) : col));
      const label = `Into the column with ${titleOf(s0.cols[part.owner]![0]!)} · ${at + 1}`;
      out.push({ id: `into:${part.owner}:${at}`, prio: 2, hit: rect(g.xs[k]!, y0, g.widths[k]!, y1 - y0), make: fixed({ ...s0, cols }, label) });
    }
  });
  return out;
}

// --- navigator and drawers -----------------------------------------------------------------------------------------

function tabTargets({ c, s0, key, size, opt }: TargetInput): DropTarget[] {
  const out: DropTarget[] = [];
  const id = idOf(key);
  const l0 = c.layout(s0, size, opt);
  const onSide = (side: Side, i: number): DeskState => touch({ ...s0, [side]: insert(s0[side], i, id), active: { ...s0.active, [side]: id } }, id);
  for (const side of ["left", "right"] as const) {
    const list = s0[side];
    const tabs = l0.items.get(`tabs:${side}`);
    const rail = l0.items.get(`rail:${side}`);
    if (tabs && !tabs.hidden) {
      const r = tabs.rect;
      const tw = r.width / (list.length + 1);
      out.push({
        id: `tabs:${side}`,
        prio: 1,
        hit: rect(r.x, r.y - 4, r.width, r.height + 8),
        make: (p) => {
          const i = clamp(Math.floor((p.x - r.x) / tw), 0, list.length);
          const label = `${Cap(side)} tab strip · tab ${i + 1}`;
          return { state: onSide(side, i), label, key: label };
        },
        stops: Array.from({ length: list.length + 1 }, (_, i) => ({ x: r.x + tw * (i + 0.5), y: r.y + r.height / 2 })),
      });
      const panel = list.map((p) => l0.items.get(panelKey(p))).find((pl) => pl && !pl.hidden);
      if (panel) out.push({ id: `side:${side}`, prio: 3, hit: panel.rect, make: fixed(onSide(side, list.length), `${Cap(side)} side`) });
    }
    if (rail && !rail.hidden) out.push({ id: `rail:${side}`, prio: 1, hit: rail.rect, make: fixed(onSide(side, list.length), `${Cap(side)} rail`) });
    if (list.length === 0 && (!rail || rail.hidden)) {
      const hit = side === "left" ? rect(0, 0, 40, size.height) : rect(size.width - 40, 0, 40, size.height);
      out.push({ id: `edge:${side}`, prio: 2, hit, make: fixed(onSide(side, 0), `${Cap(side)} side`) });
    }
  }
  return out;
}

// --- palettes ------------------------------------------------------------------------------------------------------

function paletteTargets({ c, s0, key, size, opt }: TargetInput): DropTarget[] {
  const out: DropTarget[] = [];
  const id = idOf(key);
  const { area } = paletteArea(size, opt);
  const m = c.id === "floatOver" ? OVER_MARGIN : 0;
  const pw = paletteWidth(size.width);
  const ph = s0.folded.includes(id) ? TITLE : paletteHeight(id);
  const narrow = size.width < PALETTE_NARROW;
  const anchor = { left: area.x + m, right: area.x + area.width - m - pw };
  const l0 = c.layout(s0, size, opt);
  const rectOf = (pid: number): Rect => l0.items.get(panelKey(pid))!.rect;
  const pill = l0.items.get("toolbar");
  const pillRect = pill?.look === "pill" ? pill.rect : null;
  // A corner stack's column, down to just under its last palette: it joins the stack at the place under the pointer.
  for (const side of narrow ? (["right"] as const) : (["left", "right"] as const)) {
    const ids = narrow ? [...s0.stacks.left, ...s0.stacks.right] : [...s0.stacks[side]];
    const bottom = ids.length ? Math.max(...ids.map((pid) => rectOf(pid).y + rectOf(pid).height)) : area.y + m;
    const at = (y: number): number => ids.filter((pid) => centre(rectOf(pid)).y < y).length;
    const join = (i: number): Made => {
      let stacks = s0.stacks;
      if (!narrow) stacks = { ...stacks, [side]: insert(stacks[side], i, id) };
      else if (i <= s0.stacks.left.length) stacks = { ...stacks, left: insert(stacks.left, i, id) };
      else stacks = { ...stacks, right: insert(stacks.right, i - s0.stacks.left.length, id) };
      const label = `${narrow ? "The" : Cap(side)} corner stack · ${i + 1}`;
      return { state: touch({ ...s0, stacks }, id), label, key: label };
    };
    out.push({
      id: `stack:${side}`,
      prio: 2,
      hit: rect(anchor[side], area.y, pw, bottom + 30 - area.y),
      make: (p) => join(at(p.y)),
      stops: [area.y + m, ...ids.map((pid) => rectOf(pid).y + rectOf(pid).height + G / 2)].map((y) => ({ x: anchor[side] + pw / 2, y })),
    });
  }
  // Anywhere: snapped to the area's edges (F1 also to other palettes' edges), kept inside the area.
  out.push({
    id: "free",
    prio: 3,
    free: true,
    hit: area,
    make: (p, grab) => {
      let x = p.x - grab.x;
      let y = p.y - grab.y;
      const snaps: string[] = [];
      if (Math.abs(x - anchor.left) < SNAP) [x, snaps[0]] = [anchor.left, "left edge"];
      else if (Math.abs(x - anchor.right) < SNAP) [x, snaps[0]] = [anchor.right, "right edge"];
      if (Math.abs(y - (area.y + m)) < SNAP) [y, snaps[1]] = [area.y + m, "top"];
      else if (Math.abs(y + ph - (area.y + area.height - m)) < SNAP) [y, snaps[1]] = [area.y + area.height - m - ph, "bottom"];
      if (c.id === "floatOver") {
        for (const [k, pl] of l0.items) {
          if (!isPanelKey(k) || pl.hidden) continue;
          const o = pl.rect;
          if (snaps[0] === undefined && Math.abs(x - o.x) < SNAP) [x, snaps[0]] = [o.x, `${titleOf(k)}'s edge`];
          if (snaps[1] === undefined && Math.abs(y - (o.y + o.height + G)) < SNAP && x < o.x + o.width && x + pw > o.x) [y, snaps[1]] = [o.y + o.height + G, `under ${titleOf(k)}`];
        }
      }
      x = clamp(x, area.x, area.x + area.width - pw);
      y = clamp(y, area.y, area.y + area.height - ph);
      // Never under a floating pill: it moves clear, below a pill at the top, above one at the bottom.
      if (pillRect && overlap(rect(x, y, pw, ph), pillRect) > 0) {
        y = pillRect.y < size.height / 2 ? pillRect.y + pillRect.height + G : pillRect.y - G - ph;
        y = clamp(y, 0, size.height - ph);
        snaps[1] = "clear of the toolbar";
      }
      const how = snaps.filter(Boolean).join(", ");
      return { state: touch({ ...s0, free: [...s0.free, { id, at: { x, y } }] }, id), label: how ? `Here · snapped to the ${how}` : "Here", key: `free:${Math.round(x)},${Math.round(y)}` };
    },
  });
  return out;
}

/** The drop targets for dragging `key` in `c`, in a fixed order (the keyboard's). */
export function targetsFor(input: TargetInput): DropTarget[] {
  switch (input.c.id) {
    case "docks":
    case "docksFull":
    case "dockTear":
      return dockTargets(input);
    case "tree":
      return treeTargets(input);
    case "strip":
      return stripTargets(input);
    case "navigator":
    case "drawers":
      return tabTargets(input);
    case "floatOver":
    case "floatAround":
      return paletteTargets(input);
  }
}

/** A target's drop for a pointer, laid out. */
export function dropAt(input: TargetInput, target: DropTarget, p: Point, grab: Point): Drop {
  const made = target.make(p, grab);
  const layout = input.c.layout(made.state, input.size, input.opt);
  const placed = layout.items.get(input.key)!;
  return { ...made, key: `${target.id}|${made.key}`, target: target.id, layout, slot: placed.rect, hidden: !!placed.hidden, free: !!target.free };
}
