/**
 * `dockDrag(...).after(held)`: THE layout of a state of a drag. Its state is what a release commits, its layout that
 * state solved with the drag's one `previous`, its landing the held item there, its marks every lane's in that one
 * layout, and a spot's `spots` its lane's stretches cut in that layout. `guides(frame)` draws each lane from the state it
 * names (rule B). Swept over the one-layout windows.
 */
import { describe, expect, it } from "vitest";
import type { Point, Rect } from "@n-uf/placement";
import { dockDrag, readDockState, solve, storeDockState, type DockDrag, type DockHeld } from "../src";
import { sweepWindows, type SweepWindow } from "./one-layout-windows";

const off = (a: Rect, b: Rect): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.width - b.width), Math.abs(a.height - b.height));
const overlap = (a: Rect, b: Rect): boolean => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0.01 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0.01;

function drags(): { w: SweepWindow; d: DockDrag; grab: Point }[] {
  return sweepWindows().flatMap((w) => {
    const own = solve(w.state, { previous: w.previous }).items[w.dragged];
    if (!own || own.inMenu || own.floating) return [];
    const grab = w.options.grab && w.options.grab.x < own.rect.width && w.options.grab.y < own.rect.height ? w.options.grab : { x: own.rect.width / 2, y: own.rect.height / 2 };
    return [{ w, d: dockDrag(w.state, w.dragged, { ...w.options, previous: w.previous, grab }), grab }];
  });
}

/** Each spot's states: a fixed spot once, a sliding spot at its two ends and its middle. */
function states(d: DockDrag): { lane: string; held: DockHeld }[] {
  return d.regions.lanes.flatMap((l) =>
    l.spots.flatMap((s) => {
      const across = l.axis === "x" ? l.rect.y + l.rect.height / 2 : l.rect.x + l.rect.width / 2;
      const at = (a: number): Point => (l.axis === "x" ? { x: a, y: across } : { x: across, y: a });
      const points = s.slide ? [s.along[0] + 1, (s.along[0] + s.along[1]) / 2, s.along[1] - 1] : [(s.along[0] + s.along[1]) / 2];
      return points.map((a) => ({ lane: l.id, held: { kind: "spot" as const, spot: s.id, point: at(a) } }));
    }),
  );
}

describe("after(held): the state a release commits and its one layout", () => {
  const all = drags();

  it("for every spot state: its layout is its state solved with the drag's previous, the landing is the held item there, and the store round trip keeps it", () => {
    let n = 0;
    for (const { w, d } of all)
      for (const { held } of states(d)) {
        const a = d.after(held);
        const commit = solve(a.state, { previous: w.previous });
        for (const [id, it] of Object.entries(commit.items)) {
          const x = a.layout.items[id]!;
          expect([w.name, held.kind === "spot" && held.spot, id, !!x.inMenu, x.inMenu || off(x.rect, it.rect) < 1e-9]).toEqual([w.name, held.kind === "spot" && held.spot, id, !!it.inMenu, true]);
        }
        expect(a.landing && off(a.landing, commit.items[w.dragged]!.rect) < 1e-9, `${w.name} ${held.kind === "spot" && held.spot}`).toBe(true);
        const stored = solve(readDockState(storeDockState(a.state), w.state).state, { previous: w.previous });
        for (const [id, it] of Object.entries(stored.items)) expect([id, it.inMenu || off(it.rect, commit.items[id]!.rect) < 1e-9]).toEqual([id, true]);
        n++;
      }
    expect(n).toBeGreaterThan(400);
  });

  it("its marks: no two lanes' overlap, none lies over the landing or an item drawn in a bar or a toolbar rail", () => {
    for (const { w, d } of all)
      for (const { held } of [...states(d), { held: null }]) {
        const a = d.after(held);
        // (Two lanes of no edge, new columns on one side, each mark their landing in its own layout, the layout that
        // creates it: `guides` has them give way to each other, as the sweep's overlap clause checks. A new column's
        // room gives way to every other lane's box, but a joint between two panels, a line, lies across it: the column
        // moves aside as the new one opens.)
        const edgeless = (lane: string): boolean => !w.state.edges.some((e) => e.id === lane);
        const jointOverNew = (m: { lane: string; kind: string }, k: { lane: string; kind: string }): boolean => (edgeless(m.lane) && k.kind === "line") || (edgeless(k.lane) && m.kind === "line");
        for (let i = 0; i < a.marks.length; i++)
          for (let j = i + 1; j < a.marks.length; j++) {
            const [m, k] = [a.marks[i]!, a.marks[j]!];
            if (m.lane !== k.lane && !(edgeless(m.lane) && edgeless(k.lane)) && !jointOverNew(m, k) && overlap(m.rect, k.rect)) expect.fail(`${w.name} ${held?.kind === "spot" ? held.spot : "rest"}: ${m.id} over ${k.id}`);
          }
        if (a.landing) for (const m of a.marks) if (m.kind !== "line" && overlap(m.rect, a.landing)) expect.fail(`${w.name} ${held?.kind === "spot" ? held.spot : "rest"}: ${m.id} over the landing`);
      }
  });

  it("at rest it is the window as seen, its marks lanes()'; a spot's `spots` are its lane's spots, cut inside the lane, a bar's or a rail's as seen", () => {
    for (const { w, d } of all) {
      const rest = d.after(null);
      expect([rest.state === w.state, rest.landing]).toEqual([true, null]);
      expect(rest.marks.map(({ lane: _l, ...m }) => m)).toEqual(d.regions.lanes.flatMap((l) => l.marks));
      for (const l of d.regions.lanes)
        for (const s of l.spots.filter((x) => !x.slide)) {
          const spots = d.spotsOf(s.id)!;
          const lo = l.axis === "x" ? l.rect.x : l.rect.y;
          const hi = lo + (l.axis === "x" ? l.rect.width : l.rect.height);
          expect([w.name, s.id, spots.map((x) => x.id)]).toEqual([w.name, s.id, l.spots.map((x) => x.id)]);
          for (const x of spots) expect([s.id, x.id, x.along[0] >= lo - 1e-6 && x.along[1] <= hi + 1e-6]).toEqual([s.id, x.id, true]);
        }
    }
  });

  it("is remembered: the same state gives the same object, a fixed spot at any pointer", () => {
    const { d } = all[0]!;
    const s = d.regions.lanes.flatMap((l) => l.spots).find((x) => !x.slide)!;
    expect(d.after({ kind: "spot", spot: s.id, point: { x: 1, y: 2 } })).toBe(d.after({ kind: "spot", spot: s.id, point: { x: 300, y: 9 } }));
    expect(d.after(null)).toBe(d.after(null));
  });
});

