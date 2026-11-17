/**
 * The drag intent's timing, on the document window's own session (`@n-uf/motion/drag`'s intent and `previewPlan`, the
 * held item drawn by `@n-uf/motion`'s settle): when the drop indicator shows, how long it holds, what a release lands
 * on, and under the snap preview how the item settles into its slot and back onto the pointer. Each case drives a
 * pointer path frame by frame on the session's clock and reads the drag's trace (`DocwinScene.trace`).
 */
import { SETTLE_TEMPO } from "@n-uf/motion";
import { DRAG_DEFAULTS, inRect, targetAt, type DragPreview } from "@n-uf/motion/drag";
import type { Point, Rect } from "@n-uf/placement";
import type { SceneTarget } from "@n-uf/placement/scene";
import { defaultScene, type ItemId } from "./model";
import type { DocwinScene, DragTrace, LastDrop } from "./scene";

interface Verdict {
  readonly pass: boolean;
  readonly now: string;
}
interface IntentPreset {
  readonly id: string;
  readonly title: string;
  readonly expected: string;
  readonly group: "intent";
  setup(c: DocwinScene): void;
  check(c: DocwinScene): Verdict;
}

const FRAME = 1000 / 60;
/** A pointer path: [time ms, x, y] keys, in window px. */
type Key = readonly [number, number, number];

const mid = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
const sameRect = (a: Rect | null | undefined, b: Rect | null | undefined): boolean =>
  !!a && !!b && Math.abs(a.x - b.x) <= 0.5 && Math.abs(a.y - b.y) <= 0.5 && Math.abs(a.width - b.width) <= 0.5 && Math.abs(a.height - b.height) <= 0.5;
const fmt = (r: Rect): string => `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}×${Math.round(r.height)}`;

/** Keys along `points` at `speed` px/ms, one per frame, from `t0`. */
function through(points: readonly Point[], speed: number, t0 = 0): Key[] {
  const out: Key[] = [[t0, points[0]!.x, points[0]!.y]];
  let t = t0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const n = Math.max(1, Math.ceil(dist(a, b) / speed / FRAME));
    for (let k = 1; k <= n; k++) out.push([(t += dist(a, b) / speed / n), a.x + ((b.x - a.x) * k) / n, a.y + ((b.y - a.y) * k) / n]);
  }
  return out;
}
/** The path held still at its end for `ms`. */
const hold = (keys: Key[], ms: number): Key[] => [...keys, [keys.at(-1)![0] + ms, keys.at(-1)![1], keys.at(-1)![2]]];

/**
 * Drive `id` along the path `build` makes from its grip, a frame every 1/60 s of the session's clock, `at` run once the
 * clock passes its time, then let go. The drag's trace, the drop, and the path's last time.
 */
function drive(c: DocwinScene, id: ItemId, build: (grip: Point) => Key[], at: { t: () => number; run: () => void }[] = []): { trace: DragTrace; drop: LastDrop | null; atRelease: Rect | null } | null {
  const g = c.gripOf(id);
  if (!g) return null;
  const keys = build(g);
  const T0 = 10_000;
  c.drive(true);
  try {
    if (!c.begin(id, g, { x: g.x + 6, y: g.y }, T0)) return null;
    const end = keys.at(-1)![0];
    const pending = [...at];
    for (let t = 0, i = 0; t <= end + 0.001; t += FRAME) {
      while (i < keys.length - 1 && keys[i + 1]![0] <= t) i++;
      const a = keys[i]!;
      const b = keys[Math.min(i + 1, keys.length - 1)]!;
      const u = b[0] > a[0] ? Math.min(1, (t - a[0]) / (b[0] - a[0])) : 1;
      c.move({ x: a[1] + (b[1] - a[1]) * u, y: a[2] + (b[2] - a[2]) * u });
      for (const p of pending.filter((x) => x.t() <= t)) {
        pending.splice(pending.indexOf(p), 1);
        p.run();
      }
      c.frame(T0 + t);
    }
    const atRelease = c.trace?.frames.at(-1)?.item ?? null;
    c.release(T0 + end + FRAME);
    const trace = c.trace!;
    // The trace's times from the path's start, as the keys are.
    const rel = <E extends { t: number }>(xs: readonly E[]): E[] => xs.map((e) => ({ ...e, t: e.t - T0 }));
    return { trace: { log: rel(trace.log), snaps: rel(trace.snaps), frames: rel(trace.frames) }, drop: c.lastDrop, atRelease };
  } finally {
    c.drive(false);
  }
}

