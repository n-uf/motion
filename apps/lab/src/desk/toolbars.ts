/**
 * Toolbar groups, as a pure model: commands come in groups, each sitting in one of five hosts (the title bar, the top
 * toolbar, a bottom toolbar, a left and a right side toolbar), in one of three zones (start, centre, end; top, middle,
 * bottom on a side), in order. No DOM: group sizes come in as numbers.
 *
 * - A host lays its zones out along its length: start from the lead, end up to the tail, the centre centred on the
 *   whole host; when the centre would hit the start or end zone it centres in the space between them.
 * - A host that runs out of room folds its lowest-priority groups (FOLD_ORDER) into its ⋯ group, which shows how many;
 *   a host with no ⋯ gets one at the end of its end zone.
 * - A group drop lands in a zone before all, after all, or between two groups: the insertion points along a host,
 *   each owning the stretch of the host nearest to it.
 * - A whole toolbar moves to another edge by swapping its groups with the toolbar there; the title bar never moves.
 */
import type { Rect } from "@n-uf/motion";

export type HostId = "title" | "top" | "bottom" | "left" | "right";
export type ZoneId = "start" | "center" | "end";
export type GroupId = "doc" | "edit" | "history" | "view" | "zoom" | "more" | "panel" | "share";
export type Zones = Readonly<Record<ZoneId, readonly GroupId[]>>;
export type Arrangement = Readonly<Record<HostId, Zones>>;

export const HOSTS: readonly HostId[] = ["title", "top", "bottom", "left", "right"];
export const ZONES: readonly ZoneId[] = ["start", "center", "end"];
export const GROUPS: readonly GroupId[] = ["doc", "edit", "history", "view", "zoom", "more", "panel", "share"];

export const GROUP_LABEL: Readonly<Record<GroupId, string>> = {
  doc: "Document",
  edit: "Edit",
  history: "History",
  view: "View",
  zoom: "Zoom",
  more: "More",
  panel: "Panel",
  share: "Share",
};
export const HOST_LABEL: Readonly<Record<HostId, string>> = { title: "Title bar", top: "Top toolbar", bottom: "Bottom toolbar", left: "Left toolbar", right: "Right toolbar" };
export const zoneLabel = (h: HostId, z: ZoneId): string => (vertical(h) ? { start: "top", center: "middle", end: "bottom" } : { start: "left", center: "centre", end: "right" })[z];

/** Lowest priority first: what folds into ⋯ when a host runs out of room (⋯ itself never folds). */
export const FOLD_ORDER: readonly GroupId[] = ["share", "panel", "view", "history", "edit", "zoom", "doc"];

export const vertical = (h: HostId): boolean => h === "left" || h === "right";

/** Gaps along a host: between groups in a zone, and between zones. */
export const GAP = 6;
export const ZONE_GAP = 14;
/** What the ⋯ count badge adds to the ⋯ group's length. */
export const BADGE = 20;
/** The id of the ⋯ a host gets when it folds groups and has none of its own. */
export const autoMore = (h: HostId): string => `more:auto:${h}`;

const none: Zones = { start: [], center: [], end: [] };
const z = (p: Partial<Record<ZoneId, readonly GroupId[]>>): Zones => ({ ...none, ...p });
const arr = (p: Partial<Record<HostId, Partial<Record<ZoneId, readonly GroupId[]>>>>): Arrangement => ({
  title: z(p.title ?? {}),
  top: z(p.top ?? {}),
  bottom: z(p.bottom ?? {}),
  left: z(p.left ?? {}),
  right: z(p.right ?? {}),
});

