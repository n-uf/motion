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
 * - **shown:** the guides of a lane the frame draws are its marks in `shown(frame)` (the window at rest while a float's
 *   room is closed), float frames read with the room closed and open;
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
import { dockDrag, readDockState, refusals, refusalTargets, solve, storeDockState, targets, type DockAfter, type DockDrag, type DockLayout, type DockRegions, type DockState } from "../src";
import { marksLess } from "../src/lanes";
import { referencePick } from "../src/testing/host";
import { modelOver, type DrawnFrame as LandingFrame } from "./landing-model";
import { sweepWindows, type SweepWindow } from "./one-layout-windows";
import { railTrayWindow, railWindow } from "./rail-windows";

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
/** An edge drawn in `layout`: open, or a column folded into its side's rail. */
const drawnIn = (layout: DockLayout, id: string): boolean => {
  const e = layout.edges[id];
  return !!e && (e.cross > 1e-6 || !!e.folded);
};
/** The rail a folded column of `layout` lies in. */
const railOf = (layout: DockLayout, id: string): Rect | undefined => Object.values(layout.rails).find((r) => r?.segments.some((g) => g.edge === id))?.rect;
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

/**
 * What a frame draws: the layout the drag names (`shown`), with the marks read in it and the landing (a float's lies
 * there while the window stays at rest).
 */
