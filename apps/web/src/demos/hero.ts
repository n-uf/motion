/**
 * The home hero's two instruments, as plain data the server renders and the island animates (islands/hero.ts):
 *
 * - **The scope** (motion's half): the settle curves at each tempo, a bouncy spring for contrast, and one real run of a
 *   panel's glide, recorded frame by frame and checked with `@n-uf/motion/testing`.
 * - **The plan** (placement's half): a dock desk with a panel lifted out, its rects and its drop targets, from
 *   `@n-uf/placement/dock` and `/targets`.
 *
 * Every number here comes out of the packages. The server runs them at build time for the first (finished) state, and
 * the island runs them again in the browser, live; the two states agree by construction.
 */
import { createFakeClock, createFrameLoop, createSettle, createSpring, SETTLE_TEMPO, type Rect } from "@n-uf/motion";
import { createLayoutMotion } from "@n-uf/motion/layout";
import { checkMonotonic, checkNoOvershoot, checkTempo, type CheckResult, type RectSample } from "@n-uf/motion/testing";
import { DEFAULT_OPTIONS, createDesk, liftOut } from "@n-uf/placement/dock";
import { deskDrop, deskTargets, type DeskDrop, type DeskTarget, type DeskTargetInput } from "@n-uf/placement/targets";

export type Tempo = keyof typeof SETTLE_TEMPO;
export const TEMPOS = Object.keys(SETTLE_TEMPO) as Tempo[];
/** The dial's needle, in degrees, at each tempo's detent. */
export const NEEDLE: Record<Tempo, number> = { calm: -52, default: 0, quick: 52 };

// ---- The scope's plot ----------------------------------------------------------------------------------------------
/** The plot's box in its viewBox (290 × 176), and its time axis: 0 to 400 ms. */
export const PLOT = { x0: 30, w: 252, y0: 150, h: 115.4, tMax: 400, vbW: 290, vbH: 176 };
export const plotX = (ms: number): number => PLOT.x0 + (ms / PLOT.tMax) * PLOT.w;
export const plotY = (p: number): number => PLOT.y0 - p * PLOT.h;
const f1 = (n: number): string => n.toFixed(1);

/** A path through (ms, progress) samples. */
export function pathOf(points: readonly { ms: number; p: number }[]): string {
  return points.map((q, i) => `${i ? "L" : "M"}${f1(plotX(q.ms))} ${f1(plotY(Math.max(0, q.p)))}`).join("");
}

/** The settle's progress toward its target at `omega`, sampled every `step` ms by stepping a real `createSettle`. */
export function settleCurve(omega: number, tMax = PLOT.tMax, step = 4): { ms: number; p: number }[] {
  const s = createSettle(0, { omega });
  s.setTarget(1);
  const out = [{ ms: 0, p: 0 }];
  for (let ms = step; ms <= tMax; ms += step) {
    s.step(step);
    out.push({ ms, p: s.value });
  }
  return out;
}

/** A bouncy spring (damping ratio 0.35, as many UIs ship), for contrast: it passes its target and rings. */
export function springCurve(tMax = PLOT.tMax, step = 4): { ms: number; p: number }[] {
  const s = createSpring(0, { stiffness: 625, dampingRatio: 0.35 });
  s.setTarget(1);
  const out = [{ ms: 0, p: 0 }];
  for (let ms = step; ms <= tMax; ms += step) {
    s.step(step);
    out.push({ ms, p: s.value });
  }
  return out;
}

// ---- A recorded run ------------------------------------------------------------------------------------------------
/** What a run of a panel from `from` to `to` looked like frame by frame, and what the checks said of it. */
export interface RunReport {
  /** Progress toward the target by distance, 0 to 1, per frame: the live curve. */
  readonly curve: readonly { ms: number; p: number }[];
  /** Ms to 90 % of the way, interpolated between the frames that bracket it; null if it never got there. */
  readonly t90: number | null;
  /** The furthest any component went past its start-to-target range, px (0 when it never did). */
  readonly overshoot: number;
  readonly checks: { readonly noOvershoot: CheckResult; readonly monotonic: CheckResult; readonly tempo: CheckResult };
  /** Every check passed. */
  readonly ok: boolean;
}

const KEYS = ["x", "y", "width", "height"] as const;

/** Judge recorded frames (`samples`, the first one the start) of a move from `from` to `to` at `omega`. */
export function judge(samples: readonly RectSample[], from: Rect, to: Rect, omega: number): RunReport {
  const d0 = Math.hypot(to.x - from.x, to.y - from.y);
  const t0 = samples[0]?.t ?? 0;
  const curve = samples.map((s) => ({ ms: s.t - t0, p: d0 > 0 ? 1 - Math.hypot(to.x - s.rect.x, to.y - s.rect.y) / d0 : 1 }));
  let t90: number | null = null;
  for (let i = 1; i < curve.length && t90 === null; i++) {
    const a = curve[i - 1]!, b = curve[i]!;
    if (b.p >= 0.9) t90 = a.ms + ((0.9 - a.p) / (b.p - a.p || 1)) * (b.ms - a.ms);
  }
  let overshoot = 0;
  for (const s of samples) for (const k of KEYS) overshoot = Math.max(overshoot, s.rect[k] - Math.max(from[k], to[k]), Math.min(from[k], to[k]) - s.rect[k]);
  const expected = (Math.LN10 / omega) * 1000;
  const noOvershoot = checkNoOvershoot(samples, from, to);
  const monotonic = checkMonotonic(samples, to);
  // The tempo's own promise: 90 % in ln(10)/omega s, read off whole frames, so a frame's width either way.
  const tempo = d0 > 0 ? checkTempo(samples, from, to, expected, 0.3, t0) : { ok: true, failures: [] as string[], t90: null };
  return { curve, t90, overshoot: Math.max(0, overshoot), checks: { noOvershoot, monotonic, tempo }, ok: noOvershoot.ok && monotonic.ok && tempo.ok };
}

