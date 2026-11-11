/**
 * Window motion: the curves of each case (Hyprland's, a typical host app's, and the proposal's, which the library's
 * own settle steps), the case texts, and a chart as an SVG string. Pure, so the server renders the first chart and the
 * island every later frame.
 */
import { createSettle } from "@n-uf/motion";

// ---- Curve models (progress 0 -> 1) ---------------------------------------------------------------------------------
export type Series = [number, number][];
function springSeries(k: number, c: number, x0: number, v0: number, target: number, T: number, dt: number): Series {
  // A fine fixed step, one sample every dt ms.
  const out: Series = [];
  let x = x0, v = v0, t = 0;
  const hh = 0.0002;
  for (let ms = 0; ms <= T; ms += dt) {
    while (t < ms / 1000 - 1e-12) { const a = -k * (x - target) - c * v; v += a * hh; x += v * hh; t += hh; }
    out.push([ms, x]);
  }
  return out;
}
function bez(x1: number, y1: number, x2: number, y2: number): (p: number) => number {
  return (p) => {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    let lo = 0, hi = 1, t = 0.5;
    for (let i = 0; i < 50; i++) {
      t = (lo + hi) / 2;
      const x = 3 * (1 - t) ** 2 * t * x1 + 3 * (1 - t) * t * t * x2 + t ** 3;
      if (x < p) lo = t;
      else hi = t;
    }
    return 3 * (1 - t) ** 2 * t * y1 + 3 * (1 - t) * t * t * y2 + t ** 3;
  };
}
const series = (fn: (ms: number) => number, T: number, dt: number): Series => {
  const o: Series = [];
  for (let ms = 0; ms <= T; ms += dt) o.push([ms, fn(ms)]);
  return o;
};
/**
 * The proposal, stepped by the library itself: a settle at tempo `omega` from
 * `from` to `to`, optionally retargeted to `retarget.to` at `retarget.at` ms.
 */
export function settleSeries(omega: number, T: number, dt: number, from = 0, to = 1, retarget?: { at: number; to: number }): Series {
  const s = createSettle(from, { omega, restDelta: 1e-5 });
  s.setTarget(to);
  const out: Series = [[0, from]];
  let moved = false;
  for (let ms = dt; ms <= T; ms += dt) {
    if (retarget && !moved && retarget.at < ms) {
      // Retarget exactly at `at`: step up to it, launch from where it is drawn, step the rest of the frame.
      const before = retarget.at - (ms - dt);
      if (before > 0) s.step(before);
      s.setTarget(retarget.to);
      moved = true;
      s.step(ms - retarget.at);
    } else s.step(dt);
    out.push([ms, s.value]);
  }
  return out;
}
/** Value of a sampled series at time ms (linear between samples, held after the last one). */
export function at(data: Series, ms: number): number {
  const n = data.length;
  if (ms <= data[0]![0]) return data[0]![1];
  if (ms >= data[n - 1]![0]) return data[n - 1]![1];
  let i = 1;
  while (data[i]![0] < ms) i++;
  const a = data[i - 1]!, b = data[i]!;
  return a[1] + ((b[1] - a[1]) * (ms - a[0])) / (b[0] - a[0]);
}

export interface Line { name: string; color: string; dash?: string; w?: number; data: Series }
export interface ChartOpt {
  T: number; xstep: number; ymin: number; ymax: number; yticks: number[]; yfmt: (v: number) => string;
  marks?: { v: number; color: string; label: string }[]; vmarks?: { ms: number; label: string }[];
  lines: Line[]; points?: Line[];
}

// ---- Data for the three chart cases ---------------------------------------------------------------------------------
const dt = 3;
// 1 · settle
const T1 = 450;
export const settleOpt: ChartOpt = {
  T: T1, xstep: 50, ymin: 0, ymax: 1.06, yticks: [0, 0.25, 0.5, 0.75, 0.9, 1], yfmt: (v) => Math.round(v * 100) + "%",
  marks: [{ v: 1, color: "--line-3", label: "target" }],
  lines: [
    { name: "Hyprland shipped: spring easy (ratio 0.785)", color: "--series-a", dash: "6 4", data: springSeries(238.1191, 24.21279, 0, 0, 1, T1, dt) },
    { name: "Hyprland older: easeOutQuint 479 ms", color: "--series-a2", dash: "6 4", data: series((ms) => bez(0.23, 1, 0.32, 1)(ms / 479), T1, dt) },
    { name: "Host app rect spring 320, from rest", color: "--series-b", data: springSeries(320, 2 * Math.sqrt(320), 0, 0, 1, T1, dt) },
    { name: "Host app maximize/restore: snappy 220 ms (y2 1.05)", color: "--series-b2", data: series((ms) => bez(0.05, 0.9, 0.1, 1.05)(ms / 220), T1, dt) },
    { name: "Proposed settle ω=37 (recording)", color: "--series-c2", dash: "1 3", data: settleSeries(37, T1, dt) },
    { name: "Proposed settle ω=25 (default)", color: "--series-c", w: 3.2, data: settleSeries(25, T1, dt) },
    { name: "Proposed settle ω=20 (calm)", color: "--series-c2", dash: "6 4", data: settleSeries(20, T1, dt) },
  ],
  points: [{ name: "Recording: window open (measured)", color: "--series-a", data: [[0, 0], [15, 0.44], [45, 0.755], [65, 0.965], [85, 0.985], [180, 1]] }],
};

