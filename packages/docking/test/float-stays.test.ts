/**
 * "Does not fit" is decided by the hand. A float drop's clear place counts only while the pointer is still on the item
 * placed there; with none under the pointer, the float lies at the hand over what it covers, marked `stays`, and every
 * later solve only keeps it inside the stage. The properties, on float frames (`dockDrag(...).after({ kind: "float" })`):
 * - **N1, follow:** the landing holds the pointer (on the hand rect as kept inside the stage: the stage clamp is exempt);
 * - **N2, what shows lands:** the drop's state, stored, read back and solved, draws the landing exactly;
 * - **N3, no flip-flop:** along a path, no landing rect comes back within 10 frames after another one, and no size
 *   changes there and back by more than 3 px;
 * - **N4, stable at rest:** solving the drop's state again leaves every float where it is.
 * Plus the rows of the design: a hand resize of a float lying over content, docking into a column a resting float
 * covers, the two solves of `after` agree, a gap narrower than the item while a clear place exists elsewhere, a grab at
 * the item's far end, and a fitting float pushed at a column keeps today's wall.
 */
import { describe, expect, it } from "vitest";
import { contains, clamp, type Point, type Rect } from "@n-uf/placement";
import { dockDrag, fitResize, heldRect, homeFor, moveTo, readDockState, resizeFloat, solve, storeDockState, targets, type DockState } from "../src";
import { windowState } from "./fixture";

const KEY = "notes";
const sameRect = (a: Rect | null | undefined, b: Rect | null | undefined, eps = 1e-6): boolean =>
  !!a && !!b && Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps && Math.abs(a.width - b.width) <= eps && Math.abs(a.height - b.height) <= eps;
const say = (r: Rect | null | undefined): string => (r ? `${r.x.toFixed(1)},${r.y.toFixed(1)} ${r.width.toFixed(1)}x${r.height.toFixed(1)}` : "-");

/** The fixture window (columns 260 px each side, open area 260..940) with Notes floating at `rect`. */
function withNotes(rect: Rect, more: Partial<DockState> = {}): DockState {
  const s = windowState();
  return { ...s, floats: [{ id: KEY, rect }], ...more };
}

/** The float frame at `p`, with its drop. */
function floatFrame(s: DockState, p: Point, grab?: Point) {
  const d = dockDrag(s, KEY, grab ? { grab } : {});
  return d.after({ kind: "float", point: p });
}

/** The pointer on the hand rect as kept inside the stage (the stage clamp exempt). */
function onHand(s: DockState, size: { width: number; height: number }, p: Point, grab: Point): Point {
  const hand = heldRect(s, KEY, size, p, grab);
  return { x: clamp(p.x, hand.x, hand.x + hand.width), y: clamp(p.y, hand.y, hand.y + hand.height) };
}

const stays = (s: DockState): boolean => s.floats.find((f) => f.id === KEY)?.stays === true;

/** N1, N2, N4 and the two solves of `after` on one frame; failures as text. */
function frameProps(s: DockState, p: Point, grab: Point, size: { width: number; height: number }): string[] {
  const bad: string[] = [];
  const a = floatFrame(s, p, grab);
  const landing = a.landing;
  if (!landing) return [`${p.x},${p.y}: no landing`];
  if (!contains(landing, onHand(s, size, p, grab), 1e-6)) bad.push(`N1 ${p.x},${p.y}: the pointer is off ${say(landing)}`);
  const back = readDockState(JSON.parse(JSON.stringify(storeDockState(a.state))), s).state;
  if (!sameRect(solve(back).items[KEY]?.rect, landing)) bad.push(`N2 ${p.x},${p.y}: stored and read back it lands at ${say(solve(back).items[KEY]?.rect)}, shown ${say(landing)}`);
  const again = solve(a.state);
  if (!sameRect(again.items[KEY]?.rect, landing)) bad.push(`two solves ${p.x},${p.y}: ${say(again.items[KEY]?.rect)} vs ${say(landing)}`);
  const rest = solve(a.state, { previous: again });
  for (const id of again.floats) if (!sameRect(rest.items[id]?.rect, again.items[id]?.rect)) bad.push(`N4 ${p.x},${p.y}: ${id} moved`);
  return bad;
}

