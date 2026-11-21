/**
 * One layout for the held frame and the commit: for every held frame, what is drawn (every item but the held one, the
 * landing, the guides) is the layout its release commits.
 *
 * The property, for a frame whose release lands `S` (a spot, or the float), with `commit` the layout the host draws
 * after the drop (`solve(readDockState(storeDockState(after.state)).state, { previous })`):
 * - **items:** every item but the held one is drawn where `commit` puts it (exact, in node);
 * - **landing:** the frame's landing is the held item's rect in `commit` (exact);
 * - **store:** the drop's state survives the store round trip: solved, it lays out as `after.layout` does;
 * - **hull** (decision 0002): along a lane the held item lands alone in, the hull of the lane's guides, the landing and
 *   its items is the lane's edge in `commit`, within the edge's padding and 1 px;
 * - **corner** (decision 0002): a corner where two drawn lanes meet in `commit` is drawn by the edge that owns it and by
 *   no other lane's guide;
 * - **overlap:** no two lanes' guides overlap, on any frame;
 * - **near:** the Near guide of a lane that holds items, before entry (approached or pending), is that lane's guide as
 *   on screen less the landing the pointer would take there (rule B for a populated lane).
 * Named exceptions: under "all" the lanes other than the Near one are held to **overlap** only; the Near guide of an
 * empty lane (one the screen doesn't draw) is the layout that creates it (`lanes-guide-continuity.test.ts`).
 *
 * The frames come from a landing model played along paths: from the press to the middle of each spot's stretch (fast,
 * then slow, then a rest) and, on a sliding spot, slowly along its whole stretch; under "near" and "all". The windows
 * are `./one-layout-windows`. Known failures are pending by name (`PENDING`): the sweep fails on a failure not listed
 * and on a listed one that passes (it flipped: take it off the list).
 */
import { LANDING_APPROACH, type LandingRelease } from "@n-uf/motion/drag";
import { describe, expect, it } from "vitest";
import type { Point, Rect } from "@n-uf/placement";
import { dockDrag, readDockState, solve, storeDockState, type DockDrag, type DockLayout, type DockRegions, type DockState } from "../src";
import { modelOver, type DrawnFrame as LandingFrame } from "./landing-model";
import { sweepWindows, type SweepWindow } from "./one-layout-windows";

type Axis = "x" | "y";
type Mode = "near" | "all";
type Guide = { readonly lane: string; readonly id: string; readonly kind: "line" | "box" | "hatch"; readonly rect: Rect };
type Lane = DockRegions["lanes"][number];

const lo = (r: Rect, a: Axis): number => (a === "x" ? r.x : r.y);
const hi = (r: Rect, a: Axis): number => (a === "x" ? r.x + r.width : r.y + r.height);
const fmt = (r: Rect | null | undefined): string => (r ? `${r.x.toFixed(1)},${r.y.toFixed(1)} ${r.width.toFixed(1)}x${r.height.toFixed(1)}` : "-");
const off = (a: Rect, b: Rect): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.width - b.width), Math.abs(a.height - b.height));
const inter = (a: Rect, b: Rect, m = 1): Rect | null => {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  return x1 - x0 > m && y1 - y0 > m ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
};
const contains = (a: Rect, b: Rect): boolean => b.x >= a.x - 1e-6 && b.y >= a.y - 1e-6 && b.x + b.width <= a.x + a.width + 1e-6 && b.y + b.height <= a.y + a.height + 1e-6;
const EXACT = 1e-6;

const edgeOf = (s: DockState, id: string) => s.edges.find((e) => e.id === id);
const axisOfEdge = (s: DockState, id: string): Axis => (edgeOf(s, id)!.side === "top" || edgeOf(s, id)!.side === "bottom" ? "x" : "y");
const drawn = (layout: DockLayout, id: string): boolean => (layout.edges[id]?.cross ?? 0) > 1e-6;
const pad = (s: DockState, id: string): { start: number; end: number } => ({ start: Math.max(0, edgeOf(s, id)!.pad?.start ?? 0), end: Math.max(0, edgeOf(s, id)!.pad?.end ?? 0) });
const itemsOn = (layout: DockLayout, edge: string, dragged: string): Rect[] =>
  Object.entries(layout.items)
    .filter(([id, it]) => id !== dragged && it.edge === edge && !it.floating && !it.inMenu && it.rect.width > 0 && it.rect.height > 0)
    .map(([, it]) => it.rect);