// 2 · drag: pointer accelerates, cruises, slows, release at 260 -> slot
const ptr = (ms: number): number => {
  if (ms <= 0) return 0;
  if (ms < 60) return 0.5 * 0.12 * ms * ms;
  return 216 + 7.2 * (Math.min(ms, 180) - 60) + (ms > 180 ? (Math.min(ms, 240) - 180) * 7.2 - 0.06 * (Math.min(ms, 240) - 180) ** 2 : 0);
};
const slot = ptr(240) + 70;
const Tdrag = 520, REL = 260;
const pointerLine = series((ms) => ptr(Math.min(ms, 240)), Tdrag, 2);
const relX = ptr(240);
// Held 1:1 until the release, then a settle from where it was let go into the slot.
const afterRelease = settleSeries(25, Tdrag - REL, 2, relX, slot);
const held = series((ms) => (ms <= REL ? ptr(Math.min(ms, 240)) : at(afterRelease, ms - REL)), Tdrag, 2);
const k1 = 1400, c1 = 2 * Math.sqrt(1400), k2 = 320, c2 = 2 * Math.sqrt(320);
const fol: Series = [];
{
  let x = 0, v = 0, t = 0;
  const hh = 0.0002;
  for (let ms = 0; ms <= Tdrag; ms += 2) {
    while (t < ms / 1000 - 1e-12) {
      const tm = t * 1000;
      const tgt = tm <= REL ? ptr(Math.min(tm, 240)) : slot;
      const k = tm <= REL ? k1 : k2, c = tm <= REL ? c1 : c2;
      const a = -k * (x - tgt) - c * v;
      v += a * hh; x += v * hh; t += hh;
    }
    fol.push([ms, x]);
  }
}
export const dragOpt: ChartOpt = {
  T: Tdrag, xstep: 50, ymin: 0, ymax: slot * 1.08, yticks: [0, slot], yfmt: (v) => (v === 0 ? "start" : "slot"),
  marks: [{ v: slot, color: "--line-3", label: "slot" }], vmarks: [{ ms: REL, label: "release" }],
  lines: [
    { name: "Pointer − grab offset", color: "--series-ink", dash: "1 3", w: 2.5, data: pointerLine.filter((p) => p[0] <= REL) },
    { name: "Host app own drag: localDrag 1400, then rect 320", color: "--series-b", data: fol },
    { name: "Hyprland / proposed: held 1:1, then settle ω=25", color: "--series-c", w: 3.2, data: held },
  ],
};

// 3 · retarget at 40 ms: A=0 -> B=1, then a nearer target at 0.8
const RT = 40, T3 = 450, NEW = 0.8, w25 = 25;
function unclamped(): Series {
  const o: Series = [];
  let x = 0, v = w25, t = 0, tgt = 1;
  const hh = 0.0002, k = w25 * w25, c = 2 * w25;
  for (let ms = 0; ms <= T3; ms += dt) {
    while (t < ms / 1000 - 1e-12) { if (t * 1000 >= RT) tgt = NEW; const a = -k * (x - tgt) - c * v; v += a * hh; x += v * hh; t += hh; }
    o.push([ms, x]);
  }
  return o;
}
const eoc = (p: number): number => 1 - (1 - Math.min(1, Math.max(0, p))) ** 3;
const atRT = eoc(RT / 250);
const tweenR = series((ms) => (ms < RT ? eoc(ms / 250) : atRT + (NEW - atRT) * eoc((ms - RT) / 250)), T3, dt);
function restRestart(): Series {
  const o: Series = [];
  let x = 0, v = 0, t = 0, tgt = 1, done = false;
  const hh = 0.0002, k = 320, c = 2 * Math.sqrt(320);
  for (let ms = 0; ms <= T3; ms += dt) {
    while (t < ms / 1000 - 1e-12) { if (!done && t * 1000 >= RT) { tgt = NEW; v = 0; done = true; } const a = -k * (x - tgt) - c * v; v += a * hh; x += v * hh; t += hh; }
    o.push([ms, x]);
  }
  return o;
}
export const retargetOpt: ChartOpt = {
  T: T3, xstep: 50, ymin: 0, ymax: 1.05, yticks: [0, 0.25, 0.5, NEW, 1], yfmt: (v) => (v === NEW ? "new" : v === 1 ? "old" : Math.round(v * 100) + "%"),
  marks: [{ v: NEW, color: "--line-3", label: "new target" }, { v: 1, color: "--line-3", label: "" }], vmarks: [{ ms: RT, label: "retarget" }],
  lines: [
    { name: "Tween restart (hypr-tiling CSS, host app tweens)", color: "--series-a2", dash: "6 4", data: tweenR },
    { name: "Host app docked / space change: restart from rest", color: "--series-b", data: restRestart() },
    { name: "Velocity kept, no clamp (crosses the new target)", color: "--series-b2", dash: "1 3", data: unclamped() },
    { name: "Proposed: velocity kept + clamp", color: "--series-c", w: 3.2, data: settleSeries(w25, T3, dt, 0, 1, { at: RT, to: NEW }) },
  ],
};