/** The shown targets in order: `id@t`. */
const sequence = (tr: DragTrace): string => tr.log.map((e) => `${e.id ?? "none"}@${Math.round(e.t)}`).join(" → ");
/** A target that showed for less than the switch hold (a flash), or null. */
function flash(tr: DragTrace): string | null {
  for (let i = 0; i < tr.log.length - 1; i++) {
    const e = tr.log[i]!;
    const shown = tr.log[i + 1]!.t - e.t;
    if (e.id !== null && shown < DRAG_DEFAULTS.switchHold - FRAME) return `${e.id} showed for ${Math.round(shown)} ms`;
  }
  return null;
}

/** The dragged item's docking targets with a slot, away from its own place (where home would win). */
function docking(c: DocwinScene, id: ItemId): SceneTarget[] {
  const all = c.targets(id);
  const homes = all.filter((t) => t.place.kind === "home").flatMap((t) => t.hits ?? [t.hit]);
  const near = (r: Rect): boolean => homes.some((h) => r.x < h.x + h.width + 24 && h.x - 24 < r.x + r.width && r.y < h.y + h.height + 24 && h.y - 24 < r.y + r.height);
  return all.filter((t) => t.place.kind === "gap" && !t.free && !!t.slot && !near(t.hit));
}

/** Two docking targets whose hits share a border (side by side or one above the other), and the border's middle. */
function adjacent(ts: readonly SceneTarget[]): { a: SceneTarget; b: SceneTarget; border: Point; across: "x" | "y" } | null {
  for (const a of ts)
    for (const b of ts) {
      if (a === b) continue;
      const overlapY = Math.min(a.hit.y + a.hit.height, b.hit.y + b.hit.height) - Math.max(a.hit.y, b.hit.y);
      const overlapX = Math.min(a.hit.x + a.hit.width, b.hit.x + b.hit.width) - Math.max(a.hit.x, b.hit.x);
      if (Math.abs(a.hit.x + a.hit.width - b.hit.x) < 1 && overlapY > 20) return { a, b, border: { x: b.hit.x, y: Math.max(a.hit.y, b.hit.y) + overlapY / 2 }, across: "x" };
      if (Math.abs(a.hit.y + a.hit.height - b.hit.y) < 1 && overlapX > 20) return { a, b, border: { x: Math.max(a.hit.x, b.hit.x) + overlapX / 2, y: b.hit.y }, across: "y" };
    }
  return null;
}

/** A point of the content that no docking target of `id` covers (only the float may). */
function emptySpace(c: DocwinScene, id: ItemId): Point {
  const ct = c.layout.content;
  const docked = docking(c, id);
  for (const fy of [0.33, 0.5, 0.66])
    for (const fx of [0.5, 0.4, 0.6]) {
      const p = { x: ct.x + ct.width * fx, y: ct.y + ct.height * fy };
      if (!docked.some((t) => inRect(t.hit, p, DRAG_DEFAULTS.band))) return p;
    }
  return mid(ct);
}

/** The item a case drags: a toolbar group over the bars' gaps, a panel into the columns. */
const GROUP: ItemId = "views";
const PANEL: ItemId = "notes";

function intentCase(id: string, title: string, expected: string, check: (c: DocwinScene) => Verdict, preview: DragPreview = "gap"): IntentPreset {
  return {
    id,
    title,
    expected,
    group: "intent",
    setup: (c) => {
      c.setScene(defaultScene());
      c.setDropPreview(preview);
    },
    check: (c) => {
      c.setDropPreview(preview);
      try {
        return check(c);
      } finally {
        c.setDropPreview("gap");
      }
    },
  };
}