describe("a float that doesn't fit lies at the hand", () => {
  // 760 wide: wider than the open area (680), so no clear place exists anywhere.
  const wide = { width: 760, height: 120 };
  const s = withNotes({ x: 300, y: 300, ...wide });

  it("a wide float follows the hand over the columns, marked, and lands where it is shown (N1, N2, N4)", () => {
    const grab = { x: wide.width / 2, y: wide.height / 2 };
    const bad: string[] = [];
    let marked = 0;
    for (let x = 300; x <= 900; x += 40)
      for (let y = 140; y <= 660; y += 40) {
        bad.push(...frameProps(s, { x, y }, grab, wide));
        const a = floatFrame(s, { x, y }, grab);
        if (sameRect(a.landing, heldRect(s, KEY, wide, { x, y }, grab)) && stays(a.state)) marked++;
        else bad.push(`${x},${y}: not at the hand, or not marked: ${say(a.landing)}`);
      }
    expect(bad).toEqual([]);
    expect(marked).toBeGreaterThan(100);
  });

  it("a grab at the item's far end: the stage clamp keeps it whole, and the pointer is still on it there", () => {
    const grab = { x: wide.width - 4, y: 10 };
    const bad: string[] = [];
    for (let x = 300; x <= 940; x += 20) bad.push(...frameProps(s, { x, y: 400 }, grab, wide));
    expect(bad).toEqual([]);
    // Near the left side the hand rect would be cut off: it is kept inside the stage.
    expect(floatFrame(s, { x: 300, y: 400 }, grab).landing!.x).toBe(0);
  });

  it("a marked float is only kept inside the stage at rest: a smaller window clamps it, never moves it clear", () => {
    const a = floatFrame(s, { x: 600, y: 400 }, { x: 380, y: 60 });
    expect(stays(a.state)).toBe(true);
    const at = a.landing!;
    const small = { ...a.state, stage: { ...a.state.stage, width: 900 } };
    const r = solve(small).items[KEY]!.rect;
    expect(r).toEqual({ x: 900 - at.width, y: at.y, width: at.width, height: at.height });
    expect(solve(small).notes).toContainEqual({ code: "float-covers", id: KEY });
  });

  it("an unmarked float keeps today's rule: a column opening under it moves it clear", () => {
    const clear = withNotes({ x: 280, y: 300, width: 280, height: 200 });
    expect(solve(clear).items[KEY]!.rect.x).toBe(280);
    const wider = { ...clear, edges: clear.edges.map((e) => (e.id === "left" ? { ...e, size: 320 } : e)) };
    expect(solve(wider).items[KEY]!.rect.x).toBeGreaterThanOrEqual(320);
  });
});

describe("a fitting float keeps clear while the pointer is on it", () => {
  const size = { width: 280, height: 200 };
  const s = withNotes({ x: 500, y: 300, ...size });

  it("pushed at a column it keeps today's wall until the pointer enters the column (unmarked)", () => {
    const grab = { x: size.width / 2, y: size.height / 2 };
    const bad: string[] = [];
    for (let x = 600; x < 940; x += 5) {
      const a = floatFrame(s, { x, y: 400 }, grab);
      const r = a.landing!;
      if (stays(a.state)) bad.push(`${x}: marked`);
      if (r.x + r.width > 940 + 1e-6) bad.push(`${x}: over the column, ${say(r)}`);
      if (!contains(r, { x, y: 400 })) bad.push(`${x}: the pointer is off ${say(r)}`);
      bad.push(...frameProps(s, { x, y: 400 }, grab, size));
    }
    expect(bad).toEqual([]);
  });

  it("a gap narrower than the item while a clear place exists elsewhere: at the hand, not at the far place", () => {
    // A chrome rect floats keep clear of splits the open area: 260..540 is narrower than the item (300), the clear room
    // lies above it (y under 300). The chrome stays a wall, as the bars and the stage's edge do: at the hand the item
    // lies over the column, against the chrome, not up in the clear room.
    const item = { width: 300, height: 160 };
    const g = withNotes({ x: 600, y: 80, ...item }, { keepClear: [{ x: 540, y: 300, width: 400, height: 472, for: "floats" }] });
    const grab = { x: item.width / 2, y: item.height / 2 };
    const a = floatFrame(g, { x: 400, y: 600 }, grab);
    expect(stays(a.state)).toBe(true);
    expect(a.landing).toEqual({ x: 240, y: 520, ...item });
    expect(solve(a.state).notes).toContainEqual({ code: "float-covers", id: KEY });
    // Just under the clear room, the clear place holds the pointer: it counts.
    const near = floatFrame(g, { x: 700, y: 250 }, grab);
    expect(stays(near.state)).toBe(false);
    expect(near.landing!.y + near.landing!.height).toBeLessThanOrEqual(300 + 1e-6);
    expect(frameProps(g, { x: 400, y: 600 }, grab, item)).toEqual([]);
  });
});

