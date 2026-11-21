/**
 * `guideRects`, a thin guide and a clear rect that meets only its end: the guide is shortened along its length (as a
 * box is trimmed at one end), never dropped whole. A clear rect across its middle still thins it across its thickness.
 */
import { describe, expect, it } from "vitest";
import { guideRects, type PlacedGuide } from "../src/drag";
import type { Rect } from "../src/shapes";

const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });
const inside = rect(0, 0, 1000, 800);
/** A column's line, 2 px thick, 400 px long (y 12 to 412). */
const line: PlacedGuide = { kind: "line", rect: rect(300, 12, 2, 400) };
const run = (g: PlacedGuide, clear: Rect[], more: { clearance?: number; minLength?: number; minThickness?: number } = {}): Rect[] => guideRects([g], { inside, inset: 2, clear, ...more }).map((x) => x.rect);

describe("guideRects: a thin guide that a clear rect meets only at its end", () => {
  it("a toolbar over the last 10 px shortens the line by that and the clearance, and the line is kept", () => {
    expect(run(line, [rect(100, 402, 400, 30)])).toEqual([rect(300, 12, 2, 388)]);
    expect(run(line, [rect(100, 402, 400, 30)], { clearance: 0 })).toEqual([rect(300, 12, 2, 390)]);
  });

  it("the same at the start", () => {
    // The toolbar's bottom is at 22: 10 px of the line, and 2 of clearance, go.
    expect(run(line, [rect(100, -10, 400, 32)])).toEqual([rect(300, 24, 2, 388)]);
    expect(run(line, [rect(100, -10, 400, 32)], { clearance: 0 })).toEqual([rect(300, 22, 2, 390)]);
  });

  it("a horizontal line shortens the same way, from either end", () => {
    const row: PlacedGuide = { kind: "line", rect: rect(12, 300, 400, 2) };
    expect(run(row, [rect(402, 100, 30, 400)])).toEqual([rect(12, 300, 388, 2)]);
    expect(run(row, [rect(-10, 100, 32, 400)])).toEqual([rect(24, 300, 388, 2)]);
  });

  it("a rect over only part of the thickness (poking 1 px into a 2 px line) at its end shortens it too", () => {
    expect(run(line, [rect(301, 402, 400, 30)], { clearance: 0 })).toEqual([rect(300, 12, 2, 390)]);
  });

  it("a thicker thin guide (a striped strip) is shortened, keeping its thickness", () => {
    const strip: PlacedGuide = { kind: "hatch", rect: rect(300, 12, 6, 400) };
    expect(run(strip, [rect(100, 402, 400, 30)])).toEqual([rect(300, 12, 6, 388)]);
  });

  it("a rect that overlaps the length but not the thickness leaves the guide as it is", () => {
    const got = guideRects([line], { inside, inset: 2, clear: [rect(400, 402, 100, 30)] });
    expect(got[0]).toBe(line);
  });

  it("both ends met: each is trimmed; the order of the rects never matters", () => {
    const top = rect(100, -10, 400, 32);
    const bottom = rect(100, 402, 400, 30);
    expect(run(line, [top, bottom])).toEqual([rect(300, 24, 2, 376)]);
    expect(run(line, [bottom, top])).toEqual([rect(300, 24, 2, 376)]);
  });

  it("an end part shorter than `minLength` is dropped, as a box's is; `minLength` 0 or a shorter one keeps it", () => {
    // 412 less 407 leaves 5 px of the line above a rect over the rest (grown by 2: from 17).
    const rest = rect(100, 19, 400, 400);
    expect(run(line, [rest])).toEqual([]);
    expect(run(line, [rest], { minLength: 4 })).toEqual([rect(300, 12, 2, 5)]);
    expect(run(line, [rest], { minLength: 0 })).toEqual([rect(300, 12, 2, 5)]);
    expect(run(line, [rest], { minLength: 8 })).toEqual([]);
  });

  it("a rect across the middle behaves as it did: it thins the guide across its thickness, the whole length kept, or drops it under `minThickness`", () => {
    const middle = rect(301, 200, 100, 30);
    expect(run(line, [middle], { clearance: 0, minThickness: 0 })).toEqual([rect(300, 12, 1, 400)]);
    expect(run(line, [middle], { clearance: 0 })).toEqual([]);
    expect(run(line, [rect(100, 200, 400, 30)])).toEqual([]);
  });

  it("a rect over the whole length, both ends, behaves as it did too", () => {
    expect(run(line, [rect(100, -50, 400, 600)])).toEqual([]);
    expect(run(line, [rect(301, -50, 100, 600)], { clearance: 0, minThickness: 0 })).toEqual([rect(300, 12, 1, 400)]);
  });

  it("an end rect and a middle one: the end is cut off, and a middle rect lying in the cut-off part no longer thins what is left", () => {
    const bottom = rect(100, 302, 400, 130);
    const inCut = rect(100, 350, 400, 20);
    const above = rect(301, 100, 100, 30);
    expect(run(line, [bottom, inCut], { clearance: 0 })).toEqual([rect(300, 12, 2, 290)]);
    expect(run(line, [inCut, bottom], { clearance: 0 })).toEqual([rect(300, 12, 2, 290)]);
    // A middle rect over what is left still thins it, whatever the order.
    expect(run(line, [bottom, above], { clearance: 0, minThickness: 0 })).toEqual([rect(300, 12, 1, 290)]);
    expect(run(line, [above, bottom], { clearance: 0, minThickness: 0 })).toEqual([rect(300, 12, 1, 290)]);
  });

  it("a clear rect's `kinds` still decides: a rect that constrains boxes only leaves a line alone", () => {
    const got = guideRects([line], { inside, inset: 2, clear: [{ rect: rect(100, 402, 400, 30), clearance: 2, kinds: ["box"] }] });
    expect(got[0]).toBe(line);
  });
});
