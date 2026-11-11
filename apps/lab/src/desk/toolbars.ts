/**
 * Toolbar groups, as a pure model: commands come in groups of two or more controls, each group sitting in one of five
 * hosts (the title bar, the top toolbar, a bottom toolbar, a left and a right side toolbar), in one of three zones
 * (start, centre, end; top, middle, bottom on a side), in order; or floating over the documents. A toolbar is a slot:
 * it never moves itself, its groups do. No DOM: group sizes come in as numbers.
 *
 * - A host lays its zones out along its length: start from the lead, end up to the tail, the centre centred on the
 *   whole host; when the centre would hit the start or end zone it centres in the space between them. A group's
 *   handle is the separator: GAP apart from the previous group, no divider lines.
 * - Toolbars never wrap: when room runs out, groups collapse to their handle and » from the trailing end. A group
 *   collapsed by hand stays collapsed.
 * - A group drop lands in a zone before all, after all, or between two groups. An empty zone is a target of its own:
 *   the pointer anywhere inside it lands the group there (flush to its start, centred, or flush to its end).
 */
import type { Rect } from "@n-uf/motion";

export type HostId = "title" | "top" | "bottom" | "left" | "right";
export type ZoneId = "start" | "center" | "end";
export type GroupId = "doc" | "edit" | "history" | "view" | "zoom" | "panel" | "share";
export type Zones = Readonly<Record<ZoneId, readonly GroupId[]>>;
/** A group floating over the documents: its top-left corner in stage coordinates, and where it was docked. */
export interface Floating {
  readonly id: GroupId;
  readonly x: number;
  readonly y: number;
  readonly from: { readonly host: HostId; readonly zone: ZoneId; readonly index: number } | null;
}
export type Arrangement = Readonly<Record<HostId, Zones>> & {
  /** Groups collapsed to their handle and » by hand. */
  readonly collapsed: readonly GroupId[];
  readonly floating: readonly Floating[];
};

export const HOSTS: readonly HostId[] = ["title", "top", "bottom", "left", "right"];
export const ZONES: readonly ZoneId[] = ["start", "center", "end"];
export const GROUPS: readonly GroupId[] = ["doc", "edit", "history", "view", "zoom", "panel", "share"];

export const GROUP_LABEL: Readonly<Record<GroupId, string>> = { doc: "Document", edit: "Edit", history: "History", view: "View", zoom: "Zoom", panel: "Panels", share: "Share" };
export const HOST_LABEL: Readonly<Record<HostId, string>> = { title: "Title bar", top: "Top bar", bottom: "Bottom bar", left: "Left edge", right: "Right edge" };
export const zoneLabel = (h: HostId, z: ZoneId): string => (vertical(h) ? { start: "top", center: "middle", end: "bottom" } : { start: "left", center: "centre", end: "right" })[z];

export const vertical = (h: HostId): boolean => h === "left" || h === "right";

/** Between two groups (the handle of the second is the separator). */
export const GAP = 12;
/** Between zones. */
export const ZONE_GAP = 16;

const none: Zones = { start: [], center: [], end: [] };
const z = (p: Partial<Record<ZoneId, readonly GroupId[]>>): Zones => ({ ...none, ...p });
const arr = (p: Partial<Record<HostId, Partial<Record<ZoneId, readonly GroupId[]>>>>): Arrangement => ({
  title: z(p.title ?? {}),
  top: z(p.top ?? {}),
  bottom: z(p.bottom ?? {}),
  left: z(p.left ?? {}),
  right: z(p.right ?? {}),
  collapsed: [],
  floating: [],
});

