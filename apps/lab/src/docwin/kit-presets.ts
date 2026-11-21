/**
 * Cases from UI kits' windows, checked on the DockState directly (this window has no declared rails): dynamic panel columns
 * on both sides, a 32 px rail each side, hand folds that ride, maybe a thumbnail anchor. Each reads `targets` and
 * `refusals` at the window's sides; the document window is left as it is.
 */
import { targetAt } from "@n-uf/motion/drag";
import type { DockEdge, DockState, DockItem } from "@n-uf/docking";
import { markUsed, moveTo, refusals, solve, stops, targets } from "@n-uf/docking";
import { defaultState } from "./model";

/** A case's verdict and the case itself, in the presets' shape (it needs no window). */
interface Verdict {
  readonly pass: boolean;
  readonly now: string;
}
interface Preset {
  readonly id: string;
  readonly title: string;
  readonly expected: string;
  setup(): void;
  check(): Verdict;
}

/** An inset window (12 px inset and gaps) or a flush one. */
type Shape = "inset" | "flush";

/** A kit-shaped window: Pages and Notes on the left, Findings alone on the right; with `anchor`, thumbnails at the far left. */
function kitWindow(shape: Shape, anchor: boolean, width = 1440): DockState {
  const inset = shape === "inset";
  const card = inset ? { min: 220, max: 640, natural: 300 } : { min: 200, max: 560, natural: 280 };
  const gap = inset ? 12 : 0;
  const items: Record<string, DockItem> = {};
  for (const [i, id] of ["pages", "notes", "findings"].entries())
    items[id] = {
      id,
      kind: "panel",
      used: i + 1,
      forms: {
        column: [
          { kind: "open", main: { min: 120, natural: 300, grows: true }, cross: { natural: card.natural, min: card.min } },
          { kind: "header", main: { min: 34, natural: 34 }, cross: { natural: card.natural, min: 32 } },
          { kind: "rail", main: { min: 36, natural: 36 }, cross: { natural: 32 } },
        ],
      },
      floatSizes: { column: { width: card.natural, height: 440 } },
    };
  const template = { accepts: ["panel"], cross: { min: card.min, max: card.max, rail: 32 }, gap };
  const edges: DockEdge[] = [
    { id: "left-0", side: "left", ring: anchor ? 1 : 0, column: true, items: ["pages", "notes"], ...template },
    { id: "right-0", side: "right", ring: 0, column: true, items: ["findings"], ...template },
  ];
  if (anchor) {
    edges.unshift({ id: "thumbs-edge", side: "left", ring: 0, accepts: [], items: ["thumbs"], cross: { min: 56, max: 200, rail: 32 }, outsideInset: true, giveWay: true });
    items.thumbs = { id: "thumbs", kind: "anchor", used: 0, fixed: true, forms: { column: [{ kind: "open", main: { min: 0, natural: 0, grows: true }, cross: { natural: 72, min: 56 }, setsCross: true }] } };
  }
  return {
    stage: { x: 0, y: 0, width, height: 900 },
    edges,
    items,
    floats: [],
    floatKinds: ["panel"],
    columns: { left: template, right: template },
    rails: { left: { width: 32, accepts: ["panel"] }, right: { width: 32, accepts: ["panel"] } },
    contentMin: { width: 320, height: 240 },
    handFold: "ride",
    inset: { top: gap, right: gap, bottom: gap, left: gap },
    ...(inset ? { insetWhen: "docked" as const } : {}),
    gutter: gap,
  };
}

/** What each x in `xs` picks at height `y` for a drag of `drag`, as runs: `id a..b`. */
function sweep(s: DockState, drag: string, y: number, xs: readonly number[]): { id: string; from: number; to: number }[] {
  const ts = targets(s, drag);
  const rs = refusals(s, drag);
  const runs: { id: string; from: number; to: number }[] = [];
  for (const x of xs) {
    const t = targetAt(ts, { x, y });
    const r = rs.find((q) => x >= q.hit.x && x < q.hit.x + q.hit.width && y >= q.hit.y && y < q.hit.y + q.hit.height);
    const id = t && !t.free ? t.id : r ? r.id : t ? t.id : "-";
    const last = runs[runs.length - 1];
    if (last && last.id === id) last.to = x;
    else runs.push({ id, from: x, to: x });
  }
  return runs;
}
const say = (runs: readonly { id: string; from: number; to: number }[]): string => runs.map((r) => `${r.id} ${r.from}..${r.to}`).join(", ");
const range = (a: number, b: number): number[] => Array.from({ length: b - a + 1 }, (_, i) => a + i);

/**
 * A case that sweeps x across `xs` at y 400 in both window shapes, for each item dragged, and wants every run's id to
 * pass `ok`.
 */
function sweepCase(id: string, title: string, expected: string, o: { anchor: boolean; drags: readonly string[]; xs: readonly number[]; ok: (id: string) => boolean }): Preset {
  return {
    id,
    title,
    expected,
    setup: () => undefined,
    check(): Verdict {
      const bad: string[] = [];
      const seen: string[] = [];
      for (const shape of ["flush", "inset"] as const)
        for (const drag of o.drags) {
          const runs = sweep(kitWindow(shape, o.anchor), drag, 400, o.xs);
          seen.push(`${shape} ${drag}: ${say(runs)}`);
          if (!runs.every((r) => o.ok(r.id))) bad.push(`${shape} ${drag}`);
        }
      return { pass: bad.length === 0, now: `${seen.join("; ")}.${bad.length ? ` Broken: ${bad.join(", ")}.` : ""}` };
    },
  };
}

