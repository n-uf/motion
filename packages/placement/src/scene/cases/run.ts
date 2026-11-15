/**
 * `runCase(row, host)`: plays a row's gestures on a host and compares what the host draws with what the row expects.
 * It reads the layout after every gesture that has a checkpoint, the DOM after every gesture that has a DOM check, and
 * both at the end. Failures are lines of words with the row's expectation first; nothing throws.
 */
import type { Rect } from "../../geometry";
import type { SceneLayout, SceneNote } from "../index";
import type { CaseHost, CaseResult, CaseRow, DomCheck, DomRoot, EdgeExpect, Gesture, ItemExpect, LayoutExpect, StoredExpect } from "./types";

const DEFAULT_TOLERANCE = 0.5;
const KEYS: (keyof Rect)[] = ["x", "y", "width", "height"];

const px = (n: number): string => String(Math.round(n * 100) / 100);
const say = (r: Rect): string => `${px(r.x)},${px(r.y)} ${px(r.width)}x${px(r.height)}`;

function rectIssues(what: string, want: Partial<Rect>, got: Rect, tol: number): string[] {
  const out: string[] = [];
  for (const k of KEYS) {
    const w = want[k];
    if (w !== undefined && !(Math.abs(got[k] - w) <= tol)) out.push(`${what} ${k} is ${px(got[k])}, expected ${px(w)} (${say(got)})`);
  }
  return out;
}

/** The ids docked in an edge (not in its menu), in order along it. */
function dockedIn(l: SceneLayout, edge: string): string[] {
  const e = l.edges[edge];
  const column = e?.side === "left" || e?.side === "right";
  return Object.entries(l.items)
    .filter(([, it]) => it.edge === edge && !it.inMenu && !it.rides && it.rail === undefined)
    .sort((a, b) => (column ? a[1].rect.y - b[1].rect.y : a[1].rect.x - b[1].rect.x))
    .map(([id]) => id);
}

/** Each side's open dynamic columns, outer first, with their members in order (a folded or riding column is no column). */
function columnsOf(l: SceneLayout, side: "left" | "right"): string[][] {
  return Object.entries(l.edges)
    .filter(([, e]) => e.side === side && !e.folded && !e.rides && e.cross > 0)
    .sort((a, b) => a[1].ring - b[1].ring)
    .map(([id]) => dockedIn(l, id))
    .filter((ids) => ids.length > 0);
}

function itemIssues(id: string, want: ItemExpect | null, l: SceneLayout, tol: number): string[] {
  const got = l.items[id];
  if (want === null) return got ? [`${id} is drawn (${say(got.rect)}), expected it out of the layout`] : [];
  if (!got) return [`${id} is not in the layout`];
  const out: string[] = [];
  if (want.rect) out.push(...rectIssues(id, want.rect, got.rect, tol));
  if (want.formKind !== undefined && got.formKind !== want.formKind) out.push(`${id} is ${got.formKind}, expected ${want.formKind}`);
  if (want.form !== undefined && got.form !== want.form) out.push(`${id} is form ${got.form}, expected ${want.form}`);
  if (want.edge !== undefined && (got.edge ?? null) !== want.edge) out.push(`${id} is docked in ${got.edge ?? "no edge"}, expected ${want.edge ?? "no edge"}`);
  if (want.zone !== undefined && got.zone !== want.zone) out.push(`${id} is in the ${got.zone ?? "no"} zone, expected ${want.zone}`);
  if (want.floating !== undefined && (got.floating === true) !== want.floating) out.push(`${id} is ${got.floating ? "floating" : "not floating"}, expected ${want.floating ? "floating" : "not floating"}`);
  if (want.inMenu !== undefined && (got.inMenu === true) !== want.inMenu) out.push(`${id} is ${got.inMenu ? "in the menu" : "not in the menu"}, expected ${want.inMenu ? "in the menu" : "not in the menu"}`);
  if (want.rail !== undefined && (got.rail ?? null) !== want.rail) out.push(`${id} is in ${got.rail ?? "no"} rail, expected ${want.rail ?? "no"} rail`);
  if (want.folded !== undefined && (got.folded ?? null) !== want.folded) out.push(`${id} is folded ${got.folded ?? "not"}, expected ${want.folded ?? "not"}`);
  if (want.rides !== undefined && (got.rides ?? null) !== want.rides) out.push(`${id} rides ${got.rides ?? "nothing"}, expected ${want.rides ?? "nothing"}`);
  if (want.tab !== undefined && (got.tab === true) !== want.tab) out.push(`${id} is ${got.tab ? "a tab" : "not a tab"}, expected ${want.tab ? "a tab" : "not a tab"}`);
  return out;
}

