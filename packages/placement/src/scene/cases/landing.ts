/**
 * The landing rows: the landing model's properties as conformance rows, played on any host that drags with a landing
 * model (`@n-uf/motion/drag`'s `createLandingModel` over `lanes()`). Placement never imports motion: the model comes in
 * as an input, the way the pick rule does (`createLandingHost({ landing: createLandingModel })`).
 *
 * A row is plain data: a scene, the item dragged, a pointer path at a speed (its first point the press, on the item),
 * a rest at its end, and what must hold on every frame while the pointer moves, on the last frame, and in the layout
 * after the release. A host plays the path at its own frame rate (it must call the model once more after the pointer
 * stops, as every frame does) and reports each frame.
 *
 * Every row carries `requires: { lanes: { since } }`: the first library version with `lanes()`. A host whose library is
 * older skips it (its `version`, read by `runLandingCases`); a host without a landing model doesn't run them, and its
 * suite counts them all as skipped. The skipped count is a ratchet (`lanesRatchet`): it may only fall, and from `LANES_DEADLINE` (or the breaking release, if that
 * comes first) every row must run.
 */
import { rect, type Point, type Rect } from "../../geometry";
import { lanes, type Regions } from "../lanes";
import type { Edge, Scene, SceneItem, SceneLayout } from "../index";
import { solve } from "../solve";
import { layoutIssues } from "./run";
import type { CaseRequires, LayoutExpect } from "./types";
import { form } from "./world";

/**
 * The first library version with `lanes()`: a landing row's `requires.lanes.since`. 26.11.21 to 26.11.44 shipped
 * without it; the release that ships it is 26.11.45 (a test holds it above 26.11.44, and at or below the package's
 * version once that is past 26.11.44).
 */
export const LANES_SINCE = "26.11.45";
/**
 * The first library version whose `lanes()` takes the grab (`LaneOptions.grab`): the rows that bring an item back to
 * its press point need it, and a host must pass the grab to `lanes()` for them to pass.
 */
export const GRAB_SINCE = "26.11.46";
/** The last published version without `lanes()`. */
export const LAST_WITHOUT_LANES = "26.11.44";
/** From this date every landing row runs on every host (or at the breaking release, if that comes first). */
export const LANES_DEADLINE = "2026-12-31";

export type LandingRegionName = "lane" | "open" | "refused" | "nowhere";

/** A landing model, as much of it as a host plays (`@n-uf/motion/drag`'s `createLandingModel` gives one). */
export interface LandingModelLike {
  update(
    point: Point,
    time: number,
    keys?: { readonly shift?: boolean },
  ): { readonly region: LandingRegionName; readonly lane: string | null; readonly spot: string | null; readonly landing: Rect | null; readonly room: boolean; readonly guides?: readonly LandingCaseGuide[] };
  release(): { readonly kind: "spot"; readonly lane: string; readonly spot: string; readonly home: boolean } | { readonly kind: "float"; readonly rect: Rect } | null;
}
/** What makes a landing model: `createLandingModel`, as an input. */
export type LandingRule = (options: {
  readonly regions: Regions;
  readonly regionsFor: (spot: string) => Regions;
  readonly floatLanding: (point: Point) => Rect | null;
  readonly home?: { readonly lane: string; readonly spot: string };
  readonly placeGuides?: "off" | "near" | "all";
}) => LandingModelLike;

/** A place guide a frame shows: its lane, line or box, and where. */
export interface LandingCaseGuide {
  readonly id: string;
  readonly lane: string;
  readonly kind: "line" | "box";
  readonly rect: Rect;
}

/** One frame a host reports: the pointer, whether it is still moving along the path, and the model's answer. */
export interface LandingCaseFrame {
  readonly t: number;
  readonly point: Point;
  readonly moving: boolean;
  readonly region: LandingRegionName;
  readonly lane: string | null;
  readonly spot: string | null;
  readonly landing: Rect | null;
  readonly room: boolean;
  /** The place guides shown ("near"), when the host reports them. */
  readonly guides?: readonly LandingCaseGuide[];
}

