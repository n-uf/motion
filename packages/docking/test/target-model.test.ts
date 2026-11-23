/**
 * The target model's property check: over generated windows (edge kinds × empty or occupied × item kinds ×
 * sides × insets × side bars), every point inside an edge that takes the dragged kind maps to exactly one target or
 * refusal of that edge (no hole, no overlap), in the point's own zone; the item's own rect maps only to home; and every
 * docked target's slot is its landing.
 */
import { describe, expect, it } from "vitest";
import { area, subtract } from "@n-uf/placement";
import { SPOT_PITCH, lanes, liftItem, markUsed, moveTo, parseTargetId, refusals, solve, stops, targets, zoneTakes, type DockState, type DockItem, type DockLayout, type DockDrop, type Zone } from "../src";
import { lostSlots, opensEmpty, targetZones, zoneExtents } from "../src/targets";
import type { Ownership } from "../src/targets/ownership";
import { clipTiles } from "../src/targets/tiles";
import { targetAt } from "@n-uf/motion/drag";
import { modelState } from "./model-window";
import { bar, byId, column, fixedKeepClear, form, group, panel, seeded, windowState } from "./fixture";

type R = { x: number; y: number; width: number; height: number };
const ORIGIN_PT = { x: 0, y: 0 };
/** A panel column (cut by halves of its panels), not a bar or a toolbar rail (cut by landings). */
const byHalves = (e: { side: string; compact?: boolean }): boolean => (e.side === "left" || e.side === "right") && !e.compact;
/** Two rects overlap along an edge's axis by more than half a pixel. */
const overlapsAlong = (a: R, b: R, vertical: boolean): boolean => (vertical ? a.y < b.y + b.height - 0.5 && b.y < a.y + a.height - 0.5 : a.x < b.x + b.width - 0.5 && b.x < a.x + a.width - 0.5);
/** Half-open, so two tiles that meet share no point. */
const inside = (r: R, p: { x: number; y: number }): boolean => p.x >= r.x - 1e-9 && p.x < r.x + r.width - 1e-9 && p.y >= r.y - 1e-9 && p.y < r.y + r.height - 1e-9;
/** A target's zone: its pieces (`hits`) when it has them, else its `hit`. */
const zoneOfT = (t: { hit: R; hits?: readonly R[] }): readonly R[] => t.hits ?? [t.hit];
const inTarget = (t: { hit: R; hits?: readonly R[] }, p: { x: number; y: number }): boolean => zoneOfT(t).some((r) => inside(r, p));
const same = (a: R, b: R): boolean => Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) < 0.01 && Math.abs(a.width - b.width) < 0.01 && Math.abs(a.height - b.height) < 0.01;

export { modelState };

/** The categories a point can fail by. */
type Failure = "hole" | "overlap" | "other-zone" | "own-not-home" | "slot-not-landing" | "duplicate-id" | "virtual-hole" | "virtual-overlap" | "refusal-order" | "lost-slot" | "refused-owns" | "seen-hole" | "seen-refused" | "beside-own-not-home" | "aim-order" | "strip-owned" | "refused-edge-drawn" | "min-hit";

/** The edge a target or refusal belongs to, and its zone (null: no zone). */
function edgeZoneOf(s: DockState, l: DockLayout, id: string, t: DockDrop): { edge: string | null; zone: Zone | null } {
  const p = t.place;
  if (p.kind === "gap") return { edge: p.edge, zone: p.zone };
  if (p.kind === "home") {
    // A home target's edge is the dragged item's own; its zone is the item's.
    const m = /^(?:gap|strip):([^:]+):(start|center|end)/.exec(t.id);
    if (m) return { edge: m[1]!, zone: m[2] as Zone };
    const it = l.items[id];
    return { edge: it?.edge ?? null, zone: (s.items[id]?.align as Zone | undefined) ?? "start" };
  }
  return { edge: null, zone: null };
}