const alone = (layout: DockLayout, edge: string, dragged: string): boolean => layout.items[dragged]?.edge === edge && itemsOn(layout, edge, dragged).length === 0;

/** The drag of a window as the sweep plays it: what the landing model and the host read. */
interface Drag {
  readonly w: SweepWindow;
  readonly drag: DockDrag;
  readonly regions: DockRegions;
  readonly grab: Point;
  readonly press: Point;
  readonly home?: { readonly lane: string; readonly spot: string };
}

function dragOf(w: SweepWindow): Drag | null {
  const own = solve(w.state, { previous: w.previous }).items[w.dragged];
  if (!own || own.inMenu || own.floating || own.rect.width <= 0 || own.rect.height <= 0) return null;
  const given = w.options.grab;
  const grab = given && given.x < own.rect.width && given.y < own.rect.height ? given : { x: own.rect.width / 2, y: own.rect.height / 2 };
  const options = { ...w.options, previous: w.previous, grab };
  const drag = dockDrag(w.state, w.dragged, options);
  const regions = drag.regions;
  const home = regions.lanes.flatMap((l) => l.spots.filter((x) => x.home).map((x) => ({ lane: l.id, spot: x.id })))[0];
  return { w, drag, regions, grab, press: { x: own.rect.x + grab.x, y: own.rect.y + grab.y }, ...(home ? { home } : {}) };
}

/** A frame as the host draws it. */
interface Drawn {
  readonly point: Point;
  readonly frame: LandingFrame;
  readonly release: LandingRelease;
}

/** The frames of a drag along `legs` (each a point and the speed to it, px/ms), a frame every 8 ms, then a rest. */
function play(d: Drag, mode: Mode, legs: readonly (readonly [Point, number])[], rest = 200): Drawn[] {
  const model = modelOver(d.drag, { ...(d.home ? { home: d.home } : {}), placeGuides: mode });
  const out: Drawn[] = [];
  let t = 0;
  let at = d.press;
  const push = (p: Point): void => {
    const frame = model.update(p, (t += 8));
    out.push({ point: p, frame, release: model.release(p, t) });
  };
  push(at);
  for (const [b, speed] of legs) {
    const a = at;
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / speed / 8));
    for (let k = 1; k <= n; k++) push((at = { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n }));
  }
  for (let r = 8; r <= rest; r += 8) push(at);
  return out;
}

/** The paths of a drag: to the middle of each spot's stretch, and along each sliding spot's stretch. */
function paths(d: Drag): { name: string; legs: [Point, number][] }[] {
  const out: { name: string; legs: [Point, number][] }[] = [];
  for (const l of d.regions.lanes) {
    const across = l.axis === "x" ? l.rect.y + l.rect.height / 2 : l.rect.x + l.rect.width / 2;
    const at = (a: number): Point => (l.axis === "x" ? { x: a, y: across } : { x: across, y: a });
    for (const sp of l.spots) {
      if (sp.home && !sp.slide) continue;
      const mid = at((sp.along[0] + sp.along[1]) / 2);
      const legs: [Point, number][] = [
        [mid, 0.6],
        [mid, 0.1],
      ];
      // A sliding spot: slowly to either end of its stretch (2 px in), every landing it offers on the way.
      if (sp.slide && sp.along[1] - sp.along[0] > 8)
        legs.push([at(sp.along[0] + 2), 0.15], [at(sp.along[1] - 2), 0.15]);
      out.push({ name: `${l.id} ${sp.id}`, legs });
    }
  }
  return out;
}

/** What a release lands: the drop, its result, and the committed layout after the store round trip. */
interface Landed {
  readonly key: string;
  readonly after: { readonly state: DockState; readonly layout: DockLayout };
  readonly commit: DockLayout;
  readonly stored: DockLayout;
}