/** The twelve cases: the sketch's, on the desk (its tools are the desk's edit and history; its export joins share). */
export const CASES: readonly { readonly name: string; readonly note: string; readonly arrangement: Arrangement }[] = [
  {
    name: "Like the app today",
    note: "Document left and zoom · ⋯ right in the title bar; edit · history · view in the top toolbar; panel and share in a bottom toolbar.",
    arrangement: arr({ title: { start: ["doc"], end: ["zoom", "more"] }, top: { center: ["edit", "history", "view"] }, bottom: { start: ["panel"], end: ["share"] } }),
  },
  {
    name: "Tools in the title bar, before all",
    note: "Edit and history go to the title bar's left zone, ahead of the document.",
    arrangement: arr({ title: { start: ["edit", "history", "doc"], end: ["zoom", "more"] }, top: { center: ["view"] }, bottom: { start: ["panel"], end: ["share"] } }),
  },
  {
    name: "Zoom to the title bar's centre",
    note: "Zoom sits centred on the bar.",
    arrangement: arr({ title: { start: ["doc"], center: ["zoom"], end: ["more"] }, top: { center: ["edit", "history", "view"] }, bottom: { start: ["panel"], end: ["share"] } }),
  },
  {
    name: "View after all, title bar right",
    note: "View moves past ⋯ to the very end.",
    arrangement: arr({ title: { start: ["doc"], end: ["zoom", "more", "view"] }, top: { center: ["edit", "history"] }, bottom: { start: ["panel"], end: ["share"] } }),
  },
  {
    name: "A top toolbar with three zones",
    note: "Edit and history on the top toolbar's left, view in its centre, zoom on its right.",
    arrangement: arr({ title: { start: ["doc"], end: ["more"] }, top: { start: ["edit", "history"], center: ["view"], end: ["zoom"] }, bottom: { start: ["panel"], end: ["share"] } }),
  },
  {
    name: "Zoom to the bottom bar's centre",
    note: "The bottom bar gets a centre zone.",
    arrangement: arr({ title: { start: ["doc"], end: ["more"] }, top: { center: ["edit", "history", "view"] }, bottom: { start: ["panel"], center: ["zoom"], end: ["share"] } }),
  },
  {
    name: "Bottom bar: share before all",
    note: "Share moves to the bottom bar's left, ahead of panel.",
    arrangement: arr({ title: { start: ["doc"], end: ["zoom", "more"] }, top: { center: ["edit", "history", "view"] }, bottom: { start: ["share", "panel"] } }),
  },
  {
    name: "Tools on the right side",
    note: "Edit and history leave the top toolbar for a right side toolbar.",
    arrangement: arr({ title: { start: ["doc"], end: ["zoom", "more"] }, top: { center: ["view"] }, right: { start: ["edit", "history"] }, bottom: { start: ["panel"], end: ["share"] } }),
  },
  {
    name: "Bottom toolbar to the left side",
    note: "The bottom bar turns vertical on the left: panel on top, share at the bottom.",
    arrangement: arr({ title: { start: ["doc"], end: ["zoom", "more"] }, top: { center: ["edit", "history", "view"] }, left: { start: ["panel"], end: ["share"] } }),
  },
  {
    name: "Two side toolbars",
    note: "Edit and history on the left; view and zoom on the right, centred.",
    arrangement: arr({ title: { start: ["doc"], end: ["more"] }, left: { start: ["edit", "history"] }, right: { center: ["view", "zoom"] }, bottom: { start: ["panel"], end: ["share"] } }),
  },
  {
    name: "Everything in the title bar",
    note: "One compact bar; no other toolbars (the top toolbar takes no space).",
    arrangement: arr({ title: { start: ["doc", "edit", "history"], center: ["zoom"], end: ["view", "panel", "share", "more"] } }),
  },
  {
    name: "Document centred in the top toolbar",
    note: "The title bar keeps only ⋯; the document centres in the top toolbar.",
    arrangement: arr({ title: { end: ["more"] }, top: { start: ["edit", "history"], center: ["doc"], end: ["view", "zoom"] }, bottom: { start: ["panel"], end: ["share"] } }),
  },
];

export const DEFAULT_ARRANGEMENT: Arrangement = CASES[0]!.arrangement;

// --- changes -------------------------------------------------------------------------------------------------------

const map = (a: Arrangement, f: (h: HostId, zone: ZoneId, list: readonly GroupId[]) => readonly GroupId[]): Arrangement =>
  Object.fromEntries(HOSTS.map((h) => [h, Object.fromEntries(ZONES.map((zn) => [zn, f(h, zn, a[h][zn])]))])) as unknown as Arrangement;

/** The arrangement with group `g` lifted out. */
export const withoutGroup = (a: Arrangement, g: GroupId): Arrangement => map(a, (_h, _z, l) => l.filter((x) => x !== g));

