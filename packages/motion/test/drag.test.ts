import { describe, expect, it } from "vitest";
import type { Point, Rect } from "../src/shapes";
import {
  createDragIntent,
  DRAG_DEFAULTS,
  DRAG_PREVIEW_DEFAULT,
  inRect,
  liftDecision,
  previewPlan,
  targetAt,
  type DragPreview,
  type DragTarget,
  type DragTuning,
  type PreviewPlan,
} from "../src/drag";

const FRAME = 1000 / 60;
const rect = (x: number, y: number, width: number, height: number): Rect => ({ x, y, width, height });
const mid = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

/** A pointer path: keyframes [ms, x, y], linear between them. */
type Key = readonly [number, number, number];

function along(keys: readonly Key[], t: number): Point {
  for (let i = 1; i < keys.length; i++) {
    const [t1, x1, y1] = keys[i]!;
    if (t > t1) continue;
    const [t0, x0, y0] = keys[i - 1]!;
    const f = t1 > t0 ? (t - t0) / (t1 - t0) : 1;
    return { x: x0 + (x1 - x0) * f, y: y0 + (y1 - y0) * f };
  }
  const [, x, y] = keys.at(-1)!;
  return { x, y };
}

/** Keyframes through `points` at `speed` px/ms, from `t0`. */
function through(points: readonly Point[], speed: number, t0 = 0): Key[] {
  const out: Key[] = [[t0, points[0]!.x, points[0]!.y]];
  let t = t0;
  for (let i = 1; i < points.length; i++) {
    t += Math.max(FRAME, Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y) / speed);
    out.push([t, points[i]!.x, points[i]!.y]);
  }
  return out;
}
const hold = (keys: readonly Key[], ms: number): Key[] => [...keys, [keys.at(-1)![0] + ms, keys.at(-1)![1], keys.at(-1)![2]]];
const then = (a: readonly Key[], b: (t0: number) => Key[]): Key[] => [...a, ...b(a.at(-1)![0]).slice(1)];

interface Entry {
  readonly t: number;
  readonly id: string | null;
  /** A hide while the pointer was flying (not a flash). */
  readonly flying?: boolean;
}

/** Drive an intent along `keys` one frame at a time; the indicator's log, then what a release at the end lands on. */
function drive(keys: readonly Key[], targets: readonly DragTarget[], home: Rect, tuning: Partial<DragTuning> = {}) {
  const intent = createDragIntent({ home, tuning });
  const log: Entry[] = [];
  let shown: string | null = null;
  const total = keys.at(-1)![0];
  const frames: { t: number; p: Point; aiming: boolean; shown: string | null }[] = [];
  for (let t = 0; t <= total + 0.001; t += FRAME) {
    const p = along(keys, t);
    const f = intent.update(p, t, targets);
    const id = f.shown?.id ?? null;
    if (id !== shown) log.push(id === null ? { t, id, flying: !f.aiming } : { t, id });
    shown = id;
    frames.push({ t, p, aiming: f.aiming, shown: id });
  }
  const end = along(keys, total);
  return { log, frames, landed: intent.release(end, targets)?.id ?? null, end };
}

const shows = (log: readonly Entry[]) => log.filter((e) => e.id !== null);
/** Indicators replaced, or hidden while aiming, under `flash` ms (the switch hold) after they showed. */
const flashes = (log: readonly Entry[], flash = DRAG_DEFAULTS.switchHold) =>
  log.filter((e, i) => e.id !== null && log[i + 1] && !(log[i + 1]!.id === null && log[i + 1]!.flying) && log[i + 1]!.t - e.t < flash);

// A dock of two slots one above the other, a rail beside it (more precise), and a large free area (less precise).
const A: DragTarget = { id: "slot-a", priority: 2, hit: rect(0, 0, 200, 100) };
const B: DragTarget = { id: "slot-b", priority: 2, hit: rect(0, 100, 200, 100) };
const RAIL: DragTarget = { id: "rail", priority: 1, hit: rect(-40, 0, 34, 200) };
const AREA: DragTarget = { id: "area", priority: 3, hit: rect(220, 0, 600, 400), free: true };
const DOCK = [A, B, RAIL, AREA];
const HOME = rect(300, 300, 100, 50);
const FROM = mid(HOME);