function landedOf(d: Drag, r: LandingRelease): Landed | null {
  if (!r) return null;
  // The release commits its state's one layout.
  const after = d.drag.after(r);
  if (after.landing === null) return null;
  const read = readDockState(storeDockState(after.state), d.w.state);
  return {
    key: r.kind === "float" ? "float" : r.spot,
    after,
    commit: solve(read.state, { previous: d.w.previous }),
    stored: solve(after.state, { previous: d.w.previous }),
  };
}

/** The guides of a lane as one interval set along `axis` (boxes and hatches), merged, and its lines' positions. */
function spans(gs: readonly Guide[], axis: Axis): { box: [number, number][]; lines: number[] } {
  const box = gs
    .filter((g) => g.kind !== "line")
    .map((g): [number, number] => [lo(g.rect, axis), hi(g.rect, axis)])
    .sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [a, b] of box) {
    const last = merged.at(-1);
    if (last && a <= last[1] + 1) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  return { box: merged, lines: gs.filter((g) => g.kind === "line").map((g) => (lo(g.rect, axis) + hi(g.rect, axis)) / 2).sort((a, b) => a - b) };
}
/** Two interval sets differ by more than `tol` px in all: their symmetric difference. */
function spanDiff(a: [number, number][], b: [number, number][]): number {
  const pts = [...new Set([...a.flat(), ...b.flat()])].sort((x, y) => x - y);
  const inSet = (s: [number, number][], v: number): boolean => s.some(([p, q]) => v > p && v < q);
  let d = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const m = (pts[i]! + pts[i + 1]!) / 2;
    if (inSet(a, m) !== inSet(b, m)) d += pts[i + 1]! - pts[i]!;
  }
  return d;
}
/** `ms` less `r` along `axis`: the pieces either side; a box piece the cut leaves 8 px or shorter is dropped. */
function lessAlong(ms: readonly Guide[], r: Rect | null, axis: Axis): Guide[] {
  if (!r) return [...ms];
  return ms.flatMap((m) => {
    if (!inter(m.rect, r, 1e-6)) return [m];
    const [a, b] = [lo(m.rect, axis), hi(m.rect, axis)];
    const out: Guide[] = [];
    const put = (p: number, q: number): void => {
      if (q - p > (m.kind === "box" ? 8 : 1e-6)) out.push({ ...m, rect: axis === "x" ? { ...m.rect, x: p, width: q - p } : { ...m.rect, y: p, height: q - p } });
    };
    if (m.kind === "line") return lo(r, axis) <= a && hi(r, axis) >= b ? [] : [m];
    put(a, Math.min(b, lo(r, axis)));
    put(Math.max(a, hi(r, axis)), b);
    return out;
  });
}

/** The corners of `layout` where two drawn edge lanes across each other meet, each with the edge that owns it. */
function corners(s: DockState, layout: DockLayout, laneIds: ReadonlySet<string>): { owner: string; other: string; rect: Rect }[] {
  const out: { owner: string; other: string; rect: Rect }[] = [];
  const ids = [...laneIds].filter((id) => edgeOf(s, id) && drawn(layout, id));
  for (const b of ids.filter((id) => axisOfEdge(s, id) === "x"))
    for (const r of ids.filter((id) => axisOfEdge(s, id) === "y")) {
      const br = layout.edges[b]!.rect;
      const rr = layout.edges[r]!.rect;
      const c = { x: rr.x, y: br.y, width: rr.width, height: br.height };
      const near = rr.y <= br.y + br.height + 1 && br.y <= rr.y + rr.height + 1 && br.x <= rr.x + rr.width + 1 && rr.x <= br.x + br.width + 1;
      if (!near) continue;
      if (contains(br, c)) out.push({ owner: b, other: r, rect: c });
      else if (contains(rr, c)) out.push({ owner: r, other: b, rect: c });
    }
  return out;
}