function edgeIssues(id: string, want: EdgeExpect | null, l: SceneLayout, tol: number): string[] {
  const got = l.edges[id];
  if (want === null) return got ? [`edge ${id} is in the layout, expected none`] : [];
  if (!got) return [`edge ${id} is not in the layout`];
  const out: string[] = [];
  if (want.rect) out.push(...rectIssues(`edge ${id}`, want.rect, got.rect, tol));
  if (want.cross !== undefined && !(Math.abs(got.cross - want.cross) <= tol)) out.push(`edge ${id} is ${px(got.cross)} across, expected ${px(want.cross)}`);
  if (want.tabs && got.tabs.join() !== want.tabs.join()) out.push(`edge ${id} tabs are [${got.tabs.join(", ")}], expected [${want.tabs.join(", ")}]`);
  if (want.menu !== undefined) {
    const have = got.menu ? got.menu.items : null;
    if ((have ? have.join() : null) !== (want.menu ? want.menu.join() : null)) out.push(`edge ${id} menu is ${have ? `[${have.join(", ")}]` : "none"}, expected ${want.menu ? `[${want.menu.join(", ")}]` : "none"}`);
  }
  return out;
}

const codes = (notes: readonly SceneNote[]): string[] => [...new Set(notes.map((n) => n.code))];

/** The ways `layout` differs from `want`, as lines. Empty: it matches. */
export function layoutIssues(want: LayoutExpect, layout: SceneLayout): string[] {
  const tol = want.tolerance ?? DEFAULT_TOLERANCE;
  const out: string[] = [];
  for (const [id, w] of Object.entries(want.items ?? {})) out.push(...itemIssues(id, w, layout, tol));
  for (const [id, w] of Object.entries(want.edges ?? {})) out.push(...edgeIssues(id, w, layout, tol));
  if (want.content) out.push(...rectIssues("content", want.content, layout.content, tol));
  if (want.contentAtLeast) {
    const { width, height } = want.contentAtLeast;
    if (width !== undefined && layout.content.width < width - tol) out.push(`content is ${px(layout.content.width)} wide, expected at least ${px(width)}`);
    if (height !== undefined && layout.content.height < height - tol) out.push(`content is ${px(layout.content.height)} tall, expected at least ${px(height)}`);
  }
  for (const [edge, ids] of Object.entries(want.order ?? {})) {
    const have = dockedIn(layout, edge);
    if (have.join() !== ids.join()) out.push(`${edge} holds [${have.join(", ")}], expected [${ids.join(", ")}]`);
  }
  for (const side of ["left", "right"] as const) {
    const w = want.columns?.[side];
    if (w) {
      const have = columnsOf(layout, side);
      if (JSON.stringify(have) !== JSON.stringify(w)) out.push(`${side} columns are ${JSON.stringify(have)}, expected ${JSON.stringify(w)}`);
    }
    const r = want.rails?.[side];
    if (r) {
      const have = (layout.rails[side]?.segments ?? []).map((s) => s.id);
      if (have.join() !== r.join()) out.push(`${side} rail holds [${have.join(", ")}], expected [${r.join(", ")}]`);
    }
  }
  if (want.floats && layout.floats.join() !== want.floats.join()) out.push(`floats are [${layout.floats.join(", ")}], expected [${want.floats.join(", ")}]`);
  if (want.notes) {
    const have = codes(layout.notes);
    for (const c of want.notes.has ?? []) if (!have.includes(c)) out.push(`no ${c} note (notes: ${have.join(", ") || "none"})`);
    for (const c of want.notes.hasNot ?? []) if (have.includes(c)) out.push(`unexpected ${c} note`);
    if (want.notes.none && have.length > 0) out.push(`unexpected notes: ${have.join(", ")}`);
  }
  return out;
}