// A strip: three columns, each a target, and narrow "between" targets over the gaps (smaller, so they win there).
const COLUMNS = [0, 1, 2].map((i): DragTarget => ({ id: `column-${i}`, priority: 2, hit: rect(i * 306, 0, 300, 400) }));
const BETWEEN = [1, 2].map((i): DragTarget => ({ id: `between-${i}`, priority: 2, hit: rect(i * 306 - 3 - 28, 0, 56, 400) }));
const STRIP = [...COLUMNS, ...BETWEEN];
const STRIP_HOME = rect(400, 450, 100, 40);

describe("drag/ targets", () => {
  it("the most precise target under the point wins, then the smaller zone", () => {
    expect(targetAt(DOCK, { x: -20, y: 50 })?.id).toBe("rail");
    expect(targetAt(DOCK, mid(A.hit))?.id).toBe("slot-a");
    expect(targetAt(STRIP, { x: 305, y: 200 })?.id).toBe("between-1");
    expect(targetAt(DOCK, { x: 210, y: 500 })).toBeNull();
  });

  it("inRect grows and shrinks by a margin", () => {
    expect(inRect(rect(0, 0, 10, 10), { x: 12, y: 5 })).toBe(false);
    expect(inRect(rect(0, 0, 10, 10), { x: 12, y: 5 }, 2)).toBe(true);
    expect(inRect(rect(0, 0, 10, 10), { x: 1, y: 5 }, -2)).toBe(false);
  });
});

describe("drag/ lift", () => {
  it("a mouse lifts at 5 px; a touch only after a 180 ms hold, then 8 px", () => {
    expect(liftDecision({ touch: false, distance: 4, elapsed: 10 })).toBe("wait");
    expect(liftDecision({ touch: false, distance: 5, elapsed: 10 })).toBe("lift");
    expect(liftDecision({ touch: true, distance: 9, elapsed: 100 })).toBe("refuse");
    expect(liftDecision({ touch: true, distance: 5, elapsed: 200 })).toBe("wait");
    expect(liftDecision({ touch: true, distance: 8, elapsed: 200 })).toBe("lift");
    expect(liftDecision({ touch: false, distance: 7, elapsed: 0 }, { lift: 10 })).toBe("wait");
  });
});