/**
 * One real run on a fake clock at 60 fps: a layout-motion item moves from `from` to `to` at `omega`, and every drawn
 * frame is recorded. The server's first state; the island records its live runs the same way (from the real frames).
 */
export function simulateRun(from: Rect, to: Rect, omega: number): { samples: RectSample[]; report: RunReport } {
  const clock = createFakeClock({ frameMs: 1000 / 60 });
  const loop = createFrameLoop({ clock });
  const motion = createLayoutMotion({ loop, omega });
  const item = motion.add("panel", { layOut: () => {}, draw: () => {} }, from);
  const samples: RectSample[] = [{ t: 0, rect: { ...item.drawn } }];
  let t = 0;
  motion.onFrame((frame) => {
    t += frame.delta;
    samples.push({ t, rect: { ...item.drawn } });
  });
  item.moveTo(to);
  clock.runUntilIdle();
  return { samples, report: judge(samples, from, to, omega) };
}

// ---- The plan ------------------------------------------------------------------------------------------------------
/** The desk the plan draws, in its own px: a stage of this size is laid out by placement's `dockTear` construction. */
export const STAGE = { width: 1060, height: 480 };
const PANEL_KEY = "panel:2";

/** One of the three drops the plan offers: where the pointer lets go, and what placement says of it. */
export interface PlanSlot {
  readonly id: string;
  /** What the plan calls it. */
  readonly name: string;
  readonly target: DeskTarget;
  readonly drop: DeskDrop;
  /** The pointer's place for this drop, stage px, and the grab (where the panel was held). */
  readonly at: { x: number; y: number };
}
export interface PlanRegion {
  readonly key: string;
  readonly label: string;
  readonly look: string;
  readonly rect: Rect;
}
export interface Plan {
  readonly stage: { readonly width: number; readonly height: number };
  /** The placed items of the desk (rails, the dock's section, the documents), in stage px. */
  readonly regions: readonly PlanRegion[];
  readonly slots: readonly PlanSlot[];
  /** Every target placement offers for the lifted panel, for the drag intent. */
  readonly targets: readonly DeskTarget[];
  readonly grab: { x: number; y: number };
  /** The drop at a pointer position on a target: where the panel lands. */
  drop(target: DeskTarget, p: { x: number; y: number }): DeskDrop;
}

/** Work out the plan with the real `createDesk`, `deskTargets` and `deskDrop`. */
export function planOf(size = STAGE): Plan {
  const desk = createDesk({
    panels: [{ id: 1, title: "Files", natural: 150 }, { id: 2, title: "Outline", natural: 120 }],
    start: { left: [1], right: [], bottom: [] },
  });
  const c = desk.constructionOf("dockTear");
  const input: DeskTargetInput = { c, s0: liftOut(c.initial([1]), PANEL_KEY), key: PANEL_KEY, size, opt: DEFAULT_OPTIONS };
  const layout = c.layout(input.s0, size, DEFAULT_OPTIONS);
  const titles: Record<string, string> = { "panel:1": "Files", "doc:1": "Documents", "rail:left": "", "rail:right": "" };
  const regions: PlanRegion[] = [];
  for (const [key, placed] of layout.items) {
    if (!(key in titles)) continue;
    regions.push({ key, label: titles[key]!, look: placed.look, rect: placed.rect });
  }
  const targets = deskTargets(input);
  const grab = { x: 100, y: 60 };
  const pick = (id: string, name: string, x: (t: DeskTarget) => number, y: (t: DeskTarget) => number): PlanSlot => {
    const target = targets.find((t) => t.id === id)!;
    const at = { x: x(target), y: y(target) };
    return { id, name, target, drop: deskDrop(input, target, at, grab), at };
  };
  const mid = (t: DeskTarget): { x: number; y: number } => ({ x: t.hit.x + t.hit.width / 2, y: t.hit.y + t.hit.height / 2 });
  const slots = [
    pick("dock:left:0", "Dock left", (t) => mid(t).x, (t) => mid(t).y),
    // The float target is the whole document area: let go over its right-hand middle.
    pick("float", "Float here", (t) => t.hit.x + t.hit.width * 0.72, (t) => t.hit.y + t.hit.height * 0.46),
    pick("bottom:0", "Dock bottom", (t) => mid(t).x, (t) => mid(t).y),
  ];
  return { stage: size, regions, slots, targets, grab, drop: (target, p) => deskDrop(input, target, p, grab) };
}
