/**
 * The home hero's two instruments, as plain data the server renders and the island animates (islands/hero.ts):
 *
 * - **The scope** (motion's half): the settle curves at each tempo, a bouncy spring for contrast, and one real run of a
 *   panel's glide, recorded frame by frame and checked with `@n-uf/motion/testing`.
 * - **The plan** (placement's half): a window with a panel lifted out, its rects and its drop targets, from
 *   `@n-uf/docking` (`solve` and `targets`).
 *
 * Every number here comes out of the packages. The server runs them at build time for the first (finished) state, and
 * the island runs them again in the browser, live; the two states agree by construction.
 */
import { createFakeClock, createFrameLoop, createSettle, createSpring, SETTLE_TEMPO, type Rect } from "@n-uf/motion";
import { createLayoutMotion } from "@n-uf/motion/layout";
import { checkMonotonic, checkNoOvershoot, checkTempo, type CheckResult, type RectSample } from "@n-uf/motion/testing";
import { solve, targets, type DockDrop, type DockItem, type DockState } from "@n-uf/docking";

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
  const clock = createFakeClock({ frameInterval: 1000 / 60 });
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
/** The window the plan draws, in its own px: a `DockState` of this size, laid out by placement's `solve`. */
const STAGE = { width: 1060, height: 480 };
/** The lifted panel. */
const HELD = "outline";

/** Where a drop lands: the panel's rect after it, and what to call the place. */
interface PlanDrop {
  readonly slot: Rect;
  readonly label: string;
}
/** One of the three drops the plan offers: where the pointer lets go, and what placement says of it. */
interface PlanSlot {
  readonly id: string;
  /** What the plan calls it. */
  readonly name: string;
  readonly target: DockDrop;
  readonly drop: PlanDrop;
  /** The pointer's place for this drop, stage px. */
  readonly at: { x: number; y: number };
}
interface PlanRegion {
  readonly key: string;
  readonly label: string;
  readonly rect: Rect;
}
export interface Plan {
  readonly stage: { readonly width: number; readonly height: number };
  /** What the window draws (the side rails, the Files column, the documents), in stage px. */
  readonly regions: readonly PlanRegion[];
  readonly slots: readonly PlanSlot[];
  /** Every target placement offers for the lifted panel, for the drag intent. */
  readonly targets: readonly DockDrop[];
  readonly grab: { x: number; y: number };
  /** The drop at a pointer position on a target: where the panel lands. */
  drop(target: DockDrop, p: { x: number; y: number }): PlanDrop;
}

/**
 * A panel down a column (open, its title bar, its rail tile) and along the bottom dock (open, about two fifths of the
 * documents' height, or its title bar). `grows` takes the column's spare height.
 */
const panel = (id: string, used: number, natural: number, grows: boolean): DockItem => ({
  id,
  kind: "panel",
  used,
  forms: {
    column: [{ kind: "open", main: { min: 90, natural, grows }, cross: { natural: 240 } }, { kind: "header", main: { min: 28, natural: 28 }, cross: { natural: 240 } }, { kind: "rail", main: { min: 30, natural: 30 }, cross: { natural: 34 } }],
    row: [{ kind: "open", main: { min: 160, natural: 200, grows: true }, cross: { natural: 173 } }, { kind: "header", main: { min: 28, natural: 28 }, cross: { natural: 28 }, setsCross: true }],
  },
});

/** The toolbar's room over the documents: a fixed item holding the bar's height, which takes no drops. */
const TOOLBAR: DockItem = { id: "toolbar", kind: "toolbar", used: 0, fixed: true, forms: { row: [{ kind: "row", main: { min: 0, natural: 0 }, cross: { natural: 40 }, setsCross: true }] } };

/**
 * The window: Files in a left column, room for a toolbar over the documents, an empty dock along the bottom between
 * the sides, a rail at each side (in the inset at the window's edges), and Outline lifted out of it, floating over the
 * documents.
 */
function planState(size: { width: number; height: number }): DockState {
  const column = { accepts: ["panel"], cross: { min: 160, max: 480, rail: 34 } };
  return {
    stage: { x: 0, y: 0, ...size },
    inset: { top: 6, bottom: 6, left: 40, right: 40 },
    gutter: 6,
    edges: [
      { id: "left", side: "left", ring: 0, column: true, accepts: ["panel"], items: ["files"], cross: column.cross },
      { id: "toolbar", side: "top", ring: 0, span: "between", accepts: [], items: ["toolbar"], cross: { min: 40, max: 40 } },
      { id: "bottom", side: "bottom", ring: 0, span: "between", accepts: ["panel"], items: [], cross: { min: 120, max: 200 } },
    ],
    items: { files: panel("files", 1, 150, true), [HELD]: panel(HELD, 2, 120, false), toolbar: TOOLBAR },
    floats: [{ id: HELD, rect: { x: 714, y: 161, width: 200, height: 120 } }],
    floatKinds: ["panel"],
    columns: { left: column, right: column },
    rails: { left: { width: 34, accepts: ["panel"] }, right: { width: 34, accepts: ["panel"] } },
  };
}

/** What a target's place is called. */
function labelOf(t: DockDrop): string {
  const p = t.place;
  if (p.kind === "float") return "Float here";
  if (p.kind === "gap") return `${p.edge === "left" ? "Left column" : "Bottom dock"} · slot ${p.at + 1}`;
  if (p.kind === "column") return `New ${p.side} column`;
  if (p.kind === "rail") return `${p.side === "left" ? "Left" : "Right"} rail`;
  return "Back in its place";
}

/** Work out the plan with the real `solve` and `targets`: every drop's rect is the layout a release there makes. */
export function planOf(size = STAGE): Plan {
  const state = planState(size);
  const layout = solve(state);
  const all = targets(state, HELD);
  // The side rails are drawn where their drop targets are, so a drag over a drawn rail lands in it.
  const railOf = (side: "left" | "right"): Rect => all.find((t) => t.place.kind === "rail" && t.place.side === side)!.hit;
  const regions: PlanRegion[] = [
    { key: "rail:left", label: "", rect: railOf("left") },
    { key: "rail:right", label: "", rect: railOf("right") },
    { key: "files", label: "Files", rect: layout.items.files!.rect },
    { key: "documents", label: "Documents", rect: layout.content },
  ];
  const grab = { x: 100, y: 60 };
  const drop = (target: DockDrop, p: { x: number; y: number }): PlanDrop => ({ slot: target.after(p, grab).layout.items[HELD]!.rect, label: labelOf(target) });
  const pick = (id: string, name: string, at: (t: DockDrop) => { x: number; y: number }): PlanSlot => {
    const target = all.find((t) => t.id === id)!;
    const p = at(target);
    return { id, name, target, drop: drop(target, p), at: p };
  };
  const mid = (t: DockDrop): { x: number; y: number } => ({ x: t.hit.x + t.hit.width / 2, y: t.hit.y + t.hit.height / 2 });
  const slots = [
    pick("gap:left:start:0", "Dock left", mid),
    // The float target is the whole plane: let go over the documents, right of their middle and a little above it.
    pick(`float:${HELD}`, "Float here", () => ({ x: layout.content.x + layout.content.width * 0.72, y: layout.content.y + layout.content.height * 0.408 })),
    pick("strip:bottom:center", "Dock bottom", mid),
  ];
  return { stage: size, regions, slots, targets: all, grab, drop };
}