export interface LandingCase {
  /** Generic and stable. */
  readonly id: string;
  readonly title: string;
  readonly expect: string;
  readonly scene: Scene;
  readonly item: string;
  /** The pointer path, stage px; the first point is the press on the item. */
  readonly path: readonly Point[];
  /** px/ms. */
  readonly speed: number;
  /** The pointer rests at the path's end this long before the release, ms. */
  readonly rest?: number;
  /** On every frame while the pointer moves. */
  readonly moving?: {
    /** The lane held on every frame (and never anything else). */
    readonly lane?: string;
    /** Lanes never held. */
    readonly notLanes?: readonly string[];
    /** Regions never shown. */
    readonly notRegions?: readonly LandingRegionName[];
    /** Whenever a lane is held, the landing lies within this many px of the pointer. */
    readonly trail?: number;
    /**
     * The landing lies no further from the pointer, at worst, than when the same path is played at `slow` px/ms, plus
     * `by` px: a fast hand trails no more than a slow one does, plus what it may trail.
     */
    readonly trailOverSlow?: { readonly slow: number; readonly by: number };
    /** Places where no guide lies (nothing lands there): a guide touching one of these rects fails. */
    readonly noGuideIn?: readonly Rect[];
  };
  /** On the last frame before the release. */
  readonly end?: { readonly region: LandingRegionName; readonly lane?: string | null; readonly spot?: string };
  /** The layout after the release. */
  readonly layout?: LayoutExpect;
  /**
   * After the release the item lies where it lay at the press, in the host's own layout: on the same edge, among the
   * same items in the same order, at the same rect (within 0.5 px). Checked against the play's `before` (the host's
   * layout at the press), else the row's scene as solved: a host whose geometry differs from the row's (its own gaps)
   * passes `before`, and no pixel value of the row's window is asserted.
   */
  readonly home?: true;
  readonly requires: CaseRequires & { readonly lanes: { readonly since: string } };
}

/** What a host reports for one row: its frames, the layout after the release and, optionally, the layout at the press. */
export interface LandingPlay {
  readonly frames: readonly LandingCaseFrame[];
  readonly layout: SceneLayout;
  /** The host's layout at the press (what a row's `home` compares with). Absent: the row's scene as solved. */
  readonly before?: SceneLayout;
}

/** What a host gives the landing runner: one call plays a row's drag and reports its frames and the layout after. */
export interface LandingCaseHost {
  /** The library version the host runs (`YY.M.R`); a row needing a later one is skipped. Absent: the latest. */
  readonly version?: string;
  play(row: LandingCase): LandingPlay | Promise<LandingPlay>;
}

export interface LandingCaseResult {
  readonly id: string;
  readonly ok: boolean;
  readonly failures: readonly string[];
  /** Why the row didn't run, or null. */
  readonly skipped: string | null;
}

/** `a` is before `b`, as calendar versions `YY.M.R`. */
const versionBefore = (a: string, b: string): boolean => {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0);
  return false;
};
const gapTo = (r: Rect, p: Point): number => Math.hypot(Math.max(r.x - p.x, 0, p.x - (r.x + r.width)), Math.max(r.y - p.y, 0, p.y - (r.y + r.height)));

/** `a` lies in `b` or on its edge (a zero-thick line on it counts). */
const touches = (a: Rect, b: Rect): boolean => a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height;

/** The furthest the landing gets from the pointer while a lane holds it and the pointer moves. */
const worstTrail = (frames: readonly LandingCaseFrame[]): number => Math.max(0, ...frames.filter((f) => f.moving && f.region === "lane" && f.landing).map((f) => gapTo(f.landing!, f.point)));

/** The ids docked on `edge` in `l`, in order along it (by their rects' top left). */
const onEdgeIds = (l: SceneLayout, edge: string): string[] =>
  Object.entries(l.items)
    .filter(([, it]) => it.edge === edge && !it.inMenu && !it.floating)
    .sort(([, a], [, b]) => a.rect.x - b.rect.x || a.rect.y - b.rect.y)
    .map(([id]) => id);

/** Where `item` lies in `after` against where it lay in `before`: its edge, its order there and its rect. */
function homeIssues(item: string, before: SceneLayout, after: SceneLayout): string[] {
  const a = before.items[item];
  const b = after.items[item];
  if (!a) return [`${item} is not in the layout at the press`];
  if (!b) return [`${item} is not in the layout after the release`];
  const out: string[] = [];
  const where = (it: typeof a): string => (it.floating ? "floating" : it.inMenu ? `in ${it.edge ?? "no"} menu` : (it.edge ?? "nowhere"));
  if (where(a) !== where(b)) out.push(`${item} ends ${where(b)}, not where it was (${where(a)})`);
  else if (a.edge && onEdgeIds(before, a.edge).join(",") !== onEdgeIds(after, a.edge).join(","))
    out.push(`${a.edge} holds ${onEdgeIds(after, a.edge).join(", ")}, not ${onEdgeIds(before, a.edge).join(", ")} as at the press`);
  const r0 = a.rect;
  const r1 = b.rect;
  if (Math.max(Math.abs(r0.x - r1.x), Math.abs(r0.y - r1.y), Math.abs(r0.width - r1.width), Math.abs(r0.height - r1.height)) > 0.5)
    out.push(`${item} is at ${Math.round(r1.x)},${Math.round(r1.y)} ${Math.round(r1.width)}x${Math.round(r1.height)}, not where it was (${Math.round(r0.x)},${Math.round(r0.y)} ${Math.round(r0.width)}x${Math.round(r0.height)})`);
  return out;
}