/** The arrangement with `g` moved to place `i` of zone `zone` of host `h` (`i` counts the others). */
export function insertGroup(a: Arrangement, g: GroupId, h: HostId, zone: ZoneId, i: number): Arrangement {
  const out = withoutGroup(a, g);
  return map(out, (hh, zz, l) => (hh === h && zz === zone ? [...l.slice(0, i), g, ...l.slice(i)] : l));
}

/** Two toolbars trade places: their groups swap edges. */
export const swapHosts = (a: Arrangement, h1: HostId, h2: HostId): Arrangement => ({ ...a, [h1]: a[h2], [h2]: a[h1] });

export const isEmptyHost = (a: Arrangement, h: HostId): boolean => ZONES.every((zn) => a[h][zn].length === 0);
export const hostOf = (a: Arrangement, g: GroupId): { host: HostId; zone: ZoneId; index: number } | null => {
  for (const h of HOSTS) for (const zn of ZONES) if (a[h][zn].includes(g)) return { host: h, zone: zn, index: a[h][zn].indexOf(g) };
  return null;
};
export const sameArrangement = (a: Arrangement, b: Arrangement): boolean => JSON.stringify(a) === JSON.stringify(b);

// --- a host's layout -----------------------------------------------------------------------------------------------

/** A host's room: its length and thickness, and what its ends keep for themselves (a grip, window controls). */
export interface HostSpec {
  readonly length: number;
  readonly thickness: number;
  readonly lead: number;
  readonly tail: number;
}

/** A group's size in a host: along it (`along`) and across it (`across`). */
export type GroupSize = (id: string, vertical: boolean) => { along: number; across: number };

export interface HostLayout {
  /** Each shown group's rect in the host (x along, y across for a horizontal host; transposed on a side). */
  readonly slots: ReadonlyMap<string, Rect>;
  /** Groups folded into ⋯. */
  readonly folded: readonly GroupId[];
  /** The ⋯ that shows the count (a group id or the host's own auto ⋯), or null when nothing folded. */
  readonly more: string | null;
  /** The length the groups and the ends need (folded ones not counted). */
  readonly need: number;
  /** Each zone's groups as shown, in order. */
  readonly shown: Readonly<Record<ZoneId, readonly string[]>>;
}

/** How long the host's groups need it to be, with nothing folded. */
export function hostNeed(zones: Zones, spec: Pick<HostSpec, "lead" | "tail">, size: GroupSize, v: boolean): number {
  const lens = ZONES.map((zn) => zones[zn].reduce((s, g) => s + size(g, v).along, 0) + GAP * Math.max(0, zones[zn].length - 1));
  const used = ZONES.filter((zn) => zones[zn].length > 0).length;
  return spec.lead + spec.tail + lens.reduce((s, x) => s + x, 0) + ZONE_GAP * Math.max(0, used - 1);
}