/** Runs the check over `seeds`; returns the failure counts per category and a few examples. */
export function propertyCheck(seeds: readonly number[], flush = false, middle = false, railDrop = false): { points: number; aimPoints: number; stripPoints: number; counts: Record<Failure, number>; examples: string[] } {
  const counts: Record<Failure, number> = { hole: 0, overlap: 0, "other-zone": 0, "own-not-home": 0, "slot-not-landing": 0, "duplicate-id": 0, "virtual-hole": 0, "virtual-overlap": 0, "refusal-order": 0, "lost-slot": 0, "refused-owns": 0, "seen-hole": 0, "seen-refused": 0, "beside-own-not-home": 0, "aim-order": 0, "strip-owned": 0, "refused-edge-drawn": 0, "min-hit": 0 };
  const examples: string[] = [];
  const fail = (k: Failure, msg: string): void => {
    counts[k]++;
    if (examples.length < 40) examples.push(`${k}: ${msg}`);
  };
  let points = 0;
  // The points the aim-order category samples (counted in `points` too).
  let aimPoints = 0;
  // The points the strip-owned category samples (counted in `points` too).
  let stripPoints = 0;
  for (const seed of seeds) {
    const s = modelState(seed, flush, middle, railDrop);
    const now = solve(s);
    for (const id of Object.keys(s.items)) {
      const it = s.items[id]!;
      if (it.fixed || it.closed) continue;
      // `home:<id>` is an alias of home's tile, for hosts that read it (home's only tile when no slot is home).
      const all = targets(s, id).filter((t) => !t.free);
      const slotHome = all.some((t) => t.place.kind === "home" && !t.id.startsWith("home:"));
      const ts = all.filter((t) => !(slotHome && t.id.startsWith("home:")));
      const rs = refusals(s, id);
      // The zone `lanes()` docks the item in at a point of an edge (home: its own zone), asked only where needed.
      let laneRegions: ReturnType<typeof lanes> | null = null;
      const laneZoneAt = (edgeId: string, pt: { x: number; y: number }): Zone | null => {
        laneRegions ??= lanes(s, id);
        const ln = laneRegions.lanes.find((l) => l.id === edgeId);
        const a = ln?.axis === "x" ? pt.x : pt.y;
        const sp = ln?.spots.find((x) => a >= x.along[0] && a <= x.along[1]);
        if (!sp) return null;
        const l = sp.home && !sp.slide ? now : sp.target.after(pt).layout;
        return l.items[id]?.edge === edgeId ? (l.items[id]?.zone ?? "start") : null;
      };
      // A rail drop strip owns its rect: every point in it maps to one rail target, never to a refusal or another target.
      // The other categories sample only outside the strips.
      const strips = [...new Map(all.filter((t) => t.strip).map((t) => [JSON.stringify(t.strip), t.strip!])).values()];
      const inStrip = (pt: { x: number; y: number }): boolean => strips.some((r) => inside(r, pt));
      for (const r of strips)
        for (let x = r.x + 2; x < r.x + r.width - 1; x += 6)
          for (let y = r.y + 3; y < r.y + r.height - 1; y += 9) {
            const pt = { x, y };
            points++;
            stripPoints++;
            const hits = [...ts.filter((t) => inTarget(t, pt)).map((t) => t.id), ...rs.filter((x) => inTarget(x, pt)).map((x) => x.id)];
            if (hits.length !== 1 || !hits[0]!.startsWith("rail:")) fail("strip-owned", `seed ${seed} drag ${id} at ${x.toFixed(0)},${y.toFixed(0)}: ${hits.join(", ") || "nothing"}`);
          }
      // Every slot the filter keeps, with room in its zone, keeps a hit; on a bar or a toolbar rail, where the pointer
      // takes the nearest landing, a gap whose landing is never the nearest has none, and is a stop all the same: at
      // every point along its edge another place's landing is at least as near.
      const stopsNow = stops(s, id);
      for (const x of lostSlots(s, id)) {
        const p = parseTargetId(x);
        const edge = p?.kind === "gap" ? s.edges.find((e) => e.id === p.edge) : undefined;
        const lostStop = stopsNow.find((t) => t.id === x);
        const le = edge && now.edges[edge.id];
        if (edge && !byHalves(edge) && lostStop?.slot && le) {
          const v = edge.side === "left" || edge.side === "right";
          const span = (r: R): [number, number] => (v ? [r.y, r.y + r.height] : [r.x, r.x + r.width]);
          const dAt = (r: R, q: number): number => Math.max(0, span(r)[0] - q, q - span(r)[1]);
          const others = [...stopsNow.filter((t) => t.id !== x && t.place.kind === "gap" && t.place.edge === edge.id && t.slot).map((t) => t.slot!), ...(now.items[id]?.edge === edge.id ? [now.items[id]!.rect] : [])];
          const [e0, e1] = span(le.rect);
          let nearer: number | null = null;
          for (let q = e0 + 0.5; q < e1 && nearer === null; q += 3) if (dAt(lostStop.slot, q) + 0.5 < Math.min(...others.map((r) => dAt(r, q)))) nearer = q;
          if (nearer === null) continue;
          // (A free stretch over zones is one place in the edge's order: another zone's gap of that order holds it. Which
          // zone docks it there is the zone extents' question, not the aim order's.)
          const orderOf = (l: DockLayout): string =>
            Object.entries(l.items)
              .filter(([, it]) => it.edge === edge.id && !it.inMenu && !it.floating && it.rect.width >= 1 && it.rect.height >= 1)
              .sort(([, a], [, b]) => span(a.rect)[0] - span(b.rect)[0])
              .map(([k]) => k)
              .join(" ");
          const mineOrder = orderOf(lostStop.after(ORIGIN_PT).layout);
          if (all.some((t) => t.place.kind === "gap" && t.place.edge === edge.id && orderOf(t.after(ORIGIN_PT).layout) === mineOrder)) continue;
          if (mineOrder === orderOf(now) && all.some((t) => t.place.kind === "home")) continue;
          fail("lost-slot", `seed ${seed} drag ${id} ${x}: its landing is the nearest at ${nearer.toFixed(1)}, yet no pointer reaches it`);
          continue;
        }
        fail("lost-slot", `seed ${seed} drag ${id} ${x}`);
      }
      // A target is a place a pointer can be: a zone under 1 px each way, or 1 px² in all, is as good as lost.
      for (const t of all) {
        const pieces = zoneOfT(t);
        if (pieces.some((p) => p.width < 1 || p.height < 1) || pieces.reduce((n, p) => n + p.width * p.height, 0) < 1) fail("lost-slot", `seed ${seed} drag ${id} ${t.id}: a sub-pixel hit ${JSON.stringify(t.hit)}`);
      }
      // Every point is sampled in the seen geometry: the layout as it is now, the item in place.
      const seen = now;
      // Ids are unique per call: every target's, and every refusal's.
      for (const ids of [all.map((t) => t.id), rs.map((x) => x.id)]) {
        const twice = ids.filter((x, i) => ids.indexOf(x) !== i);
        if (twice.length) fail("duplicate-id", `seed ${seed} ${id} ${twice.join(", ")}`);
      }
      // A zone's refusals are numbered by where they lie along the edge: `refuse:<edge>:<zone>`, then `:1`, `:2`, …
      for (const r of rs) {
        const n = r.id === `refuse:${r.edge}:${r.zone}` ? 0 : Number(r.id.slice(`refuse:${r.edge}:${r.zone}:`.length));
        const side = s.edges.find((e) => e.id === r.edge)?.side;
        const vertical = side ? side === "left" || side === "right" : r.edge.startsWith("rail:");
        const at = (x: typeof r): [number, number] => (vertical ? [x.hit.y, x.hit.x] : [x.hit.x, x.hit.y]);
        const earlier = (x: typeof r): boolean => at(x)[0] < at(r)[0] || (at(x)[0] === at(r)[0] && at(x)[1] < at(r)[1]);
        const before = rs.filter((x) => x.edge === r.edge && x.zone === r.zone && earlier(x)).length;
        if (n !== before) fail("refusal-order", `seed ${seed} ${id} ${r.id} is number ${before} along its edge`);
      }
      // A refused place owns nothing against other edges: a side's rail that refuses every drop of the item (it offers
      // no rail target) changes no other target. Without it (its rail not taking the kind) every other target is the same.
      for (const side of ["left", "right"] as const) {
        if (!s.rails?.[side]?.accepts.includes(it.kind) || !s.columns?.[side]?.accepts.includes(it.kind)) continue;
        if (!rs.some((r) => r.edge === `rail:${side}`) || all.some((t) => t.id.startsWith(`rail:${side}:`))) continue;
        const rails = { ...s.rails, [side]: { ...s.rails[side]!, accepts: s.rails[side]!.accepts.filter((k) => k !== it.kind) } };
        const key = (list: readonly DockDrop[]): string => JSON.stringify(list.map((t) => [t.id, t.hit]));
        if (key(all) !== key(targets({ ...s, rails }, id).filter((t) => !t.free))) fail("refused-owns", `seed ${seed} drag ${id}: the refused rail:${side} moves other targets`);
      }
      // A refusal owns nothing, whether its zone has targets or not: it never lies on another edge's drawn rect (as
      // seen, the item in place; an edge's lifted rect, which a preview may show, is not what owns space),
      // nor on any piece of a target's hit.
      const meets = (a: R, b: R): boolean => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1e-6 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1e-6;
      for (const r of rs) {
        for (const p of zoneOfT(r)) {
          for (const t of all) for (const h of t.hits ?? [t.hit]) if (meets(p, h)) fail("refused-owns", `seed ${seed} drag ${id}: ${r.id} lies on ${t.id}`);
          for (const [eid, e] of Object.entries(seen.edges)) {
            if (eid === r.edge || e.rect.width <= 1e-6 || e.rect.height <= 1e-6) continue;
            if (meets(p, e.rect)) fail("refused-owns", `seed ${seed} drag ${id}: ${r.id} lies on ${eid}`);
          }
        }
      }
      // A refusal matches what is drawn: an edge that takes the kind in no zone gives one refusal, `refuse:<edge>:start`,
      // whose pieces (`hits`, else `hit`) are its drawn rect in the stage less what the targets own, every piece at least
      // 1 px each way and `hit` the largest; every refusal lies in the stage, and a zone's refusal on a real edge never runs
      // past the edge's ends.
      for (const r of rs) {
        for (const p of zoneOfT(r)) {
          const out = p.x < s.stage.x - 1e-6 || p.y < s.stage.y - 1e-6 || p.x + p.width > s.stage.x + s.stage.width + 1e-6 || p.y + p.height > s.stage.y + s.stage.height + 1e-6;
          if (out) fail("refused-edge-drawn", `seed ${seed} drag ${id}: ${r.id} reaches past the stage`);
          const e = s.edges.find((x) => x.id === r.edge);
          const d = e && seen.edges[e.id]?.rect;
          if (!e || !d || d.width < 1e-6 || d.height < 1e-6) continue;
          const v = e.side === "left" || e.side === "right";
          const past = v ? p.y < d.y - 1e-6 || p.y + p.height > d.y + d.height + 1e-6 : p.x < d.x - 1e-6 || p.x + p.width > d.x + d.width + 1e-6;
          if (past) fail("refused-edge-drawn", `seed ${seed} drag ${id}: ${r.id} runs past ${e.id}'s ends`);
        }
      }
      for (const e of s.edges) {
        const d = seen.edges[e.id]?.rect;
        if (!d || d.width < 1e-6 || d.height < 1e-6 || (["start", "center", "end"] as const).some((z) => zoneTakes(e, z, it.kind))) continue;
        const x0 = Math.max(d.x, s.stage.x);
        const y0 = Math.max(d.y, s.stage.y);
        const shown = { x: x0, y: y0, width: Math.min(d.x + d.width, s.stage.x + s.stage.width) - x0, height: Math.min(d.y + d.height, s.stage.y + s.stage.height) - y0 };
        if (shown.width <= 1e-6 || shown.height <= 1e-6) continue;
        const want = all
          .flatMap((t) => t.hits ?? [t.hit])
          .reduce<R[]>((ps, cut) => ps.flatMap((p) => subtract(p, cut)), [shown])
          .filter((p) => p.width >= 1 && p.height >= 1);
        const mine = rs.filter((r) => r.edge === e.id);
        const r = mine[0];
        const pieces = r ? zoneOfT(r) : [];
        const largestOk = !r || pieces.every((p) => area(p) <= area(r.hit) + 1e-9);
        // The pieces cover what is left, piece by piece (cut up the same way or not): every `want` piece less the union
        // of the pieces leaves at most a 1 px rim. And they lie inside it, apart.
        const within = pieces.every((p) => p.x >= shown.x - 1e-6 && p.y >= shown.y - 1e-6 && p.x + p.width <= shown.x + shown.width + 1e-6 && p.y + p.height <= shown.y + shown.height + 1e-6);
        const apart = pieces.every((p, i) => pieces.every((q, j) => i === j || !meets(p, q)));
        const covers = want.every((w) => pieces.reduce<R[]>((ps, cut) => ps.flatMap((p) => subtract(p, cut)), [w]).every((rest) => Math.min(rest.width, rest.height) <= 1 + 1e-6));
        if (mine.length !== (want.length ? 1 : 0) || (r && (r.id !== `refuse:${e.id}:start` || !covers || !within || !apart || !largestOk || pieces.some((p) => p.width < 1 || p.height < 1))))
          fail("refused-edge-drawn", `seed ${seed} drag ${id}: ${e.id} refuses as ${JSON.stringify(mine.map((x) => [x.id, zoneOfT(x)]))}, drawn ${JSON.stringify(want)}`);
      }
      // And a bar's zone that refuses every drop of the item (no target of that zone) changes no other target; without
      // it (the zone not taking the kind) every target is the same.
      for (const e of s.edges) {
        if ((e.side !== "top" && e.side !== "bottom") || !e.accepts.includes(it.kind)) continue;
        for (const z of ["start", "center", "end"] as const) {
          if (!rs.some((r) => r.edge === e.id && r.zone === z) || all.some((t) => t.id.startsWith(`gap:${e.id}:${z}:`) || t.id === `strip:${e.id}:${z}`)) continue;
          const zoneAccepts = Object.fromEntries((["start", "center", "end"] as const).map((x) => [x, x === z ? [] : (e.zoneAccepts?.[x] ?? e.accepts)]));
          const s2: DockState = { ...s, edges: s.edges.map((x) => (x === e ? { ...x, zoneAccepts } : x)) };
          const key = (list: readonly DockDrop[]): string => JSON.stringify(list.map((t) => [t.id, t.hit]));
          if (key(all) !== key(targets(s2, id).filter((t) => !t.free))) fail("refused-owns", `seed ${seed} drag ${id}: the refused zone ${e.id}:${z} moves other targets`);
        }
      }
      // A reachable minimum: every docked target's largest piece is 12 px across by 24 px along, or the space it would
      // need beside it, in its own zone, is taken (another target, a refusal, the chrome, past the stage, or, but for a
      // column line, another drawn edge). Checked each way: the narrow side to 12, the long side to 24, each by a strip
      // of its whole length on one side. Growth over part of the length only (the library's fallback across, where a
      // home band keeps one end) is not asked for here: a unit test below pins it.
      const zones = targetZones(s, id);
      for (const t of all) {
        if (t.place.kind === "home" || t.place.kind === "none" || t.place.kind === "float" || t.strip) continue;
        const l = t.hit;
        if (Math.min(l.width, l.height) >= 12 - 1e-6 && Math.max(l.width, l.height) >= 24 - 1e-6) continue;
        const line = t.place.kind === "column";
        const ownEdge = t.place.kind === "gap" ? t.place.edge : null;
        const taken = [
          ...all.filter((o) => o !== t && !o.free).flatMap((o) => o.hits ?? [o.hit]),
          ...rs.flatMap((r) => r.hits ?? [r.hit]),
          ...fixedKeepClear(s),
          ...(line ? [] : Object.entries(seen.edges).filter(([eid, e]) => eid !== ownEdge && e.rect.width > 1e-6 && e.rect.height > 1e-6).map(([, e]) => e.rect)),
        ];
        const narrowX = l.width <= l.height;
        const zone = zones.get(t.id) ?? [];
        const inZone = (g: R): boolean => !zone.reduce<R[]>((ps, z) => ps.flatMap((p) => subtract(p, z)), [g]).some((p) => area(p) > 1e-6);
        const isFree = (g: R): boolean => inZone(g) && g.x >= s.stage.x - 1e-6 && g.y >= s.stage.y - 1e-6 && g.x + g.width <= s.stage.x + s.stage.width + 1e-6 && g.y + g.height <= s.stage.y + s.stage.height + 1e-6 && !taken.some((r) => meets(r, g));
        // The narrow side short of 12 (across), the long side short of 24 (along): on x when it is the side, else on y.
        for (const [onX, need] of [[narrowX, 12], [!narrowX, 24]] as const) {
          const d = need - (onX ? l.width : l.height);
          if (d <= 1e-6) continue;
          const sides = onX ? [{ ...l, x: l.x - d, width: d }, { ...l, x: l.x + l.width, width: d }] : [{ ...l, y: l.y - d, height: d }, { ...l, y: l.y + l.height, height: d }];
          const free = sides.filter(isFree);
          if (free.length) fail("min-hit", `seed ${seed} drag ${id}: ${t.id} ${JSON.stringify(l)} could take ${JSON.stringify(free[0])}`);
        }
      }
      // Preview = landing, from every piece of a docked target's zone.
      for (const t of ts) {
        if (t.place.kind === "home" || t.place.kind === "none" || !t.slot) continue;
        for (const h of zoneOfT(t)) {
          const landed = t.after({ x: h.x + h.width / 2, y: h.y + h.height / 2 }).layout.items[id]?.rect;
          if (!landed || !same(landed, t.slot)) fail("slot-not-landing", `seed ${seed} ${id} ${t.id}`);
        }
        // `hit` is the largest of the pieces.
        if (t.hits && !t.hits.some((h) => same(h, t.hit) && t.hits!.every((o) => o.width * o.height <= h.width * h.height + 1e-9))) fail("slot-not-landing", `seed ${seed} ${id} ${t.id}: hit isn't its largest piece`);
      }
      // The virtual edges: points either side of each column line, and down the rail where it lies or would lie, map to
      // exactly one target or refusal: never to nothing (a hole the float fills) and never to two.
      const virtualPoints: { x: number; y: number }[] = [];
      for (const side of ["left", "right"] as const) {
        if (!s.columns?.[side]?.accepts.includes(it.kind)) continue;
        const open = s.edges.filter((e) => e.side === side && e.column === true).flatMap((e) => seen.edges[e.id] ?? []).filter((x) => !x.folded && !x.rides && x.cross > 0);
        const xs = open.length ? open.flatMap((x) => [x.rect.x, x.rect.x + x.rect.width]) : [side === "left" ? seen.content.x : seen.content.x + seen.content.width];
        for (const x of xs) for (let y = seen.content.y + 3; y < seen.content.y + seen.content.height - 3; y += 6) virtualPoints.push({ x: x - 11, y }, { x: x + 11, y });
        const rail = seen.rails[side]?.rect ?? seen.railPlaces[side];
        if (!rail || !s.rails?.[side]?.accepts.includes(it.kind)) continue;
        const rx = seen.rails[side] ? rail.x + rail.width / 2 : side === "left" ? rail.x + 5 : rail.x + rail.width - 5;
        for (let y = rail.y + 3; y < rail.y + rail.height - 3; y += 6) virtualPoints.push({ x: rx, y });
      }
      const own = now.items[id];
      const ownRect = own?.edge && !own.floating ? own.rect : null;
      // A panel's body (but for a band at each end) is its column's, and no drop place: the float's.
      // An edge that doesn't take the kind (a thumbnail anchor) refuses its whole seen rect, its item's body included.
      const anyBody = Object.values(seen.items).filter((x) => x.edge && x.formKind === "open" && !x.floating && !!s.edges.find((e) => e.id === x.edge)?.accepts.includes(it.kind)).map((x) => ({ x: x.rect.x, y: x.rect.y + 12, width: x.rect.width, height: x.rect.height - 24 }));
      for (const pt of virtualPoints) {
        // The item's own rect is home's (the own-not-home category checks it).
        if (!inside(s.stage, pt) || inStrip(pt) || fixedKeepClear(s).some((c) => inside(c, pt)) || (ownRect && inside(ownRect, pt)) || anyBody.some((b) => inside(b, pt))) continue;
        points++;
        const hits = [...ts.filter((t) => inTarget(t, pt)).map((t) => t.id), ...rs.filter((x) => inTarget(x, pt)).map((x) => x.id)];
        if (hits.length === 0) fail("virtual-hole", `seed ${seed} drag ${id} at ${pt.x.toFixed(0)},${pt.y.toFixed(0)}`);
        else if (hits.length > 1) fail("virtual-overlap", `seed ${seed} drag ${id} at ${pt.x.toFixed(0)},${pt.y.toFixed(0)}: ${hits.join(", ")}`);
      }
      // What the user sees: until a target shows, the host draws the layout as it is now. Every point under an edge's
      // seen rect, the item's own edge too, maps to a target or a refusal: a stretch is owned by what is seen there, and
      // refuses where its owner has no slot. Panel bodies, fixed items and chrome stay no drop place.
      const fixedRects = Object.values(seen.items).filter((x) => x.fixed).map((x) => x.rect);
      for (const [eid, e] of Object.entries(seen.edges)) {
        if (e.rect.width < 1 || e.rect.height < 1) continue;
        for (let x = e.rect.x + 3; x < e.rect.x + e.rect.width - 1; x += 6)
          for (let y = e.rect.y + 3; y < e.rect.y + e.rect.height - 1; y += 6) {
            const pt = { x, y };
            if (!inside(s.stage, pt) || inStrip(pt) || [...fixedKeepClear(s), ...anyBody, ...fixedRects].some((r) => inside(r, pt)) || (ownRect && inside(ownRect, pt))) continue;
            points++;
            if (!ts.some((t) => inTarget(t, pt)) && !rs.some((r) => inTarget(r, pt))) fail("seen-hole", `seed ${seed} drag ${id} under ${eid} at ${x.toFixed(0)},${y.toFixed(0)}`);
          }
      }
      // A seen card of an edge that takes the kind, in a zone with a fitting slot (a target of that zone), is never a
      // refusal: the user sees the card there, and a drop there has a place.
      for (const [cid, card] of Object.entries(seen.items)) {
        const e = s.edges.find((x) => x.id === card.edge);
        if (cid === id || !e || card.fixed || card.floating || card.inMenu || card.rect.width < 1 || card.rect.height < 1) continue;
        const zone = card.zone ?? "start";
        if (!zoneTakes(e, zone, it.kind) || !ts.some((t) => t.place.kind === "gap" && t.place.edge === e.id && t.place.zone === zone)) continue;
        for (let x = card.rect.x + 3; x < card.rect.x + card.rect.width - 1; x += 6)
          for (let y = card.rect.y + 3; y < card.rect.y + card.rect.height - 1; y += 6) {
            const pt = { x, y };
            if (!inside(s.stage, pt) || inStrip(pt) || [...fixedKeepClear(s), ...fixedRects].some((r) => inside(r, pt)) || (ownRect && inside(ownRect, pt))) continue;
            points++;
            const refused = rs.filter((r) => inTarget(r, pt));
            if (refused.length) fail("seen-refused", `seed ${seed} drag ${id} over ${cid} (${e.id}:${zone}) at ${x.toFixed(0)},${y.toFixed(0)}: ${refused.map((r) => `${r.id}/${r.reason}`).join(", ")}`);
          }
      }
      // The gaps right beside the item's own place (2 and 6 px past either end, in its own zone) are the same move as
      // home: the pick there is home, never the float, nothing, nor another slot of its edge (another edge's owned band,
      // an empty rail's place at the side's boundary, may lie there).
      const ownEdge = own?.edge ? s.edges.find((x) => x.id === own.edge) : undefined;
      const ownSeen = own?.edge ? seen.edges[own.edge] : undefined;
      if (ownRect && ownEdge && ownSeen && !own!.inMenu && zoneTakes(ownEdge, own!.zone ?? "start", it.kind)) {
        const vertical = ownEdge.side === "left" || ownEdge.side === "right";
        const ext = zoneExtents(s, id, ownEdge.id).find((z) => z.zone === (own!.zone ?? "start"));
        const [o0, o1] = vertical ? [ownRect.y, ownRect.y + ownRect.height] : [ownRect.x, ownRect.x + ownRect.width];
        const others = Object.entries(seen.items).filter(([oid, x]) => oid !== id && x.edge !== ownEdge.id && !x.floating).map(([, x]) => x.rect);
        for (const along of [o0 - 2, o0 - 6, o1 + 2, o1 + 6])
          for (const f of [0.25, 0.5, 0.75]) {
            const pt = vertical ? { x: ownRect.x + ownRect.width * f, y: along } : { x: along, y: ownRect.y + ownRect.height * f };
            if (!ext || along < ext.a || along >= ext.b || !inside(ownSeen.rect, pt) || !inside(s.stage, pt) || inStrip(pt) || [...fixedKeepClear(s), ...fixedRects, ...others].some((r) => inside(r, pt))) continue;
            points++;
            const picked = targetAt(all, pt) as DockDrop | null;
            // On a bar or a toolbar rail the pointer takes the nearest landing: beside the own place a gap of its edge
            // is right where its landing is as near the point as the own rect, or overlaps it (the grab cuts there).
            const dAlong = (r: R): number => (vertical ? Math.max(0, r.y - pt.y, pt.y - r.y - r.height) : Math.max(0, r.x - pt.x, pt.x - r.x - r.width));
            const nearer = !byHalves(ownEdge) && !!picked?.slot && (dAlong(picked.slot) <= dAlong(ownRect) + 1 || overlapsAlong(picked.slot, ownRect, vertical));
            const ownEdgeSlot = picked?.place.kind === "gap" && picked.place.edge === ownEdge.id && !nearer;
            if (!picked || picked.free || ownEdgeSlot) fail("beside-own-not-home", `seed ${seed} drag ${id} at ${pt.x.toFixed(0)},${pt.y.toFixed(0)}: ${picked?.id ?? "nothing"}${rs.some((r) => inTarget(r, pt)) ? " (refused)" : ""}`);
          }
      }
      // Aim order: on every occupied edge that takes the kind, the item taken out, a point over a remaining item picks a
      // place beside it: in a panel column its leading half "before it" and its trailing half "after it"; on a bar or a
      // toolbar rail whichever of the two lands nearer the point (the nearest landing). The pick there lands the item in
      // that order among the edge's shown items, or is home where that order is the one seen now. A refusal is right
      // only where no target of the edge makes that order.
      for (const e of s.edges) {
        const le = seen.edges[e.id];
        if (!e.accepts.includes(it.kind) || !le || le.folded || le.rides || !liftItem(s, id).edges.some((x) => x.id === e.id)) continue;
        const vertical = e.side === "left" || e.side === "right";
        const along = (r: R): [number, number] => (vertical ? [r.y, r.y + r.height] : [r.x, r.x + r.width]);
        const shownOn = (l: DockLayout): string[] =>
          Object.entries(l.items)
            .filter(([, x]) => x.edge === e.id && !x.inMenu && !x.floating && !x.fixed && x.rect.width >= 1 && x.rect.height >= 1)
            .sort(([, a], [, b]) => along(a.rect)[0] - along(b.rect)[0])
            .map(([iid]) => iid);
        const seenOrder = shownOn(seen);
        const others = seenOrder.filter((x) => x !== id);
        const makes = (t: DockDrop, aimed: readonly string[], pt: { x: number; y: number }): boolean => {
          const o = shownOn(t.after(pt).layout);
          return o.includes(id) && aimed.filter((x) => o.includes(x)).join() === o.join();
        };
        others.forEach((nb, n) => {
          const card = seen.items[nb]!;
          if (!zoneTakes(e, card.zone ?? "start", it.kind)) return;
          const [c0, c1] = along(card.rect);
          // An open panel's body is no drop place: its halves are aimed at in the bands at its ends.
          const offs: [number, number] = card.formKind === "open" ? [6, c1 - c0 - 6] : [(c1 - c0) * 0.25, (c1 - c0) * 0.75];
          offs.forEach((off, half) => {
            const pt = vertical ? { x: card.rect.x + card.rect.width / 2, y: c0 + off } : { x: c0 + off, y: card.rect.y + card.rect.height / 2 };
            if (!inside(s.stage, pt) || inStrip(pt) || [...fixedKeepClear(s), ...fixedRects].some((r) => inside(r, pt))) return;
            points++;
            aimPoints++;
            const orderAt = (i: number): string[] => [...others.slice(0, i), id, ...others.slice(i)];
            const picked = targetAt(all, pt) as DockDrop | null;
            const at = `seed ${seed} drag ${id} ${half ? "after" : "before"} ${nb} on ${e.id} at ${pt.x.toFixed(0)},${pt.y.toFixed(0)}: ${picked?.id ?? "nothing"}`;
            const mine = (t: DockDrop | null): boolean => t?.place.kind === "gap" && t.place.edge === e.id;
            // Another edge owns the point (space ownership: an empty bar's band over a column's top, a column line's
            // band over a narrow column): its pick, not this edge's.
            if (picked && !picked.free && !mine(picked) && picked.place.kind !== "home") return;
            // The aim: in a panel column the half (leading: before it; trailing: after it). On a bar or a toolbar rail
            // the nearest landing of the two places beside the neighbor, either where they are as near or overlap
            // (the grab decides there: `aimCut`).
            const halves = (e.side === "left" || e.side === "right") && !e.compact;
            const landings = (aimedOrder: readonly string[]): R[] =>
              [...(aimedOrder.join() === seenOrder.join() && ownRect ? [ownRect] : []), ...ts.filter((t) => mine(t) && makes(t, aimedOrder, pt)).flatMap((t) => (t.after(pt).layout.items[id] ? [t.after(pt).layout.items[id]!.rect] : []))];
            const p = vertical ? pt.y : pt.x;
            const dist = (rs: readonly R[]): number => Math.min(...rs.map((r) => Math.max(0, along(r)[0] - p, p - along(r)[1])));
            if (!halves) {
              // The nearest landing of every place of the edge (its own rect for home): the pick's is one of the
              // nearest, or overlaps one (two overlapping landings are cut at the grab).
              const all = [...(ownRect && seenOrder.includes(id) ? [ownRect] : []), ...ts.filter((t) => mine(t) && t.slot).map((t) => t.slot!)];
              const best = dist(all);
              const nearest = all.filter((r) => dist([r]) <= best + 2);
              // The pick's place is its order: of the places that make it (zones apart, home's own rect), the nearest.
              const pickOrder = picked?.place.kind === "home" ? seenOrder : mine(picked) ? shownOn(picked!.after(pt).layout) : null;
              const pickLandings = pickOrder ? landings(pickOrder) : [];
              const overlapsNearest = pickLandings.some((l) => nearest.some((r) => along(r)[0] < along(l)[1] - 0.5 && along(l)[0] < along(r)[1] - 0.5));
              // (An overlap is cut at the grab, kept within half a pitch of it: the pick's landing no further than that.)
              if (!pickLandings.length || (dist(pickLandings) > best + 2 && !(overlapsNearest && dist(pickLandings) <= SPOT_PITCH / 2))) fail("aim-order", `${at} (its order's nearest landing ${pickLandings.length ? dist(pickLandings).toFixed(1) : "none"} px away, the nearest ${best.toFixed(1)} px)`);
              return;
            }
            const aims = [orderAt(n + half)];
            const wants = aims.map((a) => a.join(" ")).join(" or ");
            if (aims.some((a) => a.join() === seenOrder.join()) && picked?.place.kind === "home") return;
            if (aims.every((a) => a.join() === seenOrder.join())) {
              fail("aim-order", `${at} (want home)`);
              return;
            }
            if (mine(picked) && aims.some((a) => makes(picked!, a, pt))) return;
            // Not this edge's slot of that order: right only where none of its targets makes the order.
            if (mine(picked) || aims.some((a) => a.join() !== seenOrder.join() && ts.some((t) => mine(t) && makes(t, a, pt)))) fail("aim-order", `${at} (want ${wants})`);
          });
        });
      }
      for (const e of s.edges) {
        if (!e.accepts.includes(it.kind)) continue;
        const le = seen.edges[e.id];
        // An edge the lift deletes (the item's own column, a dynamic column left empty) offers no place: its seen rect
        // is home's (the own rect) or nothing.
        if (!le || le.folded || le.rides || !liftItem(s, id).edges.some((x) => x.id === e.id)) continue;
        // An empty edge that doesn't open to the kind (a tray column to a toolbar) has no tiles for it.
        if (le.stack.items.length === 0 && !opensEmpty(s, e, it.kind)) continue;
        const vertical = e.side === "left" || e.side === "right";
        // The edge's band: its seen rect, at least 12 px deep inward (an empty edge has none).
        const r = le.rect;
        const depth = Math.max(vertical ? r.width : r.height, 12);
        const band: R = vertical
          ? { x: e.side === "left" ? r.x : r.x + r.width - depth, y: r.y, width: depth, height: r.height }
          : { x: r.x, y: e.side === "top" ? r.y : r.y + r.height - depth, width: r.width, height: depth };
        const len = vertical ? band.height : band.width;
        const a0 = vertical ? band.y : band.x;
        // The zones as the model tiles them: thirds where zones only align, the solver's spans where items fill.
        const extents = zoneExtents(s, id, e.id);
        // Fixed items, other edges and chrome take their own rects: not this edge's points.
        const others = Object.entries(seen.edges).filter(([oid, o]) => oid !== e.id && o.rect.width > 0 && o.rect.height > 0).map(([, o]) => o.rect);
        const fixed = Object.values(seen.items).filter((x) => x.edge === e.id && x.fixed).map((x) => x.rect);
        // Panel bodies, but for a band at each end, aren't drop places.
        const bodies = Object.entries(seen.items).filter(([bid, x]) => bid !== id && x.edge === e.id && x.formKind === "open").map(([, x]) => (vertical ? { x: x.rect.x, y: x.rect.y + 12, width: x.rect.width, height: x.rect.height - 24 } : x.rect));
        for (let k = 3; k < len - 3; k += 6) {
          const along = a0 + k;
          const cross = vertical ? band.x + band.width / 2 : band.y + band.height / 2;
          const pt = vertical ? { x: cross, y: along } : { x: along, y: cross };
          if (inStrip(pt) || [...others, ...fixed, ...bodies, ...fixedKeepClear(s)].some((o) => inside(o, pt))) continue;
          if (ownRect && !inside(ownRect, pt) && Object.values(seen.items).some((x) => x !== own && x.edge && x.edge !== e.id && inside(x.rect, pt))) continue;
          points++;
          const zone = extents.find((z) => along >= z.a - 1e-9 && along < z.b - 1e-9)?.zone ?? null;
          const hitT = ts.filter((t) => inTarget(t, pt));
          const hitR = rs.filter((x) => inTarget(x, pt));
          const mine = hitT.filter((t) => {
            const ez = edgeZoneOf(s, now, id, t);
            return ez.edge === e.id || (t.place.kind === "home" && ez.edge === null);
          });
          const mineR = hitR.filter((x) => x.edge === e.id);
          const at = `seed ${seed} drag ${id} ${e.id} at ${pt.x.toFixed(0)},${pt.y.toFixed(0)}`;
          if (ownRect && inside(ownRect, pt)) {
            // Every target counts here, `home:<id>` too: a home slot elsewhere (the column line beside the item's own
            // column) needn't cover the own rect.
            // On a bar or a toolbar rail the own place is home's up to the aim cut beside it: a gap of its own edge
            // whose landing overlaps the own rect along the edge (the two cut at the grab) may hold the rest.
            const homeT = all.filter((t) => inTarget(t, pt));
            const cutHere = (t: DockDrop): boolean => !byHalves(e) && t.place.kind === "gap" && t.place.edge === e.id && !!t.slot && overlapsAlong(t.slot, ownRect, vertical);
            if (!homeT.length || homeT.some((t) => t.place.kind !== "home" && !cutHere(t)) || hitR.length) fail("own-not-home", `${at}: ${[...homeT.map((t) => t.id), ...hitR.map((x) => x.id)].join(", ") || "nothing"}`);
            continue;
          }
          const count = hitT.length + hitR.length;
          if (count === 0) {
            fail("hole", at);
            continue;
          }
          if (count > 1) {
            fail("overlap", `${at}: ${[...hitT.map((t) => t.id), ...hitR.map((x) => x.id)].join(", ")}`);
            continue;
          }
          // One tile of another edge (a corner a full bar owns, a column line, the rail) owns the point: fine.
          const one = mine[0] ?? null;
          if (!one && !mineR[0]) continue;
          // Home's tile may run across zones: the stretches beside the item with no slot of their own are home's.
          if (one?.place.kind === "home") continue;
          // On a bar or a toolbar rail the aim order cuts across zones by landings (`aimCut`): a gap of this edge may
          // hold a point of another zone's extent, where `lanes()` (the one answer) docks there in that gap's zone.
          if (one && !byHalves(e) && one.place.kind === "gap" && laneZoneAt(e.id, pt) === one.place.zone) continue;
          const oneZone = one ? edgeZoneOf(s, now, id, one).zone : (mineR[0]?.zone ?? null);
          if (oneZone !== null && zone !== null && oneZone !== zone) fail("other-zone", `${at} (${zone}): ${[...hitT.map((t) => t.id), ...hitR.map((x) => x.id)].join(", ")}`);
        }
      }
    }
  }
  return { points, aimPoints, stripPoints, counts, examples };
}