/**
 * What differs between a row and what its host played. `before` is the host's layout at the press (a row's `home`
 * compares with it); absent, the row's scene as solved.
 */
export function landingIssues(row: LandingCase, frames: readonly LandingCaseFrame[], layout: SceneLayout, before?: SceneLayout): string[] {
  const out: string[] = [];
  const m = row.moving;
  if (frames.length === 0) return ["no frames"];
  if (m)
    for (const f of frames.filter((x) => x.moving)) {
      const at = `at ${Math.round(f.point.x)},${Math.round(f.point.y)}`;
      if (m.lane !== undefined && (f.region !== "lane" || f.lane !== m.lane)) out.push(`${at}: ${f.region}${f.lane ? ` in ${f.lane}` : ""}, not the lane ${m.lane}`);
      if (m.notLanes && f.lane && m.notLanes.includes(f.lane)) out.push(`${at}: held ${f.lane}`);
      if (m.notRegions && m.notRegions.includes(f.region)) out.push(`${at}: ${f.region}`);
      for (const g of m.noGuideIn ? (f.guides ?? []) : []) if (m.noGuideIn!.some((r) => touches(g.rect, r))) out.push(`${at}: the guide ${g.id} where nothing lands`);
      if (m.trail !== undefined && f.region === "lane" && f.landing && gapTo(f.landing, f.point) > m.trail + 0.5) out.push(`${at}: the landing ${Math.round(gapTo(f.landing, f.point))} px from the pointer (at most ${m.trail})`);
      if (out.length >= 4) break;
    }
  const last = frames.at(-1)!;
  if (row.end) {
    if (last.region !== row.end.region) out.push(`the last frame is ${last.region}, not ${row.end.region}`);
    if (row.end.lane !== undefined && last.lane !== row.end.lane) out.push(`the last frame holds ${last.lane ?? "no lane"}, not ${row.end.lane ?? "no lane"}`);
    if (row.end.spot !== undefined && last.spot !== row.end.spot) out.push(`the last frame's spot is ${last.spot ?? "none"}, not ${row.end.spot}`);
  }
  if (row.layout) out.push(...layoutIssues(row.layout, layout));
  if (row.home) out.push(...homeIssues(row.item, before ?? solve(row.scene), layout));
  return out;
}

/**
 * Plays every row on `host` and says what differs. A row whose `requires.lanes.since` is after the host's `version` is
 * skipped (and listed as such); a row that throws fails.
 */
export async function runLandingCases(rows: readonly LandingCase[], host: LandingCaseHost): Promise<LandingCaseResult[]> {
  const out: LandingCaseResult[] = [];
  for (const row of rows) {
    if (host.version && versionBefore(host.version, row.requires.lanes.since)) {
      out.push({ id: row.id, ok: true, failures: [], skipped: `needs ${row.requires.lanes.since}, the host runs ${host.version}` });
      continue;
    }
    try {
      const { frames, layout, before } = await host.play(row);
      const issues = landingIssues(row, frames, layout, before);
      const over = row.moving?.trailOverSlow;
      if (over) {
        // The same path played slowly: how far the landing gets from the pointer at worst there.
        const slow = await host.play({ ...row, speed: over.slow });
        const fast = worstTrail(frames);
        const bound = worstTrail(slow.frames) + over.by;
        if (fast > bound + 0.5) issues.push(`the landing trails the pointer by ${Math.round(fast)} px, more than a slow hand's ${Math.round(bound - over.by)} px plus ${over.by}`);
      }
      const failures = issues.map((l) => `${row.id}: ${l}`);
      out.push({ id: row.id, ok: failures.length === 0, failures, skipped: null });
    } catch (e) {
      out.push({ id: row.id, ok: false, failures: [`${row.id}: ${e instanceof Error ? e.message : String(e)}`], skipped: null });
    }
  }
  return out;
}