function screenOf(d: Drag, frame: LandingFrame): { readonly layout: DockLayout; readonly marks: DockAfter["marks"]; readonly landing: Rect | null } {
  const drawn = frame.room ? d.drag.after(frame.state) : d.drag.after(null);
  return { layout: d.drag.shown(frame), marks: drawn.marks, landing: d.drag.after(frame.state).landing };
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
/**
 * `ms` less `r` along `axis`, by the package's one rect subtraction (`marksLess`): the pieces either side, a box piece
 * the cut leaves 8 px or shorter dropped, a line gone only where `r` covers it.
 */
const lessAlong = (ms: readonly Guide[], r: Rect | null, axis: Axis): Guide[] => (r ? marksLess(ms, axis, [r], { suffix: "~l", minBox: 8, lines: "covered" }) : [...ms]);

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
          // shown, spot frames: the model holds a spot only with its room open, so a spot frame's guides are the same read with
          // the room forced open (the guides that were cut in `after(state)` before `shown`).
          if (f.frame.state?.kind === "spot") {
            count("spot frames");
            if (!f.frame.room) fail(`shown | ${w.name} | spot frame without room | ${mode}`, `at ${Math.round(f.point.x)},${Math.round(f.point.y)}: the model gave a spot with its room closed`);
            if (JSON.stringify(d.drag.guides({ ...f.frame, guides: f.frame.named })) !== JSON.stringify(d.drag.guides({ ...f.frame, room: true, guides: f.frame.named })))
              fail(`shown | ${w.name} | spot frame, room forced open | ${mode}`, `at ${Math.round(f.point.x)},${Math.round(f.point.y)}: the guides differ with the room forced open`);
          }
          // shown: the guides of a lane the frame draws, named with the frame's own state, are its marks in `shown(frame)`:
          // the window at rest while the room is closed, the state's layout once it is open. A float's frames are read with
          // the room closed (the model's) and open (a host that draws the float's layout).
          for (const room of f.frame.state?.kind === "float" ? [false, true] : [f.frame.room]) {
            const fr = { ...f.frame, room };
            const layout = d.drag.shown(fr);
            const marks = (room ? d.drag.after(fr.state) : d.drag.after(null)).marks;
            for (const g of f.frame.named) {
              if (g.state !== fr.state || !edgeOf(s, g.lane) || !drawnIn(layout, g.lane)) continue;
              count(`shown ${fr.state?.kind ?? "rest"}, room ${room ? "open" : "closed"}`);
              const got = d.drag.guides({ ...fr, guides: [g] }).filter((m) => m.lane === g.lane);
              const want = marks.filter((m) => m.lane === g.lane);
              if (JSON.stringify(got) !== JSON.stringify(want)) fail(`shown | ${w.name} | ${g.lane} | ${mode}`, `at ${Math.round(f.point.x)},${Math.round(f.point.y)}, room ${room}: guides ${got.map((m) => fmt(m.rect)).join("; ")} vs marks in the shown layout ${want.map((m) => fmt(m.rect)).join("; ")}`);
            }
          }
          // rail-free: no guide but a line covers a rail segment the frame draws: a side rail's tabs (its folded columns'
          // members) and the items of a toolbar rail. (A lane shown for another state than the screen's that the screen
          // doesn't draw, and the corner's owner by reach, draw their own layout and win: the bar keeps the corner over a
          // rail it moves.)
          const onScreen = d.drag.shown(f.frame);
          const reachOwner = f.frame.lane ? undefined : f.frame.named.find((g) => g.state !== f.frame.state)?.lane;
          const exempt = new Set(f.frame.named.filter((g) => g.lane === reachOwner || (g.state !== f.frame.state && !drawnIn(onScreen, g.lane))).map((g) => g.lane));
          // folded: a column the screen draws folded into its side's rail shows its marks along that rail, as wide as it.
          for (const g of f.frame.named) {
            if (g.state !== f.frame.state || !onScreen.edges[g.lane]?.folded) continue;
            const rail = railOf(onScreen, g.lane);
            count("folded on screen");
            for (const x of gs)
              if (x.lane === g.lane && x.kind !== "line" && (!rail || !contains(rail, x.rect) || Math.abs((axisOfEdge(s, g.lane) === "y" ? x.rect.width - rail.width : x.rect.height - rail.height)) > 1e-6))
                fail(`folded | ${w.name} | ${g.lane} | ${mode}`, `at ${Math.round(f.point.x)},${Math.round(f.point.y)}: ${x.id} ${fmt(x.rect)} in the rail ${fmt(rail)}`);
          }
          if (gs.length > 0) {
            const segments = [
              ...Object.values(onScreen.rails).flatMap((r) => r?.segments.filter((g) => g.id !== w.dragged).map((g) => ({ id: g.id, rect: g.rect })) ?? []),
              ...s.edges.filter((e) => e.compact && e.side !== "top" && e.side !== "bottom").flatMap((e) => (onScreen.edges[e.id]?.items ?? []).filter((id) => id !== w.dragged && onScreen.items[id]).map((id) => ({ id, rect: onScreen.items[id]!.rect }))),
            ];
            if (segments.length > 0) count("rail segments");
            for (const g of gs)
              for (const t of segments)
                if (g.kind !== "line" && !exempt.has(g.lane) && inter(g.rect, t.rect, 0.5)) fail(`rail-free | ${w.name} | ${g.lane} | ${mode}`, `at ${Math.round(f.point.x)},${Math.round(f.point.y)}: ${g.id} ${fmt(g.rect)} over ${t.id} ${fmt(t.rect)}`);
          }
          // entry: a lane shown for another state than the screen's (the Near lane, or the corner's owner by reach), or
          // the entered lane, shows its entry: its marks in that state's layout, which leave out only the landing there.
          // (A lane the screen draws is the named exception, rule B: the screen's less the landing, the `near` clause.)
          const screen0 = screenOf(d, f.frame);
          for (const g of f.frame.named) {
            const l = d.regions.lanes.find((x) => x.id === g.lane);
            if (!l) continue;
            const entered = g.lane === f.frame.lane && f.frame.region === "lane";
            // (A column the screen draws folded into its rail on a spot frame is exempted here: counted, so a loss of coverage shows.)
            if (!entered && g.state !== f.frame.state && f.frame.state?.kind === "spot" && screen0.layout.edges[g.lane]?.folded && drawnIn(screen0.layout, g.lane)) count("entry exempted: folded on a spot frame");
            if (!entered && (g.state === f.frame.state || drawnIn(screen0.layout, g.lane))) continue;
            const mine = d.drag.after(g.state);
            count("entry");
            const want = spans(mine.marks.filter((m) => m.lane === g.lane), l.axis);
            const got = spans(gs.filter((x) => x.lane === g.lane), l.axis);
            if (spanDiff(want.box, got.box) > 1e-6 || want.lines.join() !== got.lines.join()) fail(`entry | ${w.name} | ${g.lane} | ${mode}`, `at ${Math.round(f.point.x)},${Math.round(f.point.y)}: guide ${JSON.stringify(got)} vs entry ${JSON.stringify(want)}`);
            if (mine.landing) for (const x of gs) if (x.lane === g.lane && x.kind !== "line" && inter(x.rect, mine.landing, 0.01)) fail(`entry | ${w.name} | ${g.lane} | ${mode}`, `${x.id} under the landing`);
          }
          // created: under "all", a lane the screen doesn't draw (an empty edge, no band, or a column the lift deletes)
          // shows its room whole in the layout that creates it (its one spot's: the marks there and the landing, the column
          // open or folded into its rail there), but where it meets another lane's guide.
          if (mode === "all" && w.options.emptyLanes !== "edge")
            for (const g of f.frame.named) {
              const l = d.regions.lanes.find((x) => x.id === g.lane);
              if (!l || g.state !== f.frame.state || l.spots.length !== 1 || !edgeOf(s, g.lane) || drawnIn(screen0.layout, g.lane)) continue;
              const sp = l.spots[0]!;
              const made = d.drag.after({ kind: "spot", spot: sp.id, point: { x: sp.landing.x + d.grab.x, y: sp.landing.y + d.grab.y } });
              const want = made.marks.filter((m) => m.lane === g.lane);
              // A column created folded into a declared rail is drawn where its run of tiles lies: the held item alone in it,
              // its run is the landing, so the lane draws no room beyond it (no mark over the rest of the rail).
              if (want.length === 0 && made.layout.edges[g.lane]?.folded && drawnIn(made.layout, g.lane)) {
                const run = Object.values(made.layout.rails).flatMap((r) => r?.segments.filter((x) => x.edge === g.lane).map((x) => x.rect) ?? []);
                if (run.length === 1 && made.landing && off(run[0]!, made.landing) <= EXACT) count("created folded, its run the landing");
              }
              if (want.length === 0 || !drawnIn(made.layout, g.lane)) continue;
              count("created");
              if (made.layout.edges[g.lane]!.folded) count("created folded");
              const others = gs.filter((x) => x.lane !== g.lane).map((x) => x.rect);
              const wanted = spans([...want, ...(made.landing ? [{ lane: g.lane, id: "landing", kind: "box" as const, rect: made.landing }] : [])], l.axis).box;
              const got = spans(gs.filter((x) => x.lane === g.lane), l.axis).box;
              // (The room whole starts at the lane's end; a landing there starts past the edge's padding.)
              const pd = Math.max(pad(s, g.lane).start, pad(s, g.lane).end) + 1;
              const inWanted = (v: number): boolean => wanted.some(([p, q]) => v >= p - pd && v <= q + pd);
              const extra = got.some(([p, q]) => !inWanted(p + 0.5) || !inWanted(q - 0.5));
              // What it gives up lies under something the screen draws, in 2-D: another lane's guide, a drawn bar or toolbar
              // rail (its items stay put), or the landing on screen.
              const stay = s.edges.filter((e) => (e.side === "top" || e.side === "bottom" || !!e.compact) && (screen0.layout.edges[e.id]?.cross ?? 0) > 1e-6).map((e) => screen0.layout.edges[e.id]!.rect);
              const tabs = Object.values(screen0.layout.rails).flatMap((r) => r?.segments.filter((x) => x.id !== w.dragged).map((x) => x.rect) ?? []);
              const blockers = [...others, ...stay, ...tabs, ...(screen0.landing ? [screen0.landing] : [])];
              const c0 = Math.min(...want.map((m) => (l.axis === "x" ? m.rect.y : m.rect.x)));
              const c1 = Math.max(...want.map((m) => (l.axis === "x" ? m.rect.y + m.rect.height : m.rect.x + m.rect.width)));
              const slab = (v: number): Rect => (l.axis === "x" ? { x: v - 1, y: c0, width: 2, height: c1 - c0 } : { x: c0, y: v - 1, width: c1 - c0, height: 2 });
              const under = (v: number): boolean => blockers.some((r) => inter(r, slab(v), 0.01) !== null);
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
              // The screen: the layout the frame draws (`shown`: the state's while its room is open, else the window at rest).
              const screen = screenOf(d, f.frame);
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
            if (r.kind === "float") count("float drops");
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
          // landing-free: no guide but a line lies over the landing the frame draws (every lane, near and all).
          for (const g of gs) if (g.kind !== "line" && inter(g.rect, f.frame.landing, 0.5)) fail(`landing-free | ${w.name} | ${g.lane} | ${mode}`, `at ${Math.round(f.point.x)},${Math.round(f.point.y)}: ${g.id} ${fmt(g.rect)} over the landing ${fmt(f.frame.landing)}`);
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
    // Frames that draw a rail segment (a side rail's tab or a toolbar rail's item) were checked against the guides.
    expect(r.counts["rail segments"] ?? 0, JSON.stringify(r.counts)).toBeGreaterThan(100);
    // Columns drawn folded into a rail, on screen and in the layout that creates a deleted one, were checked: the latter is
    // drawn where its run lies, which for the held item alone in it is the landing itself (a room beyond it would be a mark
    // over the rest of the rail).
    expect([r.counts["folded on screen"] ?? 0, r.counts["created folded, its run the landing"] ?? 0].map((n) => n > 20), JSON.stringify(r.counts)).toEqual([true, true]);
    // And no column created folded draws a mark: every one the sweep reaches has only its own tile (the count of those with
    // marks, which a change would raise, is pinned at none).
    expect(r.counts["created folded"] ?? 0, JSON.stringify(r.counts)).toBe(0);
    // Floats land and are checked too (a float landing that went null would leave none).
    expect(r.counts["float drops"] ?? 0, JSON.stringify(r.counts)).toBeGreaterThan(20);
    // Spot frames were all held with the room open and read the same with it forced open; the folded lanes the entry
    // clause exempts on them are counted: none today (the `drawnIn` exemption removes no spot-frame coverage; a loss shows here).
    expect([(r.counts["spot frames"] ?? 0) > 0, r.counts["entry exempted: folded on a spot frame"] ?? 0], JSON.stringify(r.counts)).toEqual([true, 0]);
    // The shown clause ran on float frames with the room closed and open, and on spot frames.
    expect([r.counts["shown float, room closed"] ?? 0, r.counts["shown float, room open"] ?? 0, r.counts["shown spot, room open"] ?? 0].map((n) => n > 20), JSON.stringify(r.counts)).toEqual([true, true, true]);
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

/**
 * One answer at a pointer over a rail: the drag's lanes (`dockDrag(...).regions`, what a landing model reads) and
 * `targets()` (what a drag intent reads) decide the same thing at every sampled point of a side's rail for a tile of it
 * held: move to a place, stay (home, a refusal, a blocked place: a release there commits nothing), or float. A column
 * folded into a declared rail is drawn where its run of tiles lies, and the rest of the rail is the rail's: a place there
 * is home, not a spot of the held tile's column (decision 0002's rule, one answer).
 *
 * The windows are the declared-rail windows of `./rail-windows` (one and two folded columns, narrow too) and the sweep's
 * windows where the held item is a tile of a rail. Known disagreements are pending by name (`AGREE_PENDING`, window and
 * item); the check fails on one not listed and on a listed one that agrees (it flipped: take it off the list).
 */
const inside = (r: Rect, p: Point): boolean => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;

/** The decisions at `p`: what `targets()` picks and what the lanes say, as a place id, "stay" or "float". */
function decisions(s: DockState, held: string, previous: DockLayout | undefined, options: object, p: Point): { targets: string; lanes: string } {
  const opts = { ...options, ...(previous ? { previous } : {}) };
  const pick = referencePick([...targets(s, held, opts), ...refusalTargets(refusals(s, held, opts))] as never[], p) as { id: string; place?: { kind: string }; refuse?: true } | null;
  const t = !pick || pick.refuse || pick.place?.kind === "home" || pick.place?.kind === "none" ? "stay" : pick.place?.kind === "float" ? "float" : pick.id;
  const own = solve(s, previous ? { previous } : {}).items[held]!;
  const regions = dockDrag(s, held, { ...opts, grab: { x: own.rect.width / 2, y: own.rect.height / 2 } }).regions;
  const over = regions.lanes.filter((l) => inside(l.rect, p));
  const lane = (l: Lane): string => {
    const a = l.axis === "x" ? p.x : p.y;
    if (l.refused.some((r) => a >= r.along[0] && a <= r.along[1])) return "stay";
    const sp = l.spots.find((x) => a >= x.along[0] && a <= x.along[1]);
    return !sp ? "no spot" : sp.home ? "stay" : sp.target.id;
  };
  const open = inside(regions.content, p) && !regions.blocked.some((b) => inside(b, p)) && !regions.refused.some((b) => inside(b, p));
  return { targets: t, lanes: over.length === 0 ? (open ? "float" : "stay") : over.map(lane).join("+") };
}

/**
 * Known disagreements (`<window> | <item>`), none of them about a column's run: in a narrow window `targets()` offers a new
 * column over the whole left rail where the lanes stay (a new-column line's zone starts where the rail stop ends), and so
 * in the narrow window whose right column holds a tray of toolbars (marks or a toolbar held: `column:right:1` over the
 * rail at its inner edge, from the second tile down); in the four windows with a second right column holding p1 (and p1
 * held, its column folded), the lanes' new-column lane lies over the rail's first pixels where `targets()` floats. All
 * are the same on `ce7b796c`.
 */
const AGREE_PENDING: readonly string[] = [
  "two folded columns, narrow | notes",
  "tray column, narrow | marks",
  "tray column, narrow | tools",
  "tray column, narrow | tools2",
  "two right columns, ring 0 holding p1, panel p1 | p1",
  "two right columns, ring 0 holding p1, panel p1, empty lanes as edges | p1",
  "two right columns, ring 2 holding p1, panel p1 | p1",
  "two right columns, ring 2 holding p1, panel p1, empty lanes as edges | p1",
];

describe("one answer over a rail: the lanes and targets() decide the same", () => {
  const wins: { name: string; s: DockState; held: string; previous?: DockLayout; options: object }[] = [];
  for (const [name, o] of [
    ["one folded column", { rails: true }],
    ["three tiles", { rails: true, right: ["findings", "annotations", "marks"] }],
    ["two folded columns", { rails: true, outer: ["p1", "p2"] }],
    ["two folded columns of three and two", { rails: true, right: ["findings", "annotations", "marks"], outer: ["p1", "p2"] }],
    ["two folded columns, narrow", { rails: true, outer: ["p1", "p2"], width: 800, hand: [] }],
  ] as const) {
    const s = railWindow(o as never);
    for (const id of Object.keys(s.items)) if (solve(s).items[id]?.rail) wins.push({ name, s, held: id, options: {} });
  }
  // A narrow window whose right column (annotations, marks, and a tray of two toolbars) folds into the rail by width.
  {
    const s = railTrayWindow({ rails: true, width: 700, hand: [], right: ["annotations", "marks"] }, ["tools", "tools2"]);
    for (const id of Object.keys(s.items)) if (solve(s).items[id]?.rail) wins.push({ name: "tray column, narrow", s, held: id, options: {} });
  }
  for (const w of sweepWindows()) if (solve(w.state, { previous: w.previous }).items[w.dragged]?.rail) wins.push({ name: w.name, s: w.state, held: w.dragged, previous: w.previous, options: w.options });

  const disagree = new Map<string, string>();
  let points = 0;
  for (const w of wins) {
    const l = solve(w.s, w.previous ? { previous: w.previous } : {});
    for (const rail of Object.values(l.rails)) {
      if (!rail || !rail.segments.some((g) => g.id === w.held)) continue;
      const x = rail.rect.x + rail.rect.width / 2;
      // Down the rail and a little past either end, off the tiles' ends (1.37 px) so a point is in one tile only.
      for (let y = Math.max(0, rail.rect.y - 20) + 1.37; y < Math.min(w.s.stage.height, rail.rect.y + rail.rect.height + 20); y += 3) {
        points++;
        const d = decisions(w.s, w.held, w.previous, w.options, { x, y });
        const key = `${w.name} | ${w.held}`;
        if (d.targets !== d.lanes && !disagree.has(key)) disagree.set(key, `at ${x},${y.toFixed(1)}: targets ${d.targets}, lanes ${d.lanes}`);
      }
    }
  }
  it("the property is not vacuous", () => {
    expect(wins.length).toBeGreaterThan(15);
    expect(points).toBeGreaterThan(3000);
  });
  it("no disagreement but the pending ones, by name", () => {
    expect([...disagree].filter(([k]) => !AGREE_PENDING.includes(k)).map(([k, v]) => `${k}: ${v}`)).toEqual([]);
  });
  it("every pending disagreement still disagrees (one that agrees has flipped: take it off the list)", () => {
    expect(AGREE_PENDING.filter((k) => !disagree.has(k))).toEqual([]);
  });
});