const labelOf = (c: DomCheck): string => c.note ?? (c.select ? `${c.select}${c.attr ? ` ${JSON.stringify(c.attr)}` : ""}` : `root ${JSON.stringify(c.attr ?? {})}`);

/** The ways the DOM under `root` differs from `check`, as lines. */
function domIssues(check: DomCheck, root: DomRoot): string[] {
  const out: string[] = [];
  const els: DomRoot[] = check.select ? Array.from(root.querySelectorAll(check.select)) : [root];
  const n = els.length;
  if (check.select !== undefined || check.count !== undefined) {
    const c = check.count;
    if (typeof c === "number") {
      if (n !== c) out.push(`${n} elements match ${check.select ?? "the root"}, expected ${c}`);
    } else if (c) {
      if (c.min !== undefined && n < c.min) out.push(`${n} elements match ${check.select ?? "the root"}, expected at least ${c.min}`);
      if (c.max !== undefined && n > c.max) out.push(`${n} elements match ${check.select ?? "the root"}, expected at most ${c.max}`);
    } else if (n === 0) out.push(`nothing matches ${check.select}`);
  }
  if (check.rect) {
    const tol = check.tolerance ?? DEFAULT_TOLERANCE;
    const origin = root.getBoundingClientRect?.();
    for (const el of els) {
      const box = el.getBoundingClientRect?.();
      if (!box || !origin) {
        out.push(`${check.select ?? "the root"} has no bounding rect to read`);
        continue;
      }
      const got: Rect = { x: box.left - origin.left, y: box.top - origin.top, width: box.width, height: box.height };
      out.push(...rectIssues(check.select ?? "the root", check.rect, got, tol));
    }
  }
  for (const [name, want] of Object.entries(check.attr ?? {})) {
    for (const el of els) {
      const got = el.getAttribute(name);
      if (want === null ? got !== null : got !== want) out.push(`${check.select ?? "the root"} has ${name}=${got === null ? "(none)" : `"${got}"`}, expected ${want === null ? "none" : `"${want}"`}`);
    }
  }
  return out;
}

/** The ways a stored form differs from `want`, as lines. */
function storedIssues(want: StoredExpect, stored: unknown): string[] {
  const out: string[] = [];
  const data = stored as { items?: Record<string, Record<string, unknown>> } | null;
  for (const [id, fields] of Object.entries(want.items ?? {})) {
    const have = data?.items && Object.hasOwn(data.items, id) ? data.items[id] : undefined;
    if (!have) {
      out.push(`the stored form has no item ${id}`);
      continue;
    }
    for (const [k, v] of Object.entries(fields)) {
      const got = Object.hasOwn(have, k) ? have[k] : null;
      if (got !== v) out.push(`stored ${id}.${k} is ${JSON.stringify(got)}, expected ${JSON.stringify(v)}`);
    }
  }
  const json = JSON.stringify(stored);
  for (const s of want.absent ?? []) if (json.includes(s)) out.push(`the stored form contains "${s}"`);
  return out;
}

const placeKey = (p: unknown): string =>
  JSON.stringify(p, (_k, v: unknown) => (typeof v === "number" && !Number.isFinite(v) ? "Infinity" : v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v));

const gestureWords = (g: Gesture, i: number): string => {
  const bits = [g.item, g.place ? JSON.stringify(g.place) : undefined, g.point ? `${px(g.point.x)},${px(g.point.y)}` : undefined, g.key, g.edge, g.size !== undefined ? String(g.size) : undefined].filter((x) => x !== undefined);
  return `gesture ${i + 1} (${g.type}${bits.length ? ` ${bits.join(" ")}` : ""})`;
};

/**
 * Plays `row` on `host`: loads its scene at its settings, performs its gestures in order, and checks. A gesture the host
 * can't do is a failure and ends the run (what follows would be about another state), and so is a layout the host can't
 * give or a check pointing at a gesture the row doesn't have. With no `host.root` the DOM checks are skipped, with no
 * `host.stored` the stored checks and with no `host.stops` the stops check; each is listed in `skipped`.
 */