describe("drag/ intent", () => {
  it("flying over targets shows no indicator; aiming at the last one shows it, once", () => {
    let arrival = 0;
    const keys = hold(
      (() => {
        const k = through([FROM, mid(AREA.hit), mid(A.hit), mid(B.hit)], 2);
        arrival = k.at(-1)![0];
        return k;
      })(),
      400,
    );
    const r = drive(keys, DOCK, HOME);
    expect(shows(r.log).filter((e) => e.t < arrival)).toEqual([]);
    expect(shows(r.log).map((e) => e.id)).toEqual(["slot-b"]);
    expect(r.landed).toBe("slot-b");
  });

  it("a ±14 px wobble every 60 ms on the border between two slots changes the indicator at most once", () => {
    const border = { x: 100, y: 100 };
    const keys = through([FROM, border], 0.9);
    let t = keys.at(-1)![0];
    for (let i = 0; i < 20; i++) {
      t += 60;
      keys.push([t, border.x, border.y + (i % 2 ? -14 : 14)]);
    }
    const r = drive(hold(keys, 400), DOCK, HOME);
    expect(shows(r.log).length - 1).toBeLessThanOrEqual(1);
    expect(flashes(r.log)).toEqual([]);
  });

  it("a slow sweep across a strip's columns and gaps shows every indicator for at least the flash time", () => {
    const keys = then(hold(through([mid(STRIP_HOME), { x: 20, y: 200 }], 0.8), 300), (t0) => through([{ x: 20, y: 200 }, { x: 880, y: 200 }], 0.4, t0));
    const r = drive(hold(keys, 400), STRIP, STRIP_HOME);
    expect(shows(r.log).length).toBeGreaterThan(1);
    expect(flashes(r.log)).toEqual([]);
  });

  it("aimed, then flying out past the band into empty space hides the indicator at once", () => {
    let flick = 0;
    const aimed = hold(through([FROM, mid(B.hit)], 0.8), 600);
    flick = aimed.at(-1)![0];
    const r = drive(hold(then(aimed, (t0) => through([mid(B.hit), { x: 100, y: 420 }], 2.5, t0)), 200), DOCK, HOME);
    expect(r.log.filter((e) => e.t <= flick).at(-1)?.id).toBe("slot-b");
    const out = r.frames.find((f) => f.t > flick && !inRect(B.hit, f.p, DRAG_DEFAULTS.band))!.t;
    const off = r.log.find((e) => e.t > flick && e.id === null)!.t;
    expect(off - out).toBeLessThanOrEqual(FRAME + 0.001);
  });

  it("a target the pointer has flown past isn't shown while the gap grace still holds it", () => {
    // Across slot B at speed, then stopped just past its band (in empty space): aiming again, but nothing is under it.
    const stop = { x: 100, y: 215 };
    const keys = hold(through([FROM, { x: 100, y: 120 }, stop], 2.5), 300);
    const r = drive(keys, DOCK, HOME);
    expect(shows(r.log)).toEqual([]);
  });

  it("after a hide, the first sample never counts as aiming", () => {
    const intent = createDragIntent({ home: HOME });
    let t = 0;
    for (const p of [FROM, mid(A.hit)]) {
      for (let i = 0; i < 40; i++, t += FRAME) intent.update(p, t, DOCK);
    }
    expect(intent.state.shown?.id).toBe("slot-a");
    intent.hide(t);
    // The pointer is somewhere else after the view moved under it, and on its way on, fast.
    const f = intent.update(mid(B.hit), (t += FRAME), DOCK);
    expect(f.aiming).toBe(false);
    expect(f.shown).toBeNull();
    const g = intent.update({ x: 100, y: 190 }, (t += FRAME), DOCK);
    expect(g.shown).toBeNull();
  });

  it("the same release point reached by two paths lands on the same target", () => {
    const end = mid(A.hit);
    const straight = drive(hold(through([FROM, end], 0.8), 500), DOCK, HOME);
    // By way of the free area (aimed at until it showed), then a flick to the same point, let go on arrival.
    const detour = drive(
      then(hold(through([FROM, { x: 500, y: 200 }], 0.8), 500), (t0) => through([{ x: 500, y: 200 }, end], 2.5, t0)),
      DOCK,
      HOME,
    );
    expect(detour.log.some((e) => e.id === "area")).toBe(true);
    expect(straight.landed).toBe("slot-a");
    expect(detour.landed).toBe(straight.landed);
  });

  it("a release inside the shown target's band lands on it, not on the neighbour under the pointer", () => {
    const into = { x: 100, y: 106 };
    const keys = then(hold(through([FROM, mid(A.hit)], 0.8), 500), (t0) => through([mid(A.hit), into], 1.5, t0));
    const r = drive(keys, DOCK, HOME);
    expect(targetAt(DOCK, into)?.id).toBe("slot-b");
    expect(shows(r.log).at(-1)?.id).toBe("slot-a");
    expect(r.landed).toBe("slot-a");
  });

  it("a release past the band while the switch hold runs lands on the shown target (drop = shown)", () => {
    const past = { x: 100, y: 130 };
    const keys = then(hold(through([FROM, mid(A.hit)], 0.8), 500), (t0) => through([mid(A.hit), past], 0.3, t0));
    const r = drive(keys, DOCK, HOME);
    expect(inRect(A.hit, past, DRAG_DEFAULTS.band)).toBe(false);
    expect(targetAt(DOCK, past)?.id).toBe("slot-b");
    expect(shows(r.log).at(-1)?.id).toBe("slot-a");
    expect(r.landed).toBe("slot-a");
  });

  it("a release over home does nothing; with nothing under the pointer it lands nowhere", () => {
    const back = drive(hold(through([FROM, mid(A.hit), FROM], 0.8), 200), DOCK, HOME);
    expect(back.landed).toBeNull();
    const empty = drive(hold(through([FROM, { x: 100, y: 400 }], 0.8), 200), DOCK, HOME);
    expect(empty.landed).toBeNull();
  });

  it("a more precise target breaking through takes the indicator at once", () => {
    const r = drive(then(hold(through([FROM, { x: 20, y: 50 }], 0.8), 400), (t0) => hold(through([{ x: 20, y: 50 }, { x: -20, y: 50 }], 0.3, t0), 30)), DOCK, HOME);
    const a = r.log.find((e) => e.id === "slot-a")!;
    const rail = r.log.find((e) => e.id === "rail")!;
    // Into the rail's zone 4 px at 0.3 px/ms takes about (10 + 4) / 0.3 ms from the slot's edge: well under the switch hold.
    expect(rail.t - a.t).toBeGreaterThan(0);
    const entered = r.frames.find((f) => inRect(RAIL.hit, f.p, -DRAG_DEFAULTS.breakthrough))!.t;
    expect(rail.t - entered).toBeLessThanOrEqual(FRAME + 0.001);
  });

  it("room is made after the shown target has held, never for a free target, and a new place in it waits again", () => {
    const tabs: DragTarget = { id: "tabs", priority: 1, hit: rect(0, 0, 300, 30) };
    const placeOf = (t: DragTarget, p: Point): string => `${t.id}:${Math.floor(p.x / 100)}`;
    const intent = createDragIntent({ home: HOME, placeOf });
    let t = 0;
    let f = intent.update({ x: 50, y: 15 }, t, [tabs]);
    for (let i = 0; i < 6; i++) f = intent.update({ x: 50, y: 15 }, (t += FRAME), [tabs]);
    expect(f.shown?.id).toBe("tabs");
    expect(f.room).toBe(false);
    for (let i = 0; i < 10; i++) f = intent.update({ x: 50, y: 15 }, (t += FRAME), [tabs]);
    expect(f.roomPlace).toBe("tabs:0");
    // Another place of the same target: the room stays on the old place until the new one has held.
    f = intent.update({ x: 250, y: 15 }, (t += FRAME), [tabs]);
    expect(f.roomPlace).toBe("tabs:0");
    for (let i = 0; i < 12; i++) f = intent.update({ x: 250, y: 15 }, (t += FRAME), [tabs]);
    expect(f.roomPlace).toBe("tabs:2");
    const free = drive(hold(through([FROM, { x: 500, y: 200 }], 0.8), 600), DOCK, HOME);
    expect(free.log.at(-1)?.id).toBe("area");
    const freeIntent = createDragIntent({ home: HOME });
    let tf = 0;
    let ff = freeIntent.update({ x: 500, y: 200 }, tf, DOCK);
    for (let i = 0; i < 40; i++) ff = freeIntent.update({ x: 500, y: 200 }, (tf += FRAME), DOCK);
    expect(ff.shown?.id).toBe("area");
    expect(ff.room).toBe(false);
  });

  it("a null place is no target: nothing shows there, a target beneath takes over, and a release there goes home", () => {
    // A pane whose left half takes no drop; under it, a broad area on the right only.
    const pane: DragTarget = { id: "pane", priority: 2, hit: rect(0, 0, 200, 100) };
    const area: DragTarget = { id: "area", priority: 3, hit: rect(100, 0, 300, 100) };
    const placeOf = (t: DragTarget, p: Point): string | null => (t.id === "pane" && p.x < 100 ? null : t.id);
    const intent = createDragIntent({ home: HOME, placeOf });
    let t = 0;
    let f = intent.update({ x: 50, y: 50 }, t, [pane, area]);
    for (let i = 0; i < 20; i++) f = intent.update({ x: 50, y: 50 }, (t += FRAME), [pane, area]);
    expect([f.shown, f.room]).toEqual([null, false]);
    expect(intent.release({ x: 50, y: 50 }, [pane, area])).toBeNull();
    // Its right half has a place: it shows, and room is made.
    for (let i = 0; i < 20; i++) f = intent.update({ x: 150, y: 50 }, (t += FRAME), [pane, area]);
    expect([f.shown?.id, f.room]).toEqual(["pane", true]);
    // Back into the left half while aiming: hidden at once, not after the switch hold.
    f = intent.update({ x: 95, y: 50 }, (t += FRAME), [pane, area]);
    expect([f.shown, f.room]).toEqual([null, false]);
    // Over both, where the pane has no place, the area beneath is the target.
    const over = createDragIntent({ home: HOME, placeOf: (x: DragTarget, p: Point) => (x.id === "pane" && p.x >= 100 ? null : x.id) });
    let g = over.update({ x: 150, y: 50 }, 0, [pane, area]);
    for (let i = 1; i <= 20; i++) g = over.update({ x: 150, y: 50 }, i * FRAME, [pane, area]);
    expect(g.shown?.id).toBe("area");
    expect(over.release({ x: 150, y: 50 }, [pane, area])?.id).toBe("area");
    // Shown, then an aiming step into the part where it has no place, the area beneath: the pane is dropped on that
    // very frame (no switch hold for a target that takes no drop there), and a release lands on the area.
    const step = createDragIntent({ home: HOME, placeOf: (x: DragTarget, p: Point) => (x.id === "pane" && p.x >= 100 ? null : x.id) });
    let s = step.update({ x: 95, y: 50 }, 0, [pane, area]);
    for (let i = 1; i <= 20; i++) s = step.update({ x: 95, y: 50 }, i * FRAME, [pane, area]);
    expect(s.shown?.id).toBe("pane");
    s = step.update({ x: 101, y: 50 }, 21 * FRAME, [pane, area]);
    expect(s.aiming).toBe(true);
    expect(s.shown?.id).not.toBe("pane");
    expect(step.release({ x: 101, y: 50 }, [pane, area])?.id).toBe("area");
  });

  it("hide() forgets the places: the next sample asks placeOf with no previous place", () => {
    const tabs: DragTarget = { id: "tabs", priority: 1, hit: rect(0, 0, 300, 30) };
    const seen: (string | null)[] = [];
    const intent = createDragIntent({ home: HOME, placeOf: (_t: DragTarget, p: Point, previous: string | null) => (seen.push(previous), p.x < 100 ? "L" : "R") });
    let t = 0;
    for (let i = 0; i < 5; i++) intent.update({ x: 50, y: 15 }, (t += FRAME), [tabs]);
    expect(seen.at(-1)).toBe("L");
    intent.hide(t);
    seen.length = 0;
    intent.update({ x: 50, y: 15 }, (t += FRAME), [tabs]);
    expect(seen[0]).toBeNull();
  });

  it("placeOf gets the place it gave last, so a place can hold near its boundary", () => {
    const tabs: DragTarget = { id: "tabs", priority: 1, hit: rect(0, 0, 300, 30) };
    const seen: (string | null)[] = [];
    // Two halves split at x = 100; the half it was in holds for 6 px past the line.
    const placeOf = (_t: DragTarget, p: Point, previous: string | null): string => {
      seen.push(previous);
      if (previous === "L" && p.x < 106) return "L";
      if (previous === "R" && p.x >= 94) return "R";
      return p.x < 100 ? "L" : "R";
    };
    const intent = createDragIntent({ home: HOME, placeOf });
    let t = 0;
    let f = intent.update({ x: 90, y: 15 }, t, [tabs]);
    for (let i = 0; i < 20; i++) f = intent.update({ x: 90, y: 15 }, (t += FRAME), [tabs]);
    expect(f.roomPlace).toBe("L");
    expect(seen[0]).toBeNull();
    expect(seen.at(-1)).toBe("L");
    // 3 px past the line: still the left half; 10 px past: the right, once it has held.
    for (let i = 0; i < 20; i++) f = intent.update({ x: 103, y: 15 }, (t += FRAME), [tabs]);
    expect(f.roomPlace).toBe("L");
    for (let i = 0; i < 20; i++) f = intent.update({ x: 110, y: 15 }, (t += FRAME), [tabs]);
    expect(f.roomPlace).toBe("R");
    // Back 3 px the other way: the right half holds.
    for (let i = 0; i < 20; i++) f = intent.update({ x: 97, y: 15 }, (t += FRAME), [tabs]);
    expect(f.roomPlace).toBe("R");
  });

  it("follows rebuilt targets by id, and the home moves with the view", () => {
    const intent = createDragIntent({ home: HOME });
    let t = 0;
    for (let i = 0; i < 20; i++) intent.update(mid(A.hit), (t += FRAME), DOCK);
    const moved = DOCK.map((x) => ({ ...x, hit: { ...x.hit, y: x.hit.y + 2 } }));
    const f = intent.update(mid(A.hit), (t += FRAME), moved);
    expect(f.shown).toBe(moved[0]);
    // The home moved 400 px left: its old place is now just the free area, its new place does nothing.
    intent.moveHome(-400, 0);
    // A release is fed the release point first (a jump there is flying: the shown target hides).
    intent.update(FROM, (t += FRAME), moved);
    expect(intent.release(FROM, moved)?.id).toBe("area");
    expect(intent.release({ x: FROM.x - 400, y: FROM.y }, moved)).toBeNull();
  });

  it("atHome: never true before the pointer has left home, true when it is back over it, never with a target shown", () => {
    const intent = createDragIntent({ home: HOME });
    let t = 0;
    const at = (p: Point) => intent.update(p, (t += FRAME), DOCK);
    // At the press, and nudged inside home (not past its inset): not left yet, so not "back".
    expect(at(FROM).atHome).toBe(false);
    expect(at({ x: FROM.x + 10, y: FROM.y }).atHome).toBe(false);
    expect(intent.state.leftHome).toBe(false);
    // Out to the free area, then to a slot: left, a target is shown, never atHome there.
    const out: boolean[] = [];
    for (let i = 0; i < 40; i++) out.push(at(mid(A.hit)).atHome);
    expect(out.some(Boolean)).toBe(false);
    expect(intent.state.leftHome).toBe(true);
    expect(at(mid(A.hit)).shown?.id).toBe("slot-a");
    // Back over home: atHome, no target shown, and a release there lands nowhere.
    const back = at(FROM);
    expect([back.atHome, back.shown]).toEqual([true, null]);
    expect(intent.release(FROM, DOCK)).toBeNull();
    // On the home's edge: inside it counts (home itself, not shrunk).
    expect(at({ x: HOME.x + 1, y: HOME.y + 1 }).atHome).toBe(true);
    // Out again: false.
    expect(at(mid(A.hit)).atHome).toBe(false);
  });

  it("atHome is not true at the press, even where leftHome already is (a press near home's edge; a home too small to have an inside)", () => {
    // leftHome turns on within homeInset (6 px) of the edge while the pointer is still inside home: atHome must not.
    const header = createDragIntent({ home: rect(0, 0, 200, 30) });
    const f = header.update({ x: 100, y: 3 }, 0, []);
    expect([f.atHome, header.state.leftHome]).toEqual([false, true]);
    expect(header.update({ x: 100, y: 12 }, FRAME, []).atHome).toBe(false);
    expect(header.update({ x: 2, y: 28 }, 2 * FRAME, []).atHome).toBe(false);
    // Out of home, then back in: true.
    header.update({ x: 100, y: 80 }, 3 * FRAME, []);
    expect(header.update({ x: 100, y: 3 }, 4 * FRAME, []).atHome).toBe(true);
    // A 10 x 10 home pressed at its centre: it has no part further than 6 px from an edge, so leftHome is true at once; atHome is not.
    const small = createDragIntent({ home: rect(100, 100, 10, 10) });
    const s = small.update({ x: 105, y: 105 }, 0, []);
    expect([s.atHome, small.state.leftHome]).toEqual([false, true]);
    expect(small.update({ x: 107, y: 103 }, FRAME, []).atHome).toBe(false);
    small.update({ x: 140, y: 105 }, 2 * FRAME, []);
    expect(small.update({ x: 105, y: 105 }, 3 * FRAME, []).atHome).toBe(true);
  });

  it("atHome needs the pointer to have left home first, even where home overlaps a target, and hide() doesn't forget that it left", () => {
    // A home that overlaps a target: the pointer over both, never having left home, is not atHome.
    const home = rect(0, 0, 200, 100);
    const intent = createDragIntent({ home });
    expect(intent.update(mid(home), 0, DOCK).atHome).toBe(false);
    // leftHome stays true once set, hide() included: back over home is still atHome.
    intent.update({ x: 500, y: 200 }, FRAME, DOCK);
    intent.hide(2 * FRAME);
    expect(intent.update(mid(home), 3 * FRAME, DOCK).atHome).toBe(true);
  });
});