/** Aim at a slot for 600 ms, then fly `speed` px/ms toward `to`: the indicator goes within a frame of the pointer being both fast and out of the slot's band. */
function flickCheck(c: DocwinScene, item: ItemId, a: SceneTarget, to: Point, speed: number): Verdict {
  const start = mid(a.hit);
  let flick = 0;
  const r = drive(c, item, (g) => {
    const there = hold(through([g, start], 0.8), 600);
    flick = there.at(-1)![0];
    return hold([...there, ...through([start, to], speed, flick).slice(1)], 300);
  });
  if (!r) return { pass: false, now: "The drag never lifted." };
  const before = r.trace.log.filter((e) => e.t <= flick).at(-1);
  const frames = r.trace.frames.filter((f) => f.t > flick);
  const fast = frames.find((f) => f.speed >= DRAG_DEFAULTS.aimSpeed)?.t;
  const out = frames.find((f) => !inRect(a.hit, f, DRAG_DEFAULTS.band))?.t;
  const off = r.trace.log.find((e) => e.t > flick && e.id !== a.id)?.t;
  const due = Math.max(fast ?? Infinity, out ?? Infinity);
  const ok = before?.id === a.id && off !== undefined && off <= due + FRAME + 1;
  return { pass: ok, now: `Aiming showed ${before?.id ?? "nothing"}; fast at +${Math.round((fast ?? NaN) - flick)} ms, out of the band at +${Math.round((out ?? NaN) - flick)}, off at +${Math.round((off ?? NaN) - flick)}: ${sequence(r.trace)}.` };
}

/** Whether the first snap came only once the indicator had shown its target for the room delay, else why not. */
function gated(tr: DragTrace): string | null {
  const snap = tr.snaps.find((e) => e.id !== null);
  if (!snap) return "the item never snapped";
  const showed = tr.log.filter((e) => e.id === snap.id && e.t <= snap.t).at(-1);
  if (!showed) return `the item snapped into ${snap.id} with no indicator on it`;
  return snap.t - showed.t >= DRAG_DEFAULTS.roomAfter - FRAME ? null : `the item snapped ${Math.round(snap.t - showed.t)} ms after the target showed, before the room was made`;
}

