import { describe, expect, it } from "vitest";
import type { Point, Rect } from "../src/shapes";
import {
  createDragIntent,
  createGripPress,
  DRAG_DEFAULTS,
  DOUBLE_CLICK,
  DRAG_PREVIEW_DEFAULT,
  inRect,
  liftDecision,
  pickRank,
  PLACE_GUIDES_DEFAULT,
  previewPlan,
  REFUSAL_RANK,
  targetAt,
  type DragPreview,
  type DragKeys,
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

  it("a target with hits is under the point in any of them; its zone's size is theirs together", () => {
    // An L: the largest rect is `hit`, the corner beside it is in `hits` too.
    const l: DragTarget = { id: "l", priority: 2, hit: rect(0, 0, 30, 100), hits: [rect(0, 0, 30, 100), rect(30, 80, 40, 20)] };
    const small: DragTarget = { id: "small", priority: 2, hit: rect(50, 85, 10, 10) };
    expect(targetAt([l], { x: 50, y: 90 })?.id).toBe("l");
    expect(targetAt([l], { x: 50, y: 50 })).toBeNull();
    // Equal priority: the smaller zone wins, `hits` counted together (3800 px² against 100).
    expect(targetAt([l, small], { x: 55, y: 90 })?.id).toBe("small");
    expect(targetAt([small, { ...l, hits: [rect(0, 0, 5, 5), rect(50, 85, 6, 6)] }], { x: 52, y: 87 })?.id).toBe("l");
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

  // A tray of 28 px rows: the item in row 1 (y 28–56); home's slot reaches over row 2's leading half, the next slots
  // meet at the rows' midpoints.
  const ROW_HOME = rect(0, 28, 200, 28);
  const TRAY: DragTarget[] = [
    { id: "home-slot", priority: 2, hit: rect(0, 28, 200, 42) },
    { id: "after-2", priority: 2, hit: rect(0, 70, 200, 28) },
    { id: "after-3", priority: 2, hit: rect(0, 98, 200, 14) },
  ];

  it("small zones: a direct glide from home into a 28 px row's far half lands there; a fixed 10 px band would keep home's slot", () => {
    for (const [y, want] of [
      [77, "after-2"],
      [105, "after-3"],
    ] as const) {
      const keys = hold(through([mid(ROW_HOME), { x: 100, y }], 0.3), 500);
      expect(drive(keys, TRAY, ROW_HOME).landed).toBe(want);
      expect(shows(drive(keys, TRAY, ROW_HOME).log).at(-1)?.id).toBe(want);
    }
    // The old rule (the band whole, whatever the zones' size) held home's slot 7 px into the next zone.
    expect(drive(hold(through([mid(ROW_HOME), { x: 100, y: 77 }], 0.3), 500), TRAY, ROW_HOME, { bandShare: 1 }).landed).toBe("home-slot");
  });

  it("small zones: a narrow more precise zone breaks through at a fifth of its width, not 4 px", () => {
    const thin: DragTarget = { id: "thin", priority: 1, hit: rect(-10, 0, 10, 200) };
    const keys = then(hold(through([FROM, { x: 20, y: 50 }], 0.8), 400), (t0) => hold(through([{ x: 20, y: 50 }, { x: -5, y: 50 }], 0.05, t0), 30));
    const r = drive(keys, [A, B, thin], HOME);
    const entered = r.frames.find((f) => inRect(thin.hit, f.p, -2))!.t;
    const took = r.log.find((e) => e.id === "thin")!.t;
    expect(took - entered).toBeLessThanOrEqual(FRAME + 0.001);
    expect(r.landed).toBe("thin");
    // The old rule waited for 4 px, two fifths of it.
    const old = drive(keys, [A, B, thin], HOME, { bandShare: 1 });
    expect(old.log.find((e) => e.id === "thin")!.t - entered).toBeGreaterThan(FRAME * 2);
  });

  it("large zones keep the whole band: 100 px slots hold 9 px into the neighbour, not 11", () => {
    const aimed = hold(through([FROM, mid(A.hit)], 0.8), 500);
    const at = (y: number) => drive(hold(then(aimed, (t0) => through([mid(A.hit), { x: 100, y }], 0.3, t0)), 400), DOCK, HOME).landed;
    expect(at(109)).toBe("slot-a");
    expect(at(111)).toBe("slot-b");
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

  it("item: the item is the only preview: no indicator on any target, it snaps once the room is open", () => {
    const slotted = plans(mid(A.hit), "item");
    expect(slotted.every((f) => !f.plan.showIndicator && f.plan.makeRoom === f.room && f.plan.snapItem === f.room)).toBe(true);
    expect(slotted.some((f) => f.plan.snapItem)).toBe(true);
    const free = plans({ x: 500, y: 200 }, "item");
    expect(free.at(-1)!.shown).toBe("area");
    expect(free.some((f) => f.plan.showIndicator || f.plan.snapItem || f.plan.makeRoom)).toBe(false);
  });

  it("snap: a target with no slot keeps the indicator and never snaps", () => {
    const frames = plans({ x: 500, y: 200 }, "snap");
    expect(frames.at(-1)!.shown).toBe("area");
    expect(frames.some((f) => f.plan.snapItem || f.plan.makeRoom)).toBe(false);
    expect(frames.at(-1)!.plan.showIndicator).toBe(true);
  });
});

describe("drag/ grip press", () => {
  const G = { x: 10, y: 10 };
  /** A press at `t` that moves `by` px (in 1 px steps), then ends: its lift answers and its release. */
  const click = (g: ReturnType<typeof createGripPress>, t: number, by = 0, at: Point = G) => {
    g.down(at, t);
    const lifts: string[] = [];
    for (let i = 1; i <= by; i++) lifts.push(g.move({ x: at.x + i, y: at.y }, t + i));
    return { lifted: lifts.includes("lift"), release: g.up({ x: at.x + by, y: at.y }, t + by + 40) };
  };

  it("two quick clicks: one click, then one double-activate (not a second click), and no lift", () => {
    const g = createGripPress();
    const a = click(g, 0, 2);
    const b = click(g, 180, 3);
    expect([a, b]).toEqual([
      { lifted: false, release: "click" },
      { lifted: false, release: "doubleActivate" },
    ]);
    // A third click starts a new pair.
    expect(click(g, 360).release).toBe("click");
    expect(click(g, 520).release).toBe("doubleActivate");
  });

  it("a slow pair, or a far one, is two clicks", () => {
    const g = createGripPress();
    expect([click(g, 0).release, click(g, DOUBLE_CLICK.ms + 1).release]).toEqual(["click", "click"]);
    const h = createGripPress();
    expect([click(h, 0).release, click(h, 100, 0, { x: G.x + 8, y: G.y }).release]).toEqual(["click", "click"]);
  });

  it("press and move lifts (a drag, no click), also as the second press of a pair; the next press is a first click", () => {
    const g = createGripPress();
    expect(click(g, 0, DRAG_DEFAULTS.lift)).toEqual({ lifted: true, release: null });
    expect(click(g, 100).release).toBe("click");
    expect(click(g, 200, DRAG_DEFAULTS.lift)).toEqual({ lifted: true, release: null });
    expect(click(g, 300).release).toBe("click");
  });

  it("the platform's count, when given, decides the double", () => {
    const g = createGripPress();
    g.down(G, 0, { clicks: 1 });
    expect(g.up(G, 10)).toBe("click");
    // Long after, but the platform says it is the second click.
    g.down(G, 5000, { clicks: 2 });
    expect(g.up(G, 5010)).toBe("doubleActivate");
  });
});

describe("drag/ spring-loading and keys", () => {
  // A side's rail strip, spring-loaded, 30 px at the left of a free area; its armed zone grows 6 px inward (a magnet).
  const STRIP_RAIL: DragTarget = { id: "rail:left", priority: 1, hit: rect(0, 0, 30, 400), armedHit: rect(0, 0, 36, 400), arm: "dwell" };
  const FREE: DragTarget = { id: "float", priority: 3, hit: rect(-1000, -1000, 4000, 4000), free: true };
  const SPRING = [STRIP_RAIL, FREE];
  const H = rect(500, 100, 100, 50);
  const run = (keys: readonly Key[], tuning: Partial<DragTuning> = {}, held?: { shift?: boolean; alt?: boolean; ctrl?: boolean; meta?: boolean }) => {
    const intent = createDragIntent({ home: H, tuning });
    const total = keys.at(-1)![0];
    const frames: { t: number; shown: string | null; arming: string | null; forced: string | null }[] = [];
    for (let t = 0; t <= total + 0.001; t += FRAME) {
      const f = intent.update(along(keys, t), t, SPRING, held);
      frames.push({ t, shown: f.shown?.id ?? null, arming: f.arming?.id ?? null, forced: f.forced });
    }
    return { frames, landed: intent.release(along(keys, total), SPRING, held)?.id ?? null };
  };

  it("a pass through the strip at travelling speed never arms it: the drop stays a float", () => {
    // From the home leftward through the strip and back out, at 1.5 px/ms.
    const r = run(hold(through([mid(H), { x: 15, y: 200 }, { x: 200, y: 200 }], 1.5), 200));
    expect(r.frames.some((f) => f.shown === "rail:left")).toBe(false);
    expect(r.landed).toBe("float");
  });

  it("a drop before the dwell is over is a float; held for the dwell it arms, shows at once and takes the drop", () => {
    const into = through([mid(H), { x: 15, y: 200 }], 1);
    const early = run(hold(into, 120));
    expect(early.frames.at(-1)!.arming).toBe("rail:left");
    expect(early.landed).toBe("float");
    const armed = run(hold(into, 260));
    const at = armed.frames.find((f) => f.shown === "rail:left")!.t;
    const entered = armed.frames.find((f) => f.arming === "rail:left")!.t;
    expect(at - entered).toBeGreaterThanOrEqual(DRAG_DEFAULTS.railArmDwellMs - FRAME);
    expect(at - entered).toBeLessThan(DRAG_DEFAULTS.railArmDwellMs + 2 * FRAME);
    expect(armed.landed).toBe("rail:left");
  });

  it("armed, the strip holds in its grown zone (the magnet) and disarms once the pointer leaves it", () => {
    const keys = then(hold(through([mid(H), { x: 15, y: 200 }], 1), 260), (t0) => hold(through([{ x: 15, y: 200 }, { x: 33, y: 200 }], 0.05, t0), 100));
    const r = run(keys);
    expect(r.frames.at(-1)!.shown).toBe("rail:left");
    const out = then(keys, (t0) => hold(through([{ x: 33, y: 200 }, { x: 80, y: 200 }], 0.2, t0), 200));
    const r2 = run(out);
    expect(r2.frames.at(-1)!.shown).toBe("float");
    expect(r2.landed).toBe("float");
  });

  it("a dwell of 0 arms at once", () => {
    const r = run(hold(through([mid(H), { x: 15, y: 200 }], 1), 60), { railArmDwellMs: 0 });
    expect(r.landed).toBe("rail:left");
  });

  it("the float key floats even on the strip; the rail key goes to the nearest rail from anywhere, home included", () => {
    const onStrip = hold(through([mid(H), { x: 15, y: 200 }], 1), 300);
    expect(run(onStrip, {}, { shift: true }).landed).toBe("float");
    expect(run(onStrip, {}, { shift: true }).frames.at(-1)!.forced).toBe("float");
    const mid1 = hold(through([mid(H), { x: 300, y: 200 }], 1), 100);
    const mod = run(mid1, {}, { meta: true });
    expect(mod.landed).toBe("rail:left");
    expect(mod.frames.at(-1)).toMatchObject({ shown: "rail:left", forced: "rail" });
    // Both held: the float key wins.
    expect(run(mid1, {}, { shift: true, meta: true }).landed).toBe("float");
    // Modifiers off: the keys do nothing.
    expect(run(mid1, { modifiers: { on: false, floatKey: "Shift", railKey: "Mod" } }, { meta: true }).landed).toBe("float");
    // Over home, the rail key still wins.
    const atHome = createDragIntent({ home: H });
    expect(atHome.release(mid(H), SPRING, { ctrl: true })?.id).toBe("rail:left");
  });

  it("the default rail key is Mod: ⌘ (meta) or Ctrl either one rails, and Alt does not", () => {
    const mid1 = hold(through([mid(H), { x: 300, y: 200 }], 1), 100);
    expect(DRAG_DEFAULTS.modifiers.railKey).toBe("Mod");
    expect(run(mid1, {}, { meta: true }).landed).toBe("rail:left");
    expect(run(mid1, {}, { ctrl: true }).landed).toBe("rail:left");
    expect(run(mid1, {}, { alt: true }).landed).toBe("float");
    expect(run(mid1, {}, { alt: true }).frames.at(-1)!.forced).toBe(null);
    // A host may still choose Alt, or one specific key.
    expect(run(mid1, { modifiers: { on: true, floatKey: "Shift", railKey: "Alt" } }, { alt: true }).landed).toBe("rail:left");
    expect(run(mid1, { modifiers: { on: true, floatKey: "Shift", railKey: "Meta" } }, { ctrl: true }).landed).toBe("float");
  });

  it("a target with no `arm` is unchanged by the new tuning", () => {
    const r = drive(hold(through([FROM, { x: -20, y: 50 }], 0.3), 300), DOCK, HOME, { railArmDwellMs: 5000 });
    expect(r.landed).toBe("rail");
  });
});

describe("drag/ a spring-loaded target that overlaps home", () => {
  // The item alone in its column at the window's right side: home is its column, the strip lies over home's outer part.
  const HOME = rect(700, 100, 100, 200);
  const FLOAT: DragTarget = { id: "float", priority: 3, hit: rect(-1000, -1000, 4000, 4000), free: true };
  const strip = (overlap: number, magnet = 0): DragTarget => ({
    id: "rail:right",
    priority: 1,
    hit: rect(800 - overlap, 0, overlap + 60, 400),
    arm: "dwell",
    ...(magnet ? { armedHit: rect(800 - overlap - magnet, 0, overlap + 60 + magnet, 400) } : {}),
  });
  /** Press in home's middle, move into the overlap and rest; the frames and what a release there does. */
  const play = (target: DragTarget, rest: number, tuning: Partial<DragTuning> = {}, start: Point = mid(HOME)) => {
    const intent = createDragIntent({ home: HOME, tuning });
    const to = { x: target.hit.x + 3, y: 200 };
    const keys = hold(through([start, to], 0.3), rest);
    const total = keys.at(-1)![0];
    const frames: { t: number; shown: string | null; arming: string | null; atHome: boolean }[] = [];
    for (let t = 0; t <= total + 0.001; t += FRAME) {
      const f = intent.update(along(keys, t), t, [target, FLOAT]);
      frames.push({ t, shown: f.shown?.id ?? null, arming: f.arming?.id ?? null, atHome: f.atHome });
    }
    return { intent, frames, to, landed: intent.release(to, [target, FLOAT])?.id ?? null };
  };

  it("property: a dwell target overlapping home arms after the dwell and lands the drop, whatever the overlap", () => {
    let checked = 0;
    // The drag starts over home, outside the strip (its inner edge is at 800 - overlap), and enters it over home.
    const start = { x: HOME.x + 1, y: 200 };
    for (const overlap of [2, 6, 12, 20, 36, 60, 90])
      for (const dwellMs of [0, 120, 200, 320])
        for (const magnet of [0, 8]) {
          const label = `overlap ${overlap} dwell ${dwellMs} magnet ${magnet}`;
          const r = play(strip(overlap, magnet), dwellMs + 600, { railArmDwellMs: dwellMs }, start);
          const shownAt = r.frames.find((f) => f.shown === "rail:right");
          // Resting within the lift zone of where it was lifted (a 90 px overlap leaves 10 px of home outside it) arms
          // nothing: that is the "changed my mind" spot.
          if (Math.hypot(r.to.x - start.x, r.to.y - start.y) <= DRAG_DEFAULTS.liftZone) {
            expect(shownAt, `${label}: in the lift zone`).toBeUndefined();
            expect(r.landed, `${label}: release`).toBeNull();
            checked++;
            continue;
          }
          expect(shownAt, `${label}: shown`).toBeDefined();
          const armingAt = r.frames.find((f) => f.arming === "rail:right")?.t ?? shownAt!.t;
          if (dwellMs > 0) expect(shownAt!.t - armingAt, `${label}: after the dwell`).toBeGreaterThanOrEqual(dwellMs - FRAME);
          expect(r.landed, `${label}: release`).toBe("rail:right");
          checked++;
        }
    expect(checked).toBe(56);
  });

  it("a drag that starts inside the strip and rests there arms nothing: the lift point counts as not entered", () => {
    // A flush window: the panel's grip lies under the strip at the window's edge. Lift, pause, let go: no rail.
    const home = rect(0, 100, 280, 300);
    const left: DragTarget = { id: "rail:left", priority: 1, hit: rect(0, 0, 24, 800), arm: "dwell" };
    const intent = createDragIntent({ home });
    const at = { x: 10, y: 200 };
    let shown = false;
    for (let t = 0; t <= 400; t += FRAME) shown ||= intent.update(at, t, [left, FLOAT]).shown !== null;
    expect(shown).toBe(false);
    expect(intent.release(at, [left, FLOAT])).toBeNull();
  });

  it("entering from over home counts (a lone panel reaching its own side's rail); so does leaving the strip and coming back", () => {
    const home = rect(0, 100, 280, 300);
    const left: DragTarget = { id: "rail:left", priority: 1, hit: rect(0, 0, 24, 800), arm: "dwell" };
    // Lifted over home outside the strip, into the strip, dwelling.
    const a = createDragIntent({ home });
    const keysA = hold(through([{ x: 120, y: 200 }, { x: 10, y: 200 }], 0.3), 500);
    for (let t = 0; t <= keysA.at(-1)![0]; t += FRAME) a.update(along(keysA, t), t, [left, FLOAT]);
    expect(a.state.shown?.id).toBe("rail:left");
    expect(a.release({ x: 10, y: 200 }, [left, FLOAT])?.id).toBe("rail:left");
    // Lifted inside the strip, out of it, and back into it away from the lift point to dwell.
    const b = createDragIntent({ home });
    const keysB = hold(through([{ x: 10, y: 200 }, { x: 120, y: 200 }, { x: 10, y: 320 }], 0.3), 500);
    for (let t = 0; t <= keysB.at(-1)![0]; t += FRAME) b.update(along(keysB, t), t, [left, FLOAT]);
    expect(b.state.shown?.id).toBe("rail:left");
    expect(b.release({ x: 10, y: 320 }, [left, FLOAT])?.id).toBe("rail:left");
  });

  describe("the lift zone: back where it was lifted is \"changed my mind\"", () => {
    // A flush drawer: the grip lies under the strip at the window's edge.
    const home = rect(0, 100, 280, 300);
    const left: DragTarget = { id: "rail:left", priority: 1, hit: rect(0, 0, 24, 800), arm: "dwell" };
    const grip = { x: 10, y: 120 };
    /** Lifted at the grip, away into the pages, back to `back` and resting; the shown target and the release. */
    const away = (back: Point, keys?: { meta?: boolean }, lift?: Point) => {
      const intent = createDragIntent({ home, ...(lift ? { lift } : {}) });
      const path = hold(through([grip, { x: 400, y: 300 }, back], 0.5), 400);
      for (let t = 0; t <= path.at(-1)![0]; t += FRAME) intent.update(along(path, t), t, [left, FLOAT], keys);
      return { shown: intent.state.shown?.id ?? null, landed: intent.release(back, [left, FLOAT], keys)?.id ?? null };
    };

    it("property: away and back to the lift point, a pause commits nothing, wherever in the lift zone it rests", () => {
      for (const [dx, dy] of [[0, 0], [3, 4], [-6, 8], [5, -12], [0, 15]]) {
        const r = away({ x: grip.x + dx, y: grip.y + dy });
        expect(r.shown, `${dx},${dy}`).toBeNull();
        expect(r.landed, `${dx},${dy}`).toBeNull();
      }
      // The press point given to the intent counts as the lift point (the grip), not the first sample.
      expect(away(grip, undefined, grip).landed).toBeNull();
    });

    it("with ⌘/Ctrl held it collapses into the rail, the lift zone too", () => {
      expect(away(grip, { meta: true }).landed).toBe("rail:left");
    });

    it("a lone panel still reaches its own side's rail: lifted outside the strip, into it over home away from the lift point, a dwell", () => {
      const intent = createDragIntent({ home });
      const path = hold(through([{ x: 150, y: 250 }, { x: 10, y: 250 }], 0.3), 500);
      for (let t = 0; t <= path.at(-1)![0]; t += FRAME) intent.update(along(path, t), t, [left, FLOAT]);
      expect(intent.state.shown?.id).toBe("rail:left");
      expect(intent.release({ x: 10, y: 250 }, [left, FLOAT])?.id).toBe("rail:left");
      // Past the lift zone's 16 px, in the strip over home, it arms as before.
      const near = createDragIntent({ home, lift: { x: 30, y: 250 } });
      const p2 = hold(through([{ x: 30, y: 250 }, { x: 200, y: 250 }, { x: 10, y: 275 }], 0.3), 500);
      for (let t = 0; t <= p2.at(-1)![0]; t += FRAME) near.update(along(p2, t), t, [left, FLOAT]);
      expect(near.state.shown?.id).toBe("rail:left");
    });
  });

  it("a short rest arms nothing and a release over home does nothing, as before", () => {
    const r = play(strip(30), 100, { railArmDwellMs: 400 });
    expect(r.frames.some((f) => f.shown === "rail:right")).toBe(false);
    expect(r.landed).toBeNull();
  });

  it("an armed magnet that reaches back over home keeps its marker while the pointer rests there", () => {
    const target = strip(6, 40);
    const intent = createDragIntent({ home: HOME, tuning: { railArmDwellMs: 200 } });
    const keys = hold(through([mid(HOME), { x: 797, y: 200 }], 0.3), 500);
    let t = 0;
    for (; t <= keys.at(-1)![0]; t += FRAME) intent.update(along(keys, t), t, [target, FLOAT]);
    expect(intent.state.shown?.id).toBe("rail:right");
    // Back inside the magnet's growth over home (x 754 to 794, home's own px): still shown, and a release lands on it.
    const back = { x: 770, y: 200 };
    for (let k = 0; k < 40; k++, t += FRAME) intent.update(back, t, [target, FLOAT]);
    expect(intent.state.shown?.id).toBe("rail:right");
    expect(intent.release(back, [target, FLOAT])?.id).toBe("rail:right");
  });

  it("a target that is not spring-loaded still never shows over home", () => {
    const plain: DragTarget = { id: "plain", priority: 1, hit: rect(780, 0, 100, 400) };
    const r = play(plain, 800);
    expect(r.frames.some((f) => f.shown === "plain")).toBe(false);
    expect(r.landed).toBeNull();
  });
});

describe("drag/ a zone at the window's edge", () => {
  it("from the float, a zone that ends at the window's edge takes the pointer at its very first px", () => {
    // A new-column line's zone from the window's left edge, 18 px wide; the float everywhere.
    const LINE: DragTarget = { id: "column", priority: 2, hit: rect(0, 0, 18, 800) };
    const FLOAT: DragTarget = { id: "float", priority: 3, hit: rect(-1e9, -1e9, 2e9, 2e9), free: true };
    for (const x of [0, 1, 2, 3]) {
      // Shown on the float mid-window, then a jump to the edge (the pointer clamped into the window) and a rest.
      const keys = hold(then(hold(through([{ x: 600, y: 400 }, { x: 300, y: 400 }], 0.3), 300), (t0) => [[t0, 300, 400], [t0 + FRAME, x, 400]]), 300);
      const r = drive(keys, [LINE, FLOAT], rect(900, 900, 10, 10));
      expect(r.landed, `x ${x}`).toBe("column");
    }
  });

  it("from the float into a tile the switch is at once; between two tiles the breakthrough holds as before", () => {
    const WIDE: DragTarget = { id: "wide", priority: 2, hit: rect(0, 0, 200, 400) };
    const NARROW: DragTarget = { id: "narrow", priority: 1, hit: rect(200, 0, 100, 400) };
    const FLOAT: DragTarget = { id: "float", priority: 3, hit: rect(-1e9, -1e9, 2e9, 2e9), free: true };
    const at = (from: Point, to: Point): string | null => {
      const d = createDragIntent<DragTarget>({ home: rect(900, 900, 10, 10) });
      let t = 0;
      for (let k = 0; k < 20; k++) d.update(from, (t += FRAME), [WIDE, NARROW, FLOAT]);
      for (let k = 0; k < 20; k++) d.update(to, (t += FRAME), [WIDE, NARROW, FLOAT]);
      return d.state.current?.id ?? null;
    };
    // From the float (outside both tiles, below them), 1 px into the narrow tile: it at once.
    expect(at({ x: 250, y: 600 }, { x: 250, y: 399 })).toBe("narrow");
    // From the wide tile, 2 px over the seam into the narrow one: the wide one holds (the breakthrough is 4 px)...
    expect(at({ x: 150, y: 200 }, { x: 202, y: 200 })).toBe("wide");
    // ...and 6 px over, the narrow one takes over.
    expect(at({ x: 150, y: 200 }, { x: 206, y: 200 })).toBe("narrow");
  });
});

describe("drag/ refusals in the pick", () => {
  // A kit's left rail stop (three pieces), a refusal under its band, and the float everywhere.
  const rail: DragTarget = { id: "rail:left:0", priority: 1, hit: rect(32, 0, 22, 800), hits: [rect(0, 0, 32, 36), rect(32, 0, 22, 800), rect(10, 72, 22, 728)] };
  const refusal: DragTarget = { id: "refuse:rail:left:start", priority: 2, hit: rect(0, 72, 10, 728), refuse: true };
  const float: DragTarget = { id: "float", priority: 3, hit: rect(-1e9, -1e9, 2e9, 2e9), free: true };
  const slowly = (list: readonly DragTarget[], xs: readonly number[]) => {
    const intent = createDragIntent<DragTarget>({ home: rect(20, 300, 100, 30), lift: { x: 600, y: 600 } });
    let t = 0;
    const frames: { x: number; shown: string | null; refused: string | null }[] = [];
    for (const x of xs)
      for (let k = 0; k < 4; k++) {
        t += 60;
        const f = intent.update({ x, y: 400 }, t, list);
        if (k === 3) frames.push({ x, shown: f.shown?.id ?? null, refused: f.refused?.id ?? null });
      }
    return { intent, frames };
  };

  it("approaching from the rail, the refusal under the rail's band shows nothing and says so", () => {
    const { frames } = slowly([rail, refusal, float], [30, 25, 20, 15, 12, 10, 9, 8, 7, 6, 4, 2, 0]);
    expect(frames.find((f) => f.x === 20)).toEqual({ x: 20, shown: "rail:left:0", refused: null });
    expect(frames.find((f) => f.x === 7)).toEqual({ x: 7, shown: null, refused: "refuse:rail:left:start" });
    // Every refused frame shows nothing, or a target whose own zone holds the pointer.
    for (const f of frames) if (f.refused) expect(f.shown, `x ${f.x}`).toBeNull();
  });

  it("without the refusal the rail's band holds as before; a release over a refusal lands nowhere", () => {
    const { frames } = slowly([rail, float], [30, 25, 20, 15, 12, 10, 9, 8, 7]);
    expect(frames.find((f) => f.x === 7)!.shown).toBe("rail:left:0");
    const { intent } = slowly([rail, refusal, float], [30, 20, 7]);
    expect(intent.release({ x: 7, y: 400 }, [rail, refusal, float])).toBeNull();
    expect(targetAt([rail, refusal, float], { x: 7, y: 400 })?.id).toBe("refuse:rail:left:start");
  });

  it("a real target beats a refusal where they meet or overlap, whatever the sizes; a refusal beats the float", () => {
    // A column's last gap (priority 2, large) sharing its bottom edge with a bar's refusal below it (small).
    const gap: DragTarget = { id: "gap:right:start:1", priority: 2, hit: rect(808, 780, 300, 24) };
    const bar: DragTarget = { id: "refuse:bar:start:0", priority: 2, hit: rect(800, 804, 40, 20), refuse: true };
    const under: DragTarget = { id: "refuse:column:start:0", priority: 1, hit: rect(808, 700, 10, 90), refuse: true };
    expect(REFUSAL_RANK).toBeGreaterThan(2);
    expect(REFUSAL_RANK).toBeLessThan(3);
    expect(pickRank(bar)).toBe(REFUSAL_RANK);
    expect(pickRank(under)).toBe(REFUSAL_RANK);
    expect(pickRank(gap)).toBe(2);
    // On the shared edge: the gap, though the refusal is the smaller zone.
    expect(targetAt([gap, bar, float], { x: 820, y: 804 })?.id).toBe("gap:right:start:1");
    // Inside both (a refusal given priority 1 still ranks as a refusal): the gap.
    expect(targetAt([gap, under, float], { x: 810, y: 785 })?.id).toBe("gap:right:start:1");
    // Over the refusal alone: the refusal, not the float under it.
    expect(targetAt([gap, bar, float], { x: 820, y: 815 })?.id).toBe("refuse:bar:start:0");
    // Two refusals: the smaller zone.
    const wide: DragTarget = { ...bar, id: "refuse:wide", hit: rect(700, 804, 400, 20) };
    expect(targetAt([wide, bar], { x: 820, y: 815 })?.id).toBe("refuse:bar:start:0");
  });

  it("a refusal's zone is half-open toward the outside of its `bounds`: a point on the window's edge is never in it", () => {
    const stage = rect(0, 0, 1120, 800);
    const bar: DragTarget = { id: "refuse:bar", priority: 2, hit: rect(600, 780, 520, 20), refuse: true, bounds: stage };
    const gap: DragTarget = { id: "gap", priority: 2, hit: rect(808, 760, 300, 30) };
    // Inside: the refusal.
    expect(targetAt([bar, float], { x: 958, y: 790 })?.id).toBe("refuse:bar");
    // On the stage's bottom and right edges (where a clamped pointer lands): not the refusal.
    expect(targetAt([bar, float], { x: 958, y: 800 })?.id).toBe("float");
    expect(targetAt([bar, float], { x: 1120, y: 790 })?.id).toBe("float");
    expect(targetAt([bar, gap], { x: 958, y: 800 })).toBeNull();
    // Without `bounds` its edge holds the point, as any zone's does.
    const { bounds: _b, ...closed } = bar;
    expect(targetAt([closed, float], { x: 958, y: 800 })?.id).toBe("refuse:bar");
    // A held target keeps its band there: the pick is no refusal, so nothing clears it.
    const intent = createDragIntent<DragTarget>({ home: rect(20, 300, 100, 30), lift: { x: 600, y: 600 } });
    let t = 0;
    for (let k = 0; k < 6; k++) intent.update({ x: 958, y: 775 }, (t += 60), [gap, bar]);
    expect(intent.update({ x: 958, y: 775 }, (t += 60), [gap, bar]).shown?.id).toBe("gap");
    const edge = intent.update({ x: 958, y: 800 }, (t += 60), [gap, bar]);
    expect([edge.shown?.id, edge.refused]).toEqual(["gap", null]);
    expect(intent.release({ x: 958, y: 800 }, [gap, bar])?.id).toBe("gap");
  });
});

describe("drag/ the window's edge belongs to the targets drawn against it", () => {
  // A window 1400 × 800 with a 36 px bottom bar that refuses panels, the right column's last gap above it, the float.
  const stage = rect(0, 0, 1400, 800);
  const gap: DragTarget = { id: "gap:right-0:start:1", priority: 2, hit: rect(1088, 418, 268, 346) };
  const rim: DragTarget = { id: "refuse:bar:bottom:start", priority: 2, hit: rect(0, 764, 1400, 36), refuse: true, bounds: stage };
  const float: DragTarget = { id: "float:findings", priority: 3, hit: rect(-1e9, -1e9, 2e9, 2e9), free: true, bounds: stage };
  const list = [gap, rim, float];

  it("the gap keeps the point it shares with the bar's refusal (its last row of px)", () => {
    expect(targetAt(list, { x: 1238, y: 763 })?.id).toBe("gap:right-0:start:1");
    expect(targetAt(list, { x: 1238, y: 764 })?.id).toBe("gap:right-0:start:1");
    expect(targetAt(list, { x: 1238, y: 765 })?.id).toBe("refuse:bar:bottom:start");
  });

  it("a pointer clamped onto the window's edge past a refused bar picks nothing: no refusal, no float", () => {
    expect(targetAt(list, { x: 700, y: 798 })?.id).toBe("refuse:bar:bottom:start");
    expect(targetAt(list, { x: 700, y: 800 })).toBeNull();
    expect(targetAt(list, { x: 700, y: 840 })).toBeNull();
    expect(targetAt(list, { x: 700, y: 400 })?.id).toBe("float:findings");
    // Walked over the bar, then past the window's edge (clamped there), dwelling each time: nothing shows, a release
    // commits nothing.
    const intent = createDragIntent<DragTarget>({ home: rect(1088, 84, 300, 668), lift: { x: 1108, y: 94 } });
    let t = 0;
    let f = intent.update({ x: 1148, y: 134 }, (t += 16), list);
    for (let y = 134, x = 1148; x > 700 || y < 798; ) {
      x = Math.max(700, x - 12);
      y = Math.min(798, y + 12);
      f = intent.update({ x, y }, (t += 16), list);
    }
    for (let k = 0; k < 30; k++) f = intent.update({ x: 700, y: 798 }, (t += 16), list);
    expect([f.shown, f.refused?.id]).toEqual([null, "refuse:bar:bottom:start"]);
    for (let k = 0; k < 30; k++) f = intent.update({ x: 700, y: 800 }, (t += 16), list);
    expect([f.shown, f.refused, f.refusedSinceShown]).toEqual([null, null, true]);
    expect(intent.release({ x: 700, y: 800 }, list)).toBeNull();
  });

  it("the float shown inside the window holds nothing past its edge: nothing shows at once", () => {
    const intent = createDragIntent<DragTarget>({ home: rect(1088, 84, 300, 668), lift: { x: 1108, y: 94 } });
    let t = 0;
    let f = intent.update({ x: 700, y: 400 }, (t += 16), list);
    for (let k = 0; k < 20; k++) f = intent.update({ x: 700, y: 400 }, (t += 16), list);
    expect(f.shown?.id).toBe("float:findings");
    f = intent.update({ x: 400, y: 800 }, (t += 16), list);
    expect(f.shown).toBeNull();
    expect(intent.release({ x: 400, y: 800 }, list)).toBeNull();
  });

  it("creeping onto the edge, 2 px a frame, the float gets no gap grace there: it hides on the edge's first frame", () => {
    const intent = createDragIntent<DragTarget>({ home: rect(1088, 84, 300, 668), lift: { x: 1108, y: 94 } });
    let t = 0;
    let f = intent.update({ x: 1390, y: 400 }, (t += 16), list);
    for (let k = 0; k < 20; k++) f = intent.update({ x: 1390, y: 400 }, (t += 16), list);
    expect(f.shown?.id).toBe("float:findings");
    for (let x = 1392; x < 1400; x += 2) {
      f = intent.update({ x, y: 400 }, (t += 16), list);
      expect(f.shown?.id, `x ${x}`).toBe("float:findings");
    }
    f = intent.update({ x: 1400, y: 400 }, (t += 16), list);
    expect(f.shown).toBeNull();
    expect(intent.release({ x: 1400, y: 400 }, list)).toBeNull();
    // And every frame on the edge after it.
    for (let k = 0; k < 8; k++) expect(intent.update({ x: 1400, y: 400 }, (t += 16), list).shown).toBeNull();
  });
});

describe("drag/ the float key chooses the float over dock targets, not over refusals or outside the window", () => {
  // A window 1400 × 800: a docked column's gap, a refused bar along the bottom, a rail strip at the left, the float.
  const stage = rect(0, 0, 1400, 800);
  const gap: DragTarget = { id: "gap:right-0:start:1", priority: 2, hit: rect(1088, 418, 268, 346) };
  const rim: DragTarget = { id: "refuse:bar:bottom:start", priority: 2, hit: rect(0, 764, 1400, 36), refuse: true, bounds: stage };
  const strip: DragTarget = { id: "rail:left:0", priority: 1, hit: rect(0, 0, 24, 764), arm: "dwell" };
  const float: DragTarget = { id: "float:findings", priority: 3, hit: rect(-1e9, -1e9, 2e9, 2e9), free: true, bounds: stage };
  const list = [gap, rim, strip, float];
  const shift = { shift: true };
  const at = (p: { x: number; y: number }, keys: DragKeys = shift) => {
    const intent = createDragIntent<DragTarget>({ home: rect(1088, 84, 300, 300), lift: { x: 1108, y: 94 } });
    let t = 0;
    let f = intent.update({ x: 1108, y: 94 }, t, list, keys);
    for (let k = 0; k < 12; k++) f = intent.update(p, (t += 16), list, keys);
    return { f, landed: intent.release(p, list, keys)?.id ?? null };
  };

  it("over a dock target or open space the float key still floats, over a spring-loaded strip too", () => {
    for (const p of [{ x: 1200, y: 600 }, { x: 600, y: 400 }, { x: 10, y: 400 }]) {
      const { f, landed } = at(p);
      expect([f.forced, f.shown?.id, f.refused, landed], `${p.x},${p.y}`).toEqual(["float", "float:findings", null, "float:findings"]);
    }
  });

  it("over a refusal it picks nothing: the frame is refused, nothing shows, a release lands nowhere", () => {
    const { f, landed } = at({ x: 600, y: 780 });
    expect([f.forced, f.shown, f.refused?.id, f.refusedSinceShown, landed]).toEqual(["float", null, "refuse:bar:bottom:start", false, null]);
    // Where the gap meets the refused bar, the gap is the pick, so the key floats.
    expect(at({ x: 1200, y: 764 }).landed).toBe("float:findings");
  });

  it("outside the float's bounds (a pointer clamped onto the window's edge) it picks nothing", () => {
    for (const p of [{ x: 600, y: 800 }, { x: 1400, y: 300 }, { x: 0, y: 300 }, { x: 600, y: 840 }]) {
      const { f, landed } = at(p);
      expect([f.forced, f.shown, f.refused, landed], `${p.x},${p.y}`).toEqual(["float", null, null, null]);
    }
  });

  it("refusedSinceShown behaves as without the key: over the refusal false, past it true until a target shows", () => {
    const intent = createDragIntent<DragTarget>({ home: rect(1088, 84, 300, 300), lift: { x: 1108, y: 94 } });
    let t = 0;
    intent.update({ x: 1108, y: 94 }, t, list, shift);
    let f = intent.update({ x: 600, y: 400 }, (t += 16), list, shift);
    expect(f.shown?.id).toBe("float:findings");
    f = intent.update({ x: 600, y: 780 }, (t += 16), list, shift);
    expect([f.shown, f.refused?.id, f.refusedSinceShown]).toEqual([null, "refuse:bar:bottom:start", false]);
    f = intent.update({ x: 600, y: 800 }, (t += 16), list, shift);
    expect([f.shown, f.refused, f.refusedSinceShown]).toEqual([null, null, true]);
    f = intent.update({ x: 600, y: 400 }, (t += 16), list, shift);
    expect([f.shown?.id, f.refusedSinceShown]).toEqual(["float:findings", false]);
  });

  it("the rail key is unchanged: its drop lands on the rail, wherever the pointer is", () => {
    const meta = { meta: true };
    for (const p of [{ x: 600, y: 780 }, { x: 600, y: 800 }, { x: 1200, y: 600 }]) {
      const { f, landed } = at(p, meta);
      expect([f.forced, f.shown?.id, f.refused, landed], `${p.x},${p.y}`).toEqual(["rail", "rail:left:0", null, "rail:left:0"]);
    }
  });
});

describe("drag/ a target that opens its room", () => {
  const rail: DragTarget = { id: "strip:rail-left:center", priority: 2, hit: rect(0, 0, 40, 800), opensRoom: true };
  const gap: DragTarget = { id: "gap:left:start:1", priority: 2, hit: rect(100, 300, 200, 40) };
  const float: DragTarget = { id: "float", priority: 3, hit: rect(-1e9, -1e9, 2e9, 2e9), free: true };
  const start = () => createDragIntent<DragTarget>({ home: rect(600, 0, 100, 30), lift: { x: 650, y: 15 } });
  /** Frames held at `p` from `t`, 16 ms apart: when each first showed, and whether room came with it. */
  const hold = (intent: ReturnType<typeof start>, list: readonly DragTarget[], p: { x: number; y: number }, from: number, n = 30) => {
    const frames = Array.from({ length: n }, (_, k) => ({ t: from + 16 * (k + 1), f: intent.update(p, from + 16 * (k + 1), list) }));
    return { frames, first: frames.find((x) => x.f.shown), roomAt: frames.find((x) => x.f.room) };
  };

  it("shows after roomAfter, and the frame that first shows it has its room", () => {
    const intent = start();
    intent.update({ x: 650, y: 15 }, 0, [rail, gap]);
    const { frames, first, roomAt } = hold(intent, [rail, gap], { x: 20, y: 400 }, 0);
    expect(first!.f.shown!.id).toBe(rail.id);
    expect(first!.t).toBeGreaterThanOrEqual(DRAG_DEFAULTS.roomAfter);
    expect(roomAt!.t).toBe(first!.t);
    expect(first!.f.roomPlace).toBe(rail.id);
    for (const x of frames) expect(x.f.room, `t ${x.t}`).toBe(!!x.f.shown);
  });

  it("an armed spring-loaded rail target has its room in the frame that first shows it", () => {
    const armed: DragTarget = { id: "rail:left:0", priority: 1, hit: rect(0, 0, 32, 800), arm: "dwell" };
    const intent = start();
    intent.update({ x: 650, y: 15 }, 0, [armed, float]);
    const { first } = hold(intent, [armed], { x: 16, y: 400 }, 0);
    expect([first!.f.shown!.id, first!.f.room]).toEqual([armed.id, true]);
  });

  it("a sweep across it moves nothing and shows nothing", () => {
    const intent = start();
    intent.update({ x: 650, y: 15 }, 0, [rail, gap]);
    let t = 0;
    for (const y of [100, 104, 108, 112, 116, 120, 124]) {
      const f = intent.update({ x: 20, y }, (t += 16), [rail, gap]);
      expect([f.shown, f.room]).toEqual([null, false]);
    }
    const away = intent.update({ x: 400, y: 600 }, (t += 16), [rail, gap]);
    expect([away.shown, away.room]).toEqual([null, false]);
  });

  it("before it shows, a release lands on it; a float shown before it gives way at once", () => {
    const intent = start();
    let t = 0;
    intent.update({ x: 650, y: 15 }, t, [rail, float]);
    let f = intent.update({ x: 400, y: 400 }, (t += 16), [rail, float]);
    for (let k = 0; k < 12; k++) f = intent.update({ x: 400, y: 400 }, (t += 16), [rail, float]);
    expect(f.shown?.id).toBe("float");
    f = intent.update({ x: 20, y: 400 }, (t += 16), [rail, float]);
    f = intent.update({ x: 20, y: 400 }, (t += 16), [rail, float]);
    expect([f.shown, f.room]).toEqual([null, false]);
    expect(intent.release({ x: 20, y: 400 }, [rail, float])?.id).toBe(rail.id);
  });

  it("roomHold is that target's own wait: it shows with its room after it, and roomAfter stays for the others", () => {
    const edge: DragTarget = { ...rail, roomHold: 64 };
    const intent = start();
    intent.update({ x: 650, y: 15 }, 0, [edge, gap]);
    const { first, roomAt } = hold(intent, [edge, gap], { x: 20, y: 400 }, 0);
    expect(first!.t).toBeGreaterThanOrEqual(64);
    expect(first!.t).toBeLessThan(DRAG_DEFAULTS.roomAfter);
    expect(roomAt!.t).toBe(first!.t);
  });

  it("earlyRelease decides a release before the room is open: the target by default, the float with \"float\"", () => {
    const slotted: DragTarget = { ...rail, slot: rect(0, 0, 40, 800) };
    const plain: DragTarget = { ...gap, slot: rect(100, 300, 200, 40) };
    const refused: DragTarget = { id: "refuse:bar", priority: 2, hit: rect(300, 700, 200, 40), refuse: true };
    const blocked: DragTarget = { id: "none:0", priority: 1, hit: rect(600, 300, 100, 100) };
    const bounded: DragTarget = { ...float, bounds: rect(0, 0, 1200, 800) };
    const all = [slotted, plain, refused, blocked, bounded];
    const at = (earlyRelease: "target" | "float" | undefined, p: { x: number; y: number }, frames: number) => {
      const intent = createDragIntent<DragTarget>({ home: rect(900, 0, 100, 30), lift: { x: 950, y: 15 }, ...(earlyRelease ? { earlyRelease } : {}) });
      intent.update({ x: 950, y: 15 }, 0, all);
      for (let k = 1; k <= frames; k++) intent.update(p, 16 * k, all);
      return intent.release(p, all)?.id ?? null;
    };
    const onRail = { x: 20, y: 400 };
    const onGap = { x: 200, y: 320 };
    // Before the `opensRoom` target shows (2 frames), and on a gap shown with no room yet (6 frames).
    expect([at(undefined, onRail, 2), at("target", onRail, 2), at(undefined, onGap, 6)]).toEqual([slotted.id, slotted.id, plain.id]);
    expect([at("float", onRail, 2), at("float", onGap, 6)]).toEqual(["float", "float"]);
    // Settled, it lands there either way.
    expect([at("float", onRail, 20), at("float", onGap, 30)]).toEqual([slotted.id, plain.id]);
    // A refusal lands nowhere, a place with no slot is itself, and past the float's bounds nothing floats.
    expect([at("float", { x: 400, y: 720 }, 2), at("float", { x: 650, y: 350 }, 2), at("float", { x: 700, y: 800 }, 2)]).toEqual([null, "none:0", null]);
  });

  it("a target without it is unchanged: it shows first, its room follows after roomAfter", () => {
    const intent = start();
    intent.update({ x: 650, y: 15 }, 0, [gap]);
    const { first, roomAt } = hold(intent, [gap], { x: 200, y: 320 }, 0);
    expect(first!.t).toBeLessThan(DRAG_DEFAULTS.roomAfter);
    expect(roomAt!.t - first!.t).toBeGreaterThanOrEqual(DRAG_DEFAULTS.roomAfter);
  });
});

describe("drag/ a target with its room open holds in the room it opened", () => {
  // An empty rail's strip at the window's left edge: a 12 px hit, a 30 px rail once its room is open. Beside it a column
  // that refuses the item, the float everywhere.
  const strip: DragTarget = { id: "strip:rail-left:center", priority: 2, hit: rect(0, 224, 12, 192), slot: rect(0, 241, 30, 158), opensRoom: true, roomHold: 70, roomHit: rect(0, 224, 30, 192) };
  const column: DragTarget = { id: "refuse:left:start", priority: 2, hit: rect(12, 0, 228, 640), refuse: true };
  const float: DragTarget = { id: "float", priority: 3, hit: rect(0, 0, 1080, 640), free: true, bounds: rect(0, 0, 1080, 640) };
  const ALL = [strip, column, float];
  /** Lifted at the middle, aimed at the strip at x 8, held `wait` ms, then each of `then` held 4 frames: the frames there. */
  const drift = (list: readonly DragTarget[], then: readonly Point[], wait = 400, keys?: DragKeys) => {
    const intent = createDragIntent<DragTarget>({ home: rect(500, 300, 100, 30), lift: { x: 550, y: 315 } });
    let t = 0;
    intent.update({ x: 550, y: 315 }, t, list);
    for (let k = 0; k < Math.ceil(wait / 16); k++) intent.update({ x: 8, y: 320 }, (t += 16), list);
    const frames = then.map((p) => {
      let f = intent.update(p, (t += 16), list, keys);
      for (let k = 0; k < 3; k++) f = intent.update(p, (t += 16), list, keys);
      return { p, f, landed: intent.release(p, list, keys)?.id ?? null };
    });
    return frames;
  };
  const xs = [8, 12, 16, 20, 24, 29].map((x) => ({ x, y: 320 }));

  it("the kits' case: aimed at the strip, room open, a drift from x 8 to x 29 keeps the target and its room", () => {
    for (const { p, f, landed } of drift(ALL, xs)) {
      expect([p.x, f.shown?.id, f.room, f.refused]).toEqual([p.x, strip.id, true, null]);
      expect(landed).toBe(strip.id);
    }
  });

  it("without a roomHit the same drift leaves it at the hit's edge (the flicker this fixes)", () => {
    const { roomHit: _r, ...plain } = strip;
    const at16 = drift([plain, column, float], xs)[2]!;
    expect([at16.f.shown, at16.f.room, at16.f.refused?.id]).toEqual([null, false, column.id]);
  });

  it("leaving the room drops it, and its zone is the hit again", () => {
    const [out, back] = drift(ALL, [{ x: 60, y: 320 }, { x: 20, y: 320 }]);
    expect([out!.f.shown, out!.f.room, out!.f.refused?.id]).toEqual([null, false, column.id]);
    // Back in the room's area but past the hit: the refusal there wins again until the strip is aimed at anew.
    expect([back!.f.shown, back!.f.refused?.id]).toEqual([null, column.id]);
    // Along the rail, past the room's ends, it drops too.
    const [below] = drift(ALL, [{ x: 20, y: 470 }]);
    expect(below!.f.shown?.id ?? null).not.toBe(strip.id);
  });

  it("before its room opens it holds no more than its hit: a refusal beside it wins", () => {
    const [f] = drift(ALL, [{ x: 20, y: 320 }], 32);
    expect([f!.f.shown, f!.f.room, f!.f.refused?.id]).toEqual([null, false, column.id]);
  });

  it("a more precise target in the room takes over past breakthrough; one no more precise doesn't", () => {
    const precise: DragTarget = { id: "stop:left", priority: 1, hit: rect(14, 300, 16, 40), slot: rect(0, 300, 30, 40) };
    const same: DragTarget = { id: "gap:other", priority: 2, hit: rect(14, 300, 16, 40), slot: rect(0, 300, 30, 40) };
    const [, a] = drift([strip, precise, column, float], [{ x: 8, y: 320 }, { x: 22, y: 320 }]);
    expect(a!.f.shown?.id).toBe(precise.id);
    const [, b] = drift([strip, same, column, float], [{ x: 8, y: 320 }, { x: 22, y: 320 }]);
    expect([b!.f.shown?.id, b!.f.room]).toEqual([strip.id, true]);
  });

  it("the float key still wins in the room, and the room holds nothing past the target's bounds", () => {
    // The key floats it over the strip; over the refusal beside it nothing, as anywhere (the room it held is gone).
    const [f, g] = drift(ALL, [{ x: 8, y: 320 }, { x: 20, y: 320 }], 400, { shift: true });
    expect([f!.f.shown?.id, f!.f.room, f!.landed]).toEqual([float.id, false, float.id]);
    expect([g!.f.shown, g!.f.forced, g!.f.refused?.id, g!.landed]).toEqual([null, "float", column.id, null]);
    const bounded: DragTarget = { ...strip, bounds: rect(0, 0, 1080, 640) };
    const [edge] = drift([bounded, column, float], [{ x: 0, y: 320 }]);
    expect(edge!.f.shown?.id ?? null).not.toBe(strip.id);
  });
});

describe("drag/ a floating item's own place is a free placement", () => {
  // A window 1400 × 800 with a refused bar along the bottom; a float whose box (home) lies over the bar's rim.
  const stage = rect(0, 0, 1400, 800);
  const rim: DragTarget = { id: "refuse:bar:bottom:start", priority: 2, hit: rect(0, 764, 1400, 36), refuse: true, bounds: stage };
  const float: DragTarget = { id: "float:notes", priority: 3, hit: rect(-1e9, -1e9, 2e9, 2e9), free: true, bounds: stage };
  const box = rect(500, 600, 300, 200);
  const list = [rim, float];
  /** Lifted in the box, out of it and back in at `p`, held there. */
  const back = (home: Rect, targets: readonly DragTarget[], p: { x: number; y: number }, floating = true) => {
    const intent = createDragIntent<DragTarget>({ home, lift: { x: 520, y: 620 }, floating });
    let t = 0;
    intent.update({ x: 520, y: 620 }, t, targets);
    for (let k = 0; k < 4; k++) intent.update({ x: 300, y: 300 }, (t += 16), targets);
    let f = intent.update(p, (t += 16), targets);
    for (let k = 0; k < 10; k++) f = intent.update(p, (t += 16), targets);
    return { f: [f.atHome, f.shown?.id ?? null, f.refused?.id ?? null], landed: intent.release(p, targets)?.id ?? null };
  };

  it("over a refusal inside its box: refused, and a release lands nowhere", () => {
    expect(back(box, list, { x: 650, y: 780 })).toEqual({ f: [false, null, "refuse:bar:bottom:start"], landed: null });
  });

  it("elsewhere in its box: home, as before (the host moves the float where it is let go)", () => {
    expect(back(box, list, { x: 650, y: 700 })).toEqual({ f: [true, null, null], landed: null });
  });

  it("on or past the window's edge inside its box: nothing (no home, no float, no refusal)", () => {
    const low = rect(500, 700, 300, 200);
    for (const p of [{ x: 650, y: 800 }, { x: 650, y: 840 }]) expect(back(low, list, p), `${p.x},${p.y}`).toEqual({ f: [false, null, null], landed: null });
  });

  it("a docked item's home over a refusal is still home, on the window's edge too", () => {
    const docked = rect(500, 740, 300, 60);
    const homeTarget: DragTarget = { id: "home:notes", priority: 1, hit: docked };
    for (const list2 of [[homeTarget, rim, float], [rim, float]]) {
      expect(back(docked, list2, { x: 650, y: 780 }, false)).toEqual({ f: [true, null, null], landed: null });
      expect(back(docked, list2, { x: 650, y: 800 }, false)).toEqual({ f: [true, null, null], landed: null });
    }
  });

  it("without `floating`, a float's box over a refusal is home as before (the option is the host's to give)", () => {
    expect(back(box, list, { x: 650, y: 780 }, false)).toEqual({ f: [true, null, null], landed: null });
  });
});

describe("drag/ a release beyond a refusal", () => {
  // A group dragged across a panel column (a refusal) and let go over open space (the float) in one quick move.
  const column: DragTarget = { id: "refuse:column", priority: 2, hit: rect(0, 0, 240, 800), refuse: true };
  const float: DragTarget = { id: "float", priority: 3, hit: rect(-1e9, -1e9, 2e9, 2e9), free: true };
  const list = [column, float];
  const start = () => createDragIntent<DragTarget>({ home: rect(4, 40, 236, 34), lift: { x: 8, y: 44 } });

  it("says a refusal was crossed since a target last showed, and release lands on what is under the pointer", () => {
    const intent = start();
    let t = 0;
    const flags: boolean[] = [];
    // Fast, from the grip across the column (refused), out to the open space: no target ever shows.
    for (const x of [8, 60, 120, 180, 230]) expect(intent.update({ x, y: 260 }, (t += 16), list).refused?.id).toBe("refuse:column");
    for (const x of [300, 520]) {
      const f = intent.update({ x, y: 260 }, (t += 16), list);
      expect([f.shown, f.refused]).toEqual([null, null]);
      flags.push(f.refusedSinceShown);
    }
    expect(flags).toEqual([true, true]);
    expect(intent.release({ x: 520, y: 260 }, list)?.id).toBe("float");
  });

  it("is false over the refusal itself, once a target shows, before any refusal, and after hide", () => {
    const intent = start();
    let t = 0;
    // Over open space with no refusal crossed: false.
    const away = createDragIntent<DragTarget>({ home: rect(600, 40, 100, 30), lift: { x: 650, y: 50 } });
    expect(away.update({ x: 400, y: 400 }, 16, list).refusedSinceShown).toBe(false);
    expect(intent.update({ x: 100, y: 260 }, (t += 16), list).refusedSinceShown).toBe(false);
    let f = intent.update({ x: 400, y: 260 }, (t += 16), list);
    expect(f.refusedSinceShown).toBe(true);
    // Aiming there: the float shows, and the flag is gone.
    for (let k = 0; k < 8; k++) f = intent.update({ x: 400, y: 260 }, (t += 60), list);
    expect([f.shown?.id, f.refusedSinceShown]).toEqual(["float", false]);
    // Back over the column and out, then hide: false.
    intent.update({ x: 100, y: 260 }, (t += 16), list);
    intent.update({ x: 400, y: 260 }, (t += 16), list);
    intent.hide(t);
    expect(intent.update({ x: 410, y: 260 }, (t += 16), list).refusedSinceShown).toBe(false);
  });

  it("a group flung from its bar across a docked column to open space in 24 frames: the release commits the float", () => {
    // The window (0,-16) 840 × 516; the bar's refused stretch and the docked column's tile; the float everywhere inside.
    const stage = rect(0, -16, 840, 516);
    const bar: DragTarget = { id: "refuse:bar:left:start", priority: 2, hit: rect(0, 0, 40, 166.67), refuse: true, bounds: stage };
    const tile: DragTarget = { id: "refuse:left-0:start", priority: 2, hit: rect(40, 12, 300, 476), refuse: true, bounds: stage };
    const floatIn: DragTarget = { ...float, bounds: stage };
    const all = [bar, tile, floatIn];
    const intent = createDragIntent<DragTarget>({ home: rect(0, 0, 28, 0), lift: { x: 4, y: 4 } });
    let t = 0;
    let f = intent.update({ x: 4, y: 4 }, t, all);
    const seen: string[] = [];
    for (let k = 1; k <= 24; k++) {
      f = intent.update({ x: 4 + (516 * k) / 24, y: 4 + (256 * k) / 24 }, (t += 16), all);
      seen.push(f.refused?.id ?? (f.shown ? `shown ${f.shown.id}` : "-"));
    }
    expect(seen.includes("refuse:left-0:start")).toBe(true);
    expect(seen.some((s) => s.startsWith("shown"))).toBe(false);
    expect([f.shown, f.refused, f.refusedSinceShown]).toEqual([null, null, true]);
    expect(intent.release({ x: 520, y: 260 }, all)?.id).toBe("float");
  });

  it("but once the item's own place showed after the refusal, a fling to open space is not committable", () => {
    // A side's refused strip beside its rail, the rail's own stop (the panel's place) and the float.
    const strip: DragTarget = { id: "refuse:rail:left:start", priority: 2, hit: rect(12, 120, 34, 668), refuse: true };
    const stop: DragTarget = { id: "rail:left:0", priority: 1, hit: rect(46, 12, 10, 776) };
    const all = [strip, stop, float];
    const intent = createDragIntent<DragTarget>({ home: rect(12, 84, 44, 36), lift: { x: 20, y: 100 } });
    let t = 0;
    let f = intent.update({ x: 20, y: 100 }, t, all);
    for (let y = 112; y <= 320; y += 12) f = intent.update({ x: 18, y }, (t += 16), all);
    for (let k = 0; k < 3; k++) f = intent.update({ x: 18, y: 320 }, (t += 16), all);
    expect(f.refused?.id).toBe("refuse:rail:left:start");
    // The refusal crossed and a jump straight to open space: committable.
    const jumped = createDragIntent<DragTarget>({ home: rect(12, 84, 44, 36), lift: { x: 20, y: 100 } });
    let t2 = 0;
    jumped.update({ x: 20, y: 100 }, t2, all);
    for (let y = 112; y <= 320; y += 12) jumped.update({ x: 18, y }, (t2 += 16), all);
    expect(jumped.update({ x: 400, y: 400 }, (t2 += 16), all).refusedSinceShown).toBe(true);
    // Back to its own stop, dwelling: it shows; then the jump: nothing shows, and the flag stays off.
    for (let k = 0; k < 30; k++) f = intent.update({ x: 50, y: 320 }, (t += 16), all);
    expect(f.shown?.id).toBe("rail:left:0");
    f = intent.update({ x: 400, y: 400 }, (t += 16), all);
    expect([f.shown, f.refusedSinceShown]).toEqual([null, false]);
    // A flick that never met a refusal: off too.
    const flick = createDragIntent<DragTarget>({ home: rect(600, 40, 100, 30), lift: { x: 650, y: 50 } });
    flick.update({ x: 650, y: 50 }, 0, all);
    expect(flick.update({ x: 400, y: 400 }, 16, all).refusedSinceShown).toBe(false);
  });

  it("changes nothing else: no indicator flashes after a refusal (the aim gate is kept)", () => {
    const intent = start();
    let t = 0;
    const shown: (string | null)[] = [];
    for (const x of [8, 60, 120, 180, 230, 260, 300, 340, 380]) shown.push(intent.update({ x, y: 260 }, (t += 16), list).shown?.id ?? null);
    expect(shown.every((s) => s === null)).toBe(true);
  });
});

describe("drag/ a lift rect", () => {
  // A drop strip down the left edge, spring-loaded; a 400 px wide grip across it at y 100–138, so the part of the grip
  // the strip covers is 32 × 38.
  const strip: DragTarget = { id: "rail:left:0", priority: 1, hit: rect(0, 0, 32, 800), arm: "dwell" };
  const float: DragTarget = { id: "float", priority: 3, hit: rect(-1e9, -1e9, 2e9, 2e9), free: true };
  const liftRect = rect(0, 100, 32, 38);
  /** Lifted at `lift`, out to the right of the strip, then resting at `rest` well past the dwell: what shows there. */
  const restAt = (lift: Point, rest: Point, withRect: boolean): string | null => {
    const intent = createDragIntent<DragTarget>({ home: rect(0, 100, 400, 38), lift, ...(withRect ? { liftRect } : {}) });
    let t = 0;
    let shown: string | null = null;
    for (const p of [lift, { x: 300, y: lift.y }, { x: 300, y: rest.y }, rest]) {
      for (let k = 0; k < 8; k++) {
        t += 50;
        shown = intent.update(p, t, [strip, float]).shown?.id ?? null;
      }
    }
    return shown;
  };

  it("back in the strip 180 px below the grip it arms after the dwell; resting inside the rect it never arms", () => {
    expect(restAt({ x: 16, y: 120 }, { x: 16, y: 300 }, true)).toBe("rail:left:0");
    expect(restAt({ x: 16, y: 120 }, { x: 16, y: 120 }, true)).not.toBe("rail:left:0");
  });

  it("the rect replaces the radius: 10 px below the grip, outside the rect but inside 16 px of the lift, it arms", () => {
    expect(restAt({ x: 16, y: 135 }, { x: 16, y: 145 }, true)).toBe("rail:left:0");
    // Without the rect, the 16 px radius about the lift point holds as before.
    expect(restAt({ x: 16, y: 135 }, { x: 16, y: 145 }, false)).not.toBe("rail:left:0");
    expect(restAt({ x: 16, y: 120 }, { x: 16, y: 300 }, false)).toBe("rail:left:0");
  });
});

describe("drag/ frame.landing is what a release there lands on", () => {
  it("on every frame of sweeps across docks, a rail, the float and a refusal, both release modes, with and without Shift", () => {
    const refusal: DragTarget = { id: "refuse:x", priority: 2, hit: rect(250, 0, 60, 200), refuse: true };
    const roomy: DragTarget = { ...A, slot: rect(0, 0, 200, 100), opensRoom: true };
    const list = [roomy, B, RAIL, AREA, refusal];
    let frames = 0;
    for (const earlyRelease of ["target", "float"] as const)
      for (const shift of [false, true])
        for (const path of [[FROM, mid(A.hit), mid(B.hit), mid(RAIL.hit), { x: 280, y: 100 }, mid(AREA.hit)], [FROM, { x: 100, y: 150 }, { x: 100, y: 40 }, { x: 260, y: 20 }]]) {
          const intent = createDragIntent<DragTarget>({ home: HOME, earlyRelease, tuning: { modifiers: { ...DRAG_DEFAULTS.modifiers, on: true } } });
          const keys = through(path, 0.4);
          const keysHeld: DragKeys | undefined = shift ? { shift: true } : undefined;
          for (let t = 0; t <= keys.at(-1)![0] + 300; t += FRAME) {
            const p = along(keys, t);
            const f = intent.update(p, t, list, keysHeld);
            expect([t, f.landing?.id ?? null]).toEqual([t, intent.release(p, list, keysHeld)?.id ?? null]);
            frames++;
          }
        }
    expect(frames).toBeGreaterThan(500);
  });
});

describe("drag/ place guides: where it can go, or where it will land, never both", () => {
  const frames = (preview: Parameters<typeof previewPlan>[1]) => {
    const keys = hold(through([FROM, mid(A.hit)], 0.8), 600);
    const intent = createDragIntent({ home: HOME });
    const out: ReturnType<typeof previewPlan>[] = [];
    for (let t = 0; t <= keys.at(-1)![0] + 0.001; t += FRAME) out.push(previewPlan(intent.update(along(keys, t), t, DOCK), preview));
    return out;
  };

  it("a plan a host builds itself, with no guides, is still a plan, and its guides read as off", () => {
    const own: ReturnType<typeof previewPlan> = { showIndicator: true, makeRoom: false, snapItem: false };
    expect(own.guides ?? "off").toBe("off");
  });

  it("the object forms draw with their string plans: outline as indicator, placeholder as gap, snap as item", () => {
    const strip = ({ guides: _g, ...p }: ReturnType<typeof previewPlan>) => p;
    expect(frames({ mode: "outline" }).map(strip)).toEqual(frames("indicator").map(strip));
    expect(frames({ mode: "placeholder" }).map(strip)).toEqual(frames("gap").map(strip));
    expect(frames({ mode: "snap" }).map(strip)).toEqual(frames("item").map(strip));
  });

  it("defaults: snap and placeholder near, outline off; the string forms always off", () => {
    expect(PLACE_GUIDES_DEFAULT).toEqual({ outline: "off", placeholder: "near", snap: "near" });
    for (const s of ["indicator", "gap", "snap", "item"] as const) expect(frames(s).every((p) => p.guides === "off")).toBe(true);
    expect(frames({ mode: "snap" })[0]!.guides).toBe("near");
    expect(frames({ mode: "outline" })[0]!.guides).toBe("off");
    expect(frames({ mode: "outline", placeGuides: "all" })[0]!.guides).toBe("all");
  });

  it("in every mode, no frame asks for guides while a landing shows (an indicator, room or the item in its slot)", () => {
    for (const mode of ["outline", "placeholder", "snap"] as const)
      for (const placeGuides of ["near", "all"] as const) {
        const fs = frames({ mode, placeGuides });
        for (const p of fs) if (p.showIndicator || p.makeRoom || p.snapItem) expect([mode, p.guides]).toEqual([mode, "off"]);
        // Before the landing shows, they are asked for; once it shows, they go.
        expect(fs.some((p) => p.guides === placeGuides)).toBe(true);
        expect(fs.some((p) => p.guides === "off")).toBe(true);
      }
  });
});