// ---- A chart as strings ---------------------------------------------------------------------------------------------
const V = (n: string): string => `var(${n})`;
const f1 = (v: number): string => v.toFixed(1);
export const LANE = 14;

/** The chart's frame for a given width: scales from ms and values to pixels. */
export function chartFrame(opt: ChartOpt, w: number) {
  const H = Math.max(240, Math.min(430, Math.round(w * 0.85)));
  const L = 44, R = 12, T = 14, B = 34;
  const span = opt.ymax - opt.ymin;
  return {
    H, L, R, T, B,
    X: (ms: number): number => L + ((w - L - R) * ms) / opt.T,
    Y: (v: number): number => T + (H - T - B) * (1 - (v - opt.ymin) / span),
  };
}
const clampY = (opt: ChartOpt, v: number): number => Math.max(opt.ymin, Math.min(opt.ymax, v));

/** The chart as an <svg> string, `w` px wide, with the playhead and one dot per curve at `ms`. */
export function chartSVG(opt: ChartOpt, w: number, label: string, ms = 0): string {
  const { H, L, R, T, B, X, Y } = chartFrame(opt, w);
  const o: string[] = [];
  const line = (a: Record<string, string | number>): string => `<line${Object.entries(a).map(([k, v]) => ` ${k}="${v}"`).join("")}/>`;
  const text = (a: Record<string, string | number>, t: string): string => `<text${Object.entries(a).map(([k, v]) => ` ${k}="${v}"`).join("")}>${t}</text>`;
  const xstep = w < 420 ? opt.xstep * 2 : opt.xstep;
  for (let t = 0; t <= opt.T; t += xstep) {
    o.push(line({ x1: f1(X(t)), x2: f1(X(t)), y1: T, y2: H - B, stroke: V("--line"), "shape-rendering": "crispEdges" }));
    o.push(text({ x: f1(X(t)), y: H - B + 17, "text-anchor": "middle", class: "axis" }, String(t)));
  }
  for (const v of opt.yticks) {
    o.push(line({ x1: L, x2: w - R, y1: f1(Y(v)), y2: f1(Y(v)), stroke: V("--line"), "shape-rendering": "crispEdges" }));
    o.push(text({ x: L - 8, y: f1(Y(v) + 4), "text-anchor": "end", class: "axis" }, opt.yfmt(v)));
  }
  o.push(line({ x1: L, x2: L, y1: T, y2: H - B, stroke: V("--line-3"), "shape-rendering": "crispEdges" }));
  o.push(line({ x1: L, x2: w - R, y1: H - B, y2: H - B, stroke: V("--line-3"), "shape-rendering": "crispEdges" }));
  o.push(text({ x: w - R, y: H - 3, "text-anchor": "end", class: "axis" }, "ms"));
  for (const m of opt.marks || []) {
    o.push(line({ x1: L, x2: w - R, y1: f1(Y(m.v)), y2: f1(Y(m.v)), stroke: V(m.color), "stroke-dasharray": "2 3" }));
    if (m.label) o.push(text({ x: w - R - 2, y: f1(Y(m.v) - 5), "text-anchor": "end", class: "axis small" }, m.label));
  }
  for (const m of opt.vmarks || []) {
    o.push(line({ x1: f1(X(m.ms)), x2: f1(X(m.ms)), y1: T, y2: H - B, stroke: V("--line-3"), "stroke-dasharray": "4 3" }));
    o.push(text({ x: f1(X(m.ms) + 5), y: T + 11, class: "axis small" }, m.label));
  }
  for (const s of opt.lines) {
    const d = s.data.map((p, i) => (i ? "L" : "M") + f1(X(p[0])) + " " + f1(Y(clampY(opt, p[1])))).join(" ");
    o.push(`<path d="${d}" fill="none" stroke="${V(s.color)}" stroke-width="${s.w || 1.75}"${s.dash ? ` stroke-dasharray="${s.dash}"` : ""} stroke-linejoin="round" stroke-linecap="round"/>`);
  }
  for (const p of opt.points || []) for (const q of p.data) o.push(`<circle cx="${f1(X(q[0]))}" cy="${f1(Y(q[1]))}" r="4" fill="${V(p.color)}" stroke="${V("--bg-raised")}" stroke-width="1.5"/>`);
  o.push(line({ class: "ph-head", x1: f1(X(ms)), x2: f1(X(ms)), y1: T, y2: H - B, stroke: V("--text"), "stroke-width": 1, opacity: 0.4 }));
  opt.lines.forEach((s) => {
    const last = s.data[s.data.length - 1]![0];
    o.push(`<circle class="ph-dot" cx="${f1(X(Math.min(ms, last)))}" cy="${f1(Y(clampY(opt, at(s.data, ms))))}" r="4" fill="${V(s.color)}" stroke="${V("--bg-raised")}" stroke-width="1.5"/>`);
  });
  return `<svg viewBox="0 0 ${w} ${H}" width="${w}" height="${H}" role="img" aria-label="${label}">${o.join("")}</svg>`;
}