const SEEDS = Array.from({ length: 120 }, (_, i) => i + 1);

/** No failure of any kind (before the one target model: 8159 holes, 4021 overlaps, 14849 other-zone, 2667 own-not-home). */
const KNOWN: Record<Failure, number> = { hole: 0, overlap: 0, "other-zone": 0, "own-not-home": 0, "slot-not-landing": 0, "duplicate-id": 0, "virtual-hole": 0, "virtual-overlap": 0, "refusal-order": 0, "lost-slot": 0, "refused-owns": 0, "seen-hole": 0, "seen-refused": 0, "beside-own-not-home": 0, "aim-order": 0, "strip-owned": 0, "refused-edge-drawn": 0, "min-hit": 0 };

/** Every edge renamed to an id with ":" in it: the same targets and refusals, under the renamed ids. */
export function colonRenameDiffs(seeds: readonly number[]): string[] {
  const out: string[] = [];
  const J = JSON.stringify;
  for (const seed of seeds) {
    const s = modelState(seed);
    const real = new Set(s.edges.map((e) => e.id));
    const renamed = (id: string): string => id.replace(/^(gap|strip|refuse):([^:]+)/, (all, kind: string, edge: string) => (real.has(edge) ? `${kind}:x:${edge}` : all));
    const s2: DockState = { ...s, edges: s.edges.map((e) => ({ ...e, id: `x:${e.id}` })) };
    for (const id of Object.keys(s.items)) {
      if (s.items[id]!.fixed || s.items[id]!.closed) continue;
      const a = J([targets(s, id).map((t) => [renamed(t.id), t.hit, t.slot]), refusals(s, id).map((r) => [renamed(r.id), r.hit, r.reason])]);
      const b = J([targets(s2, id).map((t) => [t.id, t.hit, t.slot]), refusals(s2, id).map((r) => [r.id, r.hit, r.reason])]);
      if (a !== b) out.push(`seed ${seed} drag ${id}`);
    }
  }
  return out;
}

