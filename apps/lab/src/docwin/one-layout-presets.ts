/**
 * The one-layout sweep in the DOM: the node sweep's paths (`packages/docking/test/one-layout-sweep.test.ts`) played on
 * the window with real frames, and on every frame the drawn window held to the layout its release commits.
 *
 * - **items and landing:** every item but the held one is drawn (DOM) where the frame's state's commit puts it
 *   (`solve(after(state).state, { previous })`), within 1 px; the frame's landing is the held item's rect there;
 * - **entry:** each lane shown for another state than the screen's (the Near lane, the corner's owner by reach) or the
 *   entered lane draws only within its marks in that state's layout (`after(state)`, the host's 2 px inset aside), and
 *   nothing over the landing there;
 * - **reach:** under "all" with no lane held or pending, over a refused place, the corner's owner is the lane nearest the
 *   pointer within the approach's reach, exactly.
 *
 * Each toolbar is lifted in the default window and taken to the middle of each lane that takes it, fast then slow, under
 * "near" and "all".
 */
import type { Point, Rect } from "@n-uf/placement";
import { LANDING_APPROACH } from "@n-uf/motion/drag";
import { lanes, solve } from "@n-uf/docking";
import { drive, hold, mid, through, type Key } from "./intent-presets";
import { defaultState, GROUPS, type ItemId } from "./model";
import { presetFrom } from "./one-preview-presets";
import type { Docwin } from "./dock-state";

type OneLayoutPreset = ReturnType<typeof presetFrom>;

/** The default window in Snap; with `guides`, that level for Snap's place guides (the check sets it back). */
const fresh = (c: Docwin, guides?: "near" | "all"): void => {
  c.setState(defaultState());
  c.setDropPreview("item");
  if (guides) c.setPlaceGuides("snap", guides);
};
const off = (a: Rect, b: Rect): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.width - b.width), Math.abs(a.height - b.height));
const overlaps = (a: Rect, b: Rect): boolean => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1;
const inside = (a: Rect, b: Rect, by: number): boolean => a.x >= b.x - by && a.y >= b.y - by && a.x + a.width <= b.x + b.width + by && a.y + a.height <= b.y + b.height + by;
const distanceTo = (r: Rect, p: Point): number => Math.hypot(Math.max(r.x - p.x, 0, p.x - (r.x + r.width)), Math.max(r.y - p.y, 0, p.y - (r.y + r.height)));
/** An element's rect in window px, from its own style (layout px: a scaled window doesn't change it). */
const styleRect = (el: HTMLElement): Rect => ({ x: parseFloat(el.style.left), y: parseFloat(el.style.top), width: parseFloat(el.style.width), height: parseFloat(el.style.height) });

/** The paths of a drag of `id` in the window now: to the middle of each lane that takes it, fast then slow, then a rest. */
function pathsOf(c: Docwin, id: ItemId): ((g: Point) => Key[])[] {
  const { endReach, floatFromHeld, stretchPositions, pitch, snapDistance } = c.dragSettings;
  const rs = lanes(c.dragState, id, { previous: c.layout, endReach, floatFromHeld, stretchPositions, pitch, snapDistance });
  return rs.lanes.map((l) => (g: Point) => hold(through([g, mid(l.rect)], 0.6), 300));
}

/** Checks every frame of the drags of every toolbar, under `guides`; adds failures to `bad`, counts to `said`. */
function sweep(c: Docwin, guides: "near" | "all", check: (c: Docwin, bad: string[], counts: Record<string, number>, guides: "near" | "all") => void, bad: string[], said: string[]): void {
  const counts: Record<string, number> = {};
  for (const id of GROUPS) {
    fresh(c, guides);
    for (const path of pathsOf(c, id as ItemId)) {
      fresh(c, guides);
      drive(c, id as ItemId, path, [], () => check(c, bad, counts, guides));
    }
  }
  said.push(`${guides}: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")}`);
}

/** Items and landing: the window as drawn is the frame's state's commit. */
function itemsCheck(c: Docwin, bad: string[], counts: Record<string, number>): void {
  const m = c.landingModel;
  if (!m || !m.frame.state || !m.frame.landing) return;
  const after = m.drag.after(m.frame.state);
  const commit = solve(after.state, { previous: m.previous });
  counts["frames"] = (counts["frames"] ?? 0) + 1;
  const held = m.id;
  // Named exception: over the document (a float state) this window keeps its committed layout until the release (the
  // one-preview model), so only the float's landing is held to the commit there.
  if (m.frame.state.kind === "spot") {
    const drawnAt = new Map<string, Rect>();
    for (const el of c.win.querySelectorAll<HTMLElement>(".dw-items [data-id]")) if (!el.closest("[data-drag-held]")) drawnAt.set(el.dataset.id!, styleRect(el));
    // Every item the commit draws (in no menu, but the held one) is drawn where the commit puts it; none is missing.
    for (const [id, it] of Object.entries(commit.items)) {
      if (id === held || it.inMenu || it.rect.width <= 0 || it.rect.height <= 0) continue;
      const r = drawnAt.get(id);
      if (!r || off(r, it.rect) > 1) {
        if (bad.length < 6) bad.push(`${id} drawn ${r ? JSON.stringify(r) : "nowhere"}, committed ${JSON.stringify(it.rect)} (${m.frame.spot ?? m.frame.region})`);
        return;
      }
    }
  }
  const landed = commit.items[held]?.rect;
  if (landed && off(landed, m.frame.landing) > 1e-6 && bad.length < 6) bad.push(`landing ${JSON.stringify(m.frame.landing)}, committed ${JSON.stringify(landed)}`);
}

