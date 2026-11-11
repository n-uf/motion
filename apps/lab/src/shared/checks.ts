/**
 * The frame-sampled checks both lab pages run on every move ("episode": from the first change while idle until
 * everything rests), the checks table and the distance-to-target trace.
 */
import type { Rect } from "@n-uf/motion";
import {
  checkContentScale,
  checkHeld,
  checkMonotonic,
  checkNoJumps,
  checkNoOvershoot,
  checkTempo,
  type CheckResult,
  type HeldSample,
  type RectSample,
  type ScaleSample,
  type TargetSample,
} from "@n-uf/motion/testing";

/** One move of one window: from where it was drawn to its target, with every frame drawn since. */
export interface Segment {
  readonly id: number;
  readonly t0: number;
  readonly from: Rect;
  readonly to: Rect;
  readonly samples: RectSample[];
}

/** One rule's verdict: null when the move didn't exercise it. */
export interface Row {
  readonly name: string;
  readonly result: CheckResult | null;
  readonly info?: string;
}

/** What an episode recorded, frame by frame. */
export interface EpisodeRecord {
  readonly segments: readonly Segment[];
  readonly runs: readonly (readonly TargetSample[])[];
  readonly scale: readonly ScaleSample[];
  readonly held: readonly HeldSample[];
  /** Per frame of the raised window: null when nothing covered it, else what did. */
  readonly onTop: readonly (string | null)[];
  /** Per frame while a slot is previewed: null when no settled neighbour is in it, else which is. */
  readonly room: readonly (string | null)[];
}

export function merge(results: readonly CheckResult[]): CheckResult {
  const failures = results.flatMap((r) => r.failures);
  return { ok: failures.length === 0, failures };
}

/** A per-frame verdict list (null: fine) as a check result. */
export function framesResult(frames: readonly (string | null)[]): CheckResult {
  const failures = frames.filter((x): x is string => x !== null);
  return { ok: failures.length === 0, failures };
}

/** A rule checked by hand: ok with no failures. */
export const verdict = (failures: readonly string[]): CheckResult => ({ ok: failures.length === 0, failures });

const KEYS = ["x", "y", "width", "height"] as const;

/** The motion rules over one episode; `name` labels a window's failures ("window 3"). */
export function motionRows(ep: EpisodeRecord, omega: number, name: (id: number) => string = (id) => `window ${id}`): { rows: Row[]; segments: Segment[] } {
  const segs = ep.segments.filter((s) => s.samples.length > 0);
  const label = (s: Segment, r: CheckResult): CheckResult => ({ ok: r.ok, failures: r.failures.map((f) => `${name(s.id)}: ${f}`) });
  let longest: Segment | null = null;
  let longestSpan = 0;
  // The longest move that wasn't interrupted: it ends on its own target.
  const finished = segs.filter((s) => {
    const last = s.samples.at(-1)!.rect;
    return KEYS.every((k) => Math.abs(last[k] - s.to[k]) < 0.5);
  });
  for (const s of finished) {
    const span = Math.max(...KEYS.map((k) => Math.abs(s.to[k] - s.from[k])));
    if (span > longestSpan) {
      longestSpan = span;
      longest = s;
    }
  }
  // Tempo: the proposed settle's 90 % time at the chosen tempo, on the longest move that finished.
  const t90 = (Math.log(10) / omega) * 1000;
  const tempo = longest ? checkTempo(longest.samples, longest.from, longest.to, t90, 0.25, longest.t0) : null;
  const tempoInfo = tempo?.t90 != null ? `90 % after ${Math.round(tempo.t90)} ms (${name(longest!.id)}, ${Math.round(longestSpan)} px; expected ${Math.round(t90)} ms)` : "";
  const rows: Row[] = [
    { name: "Something moved", result: { ok: segs.length > 0, failures: segs.length > 0 ? [] : ["no move was recorded"] } },
    { name: "No overshoot (position and size)", result: merge(segs.map((s) => label(s, checkNoOvershoot(s.samples, s.from, s.to)))) },
    { name: "Settles from one side (monotonic)", result: merge(segs.map((s) => label(s, checkMonotonic(s.samples, s.to)))) },
    { name: "No jumps or restarts", result: merge(ep.runs.map((run) => checkNoJumps(run, omega))) },
    { name: "Content never stretched", result: checkContentScale(ep.scale) },
    { name: "Held 1:1 under the pointer", result: ep.held.length > 0 ? checkHeld(ep.held) : null },
    { name: "Dragged window stays on top", result: ep.onTop.length > 0 ? framesResult(ep.onTop) : null },
    { name: "Others make room in the previewed slot", result: ep.room.length > 0 ? framesResult(ep.room) : null },
    { name: "Tempo of the longest move", result: tempo, info: tempoInfo },
  ];
  return { rows, segments: segs };
}

export function renderChecks(body: HTMLTableSectionElement, rows: readonly Row[]): void {
  body.replaceChildren(
    ...rows.map((row) => {
      const tr = document.createElement("tr");
      const verdict = row.result === null ? "not exercised" : row.result.ok ? "pass" : `fail (${row.result.failures.length})`;
      const status = row.info ? `${verdict} · ${row.info}` : verdict;
      const cls = row.result === null ? "" : row.result.ok ? "ok" : "bad";
      tr.innerHTML = `<td></td><td class="${cls}"></td><td></td>`;
      tr.children[0]!.textContent = row.name;
      tr.children[1]!.textContent = status;
      tr.children[2]!.textContent = row.result?.failures[0] ?? "";
      return tr;
    }),
  );
}

/** Distance to target over time, one line per moving window (signed: a component past its target dips below 0). */
export function renderTrace(trace: HTMLCanvasElement, t0: number, segs: readonly Segment[]): void {
  const ctx = trace.getContext("2d");
  if (!ctx) return;
  const W = trace.width;
  const H = trace.height;
  ctx.clearRect(0, 0, W, H);
  const ink = getComputedStyle(document.body).color;
  const end = Math.max(300, ...segs.map((s) => (s.samples.at(-1)?.t ?? t0) - t0));
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.25;
  ctx.beginPath();
  ctx.moveTo(30, 10);
  ctx.lineTo(30, H - 20);
  ctx.lineTo(W - 10, H - 20);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = ink;
  ctx.font = "11px system-ui";
  ctx.fillText("100 %", 0, 14);
  ctx.fillText("0", 18, H - 22);
  ctx.fillText(`${Math.round(end)} ms`, W - 60, H - 6);
  const colours = ["#4c6ef5", "#e8590c", "#2b8a3e", "#ae3ec9", "#1098ad", "#f08c00"];
  const X = (t: number): number => 30 + ((W - 40) * (t - t0)) / end;
  const Y = (f: number): number => H - 20 - (H - 30) * f;
  for (const s of segs) {
    const span = Math.max(...KEYS.map((k) => Math.abs(s.to[k] - s.from[k])));
    if (span < 0.5) continue;
    ctx.strokeStyle = colours[s.id % colours.length]!;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(X(s.t0), Y(1));
    for (const x of s.samples) {
      const k = KEYS.reduce((a, b) => (Math.abs(s.to[b] - s.from[b]) > Math.abs(s.to[a] - s.from[a]) ? b : a));
      ctx.lineTo(X(x.t), Y((x.rect[k] - s.to[k]) / (s.from[k] - s.to[k])));
    }
    ctx.stroke();
  }
}
