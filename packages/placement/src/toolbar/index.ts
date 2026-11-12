/**
 * @n-uf/placement/toolbar: toolbar groups as a pure model. Commands come in groups, each sitting in one of five
 * hosts (the title bar, the top toolbar, a bottom toolbar, a left and a right side toolbar), in one of three zones
 * (start, centre, end; top, middle, bottom on a side), in order; or floating. A toolbar is a slot: it never moves
 * itself, its groups do. Group sizes come in as numbers; group ids are the consumer's strings.
 *
 * - A host lays its zones out along its length: start from the lead, end up to the tail, the centre centred on the
 *   whole host; when the centre would hit the start or end zone it centres in the space between them.
 * - Toolbars never wrap: when room runs out, groups collapse to their handle and » from the trailing end. A group
 *   collapsed by hand stays collapsed.
 * - A group drop lands in a zone before all, after all, or between two groups. An empty zone is a target of its
 *   own. A group's own place is home: a drop there changes nothing.
 */
import type { Rect } from "../geometry";

export type HostId = "title" | "top" | "bottom" | "left" | "right";
export type ZoneId = "start" | "center" | "end";
export type Zones<G extends string = string> = Readonly<Record<ZoneId, readonly G[]>>;

/** Where a group is docked: a host, a zone, and its index there. */
export interface Place {
  readonly host: HostId;
  readonly zone: ZoneId;
  readonly index: number;
}

/** A group floating over the content: its top-left corner, and where it was docked. */
export interface Floating<G extends string = string> {
  readonly id: G;
  readonly x: number;
  readonly y: number;
  readonly from: Place | null;
}

export type Arrangement<G extends string = string> = Readonly<Record<HostId, Zones<G>>> & {
  /** Groups collapsed to their handle and » by hand. */
  readonly collapsed: readonly G[];
  readonly floating: readonly Floating<G>[];
};

export const HOSTS: readonly HostId[] = ["title", "top", "bottom", "left", "right"];
export const ZONES: readonly ZoneId[] = ["start", "center", "end"];

export const HOST_LABEL: Readonly<Record<HostId, string>> = { title: "Title bar", top: "Top bar", bottom: "Bottom bar", left: "Left edge", right: "Right edge" };
export const zoneLabel = (h: HostId, z: ZoneId): string => (vertical(h) ? { start: "top", center: "middle", end: "bottom" } : { start: "left", center: "centre", end: "right" })[z];

/** The side edges hold their groups in a column. */
export const vertical = (h: HostId): boolean => h === "left" || h === "right";

/** Between two groups (the handle of the second is the separator). */
export const GAP = 12;
/** Between zones. */
export const ZONE_GAP = 16;

/** An arrangement from the zones each host has (the rest empty), nothing collapsed or floating. */
export function arrangement<G extends string>(p: Partial<Record<HostId, Partial<Record<ZoneId, readonly G[]>>>>): Arrangement<G> {
  const z = (q: Partial<Record<ZoneId, readonly G[]>> = {}): Zones<G> => ({ start: [], center: [], end: [], ...q });
  return { title: z(p.title), top: z(p.top), bottom: z(p.bottom), left: z(p.left), right: z(p.right), collapsed: [], floating: [] };
}

// --- changes -------------------------------------------------------------------------------------------------------

const mapHosts = <G extends string>(a: Arrangement<G>, f: (h: HostId, zone: ZoneId, list: readonly G[]) => readonly G[]): Arrangement<G> => ({
  ...a,
  ...(Object.fromEntries(HOSTS.map((h) => [h, Object.fromEntries(ZONES.map((zn) => [zn, f(h, zn, a[h][zn])]))])) as Record<HostId, Zones<G>>),
});

/** Where `g` is docked (null: floating or absent). */
export function hostOf<G extends string>(a: Arrangement<G>, g: G): Place | null {
  for (const h of HOSTS) for (const zn of ZONES) if (a[h][zn].includes(g)) return { host: h, zone: zn, index: a[h][zn].indexOf(g) };
  return null;
}

/** The arrangement with group `g` lifted out (of its host, or from floating). */
export const withoutGroup = <G extends string>(a: Arrangement<G>, g: G): Arrangement<G> => ({ ...mapHosts(a, (_h, _z, l) => l.filter((x) => x !== g)), floating: a.floating.filter((f) => f.id !== g) });

/** The arrangement with `g` docked at place `i` of zone `zone` of host `h` (`i` counts the others). */
export function insertGroup<G extends string>(a: Arrangement<G>, g: G, h: HostId, zone: ZoneId, i: number): Arrangement<G> {
  return mapHosts(withoutGroup(a, g), (hh, zz, l) => (hh === h && zz === zone ? [...l.slice(0, i), g, ...l.slice(i)] : l));
}

