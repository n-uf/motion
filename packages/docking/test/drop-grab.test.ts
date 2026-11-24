/**
 * Every drop says where it holds the item (`DropResult.grab`), by the one reading a held place's `DockAfter.grab` is:
 * swept over the one-layout windows, with a plain press and with a grab function.
 *
 * - **every target has a grab:** each target of `targets()` and each stop of `stops()`, of every kind (a gap, a column, a
 *   rail, a side, a float, home, none), gives a finite `grab` from its `after()`, with no grab, a plain point or a function.
 * - **one reading:** a fixed spot's drop gives the grab `dockDrag(...).after(held)` gives for that spot, a sliding spot's
 *   and the float's too; and so does the target of `targets()` that is the spot's drop.
 * - **no glide:** an item that keeps its form and size moving from one bar's slot to another's, held at the press and
 *   brought over the slot, is drawn at the pointer less the drop's grab: the release glides under half a pitch.
 * - **no grab passed:** on one `targets()` list (and the `stops()` and the drag's spots) made with `options.grab = g`,
 *   `after(p)` equals `after(p, g)`, for every kind: a gap, a column, a float, home and a sliding spot alike.
 * - **the grab passed:** a fixed drop's grab is derived from the grab passed to `after()`, as a float's is: on one
 *   `targets()` list, another grab gives another point, equal to the one a list made with that grab gives.
 * - **every bar move:** the grab lies in the landing (0 to its size each way), and along a row's length it is the
 *   press's share of the new length, so a pointer in the slot lies on the copy drawn at the pointer less the grab.
 * - **keys:** `stops()` and `lanes()` leave `onGrabNote` out of their memo keys: an inline callback per call still hits.
 */
import { describe, expect, it } from "vitest";
import type { Point } from "@n-uf/placement";
import { dockDrag, lanes, solve, stops, targets, type DockDrop, type DockGrab, type DockGrabForm, type DockHeld, type DockLaneOptions } from "../src";
import { sweepWindows, type SweepWindow } from "./one-layout-windows";

const PITCH = 40;

/** The window's drag options with `grab`. */
const optionsOf = (w: SweepWindow, grab: DockGrab | undefined): DockLaneOptions => {
  const { grab: _own, ...rest } = w.options;
  return { ...rest, previous: w.previous, ...(grab ? { grab } : {}) };
};

const middle = (t: DockDrop): Point => ({ x: t.hit.x + t.hit.width / 2, y: t.hit.y + t.hit.height / 2 });

/** A function grab: a third of the laid rect along its longer side, a fifth across, in any form. */
const third: DockGrab = (_f: DockGrabForm, s) => (s.width >= s.height ? { x: s.width / 3, y: s.height / 5 } : { x: s.width / 5, y: s.height / 3 });

/** The grabs a window is swept with: none, the press at the item's middle, and the function. */
function grabsOf(w: SweepWindow): (DockGrab | undefined)[] {
  const own = solve(w.state, { previous: w.previous }).items[w.dragged];
  const press = own && own.rect.width > 0 && own.rect.height > 0 ? { x: own.rect.width / 2, y: own.rect.height / 2 } : undefined;
  return [undefined, ...(press ? [press] : []), third];
}

const windows = sweepWindows().filter((w) => solve(w.state, { previous: w.previous }).items[w.dragged] !== undefined);