/** A corner owner issue: another lane's guides in the corner, or a part of it the owner's guides leave undrawn. */
function cornerIssues(s: DockState, layout: DockLayout, laneIds: ReadonlySet<string>, gs: readonly Guide[], dragged: string, landing: Rect | null): string[] {
  const out: string[] = [];
  const items = Object.entries(layout.items)
    .filter(([id, it]) => id !== dragged && !it.floating && !it.inMenu && it.rect.width > 0 && it.rect.height > 0)
    .map(([, it]) => it.rect);
  const solid = landing ? [...items, landing] : items;
  for (const c of corners(s, layout, laneIds)) {
    for (const g of gs) if (g.lane !== c.owner && edgeOf(s, g.lane) && inter(g.rect, c.rect)) out.push(`${g.id} ${fmt(g.rect)} in ${c.owner}'s corner ${fmt(c.rect)}`);
    const own = gs.filter((g) => g.lane === c.owner).map((g) => g.rect);
    const oa = axisOfEdge(s, c.owner);
    const or = layout.edges[c.owner]!.rect;
    const op = pad(s, c.owner);
    const inPad = (v: number): boolean => v <= lo(or, oa) + op.start + 1 || v >= hi(or, oa) - op.end - 1;
    let gaps = 0;
    for (let x = Math.ceil(c.rect.x) + 0.5; x < c.rect.x + c.rect.width - 1; x++)
      for (let y = Math.ceil(c.rect.y) + 0.5; y < c.rect.y + c.rect.height - 1; y++) {
        const at = (r: Rect): boolean => x >= r.x - 1 && x <= r.x + r.width + 1 && y >= r.y - 1 && y <= r.y + r.height + 1;
        if (!solid.some(at) && !own.some(at) && !inPad(oa === "x" ? x : y)) gaps++;
      }
    if (gaps > 0) out.push(`${c.owner}'s corner ${fmt(c.rect)} with ${c.other}: ${gaps} px drawn by no guide of ${c.owner}`);
  }
  return out;
}

/** The sweep's result: each failure by its case name (clause, window, lane or place, mode), with the first detail. */
interface Result {
  readonly failures: Map<string, string>;
  readonly counts: Record<string, number>;
}