/** `g` floating with its top-left corner at (x, y); it remembers where it was docked. */
export function floatGroup<G extends string>(a: Arrangement<G>, g: G, x: number, y: number): Arrangement<G> {
  const from = hostOf(a, g) ?? a.floating.find((f) => f.id === g)?.from ?? null;
  const out = withoutGroup(a, g);
  return { ...out, floating: [...out.floating, { id: g, x, y, from }] };
}

/** `g` at `place`, its index kept within the zone. */
const dockAt = <G extends string>(a: Arrangement<G>, g: G, place: Place): Arrangement<G> =>
  insertGroup(a, g, place.host, place.zone, Math.min(place.index, a[place.host][place.zone].filter((x) => x !== g).length));

/** `g` docked again where it floated from, else where `home` (the default arrangement) has it. */
export function dockGroup<G extends string>(a: Arrangement<G>, g: G, home: Arrangement<G>): Arrangement<G> {
  const from = a.floating.find((f) => f.id === g)?.from ?? hostOf(home, g);
  return from ? dockAt(a, g, from) : a;
}

/** `g` back where `home` (the default arrangement) has it, expanded. */
export function resetGroup<G extends string>(a: Arrangement<G>, g: G, home: Arrangement<G>): Arrangement<G> {
  const place = hostOf(home, g);
  const out = place ? dockAt(a, g, place) : a;
  return { ...out, collapsed: out.collapsed.filter((x) => x !== g) };
}

/** `g` moved to host `h`: after its last group (in its last zone that has any), or into its start zone. */
export function moveToHost<G extends string>(a: Arrangement<G>, g: G, h: HostId): Arrangement<G> {
  const rest = withoutGroup(a, g);
  const zone = [...ZONES].reverse().find((zn) => rest[h][zn].length > 0) ?? "start";
  return insertGroup(a, g, h, zone, rest[h][zone].length);
}

/** Every group of host `from` moved to host `to`, zone by zone, after the groups there. */
export function moveBar<G extends string>(a: Arrangement<G>, from: HostId, to: HostId): Arrangement<G> {
  if (from === to) return a;
  return mapHosts(a, (h, zn, l) => (h === from ? [] : h === to ? [...l, ...a[from][zn]] : l));
}

export const toggleCollapsed = <G extends string>(a: Arrangement<G>, g: G): Arrangement<G> => ({ ...a, collapsed: a.collapsed.includes(g) ? a.collapsed.filter((x) => x !== g) : [...a.collapsed, g] });

export const isEmptyHost = <G extends string>(a: Arrangement<G>, h: HostId): boolean => ZONES.every((zn) => a[h][zn].length === 0);

const samePlace = (a: Place | null, b: Place | null): boolean => (a === null || b === null ? a === b : a.host === b.host && a.zone === b.zone && a.index === b.index);

/**
 * The same arrangement: the same groups in the same order in every zone of every host, the same groups collapsed,
 * and the same groups floating at the same corner with the same home (in any order: neither list's order means
 * anything). Compared field by field, so how the arrangement was written down (its keys' order) doesn't matter.
 */
export function sameArrangement<G extends string>(a: Arrangement<G>, b: Arrangement<G>): boolean {
  const sameList = (x: readonly G[], y: readonly G[]): boolean => x.length === y.length && x.every((g, i) => g === y[i]);
  // Both ways, so a repeated id on one side can't stand in for a missing one (["a", "a"] is not ["a", "b"]).
  const sameSet = (x: readonly G[], y: readonly G[]): boolean => x.length === y.length && x.every((g) => y.includes(g)) && y.every((g) => x.includes(g));
  if (!HOSTS.every((h) => ZONES.every((zn) => sameList(a[h][zn], b[h][zn])))) return false;
  if (!sameSet(a.collapsed, b.collapsed)) return false;
  if (!sameSet(a.floating.map((f) => f.id), b.floating.map((f) => f.id))) return false;
  return a.floating.every((f) => {
    const o = b.floating.find((x) => x.id === f.id);
    return !!o && o.x === f.x && o.y === f.y && samePlace(o.from, f.from);
  });
}

/** Dropping `g` at `place` changes nothing: it is the group's own place, its home, never a target. */
export const isOwnPlace = <G extends string>(a: Arrangement<G>, g: G, place: Place): boolean => sameArrangement(insertGroup(a, g, place.host, place.zone, place.index), a);

// --- stored arrangements -------------------------------------------------------------------------------------------