describe("guides(frame): each lane from the state it names", () => {
  const all = drags();

  it("with every guide naming the screen's state, a lane's guide is its marks there", () => {
    for (const { d } of all)
      for (const { lane, held } of states(d).slice(0, 4)) {
        const a = d.after(held);
        expect(d.guides({ state: held, room: true, guides: [{ lane, state: held }] })).toEqual(a.marks.filter((m) => m.lane === lane));
      }
  });

  it("a lane the screen doesn't draw takes the layout that creates it; a lane drawn on screen is drawn there, less the would-land landing", () => {
    let empty = 0;
    let drawn = 0;
    for (const { d } of all) {
      const rest = d.after(null);
      for (const { lane, held } of states(d)) {
        const mine = d.after(held);
        const g = d.guides({ state: null, room: false, guides: [{ lane, state: held }] });
        // (Drawn: open, or a column folded into its side's rail.)
        const e = rest.layout.edges[lane];
        if (e && (e.cross > 1e-6 || !!e.folded)) {
          drawn++;
          for (const m of g) {
            expect(rest.marks.some((r) => r.lane === lane && r.kind === m.kind && m.rect.x >= r.rect.x - 1e-9 && m.rect.x + m.rect.width <= r.rect.x + r.rect.width + 1e-9 && m.rect.y >= r.rect.y - 1e-9 && m.rect.y + m.rect.height <= r.rect.y + r.rect.height + 1e-9)).toBe(true);
            if (mine.landing && m.kind !== "line") expect(overlap(m.rect, mine.landing)).toBe(false);
          }
        } else if (mine.layout.edges[lane]) {
          empty++;
          expect(g).toEqual(mine.marks.filter((m) => m.lane === lane));
        }
      }
    }
    expect([empty > 20, drawn > 100]).toEqual([true, true]);
  });

  it('under "all", the Near lane\'s marks win: no other lane\'s guide overlaps them', () => {
    for (const { d } of all)
      for (const { lane, held } of states(d)) {
        const others = d.regions.lanes.filter((l) => l.id !== lane).map((l) => ({ lane: l.id, state: null }));
        const g = d.guides({ state: null, room: false, guides: [{ lane, state: held }, ...others] });
        const near = g.filter((m) => m.lane === lane);
        for (const m of g) if (m.lane !== lane) for (const n of near) expect([m.id, n.id, overlap(m.rect, n.rect)]).toEqual([m.id, n.id, false]);
      }
  });
});