function sweep(): Result {
  const failures = new Map<string, string>();
  const counts: Record<string, number> = {};
  const count = (k: string): void => void (counts[k] = (counts[k] ?? 0) + 1);
  const fail = (name: string, detail: string): void => void (failures.has(name) || failures.set(name, detail));
  for (const w of sweepWindows()) {
    const d = dragOf(w);
    if (!d) continue;
    count("windows");
    const s = w.state;
    const laneIds = new Set(d.regions.lanes.map((l) => l.id));
    const landedMemo = new Map<string, Landed | null>();
    const checkedDrop = new Set<string>();
    for (const path of paths(d))
      for (const mode of ["near", "all"] as const) {
        const frames = play(d, mode, path.legs);
        for (const f of frames) {
          count(`frames ${mode}`);
          const gs: Guide[] = f.frame.guides.map((g) => ({ lane: g.lane, id: g.id, kind: g.kind, rect: g.rect }));
          // overlap: no two lanes' guides overlap.
          for (let i = 0; i < gs.length; i++)
            for (let j = i + 1; j < gs.length; j++)
              if (gs[i]!.lane !== gs[j]!.lane && inter(gs[i]!.rect, gs[j]!.rect, 0.01))
                fail(`overlap | ${w.name} | ${[gs[i]!.lane, gs[j]!.lane].sort().join(" & ")} | ${mode}`, `at ${Math.round(f.point.x)},${Math.round(f.point.y)}: ${gs[i]!.id} ${fmt(gs[i]!.rect)} over ${gs[j]!.id} ${fmt(gs[j]!.rect)}`);
          // entry: a lane shown for another state than the screen's (the Near lane, or the corner's owner by reach), or
          // the entered lane, shows its entry: its marks in that state's layout, which leave out only the landing there.
          // (A lane the screen draws is the named exception, rule B: the screen's less the landing, the `near` clause.)
          const screen0 = d.drag.after(f.frame.state);
          for (const g of f.frame.named) {
            const l = d.regions.lanes.find((x) => x.id === g.lane);
            if (!l) continue;
            const entered = g.lane === f.frame.lane && f.frame.region === "lane";
            if (!entered && (g.state === f.frame.state || (screen0.layout.edges[g.lane]?.cross ?? 0) > 1e-6)) continue;
            const mine = d.drag.after(g.state);
            count("entry");
            const want = spans(mine.marks.filter((m) => m.lane === g.lane), l.axis);
            const got = spans(gs.filter((x) => x.lane === g.lane), l.axis);
            if (spanDiff(want.box, got.box) > 1e-6 || want.lines.join() !== got.lines.join()) fail(`entry | ${w.name} | ${g.lane} | ${mode}`, `at ${Math.round(f.point.x)},${Math.round(f.point.y)}: guide ${JSON.stringify(got)} vs entry ${JSON.stringify(want)}`);
            if (mine.landing) for (const x of gs) if (x.lane === g.lane && x.kind !== "line" && inter(x.rect, mine.landing, 0.01)) fail(`entry | ${w.name} | ${g.lane} | ${mode}`, `${x.id} under the landing`);
          }
          // created: under "all", a lane the screen doesn't draw (an empty edge, no band) shows its room whole in the layout
          // that creates it (its one spot's: the marks there and the landing), but where it meets another lane's guide.
          if (mode === "all")
            for (const g of f.frame.named) {
              const l = d.regions.lanes.find((x) => x.id === g.lane);
              if (!l || g.state !== f.frame.state || l.spots.length !== 1 || !edgeOf(s, g.lane) || (screen0.layout.edges[g.lane]?.cross ?? 1) > 1e-6) continue;
              const sp = l.spots[0]!;
              const made = d.drag.after({ kind: "spot", spot: sp.id, point: { x: sp.landing.x + d.grab.x, y: sp.landing.y + d.grab.y } });
              const want = made.marks.filter((m) => m.lane === g.lane);
              if (want.length === 0 || (made.layout.edges[g.lane]?.cross ?? 0) <= 1e-6) continue;
              count("created");
              const others = gs.filter((x) => x.lane !== g.lane).map((x) => x.rect);
              const wanted = spans([...want, ...(made.landing ? [{ lane: g.lane, id: "landing", kind: "box" as const, rect: made.landing }] : [])], l.axis).box;
              const got = spans(gs.filter((x) => x.lane === g.lane), l.axis).box;
              // (The room whole starts at the lane's end; a landing there starts past the edge's padding.)
              const pd = Math.max(pad(s, g.lane).start, pad(s, g.lane).end) + 1;
              const inWanted = (v: number): boolean => wanted.some(([p, q]) => v >= p - pd && v <= q + pd);
              const extra = got.some(([p, q]) => !inWanted(p + 0.5) || !inWanted(q - 0.5));
              // What it gives up lies under another lane's guide.
              const under = (v: number): boolean => others.some((r) => (l.axis === "x" ? v >= r.x - 1 && v <= r.x + r.width + 1 : v >= r.y - 1 && v <= r.y + r.height + 1));
              let lost = 0;
              for (const [p, q] of wanted) for (let v = p + 1; v < q - 1; v += 4) if (!got.some(([a, b]) => v >= a - 1 && v <= b + 1) && !under(v)) lost++;
              if (extra || lost > 0) fail(`created | ${w.name} | ${g.lane} | ${mode}`, `at ${Math.round(f.point.x)},${Math.round(f.point.y)}: guide ${JSON.stringify(got)} vs created ${JSON.stringify(wanted)}`);
            }
          // reach: under "all" with no Near lane (none held or pending), the corner's owner is the lane nearest the
          // pointer within the approach's reach, exactly: owned within it, none past it.
          if (mode === "all" && !f.frame.lane && !f.frame.pending && f.frame.region !== "open") {
            const dist = (r: Rect): number => Math.hypot(Math.max(r.x - f.point.x, 0, f.point.x - (r.x + r.width)), Math.max(r.y - f.point.y, 0, f.point.y - (r.y + r.height)));
            const nearest = [...d.regions.lanes].map((l) => ({ id: l.id, dd: dist(l.rect) })).filter((x) => x.dd <= LANDING_APPROACH.reach).sort((a, b) => a.dd - b.dd)[0];
            const owner = f.frame.named.find((g) => g.state !== f.frame.state)?.lane;
            count("reach");
            if (nearest ? owner !== nearest.id && f.frame.named.some((g) => g.lane === nearest.id && g.state === f.frame.state) && wouldPick(d, nearest.id, f.point) : owner !== undefined)
              fail(`reach | ${w.name} | ${mode}`, `at ${Math.round(f.point.x)},${Math.round(f.point.y)}: owner ${owner ?? "-"}, nearest within reach ${nearest?.id ?? "-"}`);
          }
          // near: a populated lane's Near guide before entry is the screen's guide less the would-land landing.
          const nearLanes = [...new Set(gs.map((g) => g.lane))].filter((id) => id !== f.frame.lane);
          if (mode === "near" && !f.frame.lane)
            for (const id of nearLanes) {
              const l = d.regions.lanes.find((x) => x.id === id);
              // The screen: the frame's state's layout (the window as seen at rest, the float's while it floats).
              const screen = d.drag.after(f.frame.state);
              if (!l || !edgeOf(s, id) || !drawn(screen.layout, id) || itemsOn(screen.layout, id, w.dragged).length === 0) continue;
              count("near populated");
              const would = wouldLand(d, l, f.point);
              const want = spans(lessAlong(screen.marks.filter((m) => m.lane === id), would, l.axis), l.axis);
              const got = spans(gs.filter((g) => g.lane === id), l.axis);
              const diff = spanDiff(want.box, got.box);
              if (diff > 2 || want.lines.length !== got.lines.length || want.lines.some((v, k) => Math.abs(v - got.lines[k]!) > 1))
                fail(`near | ${w.name} | ${id}`, `at ${Math.round(f.point.x)},${Math.round(f.point.y)}: guide ${JSON.stringify(got)} vs screen less landing ${JSON.stringify(want)}`);
            }
          // The frame's release: what it lands, and that drawing it is the commit.
          const r = f.release;
          if (!r) continue;
          const landingKey = `${r.kind === "float" ? "float" : r.spot} ${fmt(f.frame.landing)}`;
          if (!landedMemo.has(landingKey)) landedMemo.set(landingKey, landedOf(d, r));
          const landed = landedMemo.get(landingKey)!;
          if (!landed) {
            fail(`release | ${w.name} | ${r.kind === "float" ? "float" : r.spot}`, "no drop for the release");
            continue;
          }
          const place = r.kind === "float" ? "float" : r.spot;
          if (!checkedDrop.has(landingKey)) {
            checkedDrop.add(landingKey);
            count("drops");
            // items: every item but the held one where the commit puts it.
            for (const [id, it] of Object.entries(landed.commit.items)) {
              if (id === w.dragged) continue;
              const a = landed.after.layout.items[id];
              if (!a || !!a.inMenu !== !!it.inMenu || (!it.inMenu && off(a.rect, it.rect) > EXACT)) {
                fail(`items | ${w.name} | ${place}`, `${id} drawn ${fmt(a?.rect)}, committed ${fmt(it.rect)}`);
                break;
              }
            }
            // landing: the frame's landing is the commit's.
            const committed = landed.commit.items[w.dragged]?.rect ?? null;
            if (!f.frame.landing || !committed || off(f.frame.landing, committed) > EXACT) fail(`landing | ${w.name} | ${place}`, `frame ${fmt(f.frame.landing)}, committed ${fmt(committed)}`);
            // store: the round trip lays the drop out as its own layout.
            for (const [id, it] of Object.entries(landed.stored.items)) {
              const c = landed.commit.items[id];
              if (!c || !!c.inMenu !== !!it.inMenu || (!it.inMenu && off(c.rect, it.rect) > EXACT)) {
                fail(`store | ${w.name} | ${place}`, `${id} solved ${fmt(it.rect)}, after the store ${fmt(c?.rect)}`);
                break;
              }
            }
          }
          if (r.kind !== "spot" || !f.frame.landing) continue;
          count(`held ${mode}`);
          const lane = d.regions.lanes.find((l) => l.id === r.lane);
          if (!lane || !edgeOf(s, lane.id)) continue;
          // hull: where the held item lands alone in its lane, the guides, landing and items span the committed edge.
          const held = gs.filter((g) => g.lane === lane.id);
          if (drawn(landed.commit, lane.id) && alone(landed.commit, lane.id, w.dragged) && lane.refused.length === 0) {
            count(`hull ${mode}`);
            const a = lane.axis;
            const e = landed.commit.edges[lane.id]!.rect;
            const p = pad(s, lane.id);
            const solid = [f.frame.landing, ...held.map((g) => g.rect)];
            const h0 = Math.min(...solid.map((x) => lo(x, a)));
            const h1 = Math.max(...solid.map((x) => hi(x, a)));
            if (!(h0 >= lo(e, a) - 1 && h0 <= lo(e, a) + p.start + 1 && h1 <= hi(e, a) + 1 && h1 >= hi(e, a) - p.end - 1))
              fail(`hull | ${w.name} | ${r.spot} | ${mode}`, `hull ${h0.toFixed(1)}→${h1.toFixed(1)}, committed ${lo(e, a).toFixed(1)}→${hi(e, a).toFixed(1)}`);
          }
          // corner: in the commit, each corner of two drawn lanes is drawn by its owner only.
          const shown = mode === "all" ? laneIds : new Set(gs.map((g) => g.lane));
          const issues = cornerIssues(s, landed.commit, shown, gs, w.dragged, f.frame.landing);
          if (issues.length > 0) fail(`corner | ${w.name} | ${r.spot} | ${mode}`, issues[0]!);
        }
      }
  }
  return { failures, counts };
}