/** An arrangement as stored: version 1. */
export interface StoredArrangement<G extends string = string> {
  readonly v: 1;
  readonly hosts: Readonly<Record<HostId, Readonly<Record<ZoneId, readonly G[]>>>>;
  readonly collapsed: readonly G[];
  readonly floating: readonly { readonly id: G; readonly x: number; readonly y: number; readonly from: Place | null }[];
}

/** What reading a stored arrangement gives: the arrangement, or why it couldn't be read. Never a throw. */
export type ArrangementRead<G extends string = string> = { readonly ok: true; readonly arrangement: Arrangement<G> } | { readonly ok: false; readonly error: string };

/** The arrangement as plain data with its version, ready for `JSON.stringify`. */
export function storeArrangement<G extends string>(a: Arrangement<G>): StoredArrangement<G> {
  const hosts = Object.fromEntries(HOSTS.map((h) => [h, Object.fromEntries(ZONES.map((zn) => [zn, [...a[h][zn]]]))])) as unknown as Record<HostId, Record<ZoneId, G[]>>;
  return { v: 1, hosts, collapsed: [...a.collapsed], floating: a.floating.map((f) => ({ id: f.id, x: f.x, y: f.y, from: f.from ? { ...f.from } : null })) };
}

/**
 * A stored arrangement read back from parsed data (`JSON.parse`'s result, not the string). Anything else gives
 * `{ ok: false, error }`, never a throw: an unknown version, a missing host or zone, a value of the wrong kind, a
 * group in two places, or (with `groups`) a group the consumer doesn't have. A group the consumer has but the stored
 * arrangement lacks is no error: the consumer places it (`resetGroup` with its default arrangement, say).
 */
export function readArrangement<G extends string = string>(data: unknown, groups?: readonly G[]): ArrangementRead<G> {
  const fail = (error: string): ArrangementRead<G> => ({ ok: false, error });
  const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
  if (!isObject(data)) return fail("not an object");
  // Named without serialising it: a BigInt or a circular value must not throw.
  if (data.v !== 1) return fail(`unknown version ${typeof data.v === "number" || typeof data.v === "string" ? String(data.v) : typeof data.v} (this reads version 1)`);
  const seen = new Set<string>();
  const ids = (x: unknown, where: string, placed: boolean): G[] | string => {
    if (!Array.isArray(x) || !x.every((g) => typeof g === "string")) return `${where} is not a list of group ids`;
    for (const g of x as string[]) {
      if (groups && !(groups as readonly string[]).includes(g)) return `${where} has an unknown group "${g}"`;
      if (placed && seen.has(g)) return `group "${g}" is in two places`;
      if (placed) seen.add(g);
    }
    return x as G[];
  };
  if (!isObject(data.hosts)) return fail("hosts is missing");
  const hosts = {} as Record<HostId, Zones<G>>;
  for (const h of HOSTS) {
    const zones = data.hosts[h];
    if (!isObject(zones)) return fail(`host ${h} is missing`);
    const out = {} as Record<ZoneId, readonly G[]>;
    for (const zn of ZONES) {
      const list = ids(zones[zn], `${h}.${zn}`, true);
      if (typeof list === "string") return fail(list);
      out[zn] = list;
    }
    hosts[h] = out;
  }
  const collapsed = ids(data.collapsed, "collapsed", false);
  if (typeof collapsed === "string") return fail(collapsed);
  if (!Array.isArray(data.floating)) return fail("floating is not a list");
  const floating: Floating<G>[] = [];
  for (const f of data.floating as unknown[]) {
    if (!isObject(f) || typeof f.id !== "string" || typeof f.x !== "number" || typeof f.y !== "number" || !Number.isFinite(f.x) || !Number.isFinite(f.y)) return fail("a floating group is not { id, x, y, from }");
    const id = ids([f.id], "floating", true);
    if (typeof id === "string") return fail(id);
    const from = f.from;
    const place = from === null || from === undefined ? null : isObject(from) && HOSTS.includes(from.host as HostId) && ZONES.includes(from.zone as ZoneId) && Number.isInteger(from.index) && (from.index as number) >= 0 ? { host: from.host as HostId, zone: from.zone as ZoneId, index: from.index as number } : undefined;
    if (place === undefined) return fail(`floating group "${f.id}" has a bad home`);
    floating.push({ id: id[0]!, x: f.x, y: f.y, from: place });
  }
  return { ok: true, arrangement: { ...hosts, collapsed, floating } };
}

// --- a host's layout -----------------------------------------------------------------------------------------------