describe("bars and chrome only clamp it, as the stage's edge does", () => {
  // N1 is exempt at the stage edge, bars and chrome, where the float takes the least shift that clears them.
  it("over a bar: pushed just clear of it along y, its x at the hand", () => {
    const item = { width: 300, height: 160 };
    const s = withNotes({ x: 500, y: 300, ...item });
    const a = floatFrame(s, { x: 600, y: 50 }, { x: 150, y: 10 });
    expect(a.landing).toEqual({ x: 450, y: 68, ...item });
    // Wider than the open room: over the columns too, so marked, still pushed only below the bars.
    const wide = { width: 760, height: 120 };
    const w = withNotes({ x: 300, y: 300, ...wide });
    const b = floatFrame(w, { x: 600, y: 50 }, { x: 380, y: 10 });
    expect(b.landing).toEqual({ x: 220, y: 68, ...wide });
    expect(stays(b.state)).toBe(true);
  });

  it("over a chrome rect, the pointer deep inside it: the least push along one axis, the other kept at the hand", () => {
    const item = { width: 300, height: 160 };
    const g = withNotes({ x: 600, y: 80, ...item }, { keepClear: [{ x: 540, y: 300, width: 400, height: 472, for: "floats" }] });
    const a = floatFrame(g, { x: 660, y: 400 }, { x: 150, y: 80 });
    // Up by 180 (left would be 270): x stays where the hand puts it.
    expect(a.landing).toEqual({ x: 510, y: 140, ...item });
    expect(stays(a.state)).toBe(false);
    expect(solve(a.state).items[KEY]!.rect).toEqual(a.landing);
  });
});

describe("N3: no flip-flop along a path", () => {
  for (const [name, size] of [
    ["half the open width", { width: 340, height: 160 }],
    ["the open width", { width: 680, height: 160 }],
    ["1.2 times the open width", { width: 816, height: 160 }],
  ] as const)
    for (const dir of ["across", "down"] as const)
      it(`${name}, ${dir}`, () => {
        const s = withNotes({ x: 300, y: 300, ...size });
        const grab = { x: size.width / 2, y: size.height / 2 };
        const d = dockDrag(s, KEY, { grab });
        const rects: Rect[] = [];
        for (let t = 0; t <= 200; t++) {
          const p = dir === "across" ? { x: 270 + (660 * t) / 200, y: 420 } : { x: 600, y: 80 + (680 * t) / 200 };
          rects.push(d.after({ kind: "float", point: p }).landing!);
        }
        const bad: string[] = [];
        for (let i = 2; i < rects.length; i++)
          for (let k = 2; k <= 10 && i - k >= 0; k++) {
            const was = rects[i - k]!;
            const between = rects.slice(i - k + 1, i);
            if (sameRect(rects[i], was, 0.5) && between.some((r) => !sameRect(r, was, 0.5))) bad.push(`frame ${i}: back at ${say(was)} after ${k} frames`);
            const sz = (r: Rect) => [r.width, r.height];
            if (between.some((r) => Math.abs(sz(r)[0]! - sz(was)[0]!) > 3 || Math.abs(sz(r)[1]! - sz(was)[1]!) > 3) && Math.abs(rects[i]!.width - was.width) <= 3 && Math.abs(rects[i]!.height - was.height) <= 3) bad.push(`frame ${i}: size there and back`);
          }
        expect(bad).toEqual([]);
      });
});