/** The lanes beside a chart: one moving block per curve, placed at `ms`. */
export function lanesHTML(opt: ChartOpt, ms = 0): string {
  const span = opt.ymax - opt.ymin;
  const lane = (s: Line, isPoint: boolean): string => {
    const sw = "sw" + (isPoint ? " pt" : s.dash ? (s.dash.startsWith("1") ? " dot" : " dash") : "");
    const ticks = (opt.marks || []).map((m) => `<span class="tick" style="left:calc((100% - ${LANE}px) * ${(m.v - opt.ymin) / span} + ${LANE / 2}px)"></span>`).join("");
    const n = Math.max(0, Math.min(1, (at(s.data, ms) - opt.ymin) / span));
    return `<div class="lane" style="color:${V(s.color)}"><div class="lname"><span class="${sw}"></span><span>${s.name}</span></div><div class="track">${ticks}<span class="blk" style="left:calc((100% - ${LANE}px) * ${n})"></span></div></div>`;
  };
  return opt.lines.map((s) => lane(s, false)).join("") + (opt.points || []).map((s) => lane(s, true)).join("");
}

// ---- The cases --------------------------------------------------------------------------------------------------------
export type CaseKind = "settle" | "drag" | "retarget" | "frames";
export const CASES: { kind: CaseKind; name: string; note: string; desc: string; label: string }[] = [
  { kind: "settle", name: "Settle: one move from A to B", note: "Seven curves for one move; the proposed settle starts fast and cannot overshoot.", label: "Settle curves",
    desc: "Hyprland front-loads the move and never bounces. A host app's re-layout spring starts slowly, and its maximize/restore curve overshoots. The proposed settle starts fast like Hyprland, cannot overshoot, and has one tempo knob ω." },
  { kind: "drag", name: "Drag: pointer vs window, then drop", note: "Held 1:1, then a settle into the slot at 260 ms.", label: "Drag timeline",
    desc: "Held means held: the window is the pointer minus the grab offset in the same frame. The host app's own-drag spring (stiffness 1400) trails by about 50 ms. On release the window settles from where it was let go into its slot (drop at 260 ms)." },
  { kind: "retarget", name: "Retarget mid-flight", note: "A nearer target at 40 ms: who keeps the speed, who restarts.", label: "Retarget curves",
    desc: "A nearer target at 40 ms. The proposed settle carries on from the drawn rect with its speed, clamped so it can't overshoot the nearer target. A tween restart kinks the speed, and the host app's docked branch (and a space change) stops and restarts from rest." },
  { kind: "frames", name: "A window shrinking 220 → 140 px wide", note: "Stretch versus reveal, frames at 0, 30, 60 and 120 ms.", label: "Stretch and reveal frames",
    desc: "Frames at 0, 30, 60 and 120 ms after the change. Stretch (today, and Hyprland for ~40 ms): content is painted at the final size and scaled to the drawn box. Reveal (proposed): content is laid out at the final size and never scaled, and the frame's background band closes in." },
];
export const OPTS: Record<Exclude<CaseKind, "frames">, ChartOpt> = { settle: settleOpt, drag: dragOpt, retarget: retargetOpt };
