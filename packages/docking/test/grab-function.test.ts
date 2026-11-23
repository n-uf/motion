/**
 * The grab as a function of the laid form (`DockGrab`): one path for a plain point and a function, swept over the
 * one-layout windows.
 *
 * - **undefined is the twin:** a function that gives `undefined` everywhere lands exactly as no grab, and one that gives
 *   the press point at the item's own form and size and `undefined` elsewhere lands as that plain point (pressed at the
 *   middle and off it): the library's twin answers for every form the host leaves open, on every held place (layout,
 *   landing, marks, lanes and the grab, the host's own answer standing at the item's own form).
 * - **the lift:** at rest (`after(null)`) the grab is the press point: a plain point's own, a function's at the item's
 *   own form and size.
 * - **every landing has a grab:** `DockAfter.grab` is a finite point on every held place, rest and float included.
 * - **the grip under the pointer:** where a function places the grip in each form, a float that lands unclamped lies
 *   with that grip under the pointer, and a sliding spot's landing starts at the pointer less the grip along the lane
 *   wherever it isn't clamped or snapped; the grab reported is the function's in the form laid there.
 * - **a still pointer settles:** through a landing model, with the pointer still, the frame after next equals the next
 *   frame (its held place, landing, grab and held copy).
 */
import { describe, expect, it } from "vitest";
import type { Point, Rect, Size } from "@n-uf/placement";
import { dockDrag, solve, type DockAfter, type DockDrag, type DockGrabForm, type DockHeld, type DockItemLayout } from "../src";
import { modelOver } from "./landing-model";
import { sweepWindows, type SweepWindow } from "./one-layout-windows";

interface Drag {
  readonly w: SweepWindow;
  readonly own: DockItemLayout;
  readonly press: Point;
}

/** Every window's drag with its press: the window's grab where it lies inside the item, else the item's middle. */
function drags(): Drag[] {
  return sweepWindows().flatMap((w) => {
    const own = solve(w.state, { previous: w.previous }).items[w.dragged];
    if (!own || own.inMenu || own.floating || own.rect.width <= 0 || own.rect.height <= 0) return [];
    const given = (w.options as { grab?: Point }).grab;
    const press = given && given.x < own.rect.width && given.y < own.rect.height ? given : { x: own.rect.width / 2, y: own.rect.height / 2 };
    return [{ w, own, press }];
  });
}

/** The same drag pressed 5 px in from the item's top-left corner: off its middle on both axes. */
const offMiddle = (d: Drag): Drag => ({ ...d, press: { x: Math.min(5, d.own.rect.width / 2), y: Math.min(5, d.own.rect.height / 2) } });

/** The place a layout entry lies in, as a grab function reads it. */
const placeOf = (it: DockItemLayout): DockGrabForm["place"] =>
  it.rail || it.railTitle ? { kind: "rail", side: (it.rail ?? it.railTitle)!, orient: it.axis } : !it.floating && it.edge !== undefined ? { kind: "spot", edge: it.edge } : { kind: "float" };

const dragWith = (d: Drag, grab: unknown): DockDrag => dockDrag(d.w.state, d.w.dragged, { ...d.w.options, previous: d.w.previous, grab } as Parameters<typeof dockDrag>[2]);

/** Each spot's held places (a fixed spot once, a sliding spot at its two ends and its middle) and a few float points. */
function heldPlaces(d: DockDrag): DockHeld[] {
  const spots = d.regions.lanes.flatMap((l) =>
    l.spots.flatMap((s) => {
      const across = l.axis === "x" ? l.rect.y + l.rect.height / 2 : l.rect.x + l.rect.width / 2;
      const at = (a: number): Point => (l.axis === "x" ? { x: a, y: across } : { x: across, y: a });
      const points = s.slide ? [s.along[0] + 1, (s.along[0] + s.along[1]) / 2, s.along[1] - 1] : [(s.along[0] + s.along[1]) / 2];
      return points.map((a): DockHeld => ({ kind: "spot", spot: s.id, point: at(a) }));
    }),
  );
  const c = d.regions.content;
  const floats: DockHeld[] = d.regions.float ? [0.3, 0.5, 0.7].map((f) => ({ kind: "float", point: { x: c.x + f * c.width, y: c.y + (1 - f) * c.height } })) : [];
  return [...spots, ...floats];
}