/** The twelve cases: the sketch's, on the desk (its tools are the desk's edit and history; its export joins share). */
export const CASES: readonly { readonly name: string; readonly note: string; readonly arrangement: Arrangement }[] = [
  {
    name: "Like the app today",
    note: "Document left and zoom right in the title bar; edit · history · view in the top bar; panels and share in a bottom bar.",
    arrangement: arr({ title: { start: ["doc"], end: ["zoom"] }, top: { center: ["edit", "history", "view"] }, bottom: { start: ["panel"], end: ["share"] } }),
  },
  {
    name: "Tools in the title bar, before all",
    note: "Edit and history go to the title bar's left zone, ahead of the document.",
    arrangement: arr({ title: { start: ["edit", "history", "doc"], end: ["zoom"] }, top: { center: ["view"] }, bottom: { start: ["panel"], end: ["share"] } }),
  },
  {
    name: "Zoom to the title bar's centre",
    note: "Zoom sits centred on the bar.",
    arrangement: arr({ title: { start: ["doc"], center: ["zoom"] }, top: { center: ["edit", "history", "view"] }, bottom: { start: ["panel"], end: ["share"] } }),
  },
  {
    name: "View after all, title bar right",
    note: "View moves past zoom to the very end.",
    arrangement: arr({ title: { start: ["doc"], end: ["zoom", "view"] }, top: { center: ["edit", "history"] }, bottom: { start: ["panel"], end: ["share"] } }),
  },
  {
    name: "A top bar with three zones",
    note: "Edit and history on the top bar's left, view in its centre, zoom on its right.",
    arrangement: arr({ title: { start: ["doc"] }, top: { start: ["edit", "history"], center: ["view"], end: ["zoom"] }, bottom: { start: ["panel"], end: ["share"] } }),
  },
  {
    name: "Zoom to the bottom bar's centre",
    note: "The bottom bar gets a centre zone.",
    arrangement: arr({ title: { start: ["doc"] }, top: { center: ["edit", "history", "view"] }, bottom: { start: ["panel"], center: ["zoom"], end: ["share"] } }),
  },
  {
    name: "Bottom bar: share before all",
    note: "Share moves to the bottom bar's left, ahead of panels.",
    arrangement: arr({ title: { start: ["doc"], end: ["zoom"] }, top: { center: ["edit", "history", "view"] }, bottom: { start: ["share", "panel"] } }),
  },
  {
    name: "Tools on the right edge",
    note: "Edit and history leave the top bar for the right edge.",
    arrangement: arr({ title: { start: ["doc"], end: ["zoom"] }, top: { center: ["view"] }, right: { start: ["edit", "history"] }, bottom: { start: ["panel"], end: ["share"] } }),
  },
  {
    name: "Bottom bar's groups to the left edge",
    note: "The bottom bar's groups turn vertical on the left: panels on top, share at the bottom.",
    arrangement: arr({ title: { start: ["doc"], end: ["zoom"] }, top: { center: ["edit", "history", "view"] }, left: { start: ["panel"], end: ["share"] } }),
  },
  {
    name: "Two side toolbars",
    note: "Edit and history on the left; view and zoom on the right, centred.",
    arrangement: arr({ title: { start: ["doc"] }, left: { start: ["edit", "history"] }, right: { center: ["view", "zoom"] }, bottom: { start: ["panel"], end: ["share"] } }),
  },
  {
    name: "Everything in the title bar",
    note: "One compact bar; no other toolbars (the top bar takes no space).",
    arrangement: arr({ title: { start: ["doc", "edit", "history"], center: ["zoom"], end: ["view", "panel", "share"] } }),
  },
  {
    name: "Document centred in the top bar",
    note: "The title bar keeps only share; the document centres in the top bar.",
    arrangement: arr({ title: { end: ["share"] }, top: { start: ["edit", "history"], center: ["doc"], end: ["view", "zoom"] }, bottom: { start: ["panel"] } }),
  },
];

export const DEFAULT_ARRANGEMENT: Arrangement = CASES[0]!.arrangement;

// --- changes -------------------------------------------------------------------------------------------------------