describe("the target model's property check", () => {
  it("refused-edge-drawn: a bar that takes no panel is one refusal over its drawn rect, its fixed items included", () => {
    const s = windowState();
    const drawn = solve(s).edges;
    const rs = refusals(s, "pages");
    // The title bar (a fixed title and controls), the toolbar and the status bar each take groups only.
    expect(rs.map((r) => [r.id, r.hit, r.reason])).toEqual([
      ["refuse:titlebar:start", drawn.titlebar!.rect, "not-accepted"],
      ["refuse:toolbar:start", drawn.toolbar!.rect, "not-accepted"],
      ["refuse:status:start", drawn.status!.rect, "not-accepted"],
    ]);
    // A group's refusals in a bar that takes groups elsewhere keep their slots' tiles, inside the bar's ends.
    const status = drawn.status!.rect;
    for (const r of refusals(s, "views").filter((x) => x.edge === "status")) expect(r.hit.x >= status.x && r.hit.x + r.hit.width <= status.x + status.width + 1e-9, r.id).toBe(true);
  });

  it("min-hit: the new-column line beside a 28 px rail strip keeps 12 px across, from the column's side of its band", () => {
    const f = (kind: "open" | "header" | "rail" | "icons", min: number, natural: number, cross: number, crossMin?: number) => ({ kind, main: { min, natural, ...(kind === "open" ? { grows: true } : {}) }, cross: { natural: cross, ...(crossMin ? { min: crossMin } : {}) } });
    const p = (id: string, used: number): DockItem => ({ id, kind: "panel", used, forms: { column: [f("open", 90, 300, 240, 200), f("header", 30, 30, 240, 56), f("rail", 26, 26, 32)] } });
    const tool = (id: string): DockItem => ({ id, kind: "group", used: 0, forms: { column: [f("icons", 28, 28, 28)], row: [f("icons", 28, 28, 28)] } });
    const tpl = { accepts: ["panel"], cross: { min: 200, max: 480, rail: 32 } };
    const s: DockState = {
      stage: { x: 0, y: 0, width: 1100, height: 800 },
      edges: [
        { id: "sidebar", side: "left", ring: 0, accepts: ["group"], items: ["t1", "t2"], cross: { min: 28, max: 28, rail: 28 } },
        { id: "left-1", side: "left", ring: 1, column: true, accepts: ["panel"], items: ["pages", "annotations"], cross: { min: 200, max: 480, rail: 32 } },
        { id: "right-0", side: "right", ring: 0, column: true, accepts: ["panel"], items: ["findings"], cross: { min: 200, max: 480, rail: 32 } },
      ],
      items: byId([tool("t1"), tool("t2"), p("pages", 1), p("annotations", 2), p("findings", 3)]),
      floats: [],
      floatKinds: ["panel"],
      columns: { left: tpl, right: tpl },
      rails: { left: { width: 32, accepts: ["panel"] }, right: { width: 32, accepts: ["panel"] } },
      railDrop: { panel: { railStripWidth: 28 } },
    };
    const line = targets(s, "findings").find((t) => t.id === "column:left:1")!;
    // It was 6 px (28..34) beside the strip (0..28): now 28..40, the column's top gap giving up 6 px of its band.
    expect(line.hit).toEqual({ x: 28, y: 0, width: 12, height: 800 });
    expect(targets(s, "findings").find((t) => t.id === "gap:left-1:start:0")!.hit).toEqual({ x: 40, y: 0, width: 228, height: 12 });
    // Beside the item's own place (home's band above Annotations keeps its space) it grows where it can.
    const held = targets(s, "annotations").find((t) => t.id === "column:left:1")!;
    expect(held.hit).toEqual({ x: 28, y: 0, width: 12, height: 388 });
  });

  it("anchored fixed runs: every slot of a zone whose drop lands is a target, but one that pushes a protected fixed item (fuzzed)", () => {
    // A wide top bar of fixed readouts and movable groups in random zones and order, a floating group dragged. Protected:
    // a fixed item in another zone than the slot's, any in the center zone, and the slot's zone's anchored fixed run (from its anchor to its first movable member). A slot whose line lies between two fixed items has no
    // place to aim at and is no target either.
    const rnd = seeded(29);
    const pick = <T,>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)]!;
    let checked = 0;
    let pushedAllowed = 0;
    let refusedPush = 0;
    for (let n = 0; n < 160; n++) {
      const count = 2 + Math.floor(rnd() * 5);
      const ids = Array.from({ length: count }, (_, i) => `m${i}`);
      const items: DockItem[] = ids.map((id) => {
        const align = pick(["start", "center", "end"] as const);
        const w = 30 + Math.floor(rnd() * 80);
        return rnd() < 0.5 ? { id, kind: "readout", used: 0, fixed: true, align, forms: { row: [form("row", w, w, 28)] } } : group(id, 1 + Math.floor(rnd() * 9), { align });
      });
      const s: DockState = {
        stage: { x: 0, y: 0, width: 2000, height: 600 },
        edges: [bar("top", "top", 0, ids)],
        items: byId([...items, group("g", 20)]),
        floats: [{ id: "g", rect: { x: 800, y: 300, width: 200, height: 36 } }],
        floatKinds: ["group"],
      };
      const base = solve(s);
      const ts = targets(s, "g");
      const fixedIn = (id: string): boolean => !!s.items[id]!.fixed;
      for (const zone of ["start", "center", "end"] as const) {
        const members = ids.filter((id) => (s.items[id]!.align ?? "start") === zone);
        const fromAnchor = zone === "start" ? members : zone === "end" ? [...members].reverse() : [];
        const firstMovable = fromAnchor.findIndex((id) => !fixedIn(id));
        const anchored = new Set(firstMovable < 0 ? fromAnchor : fromAnchor.slice(0, firstMovable));
        const isProtected = (id: string): boolean => fixedIn(id) && (zone === "center" || (s.items[id]!.align ?? "start") !== zone || anchored.has(id));
        for (let k = 0; k <= members.length; k++) {
          const after = solve(markUsed(moveTo(s, "g", { kind: "gap", edge: "top", zone, at: k }), "g"));
          const me = after.items.g!;
          if (me.edge !== "top" || me.inMenu || me.zone !== zone) continue;
          const moved = ids.filter((id) => fixedIn(id) && Math.abs(after.items[id]!.rect.x - base.items[id]!.rect.x) > 0.5);
          // The other way too: a slot that would push a protected fixed item is no target.
          if (moved.some(isProtected)) {
            refusedPush++;
            expect(ts.some((t) => t.id === `gap:top:${zone}:${k}`), `case ${n}: gap:top:${zone}:${k} pushes ${moved.filter(isProtected).join(", ")} but is a target`).toBe(false);
            continue;
          }
          if (k > 0 && k < members.length && fixedIn(members[k - 1]!) && fixedIn(members[k]!)) continue;
          if (moved.length) pushedAllowed++;
          checked++;
          expect(ts.some((t) => t.id === `gap:top:${zone}:${k}`), `case ${n}: ${ids.map((id) => `${id}${fixedIn(id) ? "*" : ""}@${s.items[id]!.align ?? "start"}`).join(" ")}: gap:top:${zone}:${k} lands but isn't a target`).toBe(true);
        }
      }
    }
    expect(checked).toBeGreaterThan(300);
    expect(pushedAllowed).toBeGreaterThan(20);
    expect(refusedPush).toBeGreaterThan(20);
  });

  it("refused-edge-drawn: a target in the middle of a wholly refused bar leaves the refusal on both sides, no sliver", () => {
    const base = { edge: "top", spec: null, edgeKind: "bar" as const, vertical: false, zone: "start" as const, id: "", priority: 2 as const, keep: null };
    const own: Ownership = { owners: [], taken: new Map(), cutsOf: () => ({ cuts: [], bodies: [] }), bodies: () => [], solid: [], drawnBesides: () => [] };
    const slot = { ...base, edge: "other", kind: "slot" as const, id: "gap:other:start:0", order: 1, hit: { x: 400, y: 0, width: 100, height: 36 }, keep: { x: 450, y: 18 } };
    const sliver = { ...base, edge: "other", kind: "slot" as const, id: "gap:other:start:1", order: 1, hit: { x: 0, y: 0, width: 999.5, height: 35.5 }, keep: { x: 10, y: 10 } };
    const whole = { ...base, kind: "refuse" as const, order: 10, reason: "not-accepted" as const, whole: true, hit: { x: 0, y: 0, width: 1000, height: 36 } };
    const placed = clipTiles([slot, whole], own, [], []);
    const r = placed.find((t) => t.whole)!;
    expect(r.hits).toEqual([{ x: 0, y: 0, width: 400, height: 36 }, { x: 500, y: 0, width: 500, height: 36 }]);
    expect(r.hit).toEqual({ x: 500, y: 0, width: 500, height: 36 });
    // What a target leaves under 1 px either way is no piece of it: two 0.5 px slivers are no refusal at all.
    expect(clipTiles([sliver, whole], own, [], []).find((t) => t.whole)).toBeUndefined();
  });

  it("space ownership: a narrow column keeps its gaps inside its own rect; the column lines take the space beside it", () => {
    // A 30 px column (its panel in rail form): its outer line at 0 and its inner line at 30.
    const s: DockState = {
      stage: { x: 0, y: 0, width: 800, height: 500 },
      edges: [column("left0", "left", 0, ["p1"], { column: true })],
      items: byId([panel("p1", 1, { from: 1 }), group("g", 1)]),
      floats: [{ id: "g", rect: { x: 300, y: 200, width: 200, height: 40 } }],
      floatKinds: ["group", "panel"],
      columns: { left: { accepts: ["panel", "group"], cross: { min: 160, max: 480, rail: 30 } } },
    };
    expect(solve(s).edges.left0!.rect.width).toBe(30);
    const ts = targets(s, "g");
    const hit = (id: string): R | undefined => ts.find((t) => t.id === id)?.hit;
    // The lines, at 0 and 30, ranked where their new column would be laid. The outer line lies at the window's edge: its
    // band (the whole hit band) is laid inward from the edge, never past the stage, and it pushes the column (it owned
    // 0..24 of it). The inner line, up to COLUMN_REACH from it, is pushed by the column.
    // The column's gaps, inside its 30 px, were left 6 px: they keep the 12 px minimum across, which the outer line's
    // surplus gives (it keeps 0..18, over its own minimum).
    expect(hit("column:left:0")).toEqual({ x: 0, y: 0, width: 18, height: 500 });
    expect(hit("column:left:1")).toEqual({ x: 30, y: 0, width: 22, height: 500 });
    const gaps = ts.filter((t) => t.id.startsWith("gap:left0:"));
    expect(gaps.map((t) => t.id).sort()).toEqual(["gap:left0:start:0", "gap:left0:start:1"]);
    for (const t of gaps) expect([t.hit.x, t.hit.x + t.hit.width]).toEqual([18, 30]);
    expect(lostSlots(s, "g")).toEqual([]);
  });

  it("a column line ranks among the sides: an empty full bar's band, laid before the sides, outranks it", () => {
    const s: DockState = {
      stage: { x: 0, y: 0, width: 800, height: 500 },
      edges: [bar("top", "top", 0, []), column("left0", "left", 1, ["p1"], { column: true })],
      items: byId([panel("p1", 1), group("g", 2)]),
      floats: [{ id: "g", rect: { x: 500, y: 200, width: 200, height: 40 } }],
      floatKinds: ["group", "panel"],
      columns: { left: { accepts: ["panel", "group"], cross: { min: 160, max: 480, rail: 30 } } },
    };
    const top = solve(s).edges.top!.rect;
    const ts = targets(s, "g");
    const line = ts.find((t) => t.id === "column:left:1")!;
    // The empty bar owns the depth a drop draws it at, below its boundary; the line's tile starts under it.
    const depth = ts.find((t) => t.id.startsWith("strip:top:"))!.after({ x: 0, y: 0 }).layout.edges.top!.cross;
    expect(depth).toBeGreaterThan(12);
    expect(line.hit.y).toBe(top.y + depth);
  });

  it("a column line between two touching columns owns its band: the seam keeps a new-column target", () => {
    // Two columns side by side with no gutter: the line between them at their seam.
    const s: DockState = {
      stage: { x: 0, y: 0, width: 1000, height: 500 },
      edges: [column("left0", "left", 0, ["p1"], { column: true }), column("left1", "left", 1, ["p2"], { column: true })],
      items: byId([panel("p1", 1), panel("p2", 2), group("g", 3)]),
      floats: [{ id: "g", rect: { x: 700, y: 200, width: 200, height: 40 } }],
      floatKinds: ["group", "panel"],
      columns: { left: { accepts: ["panel", "group"], cross: { min: 160, max: 480, rail: 30 } } },
      gutter: 0,
    };
    const l = solve(s);
    const seam = l.edges.left1!.rect.x;
    expect(l.edges.left0!.rect.x + l.edges.left0!.rect.width).toBe(seam);
    const line = targets(s, "g").find((t) => t.id === "column:left:1");
    // Its band about the seam is the line's against the inner column it would push (6 px), grown to the 12 px minimum
    // across: it now overlays the outer column's edge by 6 px, where nothing else is aimed at.
    expect(line?.hit.x).toBe(seam - 6);
    expect(line?.hit.width).toBe(12);
    expect(lostSlots(s, "g")).toEqual([]);
  });

  it("a refused place owns nothing: flush beside a side bar, the outer column line keeps its target over the refused rail", () => {
    // No inset; a side bar outside it, then a column; hand folds ride, so a drop into the empty rail (its place right
    // after the bar) would ride over the column, not show in the rail: the filter refuses it.
    const s: DockState = {
      stage: { x: 0, y: 0, width: 1000, height: 500 },
      edges: [{ id: "left-bar", side: "left", ring: 0, accepts: ["group"], items: ["g1"], cross: { min: 32, max: 32, rail: 32 }, outsideInset: true }, column("left-col", "left", 1, ["p1"], { column: true })],
      items: byId([group("g1", 1), panel("p1", 3), panel("p", 2)]),
      floats: [{ id: "p", rect: { x: 500, y: 100, width: 220, height: 200 } }],
      floatKinds: ["group", "panel"],
      columns: { left: { accepts: ["panel"], cross: { min: 160, max: 480, rail: 30 } } },
      rails: { left: { width: 30, accepts: ["panel"] } },
      handFold: "ride",
      gutter: 8,
    };
    const l = solve(s);
    const bar = l.edges["left-bar"]!.rect;
    expect(l.railPlaces.left!.x).toBe(bar.x + bar.width);
    const line = targets(s, "p").find((t) => t.id === "column:left:1");
    // The new column just inside the bar is offered, its hit starting at the bar's inner side.
    expect(line).toBeDefined();
    expect(line!.hit.x).toBe(bar.x + bar.width);
    expect(line!.hit.width).toBeGreaterThan(0);
    // The rail's refusal takes only what the other edges leave: here nothing, the column's rect being the column's.
    const rail = refusals(s, "p").filter((r) => r.edge === "rail:left");
    for (const r of rail) expect(r.hit.x).toBeGreaterThanOrEqual(line!.hit.x + line!.hit.width);
    expect(lostSlots(s, "p")).toEqual([]);
  });

  it("the item's own bar is seen with the item: an overlay column's last gap ends at the bar, the corner beside home is the outer column line's", () => {
    // The group's own place (home, in the bottom bar from x 8): the bar is drawn with it, so the overlay column's last
    // gap is its 30 px down to the bar, all of it the gap's, nothing refused. The 8 px corner beside home is the outer
    // column line's: a new column there is laid before the bar between the sides, which it would push.
    const s: DockState = {
      stage: { x: 0, y: 0, width: 536, height: 869 },
      edges: [
        bar("bottom", "bottom", 0, ["g0"], { gap: 4, pad: { start: 8, end: 8 }, span: "between" }),
        column("left0", "left", 0, ["p1"], { mode: "overlay", column: true }),
        column("left1", "left", 1, [], { column: true }),
      ],
      items: byId([group("g0", 43), panel("p1", 29, { from: 1 })]),
      floats: [],
      floatKinds: ["panel", "group"],
      columns: { left: { accepts: ["panel", "group"], cross: { min: 160, max: 480, rail: 30 } } },
      rails: { left: { width: 30, accepts: ["panel"] } },
      gutter: 0,
    };
    const l = solve(s);
    expect(l.edges.left0!.rect.width).toBe(30);
    const home = l.items.g0!.rect;
    const ts = targets(s, "g0");
    const gap = ts.find((t) => t.id === "gap:left0:start:1")!;
    expect(gap.hits).toBeUndefined();
    expect([gap.hit.x, gap.hit.width, gap.hit.y + gap.hit.height]).toEqual([0, 30, home.y]);
    expect(refusals(s, "g0").filter((r) => r.edge === "left0")).toEqual([]);
    expect(targetAt(ts, { x: 20, y: 400 })?.id).toBe("gap:left0:start:1");
    expect(targetAt(ts, { x: 4, y: home.y + 10 })?.id).toBe("column:left:0");
    expect(lostSlots(s, "g0")).toEqual([]);
  });

  it("a refused zone owns nothing: the group dragged out of the top bar leaves the column's top band to the column", () => {
    // Seed 5, the group dragged out of the top bar (seen with it, so the column starts below the bar): the bar's start
    // zone has no place but home's and owns nothing over the column; the column's top band refuses the group itself (its
    // start zone takes panels).
    const s = modelState(5);
    const col = solve(s).edges["left-col"]!.rect;
    const rs = refusals(s, "g0");
    expect(rs.filter((r) => r.edge === "top").some((r) => r.hit.x < col.x + col.width && r.hit.x + r.hit.width > col.x)).toBe(false);
    expect(rs.some((r) => r.edge === "left-col" && r.zone === "start" && r.reason === "not-accepted" && r.hit.y === col.y)).toBe(true);
  });

  it("a refused stretch owns nothing: the group's own bar leaves the column's foot to the column", () => {
    // Seed 359, the group dragged out of the bottom bar (seen with it): no stretch of the bar lies over the left column;
    // the column's foot is its last gap.
    const s = modelState(359);
    const col = solve(s).edges["left-col"]!.rect;
    const on = (r: R): boolean => r.x < col.x + col.width && r.x + r.width > col.x && r.y < col.y + col.height && r.y + r.height > col.y;
    expect(refusals(s, "g3").filter((r) => r.edge === "bottom" && on(r.hit))).toEqual([]);
    const foot = targets(s, "g3").find((t) => t.id.startsWith("gap:left-col:") && t.hit.y + t.hit.height === col.y + col.height);
    expect(foot).toBeDefined();
  });

  it("tiles lie where the user sees things, even where the lift would move them: a side bar seen inside the rail refuses there", () => {
    // Flush seed 223: with the item docked, the left column is folded into the rail (x 0–30) and the side bar lies
    // inside it (x 38–70); lifting p4 would open the column there. The tiles stay in the seen layout: the column is
    // reached through the rail, and the side bar, which takes no panel, refuses over its seen rect.
    const s = modelState(223, true);
    expect(solve(s).edges["left-bar"]!.rect.x).toBe(38);
    for (const id of ["p4", "left-p"]) {
      expect(targets(s, id).some((t) => t.id.startsWith("gap:left-col:"))).toBe(false);
      const hits = [...targets(s, id).filter((t) => !t.free).flatMap(zoneOfT), ...refusals(s, id).map((r) => r.hit)];
      for (let x = 39; x < 70; x += 2) expect(hits.filter((h) => inside(h, { x, y: 40 })).length, `${id} at ${x},40`).toBe(1);
      expect(refusals(s, id).find((r) => inside(r.hit, { x: 50, y: 40 }))?.edge).toBe("left-bar");
    }
  });

  it("the gaps right beside the dragged panel's own place are home's, never the float", () => {
    // A panel between two neighbours in one column: the gaps just above and below it are the same move as home.
    const s: DockState = {
      stage: { x: 0, y: 0, width: 1000, height: 900 },
      edges: [column("left0", "left", 0, ["a", "p", "b"])],
      items: byId([panel("a", 1), panel("p", 2), panel("b", 3)]),
      floats: [],
      floatKinds: ["panel"],
      gutter: 8,
    };
    const l = solve(s);
    const own = l.items.p!.rect;
    const ts = targets(s, "p");
    for (const y of [own.y - 2, own.y - 6, own.y + own.height + 2, own.y + own.height + 6]) {
      const t = targetAt(ts, { x: own.x + own.width / 2, y });
      expect(t?.place.kind, `at y ${y}: ${t?.id}`).toBe("home");
    }
    expect(refusals(s, "p").some((r) => inside(r.hit, { x: own.x + 10, y: own.y - 2 }))).toBe(false);
  });

  it("aim order on a rail: the dragged toolbar taken out, the others' halves say before or after; home is its own place and the facing halves", () => {
    // A 30 px rail holding, top to bottom, three toolbars in its start zone (icons 158, 102 and 102 px down the rail).
    const tb = (id: string, h: number, more: Partial<DockItem> = {}): DockItem => ({
      id,
      kind: "group",
      used: 1,
      forms: { row: [form("row", 150, 150, 32), form("menu", 0, 0, 0)], column: [form("icons", h, h, 28), form("menu", 0, 0, 0)] },
      ...more,
    });
    const rail = (align: Partial<Record<string, "center" | "end">> = {}): DockState => ({
      stage: { x: 0, y: 0, width: 1080, height: 640 },
      edges: [{ id: "rail", side: "left", ring: 0, accepts: ["group"], items: ["tools", "views", "zoom"], cross: { min: 30, max: 30, rail: 30 }, compact: true, gap: 4, pad: { start: 4, end: 4 } }],
      items: byId([tb("tools", 158, align.tools ? { align: align.tools } : {}), tb("views", 102, align.views ? { align: align.views } : {}), tb("zoom", 102, align.zoom ? { align: align.zoom } : {})]),
      floats: [],
      floatKinds: ["group"],
    });
    const s = rail();
    const l = solve(s);
    const [tools, views, zoom] = [l.items.tools!.rect, l.items.views!.rect, l.items.zoom!.rect];
    const pick = (sc: DockState, id: string, y: number): DockDrop | null => targetAt(targets(sc, id), { x: 15, y }) as DockDrop | null;
    // Zoom, its grip just inside the top of Views: between Tools and Views, the slot where it lands, at its rail size.
    const between = pick(s, "zoom", views.y + 3)!;
    expect(between.id).toBe("gap:rail:start:1");
    expect(between.slot).toEqual(between.after({ x: 15, y: views.y + 3 }).layout.items.zoom!.rect);
    expect(between.slot!.y).toBe(views.y);
    expect(between.slot!.height).toBe(zoom.height);
    // A toolbar takes the nearest landing: over Views, as long as Zoom, on either side of its middle, Views' place (Views
    // moving on); Zoom's own place is home.
    expect(pick(s, "zoom", views.y + views.height / 2 - 1)!.id).toBe("gap:rail:start:1");
    expect(pick(s, "zoom", views.y + views.height / 2 + 1)!.id).toBe("gap:rail:start:1");
    expect(pick(s, "zoom", zoom.y + 3)!.place.kind).toBe("home");
    expect(pick(s, "zoom", tools.y + tools.height / 2 - 1)!.id).toBe("gap:rail:start:0");
    // Views held between Tools and Zoom is home over its own rect; over Zoom, as long as it, Zoom's place; over Tools'
    // lower half, nearer the landing before Tools than its own place, before Tools.
    for (const y of [views.y + 10, views.y + views.height - 10]) expect(pick(s, "views", y)!.place.kind, `views at ${y}`).toBe("home");
    expect(pick(s, "views", zoom.y + zoom.height / 2 - 1)!.id).toBe("gap:rail:start:2");
    expect(pick(s, "views", tools.y + tools.height / 2 + 1)!.id).toBe("gap:rail:start:0");
    // Across zones: Tools at the start, Views centred, Zoom at the end. Zoom over Views' upper half goes before it, over
    // its lower half after it, its order kept (home, or the centre zone's place of that order: which zone docks it there
    // is the zone extents' question); Tools over Views' upper half keeps its order too, over the free stretch below
    // Tools it re-aligns into the centre zone.
    const z = rail({ views: "center", zoom: "end" });
    const zl = solve(z);
    const v = zl.items.views!.rect;
    const order = (dl: DockLayout): string => ["tools", "views", "zoom"].sort((p, q) => dl.items[p]!.rect.y - dl.items[q]!.rect.y).join(" ");
    const keeps = (id: string, y: number): string => {
      const t = pick(z, id, y)!;
      return t.place.kind === "home" ? order(zl) : order(t.after({ x: 15, y }).layout);
    };
    expect(pick(z, "zoom", v.y + 3)!.id).toBe("gap:rail:center:0");
    expect(keeps("zoom", v.y + v.height - 3)).toBe(order(zl));
    expect(keeps("tools", v.y + 3)).toBe(order(zl));
    expect(pick(z, "tools", v.y - 10)!.id).toBe("gap:rail:center:0");
  });

  // The heavy sweeps run in chunks of at most 100 seeds, each its own test with its own timeout, so no single test runs
  // long on a slow runner. The same seeds as one sweep; the point counts are summed and checked after the last chunk.
  const SWEEP_TIMEOUT = 120_000;
  const chunks = (n: number, size = 100): number[][] => Array.from({ length: Math.ceil(n / size) }, (_, c) => Array.from({ length: Math.min(size, n - c * size) }, (_, i) => c * size + i + 1));
  const range = (seeds: readonly number[]): string => `seeds ${seeds[0]}–${seeds.at(-1)}`;
  type Totals = { points: number; aimPoints: number; stripPoints: number };
  /** One chunk's run: its counts at zero, its points added to `totals`. */
  const sweep = (totals: Totals, label: string, seeds: readonly number[], flush: boolean, middle: boolean, railDrop: boolean): void => {
    const r = propertyCheck(seeds, flush, middle, railDrop);
    // eslint-disable-next-line no-console
    if (process.env.MODEL_REPORT) console.log(JSON.stringify({ label, flush, middle, railDrop, points: r.points, aimPoints: r.aimPoints, stripPoints: r.stripPoints, counts: r.counts }), "\n" + r.examples.join("\n"));
    totals.points += r.points;
    totals.aimPoints += r.aimPoints;
    totals.stripPoints += r.stripPoints;
    for (const k of Object.keys(KNOWN) as Failure[]) expect(r.counts[k], `${label}${k}: ${r.examples.filter((x) => x.startsWith(k)).slice(0, 5).join(" | ")}`).toBeLessThanOrEqual(KNOWN[k]);
  };
  const totals = (): Totals => ({ points: 0, aimPoints: 0, stripPoints: 0 });

  const flushAll = totals();
  for (const seeds of chunks(600)) {
    it(`flush windows (no inset, a column inside each side bar, rails, riding folds) keep every category at zero, ${range(seeds)}`, () => sweep(flushAll, "", seeds, true, false, false), SWEEP_TIMEOUT);
  }
  it("flush windows: the sweep reaches enough points", () => {
    expect(flushAll.points).toBeGreaterThan(2000);
    expect(flushAll.aimPoints).toBeGreaterThan(500);
  });

  for (const flush of [false, true]) {
    const all = totals();
    for (const seeds of chunks(300)) {
      it(`windows whose columns and column templates split panels in halves (hitBand "middle")${flush ? ", flush" : ""}, keep every category at zero, ${range(seeds)}`, () => sweep(all, flush ? "flush " : "", seeds, flush, true, false), SWEEP_TIMEOUT);
    }
    it(`hitBand "middle"${flush ? ", flush" : ""}: the sweep reaches enough points`, () => {
      expect(all.points).toBeGreaterThan(1000);
      expect(all.aimPoints).toBeGreaterThan(200);
    });
  }

  // The flush windows are the ride mode: hand folds ride (`handFold: "ride"`), so a strip's drop rides over an open column.
  for (const [flush, middle] of [
    [false, false],
    [true, false],
    [false, true],
    [true, true],
  ] as const) {
    const all = totals();
    const mode = `${flush ? "flush " : ""}${middle ? "middle " : ""}`;
    for (const seeds of chunks(flush ? 300 : 120)) {
      it(`windows whose panels drop into their side's rail through a strip (DockState.railDrop)${mode ? `, ${mode.trim()}` : ""}, riding folds included, keep every category at zero, the strip included, ${range(seeds)}`, () => sweep(all, mode, seeds, flush, middle, true), SWEEP_TIMEOUT);
    }
    it(`DockState.railDrop${mode ? `, ${mode.trim()}` : ""}: the sweep reaches enough strip points`, () => {
      expect(all.stripPoints).toBeGreaterThan(500);
    });
  }

  it("an edge whose id holds ':' is an edge like any other (virtual edges are flagged, not named)", () => {
    expect(colonRenameDiffs(Array.from({ length: 40 }, (_, i) => i + 1))).toEqual([]);
  });

  it("every point of an accepting edge maps to one target or refusal of its own zone; own rect → home; slot = landing", () => {
    const r = propertyCheck(SEEDS);
    // eslint-disable-next-line no-console
    if (process.env.MODEL_REPORT) console.log(JSON.stringify({ points: r.points, aimPoints: r.aimPoints, counts: r.counts }), "\n" + r.examples.join("\n"));
    expect(r.points).toBeGreaterThan(5000);
    expect(r.aimPoints).toBeGreaterThan(200);
    for (const k of Object.keys(KNOWN) as Failure[]) expect(r.counts[k], `${k}: ${r.examples.filter((x) => x.startsWith(k)).slice(0, 5).join(" | ")}`).toBeLessThanOrEqual(KNOWN[k]);
  }, SWEEP_TIMEOUT);
});