/** What a frame draws of a held place, as one comparable value. */
const drawn = (a: DockAfter): string => JSON.stringify({ layout: a.layout.items, landing: a.landing, marks: a.marks, grab: a.grab });

/** Whether `f` lies in the item's own form and size (`own`). */
const atHome = (f: DockGrabForm, s: Size, own: DockItemLayout): boolean =>
  f.axis === own.axis &&
  f.form === own.form &&
  f.formKind === own.formKind &&
  JSON.stringify(f.place) === JSON.stringify(placeOf(own)) &&
  Math.abs(s.width - own.rect.width) < 1e-6 &&
  Math.abs(s.height - own.rect.height) < 1e-6;

/**
 * A host's grab: the grip a 6 px strip at the item's leading edge in each form (along a row its left end, along a
 * column its top), pressed at its middle; at the item's own form and size the press point.
 */
const gripGrab = (d: Drag) => (f: DockGrabForm, s: Size): Point => (atHome(f, s, d.own) ? d.press : f.axis === "row" ? { x: Math.min(3, s.width), y: s.height / 2 } : { x: s.width / 2, y: Math.min(3, s.height) });

describe("the grab as a function of the laid form", () => {
  const all = drags();

  it("a function giving undefined everywhere lands exactly as no grab", () => {
    let n = 0;
    for (const d of all) {
      const none = dragWith(d, undefined);
      const blank = dragWith(d, () => undefined);
      for (const held of [null, ...heldPlaces(none)]) {
        expect(drawn(blank.after(held)), `${d.w.name} ${JSON.stringify(held)}`).toBe(drawn(none.after(held)));
        n++;
      }
    }
    expect(n).toBeGreaterThan(1400);
  });

  it("a function giving the press at the item's own form and undefined elsewhere lands as that plain point, pressed at the middle or off it", () => {
    let n = 0;
    for (const d0 of all)
      for (const d of [d0, offMiddle(d0)]) {
        const plain = dragWith(d, d.press);
        const homeOnly = dragWith(d, (f: DockGrabForm, s: Size) => (atHome(f, s, d.own) ? d.press : undefined));
        expect(JSON.stringify(homeOnly.regions.lanes), d.w.name).toBe(JSON.stringify(plain.regions.lanes));
        for (const held of [null, ...heldPlaces(plain)]) {
          const [a, b] = [plain.after(held), homeOnly.after(held)];
          const at = `${d.w.name} ${JSON.stringify(d.press)} ${JSON.stringify(held)}`;
          // The plain-point path: the same layout, landing and marks on every held place.
          expect(JSON.stringify({ layout: b.layout.items, landing: b.landing, marks: b.marks }), at).toBe(JSON.stringify({ layout: a.layout.items, landing: a.landing, marks: a.marks }));
          // The grab too, but where the item lands in a lane in its own form: there the host's answer (the press) stands,
          // and the twin's (the press's share along the item's length, the middle across it) differs only across.
          const laid = b.layout.items[d.w.dragged];
          const ownFormInLane = !!held && held.kind === "spot" && !!laid && !laid.floating && atHome({ ...laid, place: placeOf(laid) }, laid.rect, d.own);
          if (!ownFormInLane) expect(b.grab, at).toEqual(a.grab);
          else {
            const long: "x" | "y" = d.own.rect.width >= d.own.rect.height ? "x" : "y";
            expect(b.grab, at).toEqual(d.press);
            expect(Math.abs(a.grab[long] - d.press[long]), at).toBeLessThan(1e-9);
          }
          n++;
        }
      }
    expect(n).toBeGreaterThan(2800);
  });

  it("the lift gives the press point: a plain point's own, a function's at the item's own form and size", () => {
    for (const d of all) {
      expect(dragWith(d, d.press).after(null).grab, d.w.name).toEqual(d.press);
      const seen: DockGrabForm[] = [];
      const fn = (f: DockGrabForm, s: Size): Point => {
        seen.push(f);
        return gripGrab(d)(f, s);
      };
      expect(dragWith(d, fn).after(null).grab, d.w.name).toEqual(d.press);
      // The function was asked at the item's own form, the place it really lies in.
      expect(seen.some((f) => atHome(f, { width: f.rect.width, height: f.rect.height }, d.own)), d.w.name).toBe(true);
    }
  });

  it("every landing has a grab, a finite point, rest and float included", () => {
    let n = 0;
    for (const d of all)
      for (const drag of [dragWith(d, d.press), dragWith(d, gripGrab(d))])
        for (const held of [null, ...heldPlaces(drag)]) {
          const g = drag.after(held).grab;
          expect(Number.isFinite(g?.x) && Number.isFinite(g?.y), `${d.w.name} ${JSON.stringify(held)}`).toBe(true);
          n++;
        }
    expect(n).toBeGreaterThan(2800);
  });

  it("where the function puts the grip, an unclamped float and an unclamped sliding landing lie with it under the pointer", () => {
    let floats = 0;
    let slides = 0;
    for (const d of all) {
      const fn = gripGrab(d);
      const drag = dragWith(d, fn);
      for (const held of heldPlaces(drag)) {
        const a = drag.after(held);
        const laid = a.layout.items[d.w.dragged];
        if (!a.landing || !laid) continue;
        const want = fn({ ...laid, place: laid.floating ? { kind: "float" } : { kind: "spot", edge: laid.edge ?? "" } }, { width: laid.rect.width, height: laid.rect.height });
        if (held.kind === "float") {
          const r = a.landing;
          // Unclamped: the float lies where the pointer less the grab puts it (nothing fitted it elsewhere).
          if (Math.abs(r.x + a.grab.x - held.point.x) > 0.5 || Math.abs(r.y + a.grab.y - held.point.y) > 0.5) continue;
          expect([a.grab.x, a.grab.y], `${d.w.name} float`).toEqual([want.x, want.y]);
          floats++;
          continue;
        }
        const lane = drag.regions.lanes.find((l) => l.spots.some((s) => s.id === held.spot))!;
        const spot = lane.spots.find((s) => s.id === held.spot)!;
        if (!spot.slide) continue;
        const ax = lane.axis;
        const p = ax === "x" ? held.point.x : held.point.y;
        const start = ax === "x" ? a.landing.x : a.landing.y;
        const [from, to] = [Math.min(spot.slide.from, spot.slide.to), Math.max(spot.slide.from, spot.slide.to)];
        const aim = p - a.grab[ax];
        // Clamped at a range end or snapped to a snap point: not at the hand by design.
        if (aim < from + 1 || aim > to - 1 || spot.slide.snaps.some((q) => Math.abs(q - aim) <= spot.slide!.snapDistance + 1)) continue;
        expect(Math.abs(start - aim), `${d.w.name} ${held.spot}`).toBeLessThanOrEqual(spot.slide.step / 2 + 1e-6);
        expect(a.grab[ax], `${d.w.name} ${held.spot}`).toBeCloseTo(want[ax], 6);
        slides++;
      }
    }
    expect(floats).toBeGreaterThan(100);
    expect(slides).toBeGreaterThan(150);
  });

  it("with the pointer still, the frame after next equals the next frame", () => {
    let n = 0;
    for (const d of all) {
      const drag = dragWith(d, gripGrab(d));
      const start = { x: d.own.rect.x + d.press.x, y: d.own.rect.y + d.press.y };
      for (const held of heldPlaces(drag)) {
        const host = modelOver(drag);
        const to = held.point;
        let t = 0;
        host.update(start, t);
        for (let i = 1; i <= 8; i++) host.update({ x: start.x + ((to.x - start.x) * i) / 8, y: start.y + ((to.y - start.y) * i) / 8 }, (t += 16));
        // Still long enough for every hold to have run out; then two frames more.
        host.update(to, (t += 2000));
        const frame = (time: number): string => {
          const f = host.update(to, time);
          const a = drag.after(f.held as DockHeld | null);
          const copy: Rect = { x: to.x - a.grab.x, y: to.y - a.grab.y, width: a.landing?.width ?? 0, height: a.landing?.height ?? 0 };
          return JSON.stringify({ held: f.held, room: f.room, landing: f.landing, grab: a.grab, copy });
        };
        const next = frame((t += 16));
        expect(frame((t += 16)), `${d.w.name} ${JSON.stringify(held)}`).toBe(next);
        n++;
      }
    }
    expect(n).toBeGreaterThan(1300);
  });
});