const mapHosts = (a: Arrangement, f: (h: HostId, zone: ZoneId, list: readonly GroupId[]) => readonly GroupId[]): Arrangement => ({
  ...a,
  ...(Object.fromEntries(HOSTS.map((h) => [h, Object.fromEntries(ZONES.map((zn) => [zn, f(h, zn, a[h][zn])]))])) as Record<HostId, Zones>),
});

/** Where `g` is docked (null: floating). */
export const hostOf = (a: Arrangement, g: GroupId): { host: HostId; zone: ZoneId; index: number } | null => {
  for (const h of HOSTS) for (const zn of ZONES) if (a[h][zn].includes(g)) return { host: h, zone: zn, index: a[h][zn].indexOf(g) };
  return null;
};

/** The arrangement with group `g` lifted out (of its host, or from floating). */
export const withoutGroup = (a: Arrangement, g: GroupId): Arrangement => ({ ...mapHosts(a, (_h, _z, l) => l.filter((x) => x !== g)), floating: a.floating.filter((f) => f.id !== g) });

/** The arrangement with `g` docked at place `i` of zone `zone` of host `h` (`i` counts the others). */
export function insertGroup(a: Arrangement, g: GroupId, h: HostId, zone: ZoneId, i: number): Arrangement {
  return mapHosts(withoutGroup(a, g), (hh, zz, l) => (hh === h && zz === zone ? [...l.slice(0, i), g, ...l.slice(i)] : l));
}

/** `g` floating with its top-left corner at (x, y), stage coordinates; it remembers where it was docked. */
export function floatGroup(a: Arrangement, g: GroupId, x: number, y: number): Arrangement {
  const from = hostOf(a, g) ?? a.floating.find((f) => f.id === g)?.from ?? null;
  const out = withoutGroup(a, g);
  return { ...out, floating: [...out.floating, { id: g, x, y, from }] };
}

/** `g` docked again where it floated from (else where the default arrangement has it). */
export function dockGroup(a: Arrangement, g: GroupId): Arrangement {
  const from = a.floating.find((f) => f.id === g)?.from ?? hostOf(DEFAULT_ARRANGEMENT, g)!;
  return insertGroup(a, g, from.host, from.zone, Math.min(from.index, a[from.host][from.zone].filter((x) => x !== g).length));
}

/** `g` back where the default arrangement has it, expanded. */
export function resetGroup(a: Arrangement, g: GroupId): Arrangement {
  const home = hostOf(DEFAULT_ARRANGEMENT, g)!;
  const out = insertGroup(a, g, home.host, home.zone, Math.min(home.index, a[home.host][home.zone].filter((x) => x !== g).length));
  return { ...out, collapsed: out.collapsed.filter((x) => x !== g) };
}

/** `g` moved to host `h`: after its last group (in its last zone that has any), or into its start zone. */
export function moveToHost(a: Arrangement, g: GroupId, h: HostId): Arrangement {
  const rest = withoutGroup(a, g);
  const zone = [...ZONES].reverse().find((zn) => rest[h][zn].length > 0) ?? "start";
  return insertGroup(a, g, h, zone, rest[h][zone].length);
}

/** Every group of host `from` moved to host `to`, zone by zone, after the groups there. */
export function moveBar(a: Arrangement, from: HostId, to: HostId): Arrangement {
  if (from === to) return a;
  return mapHosts(a, (h, zn, l) => (h === from ? [] : h === to ? [...l, ...a[from][zn]] : l));
}

export const toggleCollapsed = (a: Arrangement, g: GroupId): Arrangement => ({ ...a, collapsed: a.collapsed.includes(g) ? a.collapsed.filter((x) => x !== g) : [...a.collapsed, g] });

export const isEmptyHost = (a: Arrangement, h: HostId): boolean => ZONES.every((zn) => a[h][zn].length === 0);
export const sameArrangement = (a: Arrangement, b: Arrangement): boolean => JSON.stringify(a) === JSON.stringify(b);

