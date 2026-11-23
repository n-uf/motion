/**
 * A grab that differs per form, swept across every landing at the hand of the one-layout windows: along each sliding
 * spot's stretch a pixel at a time, both ways, and the float along a line across the content. On every landing the grab
 * given back is the function's in the form the landing shows (`DockAfter.grab == fn(shown form)`), and along a sweep the
 * form shown never flips back to one it left (no A, B, A). The fold-threshold band itself is `grab-aim-once.test.ts`.
 */
import { describe, expect, it } from "vitest";
import type { Point, Size } from "@n-uf/placement";
import { dockDrag, solve, type DockGrabForm, type DockHeld, type DockItemLayout } from "../src";
import { sweepWindows } from "./one-layout-windows";

/** A grab read from the form alone (its axis and kind; its place), so it can be checked from the landing as shown. */
const byForm = (own: DockItemLayout, press: Point) => (f: DockGrabForm, s: Size): Point => {
  if (f.axis === own.axis && f.form === own.form && f.formKind === own.formKind && Math.abs(s.width - own.rect.width) < 1e-6 && Math.abs(s.height - own.rect.height) < 1e-6) return press;
  const k = f.formKind.length + (f.place.kind === "float" ? 3 : 0);
  return f.axis === "row" ? { x: Math.min(2 + k, s.width), y: Math.min(4, s.height) } : { x: Math.min(4, s.width), y: Math.min(2 + k, s.height) };
};
const key = (it: DockItemLayout): string => `${it.axis} ${it.form} ${it.formKind} ${it.floating ? "float" : (it.edge ?? "")}`;

describe("a grab per form, swept across the landings at the hand", () => {
  it("the grab is the shown form's on every landing, and the form never flips back along a sweep", () => {
    let landings = 0;
    let sweeps = 0;
    for (const w of sweepWindows()) {
      const own = solve(w.state, { previous: w.previous }).items[w.dragged];
      if (!own || own.inMenu || own.floating || own.rect.width <= 0 || own.rect.height <= 0) continue;
      const press = { x: own.rect.width / 2, y: own.rect.height / 2 };
      const fn = byForm(own, press);
      const drag = dockDrag(w.state, w.dragged, { ...w.options, previous: w.previous, grab: fn });
      const lines: { name: string; helds: DockHeld[] }[] = [];
      for (const l of drag.regions.lanes)
        for (const s of l.spots) {
          if (!s.slide || s.along[1] - s.along[0] < 2) continue;
          const across = l.axis === "x" ? l.rect.y + l.rect.height / 2 : l.rect.x + l.rect.width / 2;
          const along = Array.from({ length: Math.floor(s.along[1] - s.along[0]) }, (_, i) => s.along[0] + 0.5 + i);
          for (const a of [along, [...along].reverse()]) lines.push({ name: s.id, helds: a.map((v) => ({ kind: "spot", spot: s.id, point: l.axis === "x" ? { x: v, y: across } : { x: across, y: v } })) });
        }
      if (drag.regions.float) {
        const c = drag.regions.content;
        lines.push({ name: "float", helds: Array.from({ length: 40 }, (_, i) => ({ kind: "float", point: { x: c.x + ((i + 0.5) / 40) * c.width, y: c.y + c.height / 2 } })) });
      }
      for (const line of lines) {
        const seen: string[] = [];
        for (const held of line.helds) {
          const a = drag.after(held);
          const laid = a.layout.items[w.dragged];
          if (!a.landing || !laid) continue;
          const at = `${w.name} ${line.name} ${JSON.stringify(held.point)}`;
          // The function in the form shown (its own size: a form-only grab reads the size only to stay inside it).
          const place: DockGrabForm["place"] = laid.floating ? { kind: "float" } : { kind: "spot", edge: laid.edge ?? "" };
          expect(a.grab, at).toEqual(fn({ ...laid, place }, { width: laid.rect.width, height: laid.rect.height }));
          const k = key(laid);
          if (seen.at(-1) !== k) {
            expect(seen.includes(k), `${at}: back to ${k} after ${seen.join(" > ")}`).toBe(false);
            seen.push(k);
          }
          landings++;
        }
        sweeps++;
      }
    }
    expect(sweeps).toBeGreaterThan(200);
    expect(landings).toBeGreaterThan(5000);
  });
});