/** Lay a host out: zones along its length, folding the lowest-priority groups when they don't fit. */
export function layoutHost(zones: Zones, h: HostId, spec: HostSpec, size: GroupSize): HostLayout {
  const v = vertical(h);
  const folded: GroupId[] = [];
  const shownOf = (): Record<ZoneId, string[]> => {
    const s = { start: [...zones.start], center: [...zones.center], end: [...zones.end] } as Record<ZoneId, string[]>;
    for (const zn of ZONES) s[zn] = s[zn].filter((g) => !folded.includes(g as GroupId));
    if (folded.length && !ZONES.some((zn) => s[zn].includes("more"))) s.end = [...s.end, autoMore(h)];
    return s;
  };
  const len = (id: string): number => size(id.startsWith("more") ? "more" : id, v).along + (folded.length && id.startsWith("more") ? BADGE : 0);
  const zoneLen = (l: readonly string[]): number => l.reduce((s, g) => s + len(g), 0) + GAP * Math.max(0, l.length - 1);
  const needOf = (s: Record<ZoneId, string[]>): number => {
    const used = ZONES.filter((zn) => s[zn].length > 0).length;
    return spec.lead + spec.tail + ZONES.reduce((sum, zn) => sum + zoneLen(s[zn]), 0) + ZONE_GAP * Math.max(0, used - 1);
  };
  let shown = shownOf();
  for (const g of FOLD_ORDER) {
    if (needOf(shown) <= spec.length) break;
    if (ZONES.some((zn) => zones[zn].includes(g))) {
      folded.push(g);
      shown = shownOf();
    }
  }
  const a0 = spec.lead;
  const b0 = spec.length - spec.tail;
  const S = zoneLen(shown.start);
  const C = zoneLen(shown.center);
  const E = zoneLen(shown.end);
  const lo = a0 + S + (S > 0 ? ZONE_GAP : 0);
  const hi = b0 - E - (E > 0 ? ZONE_GAP : 0);
  let c0 = spec.length / 2 - C / 2;
  if (c0 < lo || c0 + C > hi) c0 = (lo + hi) / 2 - C / 2;
  const slots = new Map<string, Rect>();
  const place = (list: readonly string[], from: number): void => {
    let at = from;
    for (const g of list) {
      const s = size(g.startsWith("more") ? "more" : g, v);
      const l = len(g);
      const across = (spec.thickness - s.across) / 2;
      slots.set(g, v ? { x: across, y: at, width: s.across, height: l } : { x: at, y: across, width: l, height: s.across });
      at += l + GAP;
    }
  };
  place(shown.start, a0);
  place(shown.center, c0);
  place(shown.end, b0 - E);
  const more = folded.length ? (ZONES.some((zn) => shown[zn].includes("more")) ? "more" : autoMore(h)) : null;
  return { slots, folded, more, need: needOf(shown), shown };
}

// --- insertion points ----------------------------------------------------------------------------------------------

/** A place a dragged group can go: a zone of a host and the index among the others there, at a point along the host. */
export interface Insertion {
  readonly host: HostId;
  readonly zone: ZoneId;
  readonly index: number;
  /** Along the host (host coordinates). */
  readonly at: number;
  /** The stretch of the host it owns: from, to (host coordinates). */
  readonly span: readonly [number, number];
  readonly label: string;
}

/**
 * The insertion points of a host laid out without the dragged group: in each zone before all, between two, after
 * all (an empty zone: one point, at its place); each owns the stretch of the host nearest to it.
 */
export function insertions(zones: Zones, h: HostId, spec: HostSpec, l: HostLayout): Insertion[] {
  const v = vertical(h);
  const lo = (r: Rect): number => (v ? r.y : r.x);
  const hi = (r: Rect): number => (v ? r.y + r.height : r.x + r.width);
  const pts: Omit<Insertion, "span">[] = [];
  for (const zn of ZONES) {
    const name = `${HOST_LABEL[h]} · ${zoneLabel(h, zn)}`;
    // The groups of the zone that show, with their places in the zone's list.
    const vis = zones[zn].map((g, i) => ({ g, i, r: l.slots.get(g) })).filter((x): x is { g: GroupId; i: number; r: Rect } => !!x.r);
    if (!vis.length) {
      const at = zn === "start" ? spec.lead + 6 : zn === "end" ? spec.length - spec.tail - 6 : spec.length / 2;
      pts.push({ host: h, zone: zn, index: zones[zn].length, at, label: name });
      continue;
    }
    pts.push({ host: h, zone: zn, index: vis[0]!.i, at: lo(vis[0]!.r) - GAP / 2, label: `${name} · before all` });
    for (let k = 1; k < vis.length; k++) {
      pts.push({ host: h, zone: zn, index: vis[k]!.i, at: (hi(vis[k - 1]!.r) + lo(vis[k]!.r)) / 2, label: `${name} · between ${GROUP_LABEL[vis[k - 1]!.g]} and ${GROUP_LABEL[vis[k]!.g]}` });
    }
    // After all: past the last shown group (an auto ⋯ after it stays last).
    pts.push({ host: h, zone: zn, index: zones[zn].length, at: hi(vis.at(-1)!.r) + GAP / 2, label: `${name} · after all` });
  }
  pts.sort((a, b) => a.at - b.at);
  return pts.map((p, k) => ({
    ...p,
    span: [k === 0 ? 0 : (pts[k - 1]!.at + p.at) / 2, k === pts.length - 1 ? spec.length : (p.at + pts[k + 1]!.at) / 2] as const,
  }));
}