export function runCase(row: CaseRow, host: CaseHost): CaseResult {
  const failures: string[] = [];
  const skipped: string[] = [];
  const n = row.gestures.length;
  const last = n - 1;
  const fail = (lines: string[], when: string): void => {
    for (const l of lines) failures.push(`${row.id}${when}: ${l}`);
  };
  // A check at an index the row doesn't have would never run: that is a bad row, not a pass.
  const range = (what: string, at: number | undefined): void => {
    if (at === undefined) return;
    if (!Number.isInteger(at) || at < 0 || at >= n) fail([`${what} is at gesture ${at}, but the row has ${n} gestures (0 to ${last})`], "");
  };
  for (const cp of row.checkpoints ?? []) range("a checkpoint", cp.at);
  for (const c of row.expectDom ?? []) range(`the DOM check ${labelOf(c)}`, c.at);
  range("the stops check", row.expectStops?.at);
  if (failures.length > 0) return { ok: false, failures, skipped };

  const layoutOf = (when: string): SceneLayout | null => {
    try {
      return host.layout();
    } catch (e) {
      fail([`the host couldn't give its layout: ${e instanceof Error ? e.message : String(e)}`], when);
      return null;
    }
  };
  const dom = (index: number): void => {
    for (const c of row.expectDom ?? []) {
      if ((c.at ?? last) !== index) continue;
      const root = host.root ? host.root() : null;
      if (!root) {
        skipped.push(labelOf(c));
        continue;
      }
      fail(domIssues(c, root), ` after gesture ${index + 1} (${labelOf(c)})`);
    }
  };
  const stops = (index: number): void => {
    const s = row.expectStops;
    if (!s || (s.at ?? last) !== index) return;
    if (!host.stops) {
      skipped.push(`the stops of ${s.item}`);
      return;
    }
    const have = host.stops(s.item).map(placeKey);
    const want = s.places.map(placeKey);
    if (have.join("\n") !== want.join("\n")) fail([`${s.item}'s stops are\n   ${have.join("\n   ")}\n expected\n   ${want.join("\n   ")}`], "");
  };
  try {
    host.load(row.scene, row.settings);
  } catch (e) {
    fail([`the host couldn't load the scene: ${e instanceof Error ? e.message : String(e)}`], "");
    return { ok: false, failures, skipped };
  }
  for (let i = 0; i < n; i++) {
    const g = row.gestures[i]!;
    try {
      host.perform(g);
    } catch (e) {
      fail([`${gestureWords(g, i)} failed: ${e instanceof Error ? e.message : String(e)}`], "");
      return { ok: false, failures, skipped };
    }
    for (const cp of row.checkpoints ?? []) {
      if (cp.at !== i || !cp.layout) continue;
      const l = layoutOf(` after ${gestureWords(g, i)}`);
      if (l) fail(layoutIssues(cp.layout, l), ` after ${gestureWords(g, i)}${cp.note ? ` (${cp.note})` : ""}`);
    }
    dom(i);
    stops(i);
  }
  // A row with no gestures is checked as loaded.
  if (last < 0) {
    dom(-1);
    stops(-1);
  }
  const l = layoutOf("");
  if (l) fail(layoutIssues(row.expectLayout, l), "");
  if (row.expectStored) {
    if (!host.stored) skipped.push("the stored form");
    else {
      try {
        fail(storedIssues(row.expectStored, host.stored()), " (the stored form)");
      } catch (e) {
        fail([`the host couldn't give its stored form: ${e instanceof Error ? e.message : String(e)}`], "");
      }
    }
  }
  return { ok: failures.length === 0, failures, skipped };
}

/** Runs every row on a fresh host each (`makeHost`), and returns each row's result by id. */
export function runCases(rows: readonly CaseRow[], makeHost: () => CaseHost): { id: string; result: CaseResult }[] {
  return rows.map((row) => ({ id: row.id, result: runCase(row, makeHost()) }));
}
