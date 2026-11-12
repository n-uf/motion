/**
 * The telemetry panes' plain text, one formatter for the server's first state (components/Telemetry.astro) and the island
 * (islands/telemetry.ts): fixed-width columns, so a changing number never moves a thing.
 */
import type { Rect } from "@n-uf/motion";
import type { RunReport } from "./hero";

export const pad = (v: number | string, n: number, d = 0): string => (typeof v === "number" ? v.toFixed(d) : String(v)).padStart(n);
export const FRAME_COLS = pad("f", 3) + pad("t ms", 9) + pad("x", 10) + pad("y", 9) + pad("w", 9) + pad("h", 8);
export const RECT_COLS = pad("item", 9) + pad("x", 7) + pad("y", 7) + pad("w", 7) + pad("h", 7);
/** How many frame rows the left pane shows. */
export const FRAME_ROWS = 9;
export const frameRow = (n: number, t: number, r: Rect): string => pad(n, 3) + pad(t, 9, 1) + pad(r.x, 10, 2) + pad(r.y, 9, 2) + pad(r.width, 9, 2) + pad(r.height, 8, 2);
export const rectRow = (name: string, r: Rect): string => pad(name, 9) + pad(r.x, 7) + pad(r.y, 7) + pad(r.width, 7) + pad(r.height, 7);

/** The three checks' verdicts as the pane's check line (each part a fixed width). */
export interface CheckLine {
  readonly text: string;
  readonly ok: boolean | null;
}
export function checkLine(r: RunReport | null): CheckLine[] {
  if (!r) return [{ text: "checkNoOvershoot", ok: null }, { text: "checkMonotonic", ok: null }, { text: "checkTempo", ok: null }];
  return [
    { text: "checkNoOvershoot", ok: r.checks.noOvershoot.ok },
    { text: "checkMonotonic", ok: r.checks.monotonic.ok },
    { text: `checkTempo ${r.t90 === null ? "–" : `90 % in ${Math.round(r.t90)} ms`}`, ok: r.checks.tempo.ok },
  ];
}
export const verdict = (ok: boolean | null): string => (ok === null ? "–" : ok ? "ok" : "FAIL");