/**
 * The ratchet on landing rows a host skips (any reason: no landing model, an older library, a row it can't play):
 * `skipped` may not exceed the `baseline` the host recorded last, and from `LANES_DEADLINE` (`today`, `YYYY-MM-DD`) or
 * at the `breaking` release it must be 0. The issues, none when it holds.
 */
export function lanesRatchet(r: { readonly skipped: number; readonly baseline: number; readonly today: string; readonly breaking?: boolean }): string[] {
  const out: string[] = [];
  // Dates compare as strings: only in this one form.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.today)) return [`today is "${r.today}", not a YYYY-MM-DD date`];
  if (r.skipped > r.baseline) out.push(`${r.skipped} landing rows skipped, more than the ${r.baseline} recorded: the count may only fall`);
  const due = r.today >= LANES_DEADLINE || !!r.breaking;
  if (due && r.skipped > 0) out.push(`${r.skipped} landing rows skipped${r.breaking ? " at the breaking release" : ` on ${r.today}`}: from ${LANES_DEADLINE} or the breaking release every row runs`);
  return out;
}

// --- the reference host ------------------------------------------------------------------------------------------------

/** One sample interval of the reference host, ms (125 Hz). */
const SAMPLE = 8;

/**
 * The in-memory reference host for landing rows: `lanes()` over the scene as solved, the landing model `landing` makes
 * (`createLandingModel`), a frame every 8 ms along the path (and on through the rest, the same point again), and a
 * release that commits the spot's or the float's `after(...).scene`.
 */
export function createLandingHost(o: { readonly landing: LandingRule; readonly version?: string }): LandingCaseHost {
  return {
    ...(o.version ? { version: o.version } : {}),
    play(row) {
      const s = row.scene;
      const previous = solve(s);
      const own = previous.items[row.item];
      if (!own) throw new Error(`no item ${row.item}`);
      const press = row.path[0]!;
      const grab = { x: press.x - own.rect.x, y: press.y - own.rect.y };
      const regions = lanes(s, row.item, { previous, grab });
      const regionsFor = (spot: string): Regions => lanes(s, row.item, { previous, grab, spot });
      const home = regions.lanes.flatMap((l) => l.spots.filter((x) => x.home).map((x) => ({ lane: l.id, spot: x.id })))[0];
      const model = o.landing({ regions, regionsFor, floatLanding: (p) => regions.float?.after(p, grab).layout.items[row.item]?.rect ?? null, ...(home ? { home } : {}), placeGuides: "near" });
      const frames: LandingCaseFrame[] = [];
      const play = (p: Point, t: number, moving: boolean): void => {
        const f = model.update(p, t);
        frames.push({ t, point: p, moving, region: f.region, lane: f.lane, spot: f.spot, landing: f.landing, room: f.room, ...(f.guides ? { guides: f.guides } : {}) });
      };
      let t = 0;
      let at = press;
      for (let i = 1; i < row.path.length; i++) {
        const a = row.path[i - 1]!;
        const b = row.path[i]!;
        const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / row.speed / SAMPLE));
        for (let k = 1; k <= n; k++) play((at = { x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n }), (t += SAMPLE), true);
      }
      for (let r = SAMPLE; r <= (row.rest ?? 0); r += SAMPLE) play(at, (t += SAMPLE), false);
      const out = model.release();
      const spot = out?.kind === "spot" ? [...regions.lanes, ...regionsFor(out.spot).lanes].flatMap((l) => l.spots).find((x) => x.id === out.spot) : undefined;
      const target = out?.kind === "float" ? regions.float : spot && !spot.home ? spot.target : null;
      const next = target ? target.after(at, grab).scene : s;
      return { frames, layout: solve(next, { previous }), before: previous };
    },
  };
}

// --- the rows ------------------------------------------------------------------------------------------------------------

const group = (id: string, used: number): SceneItem => ({
  id,
  kind: "group",
  used,
  forms: { row: [form("row", 180, 200, 28), form("icons", 84, 84, 28), form("menu", 0, 0, 0)], column: [form("icons", 84, 84, 28), form("menu", 0, 0, 0)] },
});
const bar = (id: string, side: "top" | "bottom", ring: number, items: string[]): Edge => ({ id, side, ring, accepts: ["group"], items, cross: { min: 36, max: 36, rail: 36 }, gap: 4, pad: { start: 8, end: 8 } });

/**
 * A 1080×640 window: a top bar (y 0–36) with `top` in it, a bottom bar (y 604–640) with `bottom`, and a toolbar rail at
 * the left (x 0–30, from y 36) with tools and zoom.
 */