describe("a float left over content, after its drop", () => {
  const wide = { width: 760, height: 120 };
  const dropped = (): DockState => floatFrame(withNotes({ x: 300, y: 300, ...wide }), { x: 600, y: 400 }, { x: 380, y: 60 }).state;

  it("a hand resize keeps it where it lies (never moved clear) and keeps the mark; what floats keep clear of still stops a growing edge", () => {
    const s = dropped();
    const at = solve(s).items[KEY]!.rect;
    const fit = fitResize(s, KEY, { ...at, height: at.height + 50 }, { bottom: true })!;
    expect(fit.rect).toEqual({ ...at, height: at.height + 50 });
    const r = resizeFloat(s, KEY, { ...at, height: at.height + 50 }, { bottom: true });
    expect(stays(r)).toBe(true);
    expect(solve(r).items[KEY]!.rect).toEqual(fit.rect);
    // Down past the status bar: it stops there.
    const far = fitResize(s, KEY, { ...at, height: 2000 }, { bottom: true })!;
    expect(far.rect.y + far.rect.height).toBe(772);
  });

  it("docking into a column the resting float covers: the column takes it, the float stays", () => {
    const s = dropped();
    const at = solve(s).items[KEY]!.rect;
    const gap = targets(s, "views").find((t) => t.place.kind === "gap" && (t.place as { edge: string }).edge === "right");
    expect(gap).toBeTruthy();
    const after = gap!.after({ x: gap!.hit.x + 1, y: gap!.hit.y + 1 });
    expect(after.layout.items.views?.edge).toBe("right");
    expect(after.layout.items[KEY]!.rect).toEqual(at);
    expect(stays(after.state)).toBe(true);
    expect(solve(moveTo(s, "views", { edge: "right", at: 0 })).items[KEY]!.rect).toEqual(at);
  });

  it("the mark round-trips through the store, Put back carries it, and a new drop decides it again", () => {
    const s = dropped();
    expect(storeDockState(s).floats.find((f) => f.id === KEY)?.stays).toBe(true);
    const read = readDockState(storeDockState(s), windowState());
    expect(stays(read.state)).toBe(true);
    expect(read.dropped).toEqual([]);
    expect(homeFor(windowState(), KEY, s)).toMatchObject({ kind: "float", stays: true });
    const docked = moveTo(s, KEY, { edge: "left", at: 0 });
    expect(solve(moveTo(docked, KEY, homeFor(docked, KEY, s)!)).items[KEY]!.rect).toEqual(solve(s).items[KEY]!.rect);
    // A float placed over the left column with the mark lies there; dropped again where a clear place holds the pointer,
    // it is unmarked.
    const over = moveTo(windowState(), KEY, { kind: "float", rect: { x: 100, y: 300, width: 280, height: 200 }, stays: true });
    expect(solve(over).items[KEY]!.rect).toEqual({ x: 100, y: 300, width: 280, height: 200 });
    const back = dockDrag(over, KEY, { grab: { x: 20, y: 10 } }).after({ kind: "float", point: { x: 600, y: 400 } });
    expect(back.state.floats.find((f) => f.id === KEY)?.stays).toBeUndefined();
  });

  it("the store drops a stays that isn't true, and one on an anchored float", () => {
    const base = windowState();
    const one = (f: object) => readDockState({ v: 1, edges: storeDockState(base).edges, items: storeDockState(base).items, floats: [{ id: KEY, x: 400, y: 200, width: 280, height: 320, ...f }] }, base);
    expect(one({ stays: 1 }).dropped).toEqual([`float:${KEY}:stays`]);
    const anchored = one({ stays: true, anchor: "content-top-right" });
    expect(anchored.dropped).toEqual([`float:${KEY}:stays`]);
    expect(anchored.state.floats[0]?.stays).toBeUndefined();
  });
});