/**
 * The title bar with a state cell and a page cell (fixed, at the end, `pushable` or not) and Zoom homed after them, "state
 * page zoom"; the window's controls are left out, so the cells are the end zone's whole fixed run.
 */
function stateBar(pushable: boolean): DockState {
  const s = defaultState();
  const cell = (id: string, width: number): DockItem => ({ id, kind: "chrome", used: 0, fixed: true, align: "end", ...(pushable ? { pushable: true } : {}), forms: { row: [{ kind: "row", main: { min: width, natural: width }, cross: { natural: 28 } }] } });
  const { controls: _controls, ...items } = s.items;
  return {
    ...s,
    edges: s.edges.map((e) => (e.id === "title" ? { ...e, items: ["title", "state", "page", "zoom"] } : e)),
    items: { ...items, state: cell("state", 72), page: cell("page", 48) },
  };
}

/**
 * Put back at the gap after the end-anchored cells: with Zoom moved out of the title bar, the places "Move to ›" offers
 * Zoom in the title bar's end zone include the one after State and Page when they are `pushable` (and not between them),
 * and moving there restores "state page zoom"; without the flag no place after them is offered.
 */
function pushableCase(): Preset {
  const tail = "gap:title:end:2";
  const between = "gap:title:end:1";
  const out = (s: DockState): DockState => markUsed(moveTo(s, "zoom", { kind: "gap", edge: "bottom", zone: "start", at: 0 }), "zoom");
  return {
    id: "kit-pushable-cells-put-back",
    title: "Put back after the title bar's state and page cells",
    expected:
      "In a title bar whose end zone holds a state cell and a page cell (fixed, declared `pushable`) with Zoom homed after them, Zoom moved to the bottom bar has the gap after the cells among its stops (not the gap between them), and \"Move to ›\" that gap puts the title bar back to \"state page zoom\": Zoom last, the cells pushed left by its width. Without `pushable` the cells keep the bar's end and no place after them is offered.",
    setup: () => undefined,
    check(): Verdict {
      const away = out(stateBar(true));
      const list = stops(away, "zoom");
      const ids = list.map((t) => t.id);
      const bad: string[] = [];
      const tailStop = list.find((t) => t.id === tail);
      if (!tailStop) bad.push(`${tail} is not a stop`);
      if (ids.includes(between)) bad.push(`${between} is a stop`);
      let said = `Zoom's title bar stops: ${ids.filter((i) => i.startsWith("gap:title:end")).join(", ")}`;
      if (tailStop) {
        const back = tailStop.after({ x: 0, y: 0 }, { x: 0, y: 0 }).state;
        const order = back.edges.find((e) => e.id === "title")!.items.join(" ");
        const l = solve(back);
        const x = (id: string): number => Math.round(l.items[id]!.rect.x);
        said += `; Put back: ${order} at x ${x("state")}, ${x("page")}, ${x("zoom")}`;
        if (order !== "title state page zoom" || !(x("state") < x("page") && x("page") < x("zoom"))) bad.push(`Put back gives ${order}`);
        if (Math.round(l.items.zoom!.rect.x + l.items.zoom!.rect.width) !== Math.round(l.edges.title!.rect.x + l.edges.title!.rect.width - 8)) bad.push("Zoom is not at the bar's end");
      }
      const plain = stops(out(stateBar(false)), "zoom").map((t) => t.id);
      said += `; without the flag: ${plain.filter((i) => i.startsWith("gap:title:end")).join(", ")}`;
      if (plain.includes(tail)) bad.push(`${tail} is a stop without the flag`);
      return { pass: bad.length === 0, now: `${said}.${bad.length ? ` Broken: ${bad.join("; ")}.` : ""}` };
    },
  };
}

/**
 * The window's first px is a conformance row now (P16 in `@n-uf/docking/testing`, with a drop at the outer 10 px
 * and over a column's own line), played on the reference host and on this window. Left here: the sweeps, which read
 * every px of a range.
 */
export function KIT_PRESETS(): Preset[] {
  return [
    pushableCase(),
    sweepCase(
      "kit-rail-stop-no-landing",
      "A rail that can't take the drop leaves the window's edge to the column line",
      "In a kit's window (flush, and inset by 12 px) with hand folds riding, Notes or Findings dragged to the left window edge: the left rail's stops can't land (the left column stays open, so a folded panel would ride over it), so the rail owns nothing there and the new-column line covers the outer 10 px. No point of x 0–9 floats or is refused.",
      { anchor: false, drags: ["notes", "findings"], xs: range(0, 9), ok: (id) => id === "column:left:0" },
    ),
    sweepCase(
      "kit-anchor-refuses-whole",
      "A thumbnail strip refuses a panel over all of it",
      "In a kit's window (flush, and inset by 12 px) with a 72 px thumbnail strip at the far left (an edge that takes nothing), Notes or Findings dragged over the strip: every point of x 0–59 says \"Can't go here\" (a refusal of the strip), none floats. A panel body is no drop place, but that cut never makes a hole in a refusal.",
      { anchor: true, drags: ["notes", "findings"], xs: range(0, 59), ok: (id) => id.startsWith("refuse:thumbs-edge:") },
    ),
    sweepCase(
      "kit-own-column-line-is-home",
      "A new column where the item's own column is, is home",
      "In a kit's window (flush, and inset by 12 px), Findings alone in the right column, dragged across the right side: a new column holding it alone where its column is now is the same move as home, so no new-column target shows beside it (no 1–2 px sliver between home and the rail). Every point from the column's left edge to the window's right edge is home, the rail or the float.",
      { anchor: false, drags: ["findings"], xs: range(1100, 1439), ok: (id) => /^(home:findings|rail:right:|float:)/.test(id) },
    ),
  ];
}