/** A host's room: its length and thickness, and what its ends keep for themselves (window controls, a margin). */
export interface HostSpec<G extends string = string> {
  readonly length: number;
  readonly thickness: number;
  readonly lead: number;
  readonly tail: number;
  /**
   * The centre zone's minimum length and its margin on each side, counted in the need whether it holds groups or
   * not (an empty centre keeps its drop size). Unset: the centre counts only its groups.
   */
  readonly center?: { readonly min: number; readonly margin: number };
  /**
   * How long each group keeps its full form when room runs out (default 0): groups with a lower keep collapse
   * first, and among equal keeps the trailing end goes first. A primary group at the end keeps open with a keep of 1.
   */
  readonly keep?: Readonly<Partial<Record<G, number>>>;
}

/** A group's size in a host, expanded or collapsed: along it (`along`) and across it (`across`). */
export type GroupSize<G extends string = string> = (id: G, vertical: boolean, collapsed: boolean) => { along: number; across: number };

export interface HostLayout<G extends string = string> {
  /** Each group's rect in the host (x along, y across for a horizontal host; transposed on a side). */
  readonly slots: ReadonlyMap<G, Rect>;
  /** Groups shown collapsed (by hand, or because the room ran out). */
  readonly collapsed: readonly G[];
  /** Of those, the ones the room collapsed (from the trailing end). */
  readonly overflow: readonly G[];
  /** The length the groups and the ends take. */
  readonly need: number;
}

/** How long the host's groups need it to be, collapsing only those in `collapsed`. */
export function hostNeed<G extends string>(zones: Zones<G>, collapsed: readonly G[], spec: Pick<HostSpec, "lead" | "tail" | "center">, size: GroupSize<G>, v: boolean): number {
  const lens = ZONES.map((zn) => zones[zn].reduce((s, g) => s + size(g, v, collapsed.includes(g)).along, 0) + GAP * Math.max(0, zones[zn].length - 1));
  const used = ZONES.filter((zn) => zones[zn].length > 0).length;
  const c = spec.center;
  if (!c) return spec.lead + spec.tail + lens.reduce((s, x) => s + x, 0) + ZONE_GAP * Math.max(0, used - 1);
  // The centre always counts, at its minimum at least, and its margins keep it apart from the start and end zones.
  return spec.lead + spec.tail + lens[0]! + lens[2]! + Math.max(lens[1]!, c.min) + 2 * c.margin;
}

/**
 * Lay a host out: zones along its length; when they don't fit, groups collapse, the lowest keep first and, among
 * equal keeps, from the trailing end.
 */
export function layoutHost<G extends string>(zones: Zones<G>, h: HostId, spec: HostSpec<G>, size: GroupSize<G>, byHand: readonly G[] = []): HostLayout<G> {
  const v = vertical(h);
  const collapsed = new Set<G>(ZONES.flatMap((zn) => zones[zn]).filter((g) => byHand.includes(g)));
  const overflow: G[] = [];
  const len = (g: G): number => size(g, v, collapsed.has(g)).along;
  const zoneLen = (l: readonly G[]): number => l.reduce((s, g) => s + len(g), 0) + GAP * Math.max(0, l.length - 1);
  const needNow = (): number => hostNeed(zones, [...collapsed], spec, size, v);
  // The lowest keep first; among equal keeps the trailing end first: the end zone's last group, back to the start
  // zone's first (the sort is stable).
  const keep = (g: G): number => spec.keep?.[g] ?? 0;
  const order = [...ZONES].reverse().flatMap((zn) => [...zones[zn]].reverse());
  for (const g of order.sort((x, y) => keep(x) - keep(y))) {
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
  const slots = new Map<G, Rect>();
  const place = (l: readonly G[], from: number): void => {
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
export interface Insertion extends Place {
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
 * (start), middle third (centre) or last third (end), less what its neighbours' groups take. `label` names a group
 * in the "between" labels (default: its id).
 */
export function insertions<G extends string>(zones: Zones<G>, h: HostId, spec: HostSpec<G>, l: HostLayout<G>, label: (g: G) => string = (g) => g): Insertion[] {
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
    for (let k = 1; k < vis.length; k++) near.push({ host: h, zone: zn, index: vis[k]!.i, at: (hi(vis[k - 1]!.r) + lo(vis[k]!.r)) / 2, empty: false, label: `${name} · between ${label(vis[k - 1]!.g)} and ${label(vis[k]!.g)}` });
    near.push({ host: h, zone: zn, index: zones[zn].length, at: hi(vis.at(-1)!.r) + GAP / 2, empty: false, label: `${name} · after all` });
  }
  near.sort((a, b) => a.at - b.at);
  const lines = near.map((p, k) => ({ ...p, span: [k === 0 ? 0 : (near[k - 1]!.at + p.at) / 2, k === near.length - 1 ? L : (p.at + near[k + 1]!.at) / 2] as const }));
  return [...lines, ...empties];
}