// --- a host's layout -----------------------------------------------------------------------------------------------

/** A host's room: its length and thickness, and what its ends keep for themselves (window controls, a margin). */
export interface HostSpec {
  readonly length: number;
  readonly thickness: number;
  readonly lead: number;
  readonly tail: number;
}

/** A group's size in a host, expanded or collapsed: along it (`along`) and across it (`across`). */
export type GroupSize = (id: GroupId, vertical: boolean, collapsed: boolean) => { along: number; across: number };

export interface HostLayout {
  /** Each group's rect in the host (x along, y across for a horizontal host; transposed on a side). */
  readonly slots: ReadonlyMap<GroupId, Rect>;
  /** Groups shown collapsed (by hand, or because the room ran out). */
  readonly collapsed: readonly GroupId[];
  /** Of those, the ones the room collapsed (from the trailing end). */
  readonly overflow: readonly GroupId[];
  /** The length the groups and the ends take. */
  readonly need: number;
}

/** How long the host's groups need it to be, collapsing only those collapsed by hand. */
export function hostNeed(zones: Zones, collapsed: readonly GroupId[], spec: Pick<HostSpec, "lead" | "tail">, size: GroupSize, v: boolean): number {
  const lens = ZONES.map((zn) => zones[zn].reduce((s, g) => s + size(g, v, collapsed.includes(g)).along, 0) + GAP * Math.max(0, zones[zn].length - 1));
  const used = ZONES.filter((zn) => zones[zn].length > 0).length;
  return spec.lead + spec.tail + lens.reduce((s, x) => s + x, 0) + ZONE_GAP * Math.max(0, used - 1);
}

/** Lay a host out: zones along its length; when they don't fit, groups collapse from the trailing end. */
export function layoutHost(zones: Zones, h: HostId, spec: HostSpec, size: GroupSize, byHand: readonly GroupId[] = []): HostLayout {
  const v = vertical(h);
  const collapsed = new Set<GroupId>(ZONES.flatMap((zn) => zones[zn]).filter((g) => byHand.includes(g)));
  const overflow: GroupId[] = [];
  const len = (g: GroupId): number => size(g, v, collapsed.has(g)).along;
  const zoneLen = (l: readonly GroupId[]): number => l.reduce((s, g) => s + len(g), 0) + GAP * Math.max(0, l.length - 1);
  const needNow = (): number => hostNeed(zones, [...collapsed], spec, size, v);
  // The trailing end first: the end zone's last group, back to the start zone's first.
  for (const g of [...ZONES].reverse().flatMap((zn) => [...zones[zn]].reverse())) {
    if (needNow() <= spec.length) break;
    if (collapsed.has(g)) continue;
    collapsed.add(g);
    overflow.push(g);
  }
  const a0 = spec.lead;
  const b0 = spec.length - spec.tail;
  const S = zoneLen(zones.start);
  const C = zoneLen(zones.center);
  const E = zoneLen(zones.end);
  const lo = a0 + S + (S > 0 ? ZONE_GAP : 0);
  const hi = b0 - E - (E > 0 ? ZONE_GAP : 0);
  let c0 = spec.length / 2 - C / 2;
  if (c0 < lo || c0 + C > hi) c0 = (lo + hi) / 2 - C / 2;
  const slots = new Map<GroupId, Rect>();
  const place = (l: readonly GroupId[], from: number): void => {
    let at = from;
    for (const g of l) {
      const s = size(g, v, collapsed.has(g));
      const across = (spec.thickness - s.across) / 2;
      slots.set(g, v ? { x: across, y: at, width: s.across, height: s.along } : { x: at, y: across, width: s.along, height: s.across });
      at += s.along + GAP;
    }
  };
  place(zones.start, a0);
  place(zones.center, c0);
  place(zones.end, b0 - E);
  return { slots, collapsed: [...collapsed], overflow, need: needNow() };
}