/** Entry and reach: each lane's drawn guides lie within its marks in the state it names; the reach owner is exact. */
function guidesCheck(c: Docwin, bad: string[], counts: Record<string, number>, guides: "near" | "all"): void {
  const m = c.landingModel;
  if (!m) return;
  const f = m.frame;
  const drawn = [...c.win.querySelectorAll<HTMLElement>(".dw-guide[data-kind]:not([data-off])")].map((el) => ({ id: el.dataset.guide!, r: styleRect(el) }));
  for (const g of f.guides) {
    const entered = g.lane === f.lane && f.region === "lane";
    if (!entered && g.state === f.state) continue;
    counts["entry"] = (counts["entry"] ?? 0) + 1;
    const marks = m.drag.guides({ state: f.state, guides: [g] }).filter((x) => x.lane === g.lane);
    const landing = g.state ? m.drag.landingOf(g.state) : null;
    const mine = drawn.filter((x) => x.id.startsWith(`${g.lane}/`));
    for (const d of mine) {
      // (The host insets a box 2 px and draws a line 2 px thick: 3 px either way.)
      if (!marks.some((x) => inside(d.r, x.rect, 3)) && bad.length < 6) bad.push(`${d.id} ${JSON.stringify(d.r)} is not its entry`);
      if (landing && overlaps(d.r, landing) && !d.id.includes("/line/") && bad.length < 6) bad.push(`${d.id} under the landing`);
    }
    // Not vacuous: a lane whose entry has a box the host's inset leaves room in draws at least one guide.
    if (marks.some((x) => x.kind === "box" && x.rect.width > 12 && x.rect.height > 12) && mine.length === 0 && bad.length < 6) bad.push(`${g.lane} drew no guide, its entry has ${marks.length} marks`);
  }
  if (guides !== "all" || f.lane || f.pending || f.region !== "refused") return;
  counts["reach"] = (counts["reach"] ?? 0) + 1;
  const p = m.pointer;
  const nearest = m.drag.regions.lanes.map((l) => ({ l, d: distanceTo(l.rect, p) })).filter((x) => x.d <= LANDING_APPROACH.reach).sort((a, b) => a.d - b.d)[0];
  const owner = f.guides.find((g) => g.state !== f.state)?.lane;
  // The nearest lane within reach owns the corner, unless the pointer picks no spot along it (a refused stretch).
  const along = nearest ? (nearest.l.axis === "x" ? p.x : p.y) : 0;
  const picks = !!nearest && nearest.l.spots.length > 0 && !nearest.l.refused.some((r) => along >= r.along[0] && along <= r.along[1]);
  if (!nearest && owner && bad.length < 6) bad.push(`at ${Math.round(p.x)},${Math.round(p.y)} the corner went to ${owner}, past every lane's reach`);
  if (nearest && picks) counts["owned within reach"] = (counts["owned within reach"] ?? 0) + 1;
  if (nearest && picks && owner !== nearest.l.id && bad.length < 6) bad.push(`at ${Math.round(p.x)},${Math.round(p.y)} the corner went to ${owner ?? "none"}, not ${nearest.l.id} within reach`);
}

export function ONE_LAYOUT_PRESETS(): OneLayoutPreset[] {
  return [
    presetFrom(
      (c) => fresh(c),
      "one-layout-items-landing",
      "One layout in the DOM: the held frame draws its commit",
      "Each toolbar lifted in the default window and taken to the middle of each lane that takes it (fast, then slow), under near and all: on every frame every other item is drawn within 1 px of where the frame's state commits it (after(state) solved with the drag's previous), and the landing is the held item's committed rect.",
      (c, bad, said) => {
        try {
          for (const guides of ["near", "all"] as const) sweep(c, guides, itemsCheck, bad, said);
        } finally {
          c.setPlaceGuides("snap", null);
        }
      },
    ),
    presetFrom(
      (c) => fresh(c),
      "one-layout-guides-entry-reach",
      "One layout in the DOM: a Near or entered lane shows its entry, and the corner switches at reach",
      "The same drags: a lane shown for another state than the screen's, or the lane entered, draws only within its marks in that state's layout (the 2 px inset aside), never over the landing there; under all, over a refused place with no lane held or pending, the corner goes to the lane nearest the pointer within the approach's reach, and to none past it.",
      (c, bad, said) => {
        try {
          for (const guides of ["near", "all"] as const) sweep(c, guides, guidesCheck, bad, said);
        } finally {
          c.setPlaceGuides("snap", null);
        }
      },
    ),
  ];
}