describe("drag/ previews", () => {
  /** The plan of every frame of a drag aimed at `goal` (held there until the room is made), under `preview`. */
  function plans(goal: Point, preview: DragPreview): { plan: PreviewPlan; shown: string | null; room: boolean }[] {
    const keys = hold(through([FROM, goal], 0.8), 600);
    const intent = createDragIntent({ home: HOME });
    const out: { plan: PreviewPlan; shown: string | null; room: boolean }[] = [];
    for (let t = 0; t <= keys.at(-1)![0] + 0.001; t += FRAME) {
      const f = intent.update(along(keys, t), t, DOCK);
      out.push({ plan: previewPlan(f, preview), shown: f.shown?.id ?? null, room: f.room });
    }
    return out;
  }

  it("snap is the default", () => {
    expect(DRAG_PREVIEW_DEFAULT).toBe("snap");
  });

  it("indicator: the indicator shows, and nothing else moves (no room, no snap)", () => {
    const frames = plans(mid(A.hit), "indicator");
    expect(frames.some((f) => f.room)).toBe(true);
    expect(frames.every((f) => f.plan.showIndicator === (f.shown !== null))).toBe(true);
    expect(frames.some((f) => f.plan.makeRoom || f.plan.snapItem)).toBe(false);
  });

  it("gap: the room opens with the intent's, the item stays under the pointer", () => {
    const frames = plans(mid(A.hit), "gap");
    expect(frames.every((f) => f.plan.makeRoom === f.room)).toBe(true);
    expect(frames.some((f) => f.plan.makeRoom)).toBe(true);
    expect(frames.some((f) => f.plan.snapItem)).toBe(false);
    expect(frames.every((f) => f.plan.showIndicator === (f.shown !== null))).toBe(true);
  });

  it("snap: the room opens and the item snaps into a slot, which needs no indicator", () => {
    const frames = plans(mid(A.hit), "snap");
    expect(frames.every((f) => f.plan.makeRoom === f.room && f.plan.snapItem === f.room)).toBe(true);
    expect(frames.some((f) => f.plan.snapItem)).toBe(true);
    expect(frames.some((f) => f.plan.showIndicator)).toBe(false);
  });

  it("snap: a target with no slot keeps the indicator and never snaps", () => {
    const frames = plans({ x: 500, y: 200 }, "snap");
    expect(frames.at(-1)!.shown).toBe("area");
    expect(frames.some((f) => f.plan.snapItem || f.plan.makeRoom)).toBe(false);
    expect(frames.at(-1)!.plan.showIndicator).toBe(true);
  });
});