/** Whether the pointer at `p` picks a spot along lane `id` (not a refused stretch): a would-land state there. */
function wouldPick(d: Drag, id: string, p: Point): boolean {
  const l = d.regions.lanes.find((x) => x.id === id)!;
  const a = l.axis === "x" ? p.x : p.y;
  return l.spots.length > 0 && !l.refused.some((r) => a >= r.along[0] && a <= r.along[1]);
}

/** Where the held item would land in `l` at `p`: the spot the pointer picks there, its drop's landing. */
function wouldLand(d: Drag, l: Lane, p: Point): Rect | null {
  const a = l.axis === "x" ? p.x : p.y;
  if (l.refused.some((r) => a >= r.along[0] && a <= r.along[1])) return null;
  const s = l.spots.find((x) => a >= x.along[0] && a <= x.along[1]) ?? [...l.spots].sort((x, y) => Math.min(Math.abs(a - x.along[0]), Math.abs(a - x.along[1])) - Math.min(Math.abs(a - y.along[0]), Math.abs(a - y.along[1])))[0];
  return s ? (s.target.after(p, d.grab).layout.items[d.w.dragged]?.rect ?? null) : null;
}

/**
 * Known failures, by case name: `<clause> | <window> | <lane, spot or place> | <mode>`. The sweep landed with 165 (#41:
 * hull 118, corner 47), all flipped by the one-layout change (a held frame drawn from `after(state)`). A new known
 * failure goes here by name until it is fixed.
 */
const PENDING: readonly string[] = [];

describe("one layout: every held frame draws what its release commits", () => {
  const r = sweep();
  it("the sweep is not vacuous", () => {
    expect(r.counts.windows).toBeGreaterThan(40);
    expect(r.counts.drops).toBeGreaterThan(500);
    expect(r.counts["hull near"] ?? 0).toBeGreaterThan(50);
    expect(r.counts["near populated"] ?? 0).toBeGreaterThan(20);
    // The rule B, entry and reach clauses ran (counts as printed, so a change in coverage shows).
    expect([r.counts.created ?? 0, r.counts.entry ?? 0, r.counts.reach ?? 0].map((n) => n > 20), JSON.stringify(r.counts)).toEqual([true, true, true]);
  });
  it("no failure but the pending ones, by name", () => {
    const unexpected = [...r.failures].filter(([k]) => !PENDING.includes(k)).map(([k, v]) => `${k}: ${v}`);
    expect(unexpected).toEqual([]);
  });
  it("every pending case still fails (one that passes has flipped: take it off the list)", () => {
    expect(PENDING.filter((k) => !r.failures.has(k))).toEqual([]);
  });
});