export function INTENT_PRESETS(): IntentPreset[] {
  return [
    intentCase(
      "intent-wobble",
      "A 14 px wobble on a border changes the indicator at most once",
      "Views held still on the border between two neighboring gaps, then wobbled 14 px across it every 60 ms: the indicator switches straight from one gap to the other at most once (the 150 ms switch delay), and never flashes.",
      (c) => {
        const pair = adjacent(docking(c, GROUP));
        if (!pair) return { pass: false, now: "No two gaps side by side." };
        const p = pair.border;
        let wobbleAt = 0;
        const r = drive(c, GROUP, (g) => {
          const keys = hold(through([g, p], 0.9), 400);
          let t = keys.at(-1)![0];
          wobbleAt = t;
          for (let i = 0; i < 20; i++) {
            t += 60;
            const d = i % 2 ? -14 : 14;
            keys.push(pair.across === "x" ? [t, p.x + d, p.y] : [t, p.x, p.y + d]);
          }
          return hold(keys, 400);
        });
        if (!r) return { pass: false, now: "The drag never lifted." };
        const log = r.trace.log;
        const changes = log.filter((e, i) => e.t > wobbleAt && e.id !== null && i > 0 && log[i - 1]!.id !== null && log[i - 1]!.id !== e.id).length;
        const f = flash(r.trace);
        return { pass: changes <= 1 && f === null, now: `${changes} switches in the wobble${f ? `; ${f}` : ""}: ${sequence(r.trace)}.` };
      },
    ),
    intentCase(
      "intent-release-in-band",
      "A release inside the shown slot's band lands on it",
      "Views aimed at a gap until it shows, then slid 6 px into the neighboring gap and let go at once: the drop lands on the shown gap, not on the neighbor under the pointer.",
      (c) => {
        const pair = adjacent(docking(c, GROUP));
        if (!pair) return { pass: false, now: "No two gaps side by side." };
        const { a, b } = pair;
        const aim = mid(a.hit);
        const into = pair.across === "x" ? { x: b.hit.x + 6, y: aim.y } : { x: aim.x, y: b.hit.y + 6 };
        const under = targetAt(c.targets(GROUP), into)?.id;
        if (under !== b.id) return { pass: false, now: `The release point is over ${under ?? "nothing"}, not ${b.id}.` };
        const r = drive(c, GROUP, (g) => {
          const there = hold(through([g, aim], 0.8), 500);
          return [...there, ...through([aim, into], 1.5, there.at(-1)![0]).slice(1)];
        });
        if (!r) return { pass: false, now: "The drag never lifted." };
        const ok = r.drop?.target === a.id;
        return { pass: ok, now: `Let go over ${under ?? "nothing"}; the indicator last showed ${r.trace.log.filter((e) => e.id).at(-1)?.id ?? "nothing"}; landed on ${r.drop?.target ?? "nothing"}.` };
      },
    ),
    intentCase(
      "intent-flick",
      "A flick from a slot into empty space hides the indicator within a frame",
      "Notes aimed at a column gap for 600 ms, then flicked at 2.5 px/ms into the pages: the indicator goes within a frame of the pointer being both fast and out of the gap's band, not kept for the gap grace.",
      (c) => {
        const a = docking(c, PANEL)[0];
        if (!a) return { pass: false, now: "No column gap for Notes." };
        return flickCheck(c, PANEL, a, emptySpace(c, PANEL), 2.5);
      },
    ),
    ...[2.5, 4].map((speed) =>
      intentCase(
        `intent-aim-flick-${speed}`,
        `Aim, then a ${speed} px/ms flick hides the indicator within a frame`,
        `Views aimed at a gap for 600 ms, then flicked 300 px at ${speed} px/ms through its neighbor: the indicator stays while its gap holds, and goes within a frame of the pointer being both fast and out of the band.`,
        (c) => {
          const pair = adjacent(docking(c, GROUP));
          if (!pair) return { pass: false, now: "No two gaps side by side." };
          const start = mid(pair.a.hit);
          const d = { x: mid(pair.b.hit).x - start.x, y: mid(pair.b.hit).y - start.y };
          const len = Math.hypot(d.x, d.y) || 1;
          return flickCheck(c, GROUP, pair.a, { x: start.x + (d.x / len) * 300, y: start.y + (d.y / len) * 300 }, speed);
        },
      ),
    ),
    intentCase(
      "intent-slow-diagonal",
      "A slow diagonal across a border shows no indicator for under 150 ms",
      "Views moved slowly (0.28 px/ms) on a diagonal across the border between two gaps: every indicator that shows stays at least the 150 ms switch delay; none flashes.",
      (c) => {
        const pair = adjacent(docking(c, GROUP));
        if (!pair) return { pass: false, now: "No two gaps side by side." };
        const p = pair.border;
        const from = pair.across === "x" ? { x: p.x - 63, y: p.y + 8 } : { x: p.x - 40, y: p.y - 30 };
        const to = pair.across === "x" ? { x: p.x + 107, y: p.y - 8 } : { x: p.x + 60, y: p.y + 30 };
        const r = drive(c, GROUP, (g) => {
          const there = hold(through([g, from], 0.8), 400);
          return hold([...there, ...through([from, to], 0.28, there.at(-1)![0]).slice(1)], 400);
        });
        if (!r) return { pass: false, now: "The drag never lifted." };
        const f = flash(r.trace);
        return { pass: f === null, now: `${f ?? "No flash"}: ${sequence(r.trace)}.` };
      },
    ),
    intentCase(
      "intent-snap-glide",
      "Snap: the item glides into the slot the intent shows",
      "With the snap preview, Notes aimed at a column gap: once the room is made (not before), the item settles into the slot, once; let go there, it lands exactly where it sat.",
      (c) => {
        const a = docking(c, PANEL)[0];
        if (!a) return { pass: false, now: "No column gap for Notes." };
        const r = drive(c, PANEL, (g) => hold(through([g, mid(a.hit)], 0.8), 600));
        if (!r) return { pass: false, now: "The drag never lifted." };
        const snaps = r.trace.snaps.filter((e) => e.id !== null);
        const why = gated(r.trace);
        const ok = why === null && snaps.length === 1 && r.drop?.target === a.id && sameRect(r.atRelease, r.drop.landed);
        return { pass: ok, now: `${why ?? "Snapped after the room"}; ${snaps.length} snaps; let go at ${r.atRelease ? fmt(r.atRelease) : "nowhere"}, landed on ${r.drop?.target ?? "nothing"} at ${r.drop?.landed ? fmt(r.drop.landed) : "nowhere"}.` };
      },
      "snap",
    ),
    intentCase(
      "intent-snap-resize",
      "Snap: a snapped item follows its slot when the window is resized under the drag",
      "With the snap preview, Notes snapped into a column gap, then the window resized mid-drag: the item follows the slot, and let go it lands exactly where it sat, on the same gap.",
      (c) => {
        const a = docking(c, PANEL)[0];
        if (!a) return { pass: false, now: "No column gap for Notes." };
        const size = c.scene.stage;
        let resizeAt = 0;
        const r = drive(
          c,
          PANEL,
          (g) => {
            const there = hold(through([g, mid(a.hit)], 0.8), 600);
            resizeAt = there.at(-1)![0];
            return hold(there, 700);
          },
          [{ t: () => resizeAt, run: () => c.setSize(size.width - 80, size.height - 40) }],
        );
        if (!r) return { pass: false, now: "The drag never lifted." };
        const ok = r.drop?.target === a.id && sameRect(r.atRelease, r.drop.landed) && c.scene.stage.width === size.width - 80;
        return { pass: ok, now: `Landed on ${r.drop?.target ?? "nothing"}; let go at ${r.atRelease ? fmt(r.atRelease) : "nowhere"}, its slot after the resize ${r.drop?.landed ? fmt(r.drop.landed) : "none"}.` };
      },
      "snap",
    ),
    intentCase(
      "intent-snap-fly-off",
      "Snap: flying off a snapped slot glides the item back to the pointer within the settle tempo",
      "With the snap preview, Notes snapped into a column gap, then flicked into the pages: it leaves the slot as the pointer flies, and once the pointer stops the way left closes as a settle does (within its 99 % time at most 1 % is left), ending under the pointer.",
      (c) => {
        const a = docking(c, PANEL)[0];
        if (!a) return { pass: false, now: "No column gap for Notes." };
        const empty = emptySpace(c, PANEL);
        let stop = 0;
        let grab: Point = { x: 0, y: 0 };
        const r = drive(c, PANEL, (g) => {
          const home = c.layout.items[PANEL]!.rect;
          grab = { x: g.x - home.x, y: g.y - home.y };
          const there = hold(through([g, mid(a.hit)], 0.8), 600);
          const flick = [...there, ...through([mid(a.hit), empty], 2.5, there.at(-1)![0]).slice(1)];
          stop = flick.at(-1)![0];
          return hold(flick, 500);
        });
        if (!r) return { pass: false, now: "The drag never lifted." };
        const off = r.trace.snaps.find((e) => e.id === null);
        const lifted = r.trace.frames[0]!;
        const gap = (f: DragTrace["frames"][number]): number =>
          Math.max(Math.abs(f.item.x - (f.x - grab.x)), Math.abs(f.item.y - (f.y - grab.y)), Math.abs(f.item.width - lifted.item.width), Math.abs(f.item.height - lifted.item.height));
        const tempo = (2 * Math.log(10) * 1000) / SETTLE_TEMPO.default;
        const atStop = r.trace.frames.find((f) => f.t >= stop);
        const later = r.trace.frames.find((f) => f.t >= stop + tempo + FRAME);
        const last = r.trace.frames.at(-1)!;
        const ok = gated(r.trace) === null && !!off?.flying && !!atStop && !!later && gap(later) <= 0.01 * gap(atStop) + 0.5 && gap(last) < 0.5;
        return { pass: ok, now: `${off?.flying ? "Left the slot flying" : "Never left the slot flying"}; ${atStop ? Math.round(gap(atStop)) : "?"} px from the pointer when it stopped, ${later ? gap(later).toFixed(1) : "?"} px ${Math.round(tempo)} ms later, ${gap(last).toFixed(1)} px at the end.` };
      },
      "snap",
    ),
  ];
}