function landingWindow(top: string[] = ["a"], bottom: string[] = []): Scene {
  const ids = ["tools", "zoom", ...top, ...bottom];
  return {
    stage: rect(0, 0, 1080, 640),
    edges: [bar("top", "top", 0, top), bar("bottom", "bottom", 0, bottom), { id: "rail-left", side: "left", ring: 0, accepts: ["group"], items: ["tools", "zoom"], cross: { min: 30, max: 30, rail: 30 }, compact: true }],
    items: Object.fromEntries(ids.map((id, i) => [id, group(id, i + 1)])),
    floats: [],
    floatKinds: ["group"],
  };
}
const LANES: LandingCase["requires"] = { lanes: { since: LANES_SINCE } };
const GRAB: LandingCase["requires"] = { lanes: { since: GRAB_SINCE } };

export const LANDING_CASES: readonly LandingCase[] = [
  {
    id: "landing-rail-repro",
    title: "An item pulled up its rail stays in the rail",
    expect: "Zoom's grip pulled straight up its rail, 6 px every 40 ms, to 4 px above the rail's top: every frame holds the rail, and the release docks Zoom above Tools.",
    scene: landingWindow(),
    item: "zoom",
    path: [
      { x: 15, y: 160 },
      { x: 15, y: 32 },
    ],
    speed: 0.15,
    rest: 40,
    moving: { lane: "rail-left" },
    end: { region: "lane", lane: "rail-left" },
    layout: { order: { "rail-left": ["zoom", "tools"] } },
    requires: LANES,
  },
  {
    id: "landing-edge-fling",
    title: "A pointer flung past the window's edge and held there docks against it",
    expect: "A toolbar flung from the document at 3 px/ms to 10 px past the window's left edge and held there for 40 ms docks in the rail drawn against that edge.",
    scene: landingWindow(),
    item: "a",
    path: [
      { x: 60, y: 18 },
      { x: 500, y: 300 },
      { x: -10, y: 400 },
    ],
    speed: 3,
    rest: 40,
    end: { region: "lane", lane: "rail-left" },
    layout: { items: { a: { edge: "rail-left" } } },
    requires: LANES,
  },
  {
    id: "landing-past-edge",
    title: "More than 48 px past the window is nowhere",
    expect: "A toolbar taken 80 px past the window's left edge and held there lands nowhere: the release puts it back.",
    scene: landingWindow(),
    item: "a",
    path: [
      { x: 60, y: 18 },
      { x: 500, y: 300 },
      { x: -80, y: 400 },
    ],
    speed: 1,
    rest: 80,
    end: { region: "nowhere", lane: null },
    layout: { items: { a: { edge: "top" } } },
    requires: LANES,
  },
  {
    id: "landing-lift-over-a-band",
    title: "A lift over an empty bar's band doesn't enter the bar",
    expect: "A floating toolbar lying over the empty top bar's band, lifted there and moved away into the document at 1.5 px/ms: the lift itself is no still pointer, so the top bar never holds it.",
    scene: { ...landingWindow([]), items: { ...landingWindow([]).items, a: group("a", 9) }, floats: [{ id: "a", rect: rect(480, 6, 200, 28) }] },
    item: "a",
    path: [
      { x: 500, y: 20 },
      { x: 504, y: 22 },
      { x: 600, y: 320 },
    ],
    speed: 1.5,
    moving: { notLanes: ["top"] },
    end: { region: "open", lane: null },
    requires: LANES,
  },
  {
    id: "landing-blocked",
    title: "Over a blocked spot a release cancels",
    expect: "A toolbar taken from its bar to the middle of a blocked spot in the document (`Scene.blocked`) and held there: no float lands there, and the release puts it back in its bar.",
    scene: { ...landingWindow(), blocked: [rect(400, 250, 160, 120)] },
    item: "a",
    path: [
      { x: 60, y: 18 },
      { x: 480, y: 310 },
    ],
    speed: 0.6,
    rest: 80,
    end: { region: "refused", lane: null },
    layout: { items: { a: { edge: "top" } } },
    requires: LANES,
  },
  {
    id: "landing-guides-where-it-lands",
    title: "No guide beside chrome nothing lands next to",
    expect: "Zoom held in a top bar that starts with a fixed lead and ends with fixed controls (nothing lands before the one or after the other): no guide lies in the 8 px before the lead or after the controls.",
    scene: (() => {
      const s = landingWindow(["lead", "a", "ctl"]);
      const fixed = (id: string, end: boolean): SceneItem => ({ id, kind: "chrome", used: 0, fixed: true, ...(end ? { align: "end" as const } : {}), forms: { row: [form("row", 120, 120, 28)] } });
      return { ...s, items: { ...s.items, lead: fixed("lead", false), ctl: fixed("ctl", true) } };
    })(),
    item: "zoom",
    path: [
      { x: 15, y: 160 },
      { x: 15, y: 18 },
      { x: 600, y: 18 },
    ],
    speed: 0.3,
    rest: 80,
    moving: { noGuideIn: [rect(0, 2, 7, 32), rect(1073, 2, 7, 32)] },
    end: { region: "lane", lane: "top" },
    requires: LANES,
  },
  {
    id: "landing-fast-pass",
    title: "A fast pass over a bar opens no room in it",
    expect: "A toolbar moved from the document down across the empty bottom bar and 40 px past the window at 1.5 px/ms: the bottom bar never holds the pointer while it moves.",
    scene: landingWindow(),
    item: "a",
    path: [
      { x: 60, y: 18 },
      { x: 500, y: 300 },
      { x: 520, y: 680 },
    ],
    speed: 1.5,
    moving: { notLanes: ["bottom"] },
    requires: LANES,
  },
  {
    id: "landing-lane-to-lane",
    title: "Rail to bar at the corner never passes through the float",
    expect: "Zoom moved up its rail into the top bar and along it at 0.6 px/ms, resting there 80 ms: no frame floats it, and it ends in the top bar.",
    scene: landingWindow(),
    item: "zoom",
    path: [
      { x: 15, y: 160 },
      { x: 15, y: 18 },
      { x: 400, y: 18 },
    ],
    speed: 0.6,
    rest: 80,
    moving: { notRegions: ["open"] },
    end: { region: "lane", lane: "top" },
    layout: { items: { zoom: { edge: "top" } } },
    requires: LANES,
  },
  {
    id: "landing-fast-along-bar",
    title: "A fast hand along a bar's free stretch keeps the item at the hand",
    expect: "A toolbar moved along its bar's free stretch at 1.2 px/ms: whenever the bar holds it, the landing lies within 40 px (the spot pitch) of the pointer.",
    scene: landingWindow(),
    item: "a",
    path: [
      { x: 110, y: 18 },
      { x: 970, y: 18 },
    ],
    speed: 1.2,
    moving: { lane: "top", trail: 40 },
    requires: LANES,
  },
  {
    id: "landing-back-home-bar",
    title: "A toolbar taken away by its end and brought back lands home",
    expect: "A toolbar pressed 12 px from its right end in its bar (the free stretch's spots lie that way), moved into the document and back to the press point at 0.6 px/ms, resting there 80 ms: it ends on its own place, not on a free-stretch spot beside it.",
    scene: landingWindow(),
    item: "a",
    path: [
      { x: 196, y: 18 },
      { x: 500, y: 300 },
      { x: 196, y: 18 },
    ],
    speed: 0.6,
    rest: 80,
    end: { region: "lane", lane: "top" },
    home: true,
    requires: GRAB,
  },
  {
    id: "landing-back-home-rail",
    title: "A rail toolbar taken away by its bottom and brought back lands home",
    expect: "Zoom pressed 6 px above its bottom in its rail (the free stretch's spots lie below it), moved into the document and back to the press point at 0.6 px/ms, resting there 80 ms: it ends where it was, below Tools.",
    scene: landingWindow(),
    item: "zoom",
    path: [
      { x: 15, y: 198 },
      { x: 500, y: 300 },
      { x: 15, y: 198 },
    ],
    speed: 0.6,
    rest: 80,
    end: { region: "lane", lane: "rail-left" },
    home: true,
    requires: GRAB,
  },
  {
    id: "landing-across-items",
    title: "A fast hand across docked items trails no further than it must",
    expect: "Zoom moved up its rail and along a bar of three toolbars at 1.2 px/ms, both ways: no frame floats it, and its landing is never further from the pointer than when the same path is played at 0.05 px/ms, plus 40 px.",
    scene: landingWindow(["a", "b", "c"]),
    item: "zoom",
    path: [
      { x: 15, y: 160 },
      { x: 15, y: 18 },
      { x: 1040, y: 18 },
      { x: 40, y: 18 },
    ],
    speed: 1.2,
    moving: { notRegions: ["open"], trailOverSlow: { slow: 0.05, by: 40 } },
    requires: LANES,
  },
];