// --- insertion points ----------------------------------------------------------------------------------------------

/** A place a dragged group can go: a zone of a host and the index among the others there, and where it is. */
export interface Insertion {
  readonly host: HostId;
  readonly zone: ZoneId;
  readonly index: number;
  /** Along the host: the insertion line (between groups); for an empty zone, the zone's middle. */
  readonly at: number;
  /** The stretch of the host it owns (host coordinates). */
  readonly span: readonly [number, number];
  /** An empty zone: it owns all of its stretch, whatever is nearer (it wins while the pointer is inside it). */
  readonly empty: boolean;
  readonly label: string;
}

/**
 * The insertion points of a host laid out without the dragged group: in each zone before all, between two, after
 * all; each owns the stretch of the host nearest to it. An empty zone owns its own stretch: the host's first third
 * (start), middle third (centre) or last third (end), less what its neighbours' groups take.
 */
export function insertions(zones: Zones, h: HostId, spec: HostSpec, l: HostLayout): Insertion[] {
  const v = vertical(h);
  const lo = (r: Rect): number => (v ? r.y : r.x);
  const hi = (r: Rect): number => (v ? r.y + r.height : r.x + r.width);
  const L = spec.length;
  const all = ZONES.flatMap((zn) => zones[zn].map((g) => l.slots.get(g)).filter((r): r is Rect => !!r));
  const first = all.length ? Math.min(...all.map(lo)) : L;
  const last = all.length ? Math.max(...all.map(hi)) : 0;
  const zoneEdge = (zn: ZoneId, end: "lo" | "hi"): number | null => {
    const rs = zones[zn].map((g) => l.slots.get(g)).filter((r): r is Rect => !!r);
    if (!rs.length) return null;
    return end === "lo" ? Math.min(...rs.map(lo)) : Math.max(...rs.map(hi));
  };
  const near: Omit<Insertion, "span">[] = [];
  const empties: Insertion[] = [];
  for (const zn of ZONES) {
    const name = `${HOST_LABEL[h]} · ${zoneLabel(h, zn)}`;
    const vis = zones[zn].map((g, i) => ({ g, i, r: l.slots.get(g)! }));
    if (!vis.length) {
      const sEnd = zoneEdge("start", "hi");
      const eStart = zoneEdge("end", "lo");
      const span: [number, number] =
        zn === "start" ? [0, Math.min(L / 3, first - GAP / 2)] : zn === "end" ? [Math.max((2 * L) / 3, last + GAP / 2), L] : [Math.max(L / 3, (sEnd ?? 0) + GAP / 2), Math.min((2 * L) / 3, (eStart ?? L) - GAP / 2)];
      if (span[1] - span[0] >= 8) empties.push({ host: h, zone: zn, index: 0, at: (span[0] + span[1]) / 2, span, empty: true, label: name });
      continue;
    }
    near.push({ host: h, zone: zn, index: vis[0]!.i, at: lo(vis[0]!.r) - GAP / 2, empty: false, label: `${name} · before all` });
    for (let k = 1; k < vis.length; k++) near.push({ host: h, zone: zn, index: vis[k]!.i, at: (hi(vis[k - 1]!.r) + lo(vis[k]!.r)) / 2, empty: false, label: `${name} · between ${GROUP_LABEL[vis[k - 1]!.g]} and ${GROUP_LABEL[vis[k]!.g]}` });
    near.push({ host: h, zone: zn, index: zones[zn].length, at: hi(vis.at(-1)!.r) + GAP / 2, empty: false, label: `${name} · after all` });
  }
  near.sort((a, b) => a.at - b.at);
  const lines = near.map((p, k) => ({ ...p, span: [k === 0 ? 0 : (near[k - 1]!.at + p.at) / 2, k === near.length - 1 ? L : (p.at + near[k + 1]!.at) / 2] as const }));
  return [...lines, ...empties];
}