describe("every drop gives the grab", () => {
  it("each target and stop of every kind has a finite grab", () => {
    const kinds = new Map<string, number>();
    for (const w of windows)
      for (const grab of grabsOf(w)) {
        const o = optionsOf(w, grab);
        for (const t of [...targets(w.state, w.dragged, o), ...stops(w.state, w.dragged, o)]) {
          const a = t.after(middle(t), grab);
          const at = `${w.name} ${t.id}`;
          expect(a.grab, at).toBeDefined();
          expect(Number.isFinite(a.grab!.x) && Number.isFinite(a.grab!.y), at).toBe(true);
          kinds.set(t.place.kind, (kinds.get(t.place.kind) ?? 0) + 1);
        }
      }
    for (const k of ["gap", "column", "float", "home"]) expect(kinds.get(k) ?? 0, k).toBeGreaterThan(100);
    // eslint-disable-next-line no-console
    console.info("drop grab, targets by kind:", JSON.stringify([...kinds]));
  });

  it("a drop's grab is derived from the grab passed to after(), fixed and float alike", () => {
    const kinds = new Map<string, number>();
    let moved = 0;
    for (const w of windows) {
      const own = solve(w.state, { previous: w.previous }).items[w.dragged]!;
      const off = { x: Math.min(5, own.rect.width / 2), y: Math.min(5, own.rect.height / 2) };
      // One list made with no grab; each grab is passed to its drops' after(), as a host that has only its press does.
      const plain = targets(w.state, w.dragged, optionsOf(w, undefined));
      for (const g of [off, third]) {
        const made = new Map(targets(w.state, w.dragged, optionsOf(w, g)).map((t) => [t.id, t] as const));
        for (const t of plain) {
          const a = t.after(middle(t), g).grab!;
          const at = `${w.name} ${t.id}`;
          expect(a, at).toBeDefined();
          // The same drop of a list made with that grab (its tiles cut by it) gives the same.
          const same = made.get(t.id);
          if (same) expect(same.after(middle(t), g).grab, at).toEqual(a);
          // The grab passed decides it: another grab (none) gives another point on the drops it reaches.
          if (g === off && t.after(middle(t)).grab && JSON.stringify(t.after(middle(t)).grab) !== JSON.stringify(a)) moved++;
          kinds.set(t.place.kind, (kinds.get(t.place.kind) ?? 0) + 1);
        }
      }
    }
    for (const k of ["gap", "column", "float", "home"]) expect(kinds.get(k) ?? 0, k).toBeGreaterThan(100);
    expect(moved).toBeGreaterThan(100);
    // eslint-disable-next-line no-console
    console.info("drop grab, passed to after(), by kind:", JSON.stringify([...kinds]), "moved by the grab:", moved);
  });

  it("a grab not passed to after() is the drag's own (options.grab), the same for every kind", () => {
    const kinds = new Map<string, number>();
    let slides = 0;
    let floats = 0;
    for (const w of windows) {
      const own = solve(w.state, { previous: w.previous }).items[w.dragged]!;
      const off = { x: Math.min(5, own.rect.width / 2), y: Math.min(5, own.rect.height / 2) };
      for (const g of [off, third]) {
        // One list, made with the grab: after(p) with none is after(p, g), whatever the kind of drop.
        const o = optionsOf(w, g);
        const same = (t: DockDrop, p: Point, at: string): void => {
          expect(t.after(p), at).toEqual(t.after(p, g));
          kinds.set(t.place.kind, (kinds.get(t.place.kind) ?? 0) + 1);
        };
        for (const t of [...targets(w.state, w.dragged, o), ...stops(w.state, w.dragged, o)]) same(t, middle(t), `${w.name} ${t.id}`);
        const drag = dockDrag(w.state, w.dragged, o);
        for (const lane of drag.regions.lanes)
          for (const s of lane.spots) {
            same(s.target, middle(s.target), `${w.name} ${s.id}`);
            if (s.slide) slides++;
          }
        if (drag.regions.float) {
          const c = drag.regions.content;
          same(drag.regions.float, { x: c.x + c.width * 0.4, y: c.y + c.height * 0.6 }, `${w.name} float`);
          floats++;
        }
      }
    }
    for (const k of ["gap", "column", "float", "home"]) expect(kinds.get(k) ?? 0, k).toBeGreaterThan(100);
    expect(slides).toBeGreaterThan(100);
    expect(floats).toBeGreaterThan(100);
    // eslint-disable-next-line no-console
    console.info("drop grab, none passed, by kind:", JSON.stringify([...kinds]), "sliding:", slides, "floats:", floats);
  });

  it("a drop's grab is the held place's, for fixed spots, sliding spots, floats and the targets that are the spots' drops", () => {
    let fixed = 0;
    let slides = 0;
    let floats = 0;
    let listed = 0;
    for (const w of windows)
      for (const grab of grabsOf(w)) {
        const o = optionsOf(w, grab);
        const drag = dockDrag(w.state, w.dragged, o);
        const listedBy = new Map(targets(w.state, w.dragged, o).map((t) => [t.id, t] as const));
        for (const lane of drag.regions.lanes)
          for (const s of lane.spots) {
            const across = lane.axis === "x" ? lane.rect.y + lane.rect.height / 2 : lane.rect.x + lane.rect.width / 2;
            const along = (s.along[0] + s.along[1]) / 2;
            const point: Point = lane.axis === "x" ? { x: along, y: across } : { x: across, y: along };
            const held: DockHeld = { kind: "spot", spot: s.id, point };
            const want = drag.after(held).grab;
            const at = `${w.name} ${s.id}`;
            expect(s.target.after(point, grab).grab, at).toEqual(want);
            if (s.slide) slides++;
            else {
              fixed++;
              // The same drop as the targets() list gives, where that list has it.
              const same = listedBy.get(s.target.id);
              if (same) {
                expect(same.after(point, grab).grab, `${at} (targets())`).toEqual(want);
                listed++;
              }
            }
          }
        if (drag.regions.float) {
          const c = drag.regions.content;
          const point = { x: c.x + c.width * 0.4, y: c.y + c.height * 0.6 };
          expect(drag.regions.float.after(point, grab).grab, `${w.name} float`).toEqual(drag.after({ kind: "float", point }).grab);
          floats++;
        }
      }
    expect(fixed).toBeGreaterThan(1000);
    expect(slides).toBeGreaterThan(100);
    expect(floats).toBeGreaterThan(100);
    expect(listed).toBeGreaterThan(500);
  });

  it("on a bar a bar-to-bar move glides less than half a pitch on release", () => {
    let moves = 0;
    let worst = 0;
    // The item keeps its form and size from one bar's slot to another's. Its copy is held at the press and the user brings
    // it over the slot: the pointer at the slot's start plus the press, the copy lying on the slot. It then takes the form
    // the drop gives, drawn at the pointer less the drop's grab, and a release lands it at the slot: the glide along the
    // bar is how far that grab lies from the press. A drop with no grab (the fixed slot's, before) left the host its own.
    for (const w of windows)
      for (const grab of grabsOf(w)) {
        const o = optionsOf(w, grab);
        const press = dockDrag(w.state, w.dragged, o).after(null).grab;
        const own = solve(w.state, { previous: w.previous }).items[w.dragged]!;
        if (own.floating || own.inMenu || own.rail || !w.state.edges.some((e) => e.id === own.edge && (e.side === "top" || e.side === "bottom"))) continue;
        for (const t of targets(w.state, w.dragged, o)) {
          if (t.place.kind !== "gap" || t.free) continue;
          const edge = w.state.edges.find((e) => e.id === (t.place as { edge: string }).edge);
          if (!edge || (edge.side !== "top" && edge.side !== "bottom")) continue;
          const a = t.after(middle(t), o.grab);
          const to = a.layout.items[w.dragged]?.rect;
          if (!to || Math.abs(to.width - own.rect.width) > 1e-6 || Math.abs(to.height - own.rect.height) > 1e-6) continue;
          const pointer = to.x + press.x;
          const glide = Math.abs(pointer - a.grab!.x - to.x);
          worst = Math.max(worst, glide);
          moves++;
          expect(glide, `${w.name} ${t.id}`).toBeLessThan(PITCH / 2);
        }
      }
    expect(moves).toBeGreaterThan(200);
    // eslint-disable-next-line no-console
    console.info("drop grab, bar-to-bar moves:", moves, "worst glide:", worst);
  });

  it("on every bar-to-bar move the grab lies in the landing and is the press's share of its new length", () => {
    let moves = 0;
    let shares = 0;
    for (const w of windows)
      for (const grab of grabsOf(w)) {
        const o = optionsOf(w, grab);
        const own = solve(w.state, { previous: w.previous }).items[w.dragged]!;
        if (own.floating || own.inMenu || own.rail || !w.state.edges.some((e) => e.id === own.edge && (e.side === "top" || e.side === "bottom"))) continue;
        for (const t of targets(w.state, w.dragged, o)) {
          if (t.place.kind !== "gap" || t.free) continue;
          const edge = w.state.edges.find((e) => e.id === (t.place as { edge: string }).edge);
          if (!edge || (edge.side !== "top" && edge.side !== "bottom")) continue;
          const a = t.after(middle(t), o.grab);
          const to = a.layout.items[w.dragged]?.rect;
          if (!to || !a.grab) continue;
          const at = `${w.name} ${t.id}`;
          // In the landing, whatever its form and size.
          expect(a.grab.x, at).toBeGreaterThanOrEqual(0);
          expect(a.grab.x, at).toBeLessThanOrEqual(to.width + 1e-6);
          expect(a.grab.y, at).toBeGreaterThanOrEqual(0);
          expect(a.grab.y, at).toBeLessThanOrEqual(to.height + 1e-6);
          // So a pointer in the slot lies on the copy drawn at the pointer less the grab.
          const slot = t.slot ?? to;
          const p = { x: slot.x + slot.width / 2, y: slot.y + slot.height / 2 };
          expect(p.x - a.grab.x, at).toBeLessThanOrEqual(p.x + 1e-6);
          expect(p.x - a.grab.x + to.width, at).toBeGreaterThanOrEqual(p.x - 1e-6);
          moves++;
          // A plain press along the item's own length (a row on a bar): its share of the new length.
          if (grab && typeof grab !== "function" && own.rect.width >= own.rect.height && to.width >= to.height) {
            expect(a.grab.x, at).toBeCloseTo(Math.min(1, Math.max(0, grab.x / own.rect.width)) * to.width, 6);
            shares++;
          }
        }
      }
    expect(moves).toBeGreaterThan(500);
    expect(shares).toBeGreaterThan(100);
    // eslint-disable-next-line no-console
    console.info("drop grab, every bar move:", moves, "share checks:", shares);
  });
});

describe("the memo keys", () => {
  const w = windows[0]!;
  const o = (f: () => void): DockLaneOptions => ({ ...optionsOf(w, undefined), onGrabNote: f });

  it("stops() and lanes() are remembered whatever onGrabNote callback a call passes (an inline arrow per call hits)", () => {
    const first = stops(w.state, w.dragged, o(() => {}));
    expect(first.length).toBeGreaterThan(0);
    // (The list is a new array each call, over the same targets.)
    expect(stops(w.state, w.dragged, o(() => {}))[0]).toBe(first[0]);
    const spots = lanes(w.state, w.dragged, o(() => {})).lanes;
    expect(lanes(w.state, w.dragged, o(() => {})).lanes).toBe(spots);
  });
});
