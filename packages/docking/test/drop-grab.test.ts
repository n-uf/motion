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
 * - **keys:** `stops()` and `lanes()` keep one result per `onGrabNote` callback (by identity), as they do per grab.
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
});

describe("the memo keys", () => {
  const w = windows[0]!;

  it("stops() is remembered per onGrabNote callback", () => {
    const a = (): void => {};
    const b = (): void => {};
    const o = (f: () => void): DockLaneOptions => ({ ...optionsOf(w, undefined), onGrabNote: f });
    const first = stops(w.state, w.dragged, o(a));
    expect(first.length).toBeGreaterThan(0);
    // (The list is a new array each call, over the same targets.)
    expect(stops(w.state, w.dragged, o(a))[0]).toBe(first[0]);
    expect(stops(w.state, w.dragged, o(b))[0]).not.toBe(first[0]);
  });

  it("lanes() is remembered per onGrabNote callback", () => {
    const a = (): void => {};
    const b = (): void => {};
    const o = (f: () => void): DockLaneOptions => ({ ...optionsOf(w, undefined), onGrabNote: f });
    const first = lanes(w.state, w.dragged, o(a)).lanes;
    expect(lanes(w.state, w.dragged, o(a)).lanes).toBe(first);
    expect(lanes(w.state, w.dragged, o(b)).lanes).not.toBe(first);
  });
});
