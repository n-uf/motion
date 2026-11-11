/**
 * The desk page's scripted scenarios: each sets a construction, a stage size and options up, plays a few moves
 * through the page (`DeskLab`) and states what it expects; the page records and checks every frame of every move.
 */
import type { Rect } from "@n-uf/motion";
import { overlap, type Point } from "../shared/geometry";
import { DRAG, rawTarget, within, type Target } from "./intent";
import { dropAt, targetsFor, without } from "./drops";
import { CONSTRUCTIONS, type ConstructionId } from "./layouts";
import { DEFAULT_OPTIONS, G, LAYER, idOf, natural, panelKey, type DeskState, type Layout, type Options, type Side, type Size } from "./model";

/** What a scenario can do to the page and read from it. */
export interface DeskLab {
  construction(): ConstructionId;
  state(): DeskState;
  layout(): Layout;
  size(): Size;
  options(): Options;
  use(id: ConstructionId): void;
  setOptions(o: Partial<Options>): void;
  setSize(width: number, height: number): void;
  open(): void;
  close(): void;
  fold(id: number): void;
  /** Panel `id` was used (a press on it): it folds or shades last. */
  touch(id: number): void;
  icon(side: Side, id: number): void;
  tab(side: Side, id: number): void;
  focus(id: number): void;
  /** The item's rect as drawn now, or null when it isn't on the desk. */
  drawn(key: string): Rect | null;
  /** The item is fully shown (not folded away, not fading). */
  shown(key: string): boolean;
  /** Resolves once everything rests. */
  idle(): Promise<void>;
  /**
   * A plain scripted drag: lift `key` at its grip, move the pointer to `to()` (read after the lift) at an even pace,
   * hold it there long enough to aim, then release (or Escape `escapeAt` of the way, a fraction).
   */
  drag(key: string, to: () => Point, opts?: { escapeAt?: number }): Promise<DragResult>;
  /**
   * A drag along a keyframed path, in real time ([ms from the lift, x, y], made from the grip point); then release,
   * or Escape at `escapeAt` ms.
   */
  path(key: string, path: (grip: Point) => readonly PathKey[], opts?: { escapeAt?: number | (() => number); at?: readonly PathAction[] }): Promise<DragResult>;
  /** A keyboard drag: pick `key` up, step `steps` targets on with the arrow key, then Enter. */
  keyboard(key: string, steps: number): Promise<DragResult>;
  /** The drop targets `key` would have if it were lifted now. */
  targets(key: string): Target[];
  /** Where a drag of `key` starts. */
  grip(key: string): Point | null;
  /** Start the scenario's desk afresh. */
  restart(): void;
  /** The drop preview the scenario runs with. */
  preview(): "indicator" | "snap";
}

/** A pointer path keyframe: ms from the lift, x, y. */
export type PathKey = readonly [number, number, number];

/** Something done to the desk during a path drag, at `t` ms from the lift (read once the path is made). */
export interface PathAction {
  readonly t: number | (() => number);
  readonly run: () => void;
}

/** The indicator showing a target (ms from the lift), or hidden (null), and whether it hid because the pointer flew. */
export interface IndicatorEntry {
  readonly t: number;
  readonly id: string | null;
  readonly flying?: boolean;
}

/**
 * What a drag did: the indicator's log, the pointer and its smoothed speed per frame (a path drag), and what it
 * landed on (null: home).
 */
export interface DragResult {
  readonly log: readonly IndicatorEntry[];
  readonly frames?: readonly { readonly t: number; readonly x: number; readonly y: number; readonly speed: number; readonly item: Rect }[];
  /** Snap preview: the slots the item sat in (null: back on the pointer). */
  readonly snaps?: readonly IndicatorEntry[];
  /** Where the item was drawn when it was let go, and where the pointer held it. */
  readonly atRelease?: Rect | null;
  /** Where the page shows the item right after the release, before any frame (read from the DOM). */
  readonly landingFrom?: Rect | null;
  readonly grab?: Point;
  readonly landed: string | null;
}

export type Expect = (ok: boolean, failure: string) => void;

export interface Scenario {
  readonly construction?: ConstructionId;
  readonly size?: readonly [number, number];
  readonly options?: Partial<Options>;
  readonly docs?: number;
  /** It only checks pure layouts: nothing has to move. */
  readonly still?: boolean;
  /** It drags: it runs with each drop preview. */
  readonly drag?: boolean;
  /** It is about one preview only. */
  readonly preview?: "indicator" | "snap";
  readonly play: (expect: Expect) => Promise<void>;
}

const sameRect = (a: Rect, b: Rect): boolean => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.width - b.width), Math.abs(a.height - b.height)) < 0.5;
const fmt = (r: Rect): string => `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)} × ${Math.round(r.height)}`;

/** Everything shown rests where the layout puts it. */
export function settledAsLaidOut(lab: DeskLab, expect: Expect): void {
  for (const [key, p] of lab.layout().items) {
    if (p.hidden) continue;
    const d = lab.drawn(key);
    expect(!!d && sameRect(d, p.rect), `${key} rests at ${d ? fmt(d) : "nowhere"}, laid out at ${fmt(p.rect)}`);
    expect(lab.shown(key), `${key} isn't fully shown`);
  }
}

const TOOLBAR_MODES: Partial<Options>[] = [
  { toolbar: "top", toolbarSpace: "reserved" },
  { toolbar: "top", toolbarSpace: "overlay" },
  { toolbar: "bottom", toolbarSpace: "reserved" },
  { toolbar: "bottom", toolbarSpace: "overlay" },
];
const BOTTOM_MODES: Options["bottom"][] = ["reserved", "overlay", "off"];

/**
 * A pure layout's promises: every shown item inside the stage (unless it may scroll off), at least its minimum, a
 * real rect; items on the documents' and docks' layers never overlap; a reserved toolbar covers no document.
 */
export function layoutFailures(l: Layout, size: Size, opt: Options, what: string): string[] {
  const out: string[] = [];
  const shown = [...l.items].filter(([, p]) => !p.hidden);
  for (const [key, p] of shown) {
    const r = p.rect;
    if (![r.x, r.y, r.width, r.height].every(Number.isFinite) || r.width <= 0 || r.height <= 0) out.push(`${what}: ${key} at ${fmt(r)}`);
    else if (!p.offStage && (r.x < -0.5 || r.y < -0.5 || r.x + r.width > size.width + 0.5 || r.y + r.height > size.height + 0.5)) out.push(`${what}: ${key} at ${fmt(r)} leaves the stage`);
    const min = p.min;
    if (min && ((min.width !== undefined && r.width < min.width - 0.5) || (min.height !== undefined && r.height < min.height - 0.5))) out.push(`${what}: ${key} ${Math.round(r.width)} × ${Math.round(r.height)} is below its minimum`);
  }
  const flat = shown.filter(([, p]) => p.layer <= LAYER.dock && p.look !== "rail");
  for (let i = 0; i < flat.length; i++) {
    for (let j = i + 1; j < flat.length; j++) {
      const [ka, a] = flat[i]!;
      const [kb, b] = flat[j]!;
      if (overlap(a.rect, b.rect) > 1) out.push(`${what}: ${ka} overlaps ${kb}`);
    }
  }
  const tb = l.items.get("toolbar");
  if (tb && tb.look === "pill" && opt.toolbarSpace === "reserved") {
    for (const [key, p] of shown) if (key.startsWith("doc:") && overlap(p.rect, tb.rect) > 1) out.push(`${what}: the reserved toolbar covers ${key}`);
  }
  // A pill floats over documents only: never over a panel, a rail or a tab row.
  if (tb && tb.look === "pill") {
    for (const [key, p] of shown) if (key !== "toolbar" && !key.startsWith("doc:") && overlap(p.rect, tb.rect) > 1) out.push(`${what}: the pill covers ${key}`);
  }
  return out;
}

export function makeScenarios(lab: DeskLab): Record<string, Scenario> {
  const scenarios: Record<string, Scenario> = {
    "layouts: every construction, size and mode keeps its promises": {
      still: true,
      play: async (expect) => {
        const fails: string[] = [];
        for (const c of CONSTRUCTIONS) {
          const modes: Options[] = [];
          for (const t of c.pill ? TOOLBAR_MODES : [TOOLBAR_MODES[0]!]) for (const b of c.bottom ? BOTTOM_MODES : (["reserved"] as const)) modes.push({ ...(t as Options), bottom: b });
          for (const W of [480, 520, 640, 760, 960, 1040, 1440]) {
            for (const H of [320, 420, 480, 560, 800]) {
              for (let n = 1; n <= 4; n++) {
                const s = c.initial(Array.from({ length: n }, (_, i) => i + 1));
                for (const opt of modes) fails.push(...layoutFailures(c.layout(s, { width: W, height: H }, opt), { width: W, height: H }, opt, `${c.title} ${W} × ${H}, ${n} docs, ${opt.toolbar}/${opt.toolbarSpace}/${opt.bottom}`));
              }
            }
          }
        }
        expect(fails.length === 0, `${fails.length} broken promises; first: ${fails[0]}`);
      },
    },
  };
  scenarios["F1, F2 · palettes dropped anywhere are never under the pill, in any toolbar mode"] = {
    still: true,
    play: async (expect) => {
      const fails: string[] = [];
      const covered = (c: (typeof CONSTRUCTIONS)[number], s: DeskState, size: Size, opt: Options, what: string): void => {
        const l = c.layout(s, size, opt);
        const tb = l.items.get("toolbar")!.rect;
        for (const [key, pl] of l.items) if (key.startsWith("panel:") && overlap(pl.rect, tb) > 1) fails.push(`${c.title} ${size.width} × ${size.height} ${opt.toolbar}/${opt.toolbarSpace}, ${what}: the pill covers ${key}`);
      };
      let seed = 11;
      const rnd = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
      for (const c of CONSTRUCTIONS.filter((x) => x.id === "floatOver" || x.id === "floatAround")) {
        // Free palettes left little room in the pill's band (a regression case): the pill must not sit over them.
        const tight = { ...c.initial([1, 2]), stacks: { left: [1, 2], right: [3] }, free: [{ id: 4, at: { x: 434, y: 220 } }, { id: 5, at: { x: 518, y: 160 } }] };
        for (const m of TOOLBAR_MODES) covered(c, tight, { width: 1212, height: 377 }, { ...DEFAULT_OPTIONS, ...m }, "palettes 4 and 5 placed at x 434 and 518");
        for (let n = 0; n < 1200; n++) {
          const size = { width: Math.round(480 + rnd() * 960), height: Math.round(320 + rnd() * 480) };
          const opt: Options = { ...DEFAULT_OPTIONS, toolbar: rnd() < 0.5 ? "top" : "bottom", toolbarSpace: "overlay" };
          let s = c.initial([1, 2]);
          const drops: string[] = [];
          // Four drops, each placed by the free target with the desk as the drops before it left it.
          for (let k = 0; k < 4; k++) {
            const key = `panel:${1 + Math.floor(rnd() * 5)}`;
            const input = { c, s0: without(s, key), key, size, opt };
            const free = targetsFor(input).find((t) => t.id === "free")!;
            const p = { x: rnd() * size.width, y: rnd() * size.height };
            s = dropAt(input, free, p, { x: 40, y: 11 }).state;
            drops.push(`${key}@${Math.round(p.x)},${Math.round(p.y)}`);
          }
          // Then the toolbar switches through every mode, the palettes staying where they were dropped.
          for (const m of TOOLBAR_MODES) covered(c, s, size, { ...opt, ...m }, `drops ${drops.join(" ")} (dropped with the pill ${opt.toolbar})`);
        }
      }
      expect(fails.length === 0, `${fails.length} covered; first: ${fails[0]}`);
    },
  };
  scenarios["B · every tree drop lands under the pointer, and its label says where"] = {
    still: true,
    play: async (expect) => {
      const c = CONSTRUCTIONS.find((x) => x.id === "tree")!;
      const fails: string[] = [];
      for (const [W, H] of [[960, 560], [1440, 820], [760, 420]] as const) {
        for (let n = 1; n <= 4; n++) {
          const s = c.initial(Array.from({ length: n }, (_, i) => i + 1));
          const size = { width: W, height: H };
          for (const key of [...s.tree.L, ...s.tree.R, ...s.tree.C]) {
            const input = { c, s0: without(s, key), key, size, opt: DEFAULT_OPTIONS };
            const ts = targetsFor(input);
            // A document is never offered a side column (it would only float there).
            if (key.startsWith("doc:")) for (const t of ts) if (/^(tile:[LR]|edge:)/.test(t.id)) fails.push(`${W} × ${H}, ${n} docs: ${key} is offered ${t.id}`);
            // No two targets share a zone and a label (the keyboard would stop twice at one place).
            const made = ts.map((t) => ({ t, label: dropAt(input, t, mid(t.hit), { x: 0, y: 0 }).label }));
            for (let i = 0; i < made.length; i++) {
              for (let j = i + 1; j < made.length; j++) {
                if (made[i]!.label === made[j]!.label && sameRect(made[i]!.t.hit, made[j]!.t.hit)) fails.push(`${W} × ${H}, ${n} docs, ${key}: ${made[i]!.t.id} and ${made[j]!.t.id} are both "${made[i]!.label}" at ${fmt(made[i]!.t.hit)}`);
              }
            }
            for (const t of ts) {
              if (t.id.startsWith("edge:")) continue;
              const p = mid(t.hit);
              const d = dropAt(input, t, p, { x: 0, y: 0 });
              const floats = d.layout.items.get(key)!.layer > LAYER.doc;
              const what = `${W} × ${H}, ${n} docs, ${key} on ${t.id} ("${d.label}")`;
              const floating = (l: Layout): string[] => [...l.items].filter(([k, pl]) => k !== key && pl.layer > LAYER.doc && (k.startsWith("doc:") || k.startsWith("panel:"))).map(([k]) => k);
              const before = floating(c.layout(input.s0, size, DEFAULT_OPTIONS)).join();
              const after = floating(d.layout);
              if (floats !== d.label.includes("it floats")) fails.push(`${what}: it ${floats ? "floats" : "tiles"}`);
              else if (!floats && (after.length > 0) !== /; .* floats?$/.test(d.label)) fails.push(`${what}: ${after.length} other tiles float`);
              // Unless the drop makes others float (which reshapes the tree, as the label says), it lands under the pointer.
              else if (!floats && after.join() === before && !within(d.slot, p)) fails.push(`${what}: dropped at ${Math.round(p.x)},${Math.round(p.y)}, lands at ${fmt(d.slot)}`);
            }
          }
        }
      }
      expect(fails.length === 0, `${fails.length} zones off; first: ${fails[0]}`);
    },
  };
  CONSTRUCTIONS.forEach((c, i) => {
    // From the construction before it in the list, so everything has somewhere to glide.
    scenarios[`switch to ${c.title}`] = {
      construction: CONSTRUCTIONS[(i + CONSTRUCTIONS.length - 1) % CONSTRUCTIONS.length]!.id,
      play: async (expect) => {
        lab.use(c.id);
        await lab.idle();
        expect(lab.construction() === c.id, `the construction is ${lab.construction()}`);
        settledAsLaidOut(lab, expect);
      },
    };
  });
  Object.assign(scenarios, proportions(), giveWay(lab), handMoves(lab), modes(lab), drags(lab), dragModel(lab));
  return scenarios;
}

/** The constructions with edge docks, and those with side panels of a fixed width. */
const EDGE_DOCKS: readonly ConstructionId[] = ["docks", "docksFull", "dockTear"];
const SIDED: readonly ConstructionId[] = [...EDGE_DOCKS, "navigator", "drawers"];
/** A side dock's width, its tolerance, and the most of the stage's height the bottom dock takes. */
const SIDE_W = 240;
const SIDE_TOL = 8;
const BOTTOM_SHARE = 0.36;
/** The most a section that isn't its dock's last open one grows past its natural height. */
const AIR = 24;

/** How each construction starts and how big its docks are: pure layouts at the stage sizes people open it at. */
function proportions(): Record<string, Scenario> {
  const docs = [1, 2];
  return {
    "start: every construction opens fully docked; only F1 and F2 start with palettes floating": {
      still: true,
      play: async (expect) => {
        const fails: string[] = [];
        for (const c of CONSTRUCTIONS) {
          // At the narrow, laptop and large stages, each starting as it would at that size.
          for (const [W, H] of [[520, 700], [960, 560], [1440, 900]] as const) {
            const size = { width: W, height: H };
            const s = c.initial(docs, size);
            if (s.torn.length || s.free.length) fails.push(`${c.title} ${W} × ${H}: starts with ${[...s.torn, ...s.free].map((f) => `panel:${f.id}`).join(", ")} placed freely`);
            if (c.id === "floatOver" || c.id === "floatAround") continue;
            // A drawer sliding over the documents is how E gives way when narrow, not a panel set floating.
            for (const [k, p] of c.layout(s, size, DEFAULT_OPTIONS).items) if (/^(panel|doc):/.test(k) && !p.hidden && p.layer > LAYER.dock && p.look !== "bare") fails.push(`${c.title} ${W} × ${H}: ${k} floats (${p.look})`);
          }
        }
        expect(fails.length === 0, `${fails.length} floating at the start; first: ${fails[0]}`);
      },
    },
    "docks: sections take their natural height; only each dock's last open section takes the rest": {
      still: true,
      play: async (expect) => {
        const fails: string[] = [];
        for (const c of CONSTRUCTIONS.filter((x) => EDGE_DOCKS.includes(x.id))) {
          for (const [W, H] of [[960, 560], [1200, 700], [1440, 900]] as const) {
            for (const bottom of ["reserved", "off"] as const) {
              const s0 = c.initial(docs);
              // As it starts, with the first section folded by hand, and with three documents.
              for (const [what, s] of [["as it starts", s0], ["Files folded", { ...s0, folded: [1] }], ["three documents", c.initial([1, 2, 3])]] as const) {
                const l = c.layout(s, { width: W, height: H }, { ...DEFAULT_OPTIONS, bottom });
                const columns = new Map<number, [string, Rect][]>();
                for (const [k, p] of l.items) {
                  if (!k.startsWith("panel:") || p.hidden || p.look !== "section") continue;
                  const x = Math.round(p.rect.x);
                  columns.set(x, [...(columns.get(x) ?? []), [k, p.rect]]);
                }
                for (const list of columns.values()) {
                  const last = list.reduce((a, b) => (b[1].y > a[1].y ? b : a))[0];
                  for (const [k, rr] of list) {
                    const n = natural(idOf(k));
                    if (k !== last && rr.height > n + AIR + 0.5) fails.push(`${c.title} ${W} × ${H}, bottom ${bottom}, ${what}: ${k} is ${Math.round(rr.height)} tall, its content ${n}`);
                  }
                }
              }
            }
          }
        }
        expect(fails.length === 0, `${fails.length} sections stretched; first: ${fails[0]}`);
      },
    },
    "docks: the bottom dock is 180 to 200 px tall, never more than 36 % of the stage": {
      still: true,
      play: async (expect) => {
        const fails: string[] = [];
        for (const c of CONSTRUCTIONS.filter((x) => x.bottom)) {
          for (const W of [760, 960, 1440]) {
            for (const H of [480, 500, 560, 640, 800]) {
              for (const bottom of ["reserved", "overlay"] as const) {
                const b = c.layout(c.initial(docs), { width: W, height: H }, { ...DEFAULT_OPTIONS, bottom }).items.get(P.history)!;
                if (b.rect.height > BOTTOM_SHARE * H + 0.5) fails.push(`${c.title} ${W} × ${H}, ${bottom}: ${Math.round(b.rect.height)} px, ${Math.round((b.rect.height / H) * 100)} % of the stage`);
              }
            }
          }
          const b = c.layout(c.initial(docs), { width: 960, height: 560 }, DEFAULT_OPTIONS).items.get(P.history)!.rect;
          if (b.height < 180 - 0.5 || b.height > 200 + 0.5) fails.push(`${c.title} 960 × 560: ${Math.round(b.height)} px tall`);
        }
        expect(fails.length === 0, `${fails.length} too tall; first: ${fails[0]}`);
      },
    },
    "docks: side docks are 240 px wide at the default stage": {
      still: true,
      play: async (expect) => {
        const fails: string[] = [];
        for (const c of CONSTRUCTIONS.filter((x) => SIDED.includes(x.id))) {
          const s = c.initial(docs);
          const l = c.layout(s, { width: 960, height: 560 }, DEFAULT_OPTIONS);
          for (const side of ["left", "right"] as const) {
            const shown = s[side].map((id) => [panelKey(id), l.items.get(panelKey(id))!] as const).filter(([, p]) => !p.hidden);
            if (!shown.length) fails.push(`${c.title}: the ${side} side shows nothing`);
            for (const [k, p] of shown) if (Math.abs(p.rect.width - SIDE_W) > SIDE_TOL) fails.push(`${c.title}: ${k} on the ${side} is ${Math.round(p.rect.width)} wide`);
          }
        }
        expect(fails.length === 0, `${fails.length} off; first: ${fails[0]}`);
      },
    },
    "E · narrow, the two drawers sliding over never overlap": {
      still: true,
      play: async (expect) => {
        const fails: string[] = [];
        const c = CONSTRUCTIONS.find((x) => x.id === "drawers")!;
        const s = c.initial(docs);
        for (const W of [480, 520, 560, 640, 700, 760, 960]) {
          for (const H of [420, 700]) {
            const l = c.layout(s, { width: W, height: H }, DEFAULT_OPTIONS);
            const side = (sd: Side): Rect[] => [...l.items].filter(([k, p]) => !p.hidden && (k === `tabs:${sd}` || (k.startsWith("panel:") && s[sd].includes(idOf(k))))).map(([, p]) => p.rect);
            for (const a of side("left")) for (const b of side("right")) if (overlap(a, b) > 1) fails.push(`${W} × ${H}: the left drawer at ${fmt(a)} overlaps the right one at ${fmt(b)}`);
          }
        }
        expect(fails.length === 0, `${fails.length} overlaps; first: ${fails[0]}`);
      },
    },
    "B, D · panels in a column take their natural height; only the column's last one takes the rest": {
      still: true,
      play: async (expect) => {
        const fails: string[] = [];
        for (const c of CONSTRUCTIONS.filter((x) => x.id === "tree" || x.id === "strip")) {
          for (const [W, H] of [[960, 560], [1200, 700], [1440, 900]] as const) {
            for (const n of [1, 2, 3]) {
              const s = c.initial(Array.from({ length: n }, (_, i) => i + 1));
              const l = c.layout(s, { width: W, height: H }, DEFAULT_OPTIONS);
              // A column: the tiles at one x (floating ones aren't in one); in B only the side columns (the centre
              // tiles by dwindle, as documents do).
              const inColumn = (k: string): boolean => c.id !== "tree" || s.tree.L.includes(k) || s.tree.R.includes(k);
              const columns = new Map<number, [string, Rect][]>();
              for (const [k, p] of l.items) {
                if (!/^(panel|doc):/.test(k) || p.hidden || p.layer !== LAYER.doc || !inColumn(k)) continue;
                const x = Math.round(p.rect.x);
                columns.set(x, [...(columns.get(x) ?? []), [k, p.rect]]);
              }
              for (const list of columns.values()) {
                const last = list.reduce((a, b) => (b[1].y > a[1].y ? b : a))[0];
                for (const [k, rr] of list) {
                  if (!k.startsWith("panel:") || k === last) continue;
                  const nat = natural(idOf(k));
                  if (rr.height > nat + AIR + 0.5) fails.push(`${c.title} ${W} × ${H}, ${n} docs: ${k} is ${Math.round(rr.height)} tall, its content ${nat}`);
                }
              }
            }
          }
        }
        expect(fails.length === 0, `${fails.length} panels stretched; first: ${fails[0]}`);
      },
    },
  };
}

/** The item each construction's drag-model scenarios drag. */
const DRAGGED: Record<ConstructionId, string> = {
  docks: "panel:3",
  docksFull: "panel:3",
  tree: "panel:4",
  navigator: "panel:3",
  strip: "panel:3",
  drawers: "panel:3",
  floatOver: "panel:2",
  floatAround: "panel:3",
  dockTear: "panel:3",
};

const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
/** Keyframes through `points` at `speed` px/ms, starting at 0 ms. */
function through(points: readonly Point[], speed: number, t0 = 0): PathKey[] {
  const out: PathKey[] = [[t0, points[0]!.x, points[0]!.y]];
  let t = t0;
  for (let i = 1; i < points.length; i++) {
    t += Math.max(16, dist(points[i - 1]!, points[i]!) / speed);
    out.push([t, points[i]!.x, points[i]!.y]);
  }
  return out;
}
const hold = (path: PathKey[], ms: number): PathKey[] => [...path, [path.at(-1)![0] + ms, path.at(-1)![1], path.at(-1)![2]]];
const shows = (r: DragResult) => r.log.filter((e) => e.id !== null);
/**
 * The first flash of a drag, or null: an indicator replaced, or hidden while the pointer aims, under DRAG.FLASH ms
 * after it showed (a hide because the pointer started flying is not a flash).
 */
function flashOf(r: DragResult): string | null {
  const i = r.log.findIndex((e, k) => {
    const next = r.log[k + 1];
    return e.id !== null && !!next && !(next.id === null && next.flying) && next.t - e.t < DRAG.FLASH;
  });
  return i < 0 ? null : `${r.log[i]!.id} showed for ${Math.round(r.log[i + 1]!.t - r.log[i]!.t)} ms`;
}

/**
 * The drag model's promises, per construction: flying over targets shows no indicator; holding on a border changes
 * it at most once; the same release point reached by two paths lands the same; the keyboard steps through targets.
 * (Flashes and "the drop is what the indicator said" are checked on every drag.)
 */
function dragModel(lab: DeskLab): Record<string, Scenario> {
  const out: Record<string, Scenario> = {};
  for (const c of CONSTRUCTIONS) {
    const key = DRAGGED[c.id];
    const name = `${c.title.split(" · ")[0]} · drag model`;
    /** The targets a drag can aim at: not over the item's own home (its grip). */
    const aimable = (grip: Point): Target[] => lab.targets(key).filter((t) => !within(t.hit, grip, 12) && mid(t.hit).x > 0 && mid(t.hit).x < lab.size().width);
    out[`${name}: flying over targets shows no indicator, aiming shows one`] = {
      construction: c.id,
      drag: true,
      play: async (expect) => {
        const grip = lab.grip(key)!;
        const ts = aimable(grip);
        const all = lab.targets(key);
        const goal = ts.filter((t) => t.prio <= 2).sort((a, b) => dist(mid(b.hit), grip) - dist(mid(a.hit), grip))[0] ?? ts[0];
        if (!goal) return expect(false, "no target to aim at");
        const end = mid(goal.hit);
        const via = ts.filter((t) => t !== goal).sort((a, b) => Math.min(dist(mid(b.hit), grip), dist(mid(b.hit), end)) - Math.min(dist(mid(a.hit), grip), dist(mid(a.hit), end)))[0];
        const points = via ? [grip, mid(via.hit), end] : [grip, end];
        let arrival = 0;
        const r = await lab.path(key, (g) => {
          const fly = through([g, ...points.slice(1)], 2);
          arrival = fly.at(-1)![0];
          return hold(fly, 600);
        });
        const early = shows(r).filter((e) => e.t < arrival - 1);
        expect(early.length === 0, `the indicator showed ${early.map((e) => `${e.id} at ${Math.round(e.t)} ms`).join(", ")} while flying (arrived at ${Math.round(arrival)} ms)`);
        const snappedEarly = (r.snaps ?? []).filter((e) => e.id !== null && e.t < arrival - 1);
        expect(snappedEarly.length === 0, `the item snapped into ${snappedEarly.map((e) => `${e.id} at ${Math.round(e.t)} ms`).join(", ")} while flying`);
        const want = rawTarget(all, end)?.id ?? null;
        expect(shows(r).length === 1 && shows(r)[0]!.id === want, `aiming showed ${shows(r).map((e) => e.id).join(", ") || "nothing"}, not ${want}`);
        expect(r.landed === want, `landed on ${r.landed ?? "home"}, not ${want}`);
      },
    };
    out[`${name}: holding on a border changes the indicator at most once`] = {
      construction: c.id,
      drag: true,
      play: async (expect) => {
        const grip = lab.grip(key)!;
        const all = lab.targets(key);
        // A border: an edge of a target where the most precise target differs 8 px either side of it (across any gap
        // between the zones); the pointer holds there, wobbling 6 px about the middle of the gap.
        let border: { p: Point; dx: number; dy: number } | null = null;
        for (const t of aimable(grip)) {
          const r = t.hit;
          // Each edge, stepping outward (dx, dy) from the zone; the border point is half a gap out.
          const edges = [
            { p: { x: r.x + r.width / 2, y: r.y - G / 2 }, dx: 0, dy: -1 },
            { p: { x: r.x + r.width / 2, y: r.y + r.height + G / 2 }, dx: 0, dy: 1 },
            { p: { x: r.x - G / 2, y: r.y + r.height / 2 }, dx: -1, dy: 0 },
            { p: { x: r.x + r.width + G / 2, y: r.y + r.height / 2 }, dx: 1, dy: 0 },
          ];
          for (const e of edges) {
            const a = rawTarget(all, { x: e.p.x - 8 * e.dx, y: e.p.y - 8 * e.dy });
            const b = rawTarget(all, { x: e.p.x + 8 * e.dx, y: e.p.y + 8 * e.dy });
            if (a && b && a.id !== b.id && dist(e.p, grip) > 40 && e.p.x > 5 && e.p.x < lab.size().width - 5) border = e;
            if (border) break;
          }
          if (border) break;
        }
        if (!border) return expect(false, "no border between two targets");
        const b = border;
        const r = await lab.path(key, (g) => {
          const keys = through([g, b.p], 0.9);
          let t = keys.at(-1)![0];
          for (let i = 0; i < 14; i++) {
            t += 70;
            const s = i % 2 ? -6 : 6;
            keys.push([t, b.p.x + s * b.dx, b.p.y + s * b.dy]);
          }
          return hold(keys, 400);
        });
        const changes = shows(r).length - 1;
        const seq = r.log.map((e) => `${e.id ?? "none"}@${Math.round(e.t)}`).join(" → ");
        expect(changes <= 1, `the indicator changed ${changes} times on the border: ${seq}`);
        const snapChanges = (r.snaps ?? []).filter((e) => e.id !== null).length - 1;
        expect(snapChanges <= 1, `the item snapped ${snapChanges + 1} times on the border`);
        expect(flashOf(r) === null, `${flashOf(r)}: ${seq} (border at ${Math.round(b.p.x)},${Math.round(b.p.y)})`);
      },
    };
    out[`${name}: the same release point by two paths lands the same`] = {
      construction: c.id,
      drag: true,
      play: async (expect) => {
        const grip = lab.grip(key)!;
        const all = lab.targets(key);
        const home = lab.shown(key) ? lab.drawn(key) : null;
        // Aim points: a target's centre (else a point a quarter in from its corners) where it is the target under the
        // pointer, away from the item's home and on the stage.
        const spots = all.flatMap((t) => {
          const r = t.hit;
          const ok = (p: Point): boolean => rawTarget(all, p)?.id === t.id && dist(p, grip) > 40 && !(home && within(home, p, 12)) && p.x > 0 && p.x < lab.size().width;
          const p = [mid(r), ...[0.25, 0.75].flatMap((fx) => [0.25, 0.75].map((fy) => ({ x: r.x + r.width * fx, y: r.y + r.height * fy })))].find(ok);
          return p ? [{ t, p }] : [];
        });
        // The release point lies outside the band of every target as precise as its own: no path can keep another one.
        const clear = (s: { t: Target; p: Point }): boolean => all.every((o) => o.id === s.t.id || o.prio > s.t.prio || !within(o.hit, s.p, DRAG.BAND));
        const goal = spots.find((s) => s.t.prio <= 2 && clear(s)) ?? spots.find(clear);
        // The detour: a target whose aim point is outside the goal's band and whose band doesn't reach the release
        // point (shown there, it would keep the release, as the rules say).
        const other =
          goal &&
          spots
            .filter((s) => s.t.id !== goal.t.id && !within(goal.t.hit, s.p, DRAG.BAND) && !within(s.t.hit, goal.p, DRAG.BAND))
            .sort((a, b) => dist(a.p, grip) - dist(b.p, grip))[0];
        if (!goal || !other) return expect(false, "not two targets to take two paths");
        const end = goal.p;
        // Straight there, aiming at the end.
        const r1 = await lab.path(key, (g) => hold(through([g, end], 0.8), 500));
        await lab.idle();
        const s1 = JSON.stringify(lab.state());
        lab.restart();
        await lab.idle();
        // By way of another target (aimed at until room is made), then a flick to the same point and an instant release.
        const r2 = await lab.path(key, (g) => {
          const aimOther = hold(through([g, other.p], 0.8), 500);
          return [...aimOther, ...through([other.p, end], 2.5, aimOther.at(-1)![0]).slice(1)];
        });
        await lab.idle();
        expect(r1.landed === r2.landed, `landed on ${r1.landed} straight there, on ${r2.landed} by way of ${other.t.id}`);
        expect(JSON.stringify(lab.state()) === s1, "the two paths left the desk in different states");
      },
    };
    out[`${name}: the keyboard steps through targets and drops`] = {
      construction: c.id,
      drag: true,
      play: async (expect) => {
        const before = JSON.stringify(lab.state());
        const r = await lab.keyboard(key, 2);
        await lab.idle();
        expect(shows(r).length >= 1, "the arrow keys showed no target");
        expect(r.landed !== null && r.landed === shows(r).at(-1)!.id, `landed on ${r.landed ?? "home"}, the indicator showed ${shows(r).at(-1)?.id ?? "nothing"}`);
        expect(JSON.stringify(lab.state()) !== before || r.landed !== null, "nothing changed");
        // Snap: the keyboard snaps into a slot only once the others have made room there, as the pointer does.
        const snapped = (r.snaps ?? []).find((e) => e.id !== null);
        if (lab.preview() === "snap" && snapped) expect(gated(r) === null, `${gated(r)}`);
      },
    };
  }
  out["D · drag model: the strip scrolls at the stage's edge, the indicator hidden while it does"] = {
    construction: "strip",
    drag: true,
    play: async (expect) => {
      lab.focus(1);
      await lab.idle();
      const W = lab.size().width;
      let edgeFrom = 0;
      let edgeTo = 0;
      const r = await lab.path(DRAGGED.strip, (g) => {
        const toEdge = through([g, { x: W - 12, y: 300 }], 0.8);
        edgeFrom = toEdge.at(-1)![0];
        const held = hold(toEdge, 700);
        edgeTo = held.at(-1)![0];
        return hold(through([{ x: W - 12, y: 300 }, { x: W / 2, y: 300 }], 0.8, edgeTo), 500);
      });
      await lab.idle();
      expect((lab.state().stripScroll ?? 0) > 0, "the strip didn't scroll");
      const during = shows(r).filter((e) => e.t > edgeFrom + 50 && e.t < edgeTo);
      expect(during.length === 0, `the indicator showed ${during.map((e) => e.id).join(", ")} while the strip scrolled`);
    },
  };
  const flash = flashOf;
  const sequence = (r: DragResult): string => r.log.map((e) => `${e.id ?? (e.flying ? "flying" : "none")}@${Math.round(e.t)}`).join(" → ");
  // Each path below shows a flash when the switch hold is 0 (checked against the pure model); the hold prevents it.
  out["B · drag model: a slow diagonal across the centre's corner shows no indicator for under 150 ms"] = {
    construction: "tree",
    drag: true,
    play: async (expect) => {
      const key = DRAGGED.tree;
      // Where the centre's left part meets its two right regions: the corner below the top right region.
      const tr = lab.targets(key).find((t) => t.id === "tile:C:1");
      if (!tr) return expect(false, "no centre region to cross");
      const corner = { x: tr.hit.x - G / 2, y: tr.hit.y + tr.hit.height + G / 2 };
      const from = { x: corner.x - 63, y: corner.y + 58 };
      const to = { x: corner.x + 107, y: corner.y - 68 };
      const r = await lab.path(key, (g) => {
        const there = hold(through([g, from], 0.8), 400);
        return hold([...there, ...through([from, to], 0.28, there.at(-1)![0]).slice(1)], 400);
      });
      expect(flash(r) === null, `${flash(r)}: ${sequence(r)}`);
    },
  };
  out["D · drag model: a slow sweep across the strip shows every indicator for 150 ms or more"] = {
    construction: "strip",
    drag: true,
    play: async (expect) => {
      const W = lab.size().width;
      // Across the columns at 0.4 px/ms, clear of the edge scroll.
      const r = await lab.path(DRAGGED.strip, (g) => {
        const there = hold(through([g, { x: DRAG.EDGE + 20, y: 300 }], 0.8), 300);
        return hold([...there, ...through([{ x: DRAG.EDGE + 20, y: 300 }, { x: W - DRAG.EDGE - 20, y: 300 }], 0.4, there.at(-1)![0]).slice(1)], 400);
      });
      expect(flash(r) === null, `${flash(r)}: ${sequence(r)}`);
    },
  };
  /** The first snap, if it came only once the indicator had shown for the room delay (a frame's slack), else why not. */
  const gated = (r: DragResult): string | null => {
    const snap = (r.snaps ?? []).find((e) => e.id !== null);
    if (!snap) return "the item never snapped";
    const showed = r.log.filter((e) => e.id === snap.id && e.t <= snap.t).at(-1);
    if (!showed) return `the item snapped into ${snap.id} at ${Math.round(snap.t)} ms with no indicator on it`;
    return snap.t - showed.t >= DRAG.ROOM_AFTER - 1000 / 60 ? null : `the item snapped into ${snap.id} ${Math.round(snap.t - showed.t)} ms after the indicator showed it, before the room was made`;
  };
  // The dragged item is the real one: on a drop it starts settling from where it was let go (never from home, never
  // a frame elsewhere), and a snapped item let go in its slot doesn't move again.
  const landings = [
    ["A", "docks", DRAGGED.docks, "panel"],
    ["D", "strip", "doc:2", "document"],
  ] as const;
  for (const [short, cid, key, what] of landings) {
    out[`${short} · a dropped ${what} starts its landing where it was let go`] = {
      construction: cid,
      size: cid === "strip" ? [1440, 560] : undefined,
      drag: true,
      play: async (expect) => {
        const all = lab.targets(key);
        const goal = cid === "docks" ? all.find((t) => t.id === "dock:left:0") : all.find((t) => t.id.startsWith("into:") && t.id.endsWith(":1") && t.hit.width > 300);
        if (!goal) return expect(false, "no target to drop on");
        const r = await lab.drag(key, () => mid(goal.hit));
        await lab.idle();
        expect(r.landed === goal.id, `landed on ${r.landed ?? "home"}, not ${goal.id}`);
        const from = r.landingFrom;
        const off = from && r.atRelease ? Math.max(Math.abs(from.x - r.atRelease.x), Math.abs(from.y - r.atRelease.y), Math.abs(from.width - r.atRelease.width), Math.abs(from.height - r.atRelease.height)) : Infinity;
        expect(off <= 2, `let go at ${r.atRelease ? fmt(r.atRelease) : "?"}, the landing starts at ${from ? fmt(from) : "?"} (${Math.round(off)} px off)`);
        if (lab.preview() === "snap" && (r.snaps ?? []).some((e) => e.id !== null)) {
          const landed = lab.layout().items.get(key)!.rect;
          expect(!!r.atRelease && sameRect(r.atRelease, landed), `snapped in its slot, it still moved after the release: from ${r.atRelease ? fmt(r.atRelease) : "?"} to ${fmt(landed)}`);
        }
      },
    };
  }
  out["A · snap: the item glides into the slot the model shows, its size revealed"] = {
    construction: "docks",
    drag: true,
    preview: "snap",
    play: async (expect) => {
      const key = DRAGGED.docks;
      const all = lab.targets(key);
      const a = all.find((t) => t.id === "dock:left:0");
      if (!a) return expect(false, "no left dock slot");
      const r = await lab.drag(key, () => mid(a.hit));
      await lab.idle();
      expect(gated(r) === null, `${gated(r)}`);
      expect((r.snaps ?? []).filter((e) => e.id !== null).length === 1, `the item snapped ${(r.snaps ?? []).filter((e) => e.id !== null).map((e) => e.id).join(", ")}`);
      const landed = lab.layout().items.get(key)!.rect;
      expect(!!r.atRelease && sameRect(r.atRelease, landed), `the item was let go at ${r.atRelease ? fmt(r.atRelease) : "nowhere"}, its slot is ${fmt(landed)}`);
      expect(r.landed === a.id, `landed on ${r.landed ?? "home"}, not ${a.id}`);
    },
  };
  out["C · drag model: a release just after moving to another tab of the strip lands at the pointer's tab"] = {
    construction: "navigator",
    drag: true,
    play: async (expect) => {
      const key = DRAGGED.navigator;
      const strip = lab.targets(key).find((t) => t.id === "tabs:left");
      if (!strip) return expect(false, "no left tab strip");
      // Three places in the strip (two tabs and the new one): aim at the first until it shows (and, snapping, the
      // item sits in it), then move slowly to the last and let go on arrival, before the room has moved there.
      const tw = strip.hit.width / 3;
      const first = { x: strip.hit.x + tw / 2, y: mid(strip.hit).y };
      const last = { x: strip.hit.x + tw * 2.5, y: mid(strip.hit).y };
      const r = await lab.path(key, (g) => {
        const there = hold(through([g, first], 0.8), 600);
        return [...there, ...through([first, last], 0.3, there.at(-1)![0]).slice(1)];
      });
      await lab.idle();
      expect(r.landed === "tabs:left", `landed on ${r.landed ?? "home"}, not the left tab strip`);
      const left = lab.state().left;
      expect(left.indexOf(3) === left.length - 1, `Notes is tab ${left.indexOf(3) + 1} of ${left.length}, not the last (where the pointer was)`);
    },
  };
  out["A · snap: a snapped item follows its slot when the stage is resized under the drag"] = {
    construction: "docks",
    drag: true,
    preview: "snap",
    play: async (expect) => {
      const key = DRAGGED.docks;
      const a = lab.targets(key).find((t) => t.id === "dock:left:0");
      if (!a) return expect(false, "no left dock slot");
      let resizeAt = 0;
      const r = await lab.path(
        key,
        (g) => {
          const there = hold(through([g, mid(a.hit)], 0.8), 600);
          resizeAt = there.at(-1)![0];
          return hold(there, 700);
        },
        { at: [{ t: () => resizeAt, run: () => lab.setSize(1200, 680) }] },
      );
      await lab.idle();
      expect(lab.size().width === 1200, "the stage wasn't resized");
      const landed = lab.layout().items.get(key)!.rect;
      expect(r.landed === a.id, `landed on ${r.landed ?? "home"}, not ${a.id}`);
      expect(!!r.atRelease && sameRect(r.atRelease, landed), `the item was let go at ${r.atRelease ? fmt(r.atRelease) : "nowhere"}, its slot after the resize is ${fmt(landed)}`);
    },
  };
  out["A · snap: flying off a snapped slot glides the item back to the pointer within the settle tempo"] = {
    construction: "docks",
    drag: true,
    preview: "snap",
    play: async (expect) => {
      const key = DRAGGED.docks;
      const all = lab.targets(key);
      const a = all.find((t) => t.id === "dock:left:1");
      if (!a) return expect(false, "no left dock slot");
      const empty = { x: lab.size().width / 2, y: lab.size().height / 3 };
      let stop = 0;
      const r = await lab.path(key, (g) => {
        const there = hold(through([g, mid(a.hit)], 0.8), 600);
        const flick = [...there, ...through([mid(a.hit), empty], 2.5, there.at(-1)![0]).slice(1)];
        stop = flick.at(-1)![0];
        return hold(flick, 500);
      });
      expect(gated(r) === null, `${gated(r)}`);
      const off = (r.snaps ?? []).find((e) => e.id === null);
      expect(!!off && !!off.flying, `the item didn't leave its slot as the pointer flew off: ${(r.snaps ?? []).map((e) => `${e.id ?? (e.flying ? "flying" : "none")}@${Math.round(e.t)}`).join(" → ")}`);
      // Once the pointer stops, the way left closes as a settle does: within its 99 % time (and a frame of slack, the
      // frames being read before each step), at most 1 % of it is left; and the item ends up held under the pointer.
      const lifted = (r.frames ?? []).find((f) => f.t < stop);
      const g = r.grab ?? { x: 0, y: 0 };
      const gap = (f: NonNullable<DragResult["frames"]>[number]): number =>
        Math.max(Math.abs(f.item.x - (f.x - g.x)), Math.abs(f.item.y - (f.y - g.y)), Math.abs(f.item.width - lifted!.item.width), Math.abs(f.item.height - lifted!.item.height));
      const tempo = (2 * Math.log(10) * 1000) / 25;
      const atStop = (r.frames ?? []).find((f) => f.t >= stop);
      const later = (r.frames ?? []).find((f) => f.t >= stop + tempo + 1000 / 60);
      const last = (r.frames ?? []).at(-1);
      expect(!!lifted && !!atStop && !!later && gap(later) <= 0.01 * gap(atStop) + 0.5, `${atStop ? Math.round(gap(atStop)) : "?"} px from the pointer when it stopped, still ${later ? gap(later).toFixed(1) : "?"} px ${Math.round(tempo)} ms later`);
      expect(!!last && gap(last) < 0.5, `the item isn't under the pointer at the end (${last ? gap(last).toFixed(1) : "?"} px off)`);
    },
  };
  out["A · drag model: a flick from a slot into empty space hides the indicator within a frame"] = {
    construction: "docks",
    drag: true,
    play: async (expect) => {
      const key = DRAGGED.docks;
      const all = lab.targets(key);
      const a = all.find((t) => t.id === "dock:left:1");
      const empty = { x: lab.size().width / 2, y: lab.size().height / 3 };
      if (!a) return expect(false, "no left dock slot");
      expect(rawTarget(all, empty) === null, `(${empty.x}, ${empty.y}) is in ${rawTarget(all, empty)?.id}, not empty space`);
      const start = mid(a.hit);
      let flick = 0;
      const r = await lab.path(key, (g) => {
        const there = hold(through([g, start], 0.8), 600);
        flick = there.at(-1)![0];
        return hold([...there, ...through([start, empty], 2.5, flick).slice(1)], 300);
      });
      const frames = (r.frames ?? []).filter((f) => f.t > flick);
      const fast = frames.find((f) => f.speed >= DRAG.AIM_SPEED)?.t;
      const out = frames.find((f) => !within(a.hit, f, DRAG.BAND))?.t;
      const off = r.log.find((e) => e.t > flick && e.id === null)?.t;
      const due = Math.max(fast ?? Infinity, out ?? Infinity);
      expect(r.log.filter((e) => e.t <= flick).at(-1)?.id === a.id, `aiming didn't show ${a.id}: ${sequence(r)}`);
      // Not kept for the gap grace: flying out of its band, it goes at once.
      expect(off !== undefined && off <= due + 1000 / 60 + 1, `fast at +${Math.round((fast ?? NaN) - flick)} ms, out of the band at +${Math.round((out ?? NaN) - flick)}, off at +${Math.round((off ?? NaN) - flick)}: ${sequence(r)}`);
    },
  };
  for (const [cid, key] of [["docks", DRAGGED.docks], ["tree", DRAGGED.tree], ["strip", DRAGGED.strip]] as const) {
    for (const speed of [2.5, 4]) {
      out[`${cid === "docks" ? "A" : cid === "tree" ? "B" : "D"} · drag model: aim, then a ${speed} px/ms flick hides the indicator within a frame`] = {
        construction: cid,
        drag: true,
        play: async (expect) => {
          const grip = lab.grip(key)!;
          const all = lab.targets(key);
          const ts = all.filter((t) => t.prio <= 2 && !within(t.hit, grip, 12) && mid(t.hit).x > 0 && mid(t.hit).x < lab.size().width);
          // A target whose centre is clear of the band of every target as precise: aiming there shows it, whatever the way in.
          const a = ts.find((t) => all.every((o) => o.id === t.id || o.prio > t.prio || !within(o.hit, mid(t.hit), DRAG.BAND)));
          const b = a && ts.filter((t) => t !== a).sort((x, y) => dist(mid(x.hit), mid(a.hit)) - dist(mid(y.hit), mid(a.hit)))[0];
          if (!a || !b) return expect(false, "no two neighbouring targets");
          // Aim at A for 600 ms, then flick 300 px through its neighbour.
          const start = mid(a.hit);
          const d = { x: mid(b.hit).x - start.x, y: mid(b.hit).y - start.y };
          const len = Math.hypot(d.x, d.y);
          const end = { x: start.x + (d.x / len) * 300, y: start.y + (d.y / len) * 300 };
          let flick = 0;
          const r = await lab.path(key, (g) => {
            const there = hold(through([g, start], 0.8), 600);
            flick = there.at(-1)![0];
            return hold([...there, ...through([start, end], speed, flick).slice(1)], 300);
          });
          const before = r.log.filter((e) => e.t <= flick).at(-1);
          expect(before?.id === a.id, `aiming showed ${before?.id ?? "nothing"}, not ${a.id}: ${sequence(r)}`);
          const frames = (r.frames ?? []).filter((f) => f.t > flick);
          const fast = frames.find((f) => f.speed >= DRAG.AIM_SPEED)?.t;
          const out = frames.find((f) => !within(a.hit, f, DRAG.BAND))?.t;
          const off = r.log.find((e) => e.t > flick && e.id === null)?.t;
          // The indicator stays while its target holds; once the pointer is both fast and out of the band, it goes.
          const due = Math.max(fast ?? Infinity, out ?? Infinity);
          expect(off !== undefined && off <= due + 1000 / 60 + 1, `fast at +${Math.round((fast ?? NaN) - flick)} ms, out of the band at +${Math.round((out ?? NaN) - flick)}, off at +${Math.round((off ?? NaN) - flick)}: ${sequence(r)}`);
        },
      };
    }
  }
  out["A · drag model: a 14 px wobble between two dock slots changes the indicator at most once"] = {
    construction: "docks",
    drag: true,
    play: async (expect) => {
      const key = DRAGGED.docks;
      const all = lab.targets(key);
      // Two dock slots one above the other: the border between them.
      const pair = all.filter((t) => t.id.startsWith("dock:")).flatMap((a) => all.filter((b) => b.id.startsWith("dock:") && Math.abs(b.hit.y - (a.hit.y + a.hit.height)) < 1 && Math.abs(b.hit.x - a.hit.x) < 1).map((b) => [a, b] as const))[0];
      if (!pair) return expect(false, "no two dock slots one above the other");
      const p = { x: pair[0].hit.x + pair[0].hit.width / 2, y: pair[1].hit.y };
      const r = await lab.path(key, (g) => {
        const keys = through([g, p], 0.9);
        let t = keys.at(-1)![0];
        for (let i = 0; i < 20; i++) {
          t += 60;
          keys.push([t, p.x, p.y + (i % 2 ? -14 : 14)]);
        }
        return hold(keys, 400);
      });
      const changes = shows(r).length - 1;
      expect(changes <= 1, `the indicator changed ${changes} times: ${sequence(r)}`);
      expect(flash(r) === null, `${flash(r)}: ${sequence(r)}`);
      const snapChanges = (r.snaps ?? []).filter((e) => e.id !== null).length - 1;
      expect(snapChanges <= 1, `the item snapped ${snapChanges + 1} times in the wobble`);
    },
  };
  out["A · drag model: a release inside the shown slot's band lands on it, not on the neighbour under the pointer"] = {
    construction: "docks",
    drag: true,
    play: async (expect) => {
      const key = DRAGGED.docks;
      const all = lab.targets(key);
      const pair = all.filter((t) => t.id.startsWith("dock:")).flatMap((a) => all.filter((b) => b.id.startsWith("dock:") && Math.abs(b.hit.y - (a.hit.y + a.hit.height)) < 1 && Math.abs(b.hit.x - a.hit.x) < 1).map((b) => [a, b] as const))[0];
      if (!pair) return expect(false, "no two dock slots one above the other");
      const [a, b] = pair;
      const aim = mid(a.hit);
      // Aim at A until it shows and makes room, then slide 6 px into B (inside A's band) and let go at once.
      const into = { x: aim.x, y: b.hit.y + 6 };
      const r = await lab.path(key, (g) => {
        const there = hold(through([g, aim], 0.8), 500);
        return [...there, ...through([aim, into], 1.5, there.at(-1)![0]).slice(1)];
      });
      expect(rawTarget(all, into)?.id === b.id, `the release point is under ${rawTarget(all, into)?.id}, not ${b.id}`);
      expect(shows(r).at(-1)?.id === a.id, `the indicator last showed ${shows(r).at(-1)?.id ?? "nothing"}, not ${a.id}: ${sequence(r)}`);
      expect(r.landed === a.id, `landed on ${r.landed ?? "home"}, not on the shown ${a.id}`);
    },
  };
  /** A path to the left edge, held there `ms` (the strip scrolls), with the time it leaves the edge. */
  const toLeftEdge = (g: Point, ms: number): PathKey[] => hold(through([g, { x: 12, y: 300 }], 0.8), ms);
  out["D · drag model: after an edge scroll, the item's home has moved with the strip"] = {
    construction: "strip",
    docs: 4,
    drag: true,
    play: async (expect) => {
      const r = await lab.path(DRAGGED.strip, (g) => {
        const edge = toLeftEdge(g, 900);
        return hold([...edge, ...through([{ x: 12, y: 300 }, { x: 830, y: 100 }], 0.8, edge.at(-1)![0]).slice(1)], 500);
      });
      await lab.idle();
      expect(r.landed !== null, "the release at (830, 100) after the scroll settled home, as if the home had stayed put");
    },
  };
  out["D · drag model: a flick right after an edge scroll shows no indicator"] = {
    construction: "strip",
    docs: 4,
    drag: true,
    play: async (expect) => {
      let edgeEnd = 0;
      const r = await lab.path(DRAGGED.strip, (g) => {
        const edge = toLeftEdge(g, 700);
        edgeEnd = edge.at(-1)![0];
        return [...edge, ...through([{ x: 12, y: 300 }, { x: lab.size().width - 60, y: 300 }], 2.5, edgeEnd).slice(1)];
      });
      await lab.idle();
      const after = shows(r).filter((e) => e.t > edgeEnd);
      expect(after.length === 0, `the indicator showed ${after.map((e) => `${e.id} at ${Math.round(e.t - edgeEnd)} ms`).join(", ")} during the flick`);
    },
  };
  out["D · drag model: Escape after an edge scroll puts the scroll back"] = {
    construction: "strip",
    docs: 4,
    drag: true,
    play: async (expect) => {
      const before = JSON.stringify(lab.state());
      let edgeEnd = 0;
      await lab.path(
        DRAGGED.strip,
        (g) => {
          const edge = toLeftEdge(g, 700);
          edgeEnd = edge.at(-1)![0];
          return hold(edge, 100);
        },
        { escapeAt: () => edgeEnd + 50 },
      );
      await lab.idle();
      expect(JSON.stringify(lab.state()) === before, `the desk isn't as it was: stripScroll ${lab.state().stripScroll}`);
    },
  };
  return out;
}

/** One drag (or more) per construction, onto the drop targets its rules have. */
function drags(lab: DeskLab): Record<string, Scenario> {
  const r = readers(lab);
  const drag = (key: string, to: () => Point, opts?: { escapeAt?: number }) => lab.drag(key, to, opts);
  const rectOf = (key: string): Rect => r.at(key)!.rect;
  const list = (l: readonly (number | string)[]): string => l.join(",") || "nothing";
  return {
    "A · drag Notes to the top of the left dock": {
      construction: "docks",
      drag: true,
      play: async (expect) => {
        await drag(P.notes, () => ({ x: rectOf(P.files).x + 60, y: rectOf(P.files).y + 8 }));
        await lab.idle();
        expect(lab.state().left[0] === 3, `left dock: ${list(lab.state().left)}`);
        settledAsLaidOut(lab, expect);
      },
    },
    "A · drop a panel on a folded dock's rail": {
      construction: "docks",
      size: [760, 560],
      drag: true,
      play: async (expect) => {
        await drag(P.files, () => ({ x: 760 - 17, y: 30 }));
        await lab.idle();
        expect(lab.state().right.includes(1), `right dock: ${list(lab.state().right)}`);
        expect(r.hidden(P.files), "Files didn't fold into the rail with its dock");
        settledAsLaidOut(lab, expect);
      },
    },
    "A2 · drag Files into the full-width bottom dock": {
      construction: "docksFull",
      drag: true,
      play: async (expect) => {
        await drag(P.files, () => ({ x: rectOf(P.history).x + 30, y: rectOf(P.history).y + 40 }));
        await lab.idle();
        expect(lab.state().bottom[0] === 1, `bottom dock: ${list(lab.state().bottom)}`);
        settledAsLaidOut(lab, expect);
      },
    },
    "B · drag Inspector just under Files: it goes between Files and Outline": {
      construction: "tree",
      drag: true,
      play: async (expect) => {
        // A tree zone is where the item lands: between Files and Outline starts right under Files.
        await drag(P.inspector, () => {
          const f = rectOf(P.files);
          return { x: f.x + f.width / 2, y: f.y + f.height + G + 12 };
        });
        await lab.idle();
        expect(list(lab.state().tree.L) === "panel:1,panel:4,panel:2", `left column: ${list(lab.state().tree.L)}`);
        settledAsLaidOut(lab, expect);
      },
    },
    "C · drag Notes from the right tab row into the left one": {
      construction: "navigator",
      drag: true,
      play: async (expect) => {
        await drag(P.notes, () => {
          const t = rectOf("tabs:left");
          return { x: t.x + t.width / 2, y: t.y + 14 };
        });
        await lab.idle();
        const s = lab.state();
        expect(list(s.left) === "1,3,2" && s.active.left === 3, `left tabs: ${list(s.left)}, showing ${s.active.left}`);
        expect(!r.hidden(P.notes) && r.hidden(P.files), "Notes isn't the left side's showing panel");
        settledAsLaidOut(lab, expect);
      },
    },
    "D · drag Notes into the first column, then Meeting notes under Quarterly plan": {
      construction: "strip",
      size: [1440, 560],
      drag: true,
      play: async (expect) => {
        await drag(P.notes, () => ({ x: rectOf(P.outline).x + 90, y: rectOf(P.outline).y + rectOf(P.outline).height - 10 }));
        await lab.idle();
        expect(list(lab.state().cols[0]!) === "panel:1,panel:2,panel:3", `first column: ${list(lab.state().cols[0]!)}`);
        await drag("doc:2", () => ({ x: rectOf("doc:1").x + rectOf("doc:1").width / 2, y: rectOf("doc:1").y + rectOf("doc:1").height - 30 }));
        await lab.idle();
        expect(lab.state().cols.some((c) => list(c) === "doc:1,doc:2"), `columns: ${lab.state().cols.map((c) => `[${list(c)}]`).join(" ")}`);
        settledAsLaidOut(lab, expect);
      },
    },
    "E · drag History into the left drawer's tab row": {
      construction: "drawers",
      drag: true,
      play: async (expect) => {
        await drag(P.history, () => {
          const t = rectOf("tabs:left");
          return { x: t.x + t.width - 10, y: t.y + 14 };
        });
        await lab.idle();
        const s = lab.state();
        expect(s.left.at(-1) === 5 && s.active.left === 5, `left drawer: ${list(s.left)}, showing ${s.active.left}`);
        settledAsLaidOut(lab, expect);
      },
    },
    "F1 · drag Outline anywhere, then into the top-right stack": {
      construction: "floatOver",
      drag: true,
      play: async (expect) => {
        await drag(P.outline, () => ({ x: 450, y: 300 }));
        await lab.idle();
        const f = lab.state().free.find((x) => x.id === 2);
        expect(!!f && Math.abs(f.at!.x - 410) < 1 && Math.abs(f.at!.y - 289) < 1, `Outline is free at ${f ? `${Math.round(f.at!.x)},${Math.round(f.at!.y)}` : "nowhere"}, not under the pointer`);
        await drag(P.outline, () => ({ x: rectOf(P.notes).x + 40, y: rectOf(P.notes).y + 6 }));
        await lab.idle();
        expect(lab.state().stacks.right[0] === 2, `right stack: ${list(lab.state().stacks.right)}`);
        settledAsLaidOut(lab, expect);
      },
    },
    "F2 · drag Notes under the left stack; the documents re-tile around": {
      construction: "floatAround",
      drag: true,
      play: async (expect) => {
        await drag(P.notes, () => ({ x: rectOf(P.outline).x + 40, y: rectOf(P.outline).y + rectOf(P.outline).height + 20 }));
        await lab.idle();
        expect(list(lab.state().stacks.left) === "1,2,3", `left stack: ${list(lab.state().stacks.left)}`);
        for (const [k, d] of r.docs()) for (const id of [1, 2, 3, 4, 5]) expect(overlap(rectOf(`panel:${id}`), d) < 1, `panel ${id} covers ${k}`);
        settledAsLaidOut(lab, expect);
      },
    },
    "F3 · tear Notes off, then dock it back on its rail icon": {
      construction: "dockTear",
      drag: true,
      play: async (expect) => {
        await drag(P.notes, () => ({ x: 450, y: 250 }));
        await lab.idle();
        expect(lab.state().torn.some((f) => f.id === 3) && !lab.state().right.includes(3), "Notes didn't tear off");
        expect(r.at(P.notes)!.layer > 2, "the torn-off Notes doesn't float over the documents");
        await drag(P.notes, () => ({ x: lab.size().width - 17, y: 22 }));
        await lab.idle();
        expect(lab.state().right.includes(3) && !lab.state().torn.some((f) => f.id === 3), `right dock: ${list(lab.state().right)}`);
        settledAsLaidOut(lab, expect);
      },
    },
    "F3 · a torn-off panel low on the stage shades when the height runs out": {
      construction: "dockTear",
      drag: true,
      play: async (expect) => {
        // Low, but above the bottom dock's drop zone.
        await drag(P.inspector, () => ({ x: 450, y: 300 }));
        await lab.idle();
        expect(r.look(P.inspector) === "float", `Inspector is ${r.look(P.inspector)}, not floating at full height`);
        await r.resize(960, 420);
        expect(r.look(P.inspector) === "header", `Inspector is ${r.look(P.inspector)} at 420, not shaded`);
        expect(r.notes().includes("floating panel shaded"), `notes: ${r.notes()}`);
        settledAsLaidOut(lab, expect);
      },
    },
    "F3 · Escape mid-drag puts everything back": {
      construction: "dockTear",
      drag: true,
      play: async (expect) => {
        const before = JSON.stringify(lab.state());
        const rects = [...lab.layout().items].map(([k, p]) => [k, { ...p.rect }] as const);
        await drag(P.notes, () => ({ x: 120, y: 200 }), { escapeAt: 0.7 });
        await lab.idle();
        expect(JSON.stringify(lab.state()) === before, "the desk isn't as it was before the lift");
        for (const [k, rr] of rects) expect(sameRect(r.at(k)!.rect, rr), `${k} isn't back home`);
        settledAsLaidOut(lab, expect);
      },
    },
  };
}

/** Readers of the page's current layout. */
function readers(lab: DeskLab) {
  const at = (key: string) => lab.layout().items.get(key);
  return {
    at,
    look: (key: string) => at(key)?.look,
    hidden: (key: string) => !!at(key)?.hidden,
    notes: () => lab.layout().notes.join("; "),
    docs: () => [...lab.layout().items].filter(([k]) => k.startsWith("doc:")).map(([k, p]) => [k, p.rect] as const),
    resize: async (w: number, h: number) => {
      lab.setSize(w, h);
      await lab.idle();
    },
  };
}

const P = { files: "panel:1", outline: "panel:2", notes: "panel:3", inspector: "panel:4", history: "panel:5" } as const;

/** Each construction's rules for running out of height and of width, played by resizing the stage. */
function giveWay(lab: DeskLab): Record<string, Scenario> {
  const r = readers(lab);
  return {
    "A · height: least recently used sections fold to headers": {
      construction: "docks",
      options: { bottom: "off" },
      play: async (expect) => {
        lab.touch(3);
        await r.resize(960, 420);
        expect(r.look(P.inspector) === "header", `Inspector (least recently used) is ${r.look(P.inspector)}, not folded`);
        expect(r.look(P.notes) === "section" && r.look(P.history) === "section", "Notes or History folded though Inspector was enough");
        expect(r.notes().includes("1 section folded"), `notes: ${r.notes()}`);
        await r.resize(960, 560);
        expect(r.look(P.inspector) === "section", "Inspector didn't unfold when the height came back");
        settledAsLaidOut(lab, expect);
      },
    },
    "A · height: the bottom dock folds to its header": {
      construction: "docks",
      play: async (expect) => {
        await r.resize(960, 420);
        expect(r.look(P.history) === "header" && Math.abs(r.at(P.history)!.rect.height - 22) < 0.5, `History is ${r.look(P.history)}, ${Math.round(r.at(P.history)!.rect.height)} px tall`);
        expect(r.notes().includes("bottom dock folded to its header"), `notes: ${r.notes()}`);
        settledAsLaidOut(lab, expect);
      },
    },
    "A · width: the right dock folds to its rail first, then the left": {
      construction: "docks",
      play: async (expect) => {
        await r.resize(760, 560);
        expect(r.hidden(P.notes) && r.hidden(P.inspector) && !r.hidden(P.files), "at 760 the right dock isn't the only one folded");
        await r.resize(520, 560);
        expect(r.hidden(P.files) && r.hidden(P.outline), "at 520 the left dock didn't fold too");
        expect(r.notes().includes("left dock folded to its rail"), `notes: ${r.notes()}`);
        await r.resize(960, 560);
        expect(!r.hidden(P.files) && !r.hidden(P.notes), "the docks didn't open again at 960");
        settledAsLaidOut(lab, expect);
      },
    },
    "A · a rail icon opens its dock; the other one folds instead": {
      construction: "docks",
      size: [760, 560],
      play: async (expect) => {
        expect(r.hidden(P.notes), "the right dock didn't start folded at 760");
        lab.icon("right", 3);
        await lab.idle();
        expect(!r.hidden(P.notes) && r.hidden(P.files), "opening the right dock didn't fold the left one instead");
        lab.icon("right", 3);
        await lab.idle();
        expect(r.hidden(P.notes), "a second click didn't fold the right dock again");
        settledAsLaidOut(lab, expect);
      },
    },
    "A2 · the bottom dock keeps the full width; the side docks end above it": {
      construction: "docksFull",
      play: async (expect) => {
        await r.resize(520, 560);
        const b = r.at(P.history)!.rect;
        expect(Math.abs(b.x - 6) < 0.5 && Math.abs(b.width - (520 - 12)) < 0.5, `the bottom dock is at ${fmt(b)}, not the full width`);
        const rail = r.at("rail:left")!.rect;
        expect(rail.y + rail.height <= b.y + 0.5, `the left rail runs down to ${Math.round(rail.y + rail.height)}, under the bottom dock at ${Math.round(b.y)}`);
        expect(r.hidden(P.files) && r.hidden(P.notes), "both side docks should fold at 520");
        await r.resize(960, 420);
        expect(r.look(P.history) === "header", "the bottom dock didn't fold to its header at 420");
        expect(r.at("rail:left")!.rect.height > rail.height, "the side docks didn't grow when the bottom dock folded");
        settledAsLaidOut(lab, expect);
      },
    },
    "B · width: the newest tile that breaks a minimum floats": {
      construction: "tree",
      play: async (expect) => {
        expect(!r.notes().includes("float"), `something floats at 960: ${r.notes()}`);
        await r.resize(760, 560);
        expect(r.look("doc:2") === "doc" && r.at("doc:2")!.layer > 1, "Meeting notes (the newest) didn't float");
        expect(r.notes().includes("Meeting notes"), `notes: ${r.notes()}`);
        await r.resize(960, 560);
        expect(r.at("doc:2")!.layer === 1, "Meeting notes didn't tile again at 960");
        settledAsLaidOut(lab, expect);
      },
    },
    "B · height: the newest tile floats": {
      construction: "tree",
      play: async (expect) => {
        await r.resize(960, 320);
        expect(r.notes().includes("float"), `nothing floats at 320: ${r.notes()}`);
        settledAsLaidOut(lab, expect);
      },
    },
    "B · narrow start: the side columns start on their rails, the documents tile; a rail icon opens its column": {
      construction: "tree",
      size: [520, 700],
      play: async (expect) => {
        const floating = (): string[] => [...lab.layout().items].filter(([k, p]) => /^(panel|doc):/.test(k) && !p.hidden && p.layer > LAYER.dock).map(([k]) => k);
        expect(floating().length === 0, `floating at the start: ${floating().join(", ")}`);
        expect(!r.hidden("rail:left") && !r.hidden("rail:right") && r.hidden(P.files) && r.hidden(P.notes), "the side columns didn't start on their rails");
        for (const [k, d] of r.docs()) expect(d.width >= 240 - 0.5, `${k} is ${Math.round(d.width)} wide`);
        lab.icon("left", 1);
        await lab.idle();
        expect(!r.hidden(P.files) && !r.hidden(P.outline), "the left rail icon didn't open its column");
        settledAsLaidOut(lab, expect);
      },
    },
    "C · width: the sides fold to icon tabs; height changes nothing": {
      construction: "navigator",
      play: async (expect) => {
        await r.resize(760, 560);
        expect(r.hidden(P.inspector) && !r.hidden("rail:right") && !r.hidden(P.files), "at 760 only the inspector side should fold to icon tabs");
        await r.resize(520, 560);
        expect(r.hidden(P.files) && !r.hidden("rail:left"), "at 520 the navigator side didn't fold");
        await r.resize(960, 320);
        expect(r.notes() === "", `height gave way: ${r.notes()}`);
        expect(!r.hidden(P.files) && !r.hidden(P.inspector), "the sides didn't come back at 960");
        settledAsLaidOut(lab, expect);
      },
    },
    "D · height: a column splits in two": {
      construction: "strip",
      play: async (expect) => {
        await r.resize(960, 380);
        expect(r.notes().includes("split into two columns"), `notes: ${r.notes()}`);
        expect(Math.abs(r.at(P.notes)!.rect.x - r.at(P.history)!.rect.x) > 1, "Notes and History are still in one column");
        await r.resize(960, 560);
        expect(Math.abs(r.at(P.notes)!.rect.x - r.at(P.history)!.rect.x) < 0.5, "the column didn't join again at 560");
        settledAsLaidOut(lab, expect);
      },
    },
    "D · width: the strip scrolls to the focus": {
      construction: "strip",
      play: async (expect) => {
        expect(!r.hidden("thumb"), "the strip doesn't scroll at 960");
        lab.focus(1);
        await lab.idle();
        const before = r.at("doc:1")!.rect.x;
        lab.focus(2);
        await lab.idle();
        const d2 = r.at("doc:2")!.rect;
        expect(r.at("doc:1")!.rect.x < before - 1, "the strip didn't scroll toward Meeting notes");
        expect(d2.x >= -0.5 && d2.x + d2.width <= 960.5, `the focused document is at ${fmt(d2)}, not on screen`);
        await r.resize(1440, 560);
        expect(r.hidden("thumb"), "the strip still scrolls at 1440");
        settledAsLaidOut(lab, expect);
      },
    },
    "E · width: drawers slide over instead of pushing": {
      construction: "drawers",
      size: [1440, 560],
      play: async (expect) => {
        const over = (key: string): boolean => r.at(key)!.layer > LAYER.dock;
        expect(!over(P.inspector), "the right drawer isn't docked at 1440");
        const wide = r.at("doc:1")!.rect.x;
        await r.resize(960, 560);
        expect(over(P.inspector) && !over(P.files), "at 960 the right drawer should slide over, the left still push");
        await r.resize(700, 560);
        expect(over(P.files), "at 700 the left drawer didn't slide over");
        expect(r.at("doc:1")!.rect.x < wide, "the documents didn't take the room the left drawer gave");
        await r.resize(960, 320);
        expect(!r.notes().includes("height"), "height gave way");
        settledAsLaidOut(lab, expect);
      },
    },
    "F1 · height: least recently used palettes shade; the documents never move": {
      construction: "floatOver",
      play: async (expect) => {
        const docs = r.docs();
        await r.resize(960, 420);
        expect(r.look(P.notes) === "header" && r.look(P.history) === "float", `Notes is ${r.look(P.notes)}, History ${r.look(P.history)}`);
        expect(r.notes().includes("shaded"), `notes: ${r.notes()}`);
        lab.setSize(960, 560);
        await lab.idle();
        for (const [k, rr] of docs) expect(sameRect(rr, r.at(k)!.rect), `${k} moved`);
        settledAsLaidOut(lab, expect);
      },
    },
    "F1 · width: narrow, the stacks merge in one corner": {
      construction: "floatOver",
      play: async (expect) => {
        await r.resize(600, 700);
        expect(Math.abs(r.at(P.files)!.rect.x - r.at(P.notes)!.rect.x) < 0.5, "Files and Notes aren't in one stack");
        expect(r.notes().includes("share the right corner"), `notes: ${r.notes()}`);
        settledAsLaidOut(lab, expect);
      },
    },
    "F2 · width: the documents get narrower; height: palettes shade": {
      construction: "floatAround",
      play: async (expect) => {
        const w = r.at("doc:1")!.rect.width;
        await r.resize(760, 560);
        expect(r.at("doc:1")!.rect.width < w - 1, "the documents didn't get narrower");
        for (const id of [1, 2, 3, 4, 5]) for (const [k, d] of r.docs()) expect(overlap(r.at(`panel:${id}`)!.rect, d) < 1, `panel ${id} covers ${k}`);
        await r.resize(760, 420);
        expect(r.notes().includes("shaded"), `notes: ${r.notes()}`);
        settledAsLaidOut(lab, expect);
      },
    },
    "F3 · as A: the docks fold to their rails, the bottom dock to its header; a torn-off panel stays out": {
      construction: "dockTear",
      drag: true,
      play: async (expect) => {
        // It starts fully docked: Inspector floats only once it is torn off.
        expect(lab.state().torn.length === 0 && lab.state().right.includes(4), "F3 doesn't start with Inspector docked");
        await lab.drag(P.inspector, () => ({ x: 450, y: 250 }));
        await lab.idle();
        const torn = r.at(P.inspector)!;
        expect(lab.state().torn.some((f) => f.id === 4) && torn.layer > LAYER.dock, "Inspector didn't tear off to float");
        expect(r.docs().some(([, d]) => overlap(d, torn.rect) > 1), "the torn-off Inspector doesn't float over a document");
        await r.resize(640, 420);
        expect(r.hidden(P.notes) && r.look(P.history) === "header", `Notes hidden: ${r.hidden(P.notes)}, History ${r.look(P.history)}`);
        expect(!r.hidden(P.inspector), "the torn-off Inspector folded with the dock");
        settledAsLaidOut(lab, expect);
      },
    },
  };
}

/** Folding, shading, rail icons and tabs by hand. */
function handMoves(lab: DeskLab): Record<string, Scenario> {
  const r = readers(lab);
  return {
    "A · fold and unfold a section": {
      construction: "docks",
      play: async (expect) => {
        const outline = r.at(P.outline)!.rect.height;
        lab.fold(1);
        await lab.idle();
        expect(r.look(P.files) === "header", "Files didn't fold");
        expect(r.at(P.outline)!.rect.height > outline + 1, "Outline didn't take the room Files gave");
        lab.fold(1);
        await lab.idle();
        expect(Math.abs(r.at(P.outline)!.rect.height - outline) < 0.5, "Outline didn't give the room back");
        settledAsLaidOut(lab, expect);
      },
    },
    "F1 · shade and unshade a palette": {
      construction: "floatOver",
      play: async (expect) => {
        lab.fold(2);
        await lab.idle();
        expect(r.look(P.outline) === "header", "Outline didn't shade");
        lab.fold(2);
        await lab.idle();
        expect(r.look(P.outline) === "float", "Outline didn't unshade");
        settledAsLaidOut(lab, expect);
      },
    },
    "C · a tab shows its panel": {
      construction: "navigator",
      play: async (expect) => {
        lab.tab("right", 5);
        await lab.idle();
        expect(!r.hidden(P.history) && r.hidden(P.inspector), "History isn't the one showing");
        expect(lab.shown(P.history) && !lab.shown(P.inspector), "the panels didn't cross-fade");
        settledAsLaidOut(lab, expect);
      },
    },
    "E · a rail icon closes and opens a drawer": {
      construction: "drawers",
      play: async (expect) => {
        const x = r.at("doc:1")!.rect.x;
        lab.icon("left", 1);
        await lab.idle();
        expect(r.hidden(P.files) && r.hidden("tabs:left"), "the left drawer didn't close");
        expect(r.at("doc:1")!.rect.x < x - 1, "the documents didn't take the room");
        lab.icon("left", 2);
        await lab.idle();
        expect(!r.hidden(P.outline) && r.hidden(P.files), "the drawer didn't open on Outline");
        settledAsLaidOut(lab, expect);
      },
    },
    "F3 · fold the left dock to its rail by hand": {
      construction: "dockTear",
      play: async (expect) => {
        lab.icon("left", 1);
        await lab.idle();
        expect(r.hidden(P.files) && r.hidden(P.outline), "the left dock didn't fold");
        lab.icon("left", 2);
        await lab.idle();
        expect(!r.hidden(P.outline), "the left dock didn't open again");
        settledAsLaidOut(lab, expect);
      },
    },
  };
}

const constructionTitle = (id: ConstructionId): string => CONSTRUCTIONS.find((c) => c.id === id)!.title;

/** The toolbar's four modes and the bottom dock's three, in every construction that has them. */
function modes(lab: DeskLab): Record<string, Scenario> {
  const r = readers(lab);
  const out: Record<string, Scenario> = {};
  for (const c of CONSTRUCTIONS.filter((x) => x.pill).map((x) => x.id)) {
    out[`toolbar modes · ${constructionTitle(c)}`] = {
      construction: c,
      play: async (expect) => {
        for (const m of [...TOOLBAR_MODES.slice(1), TOOLBAR_MODES[0]!]) {
          lab.setOptions(m);
          await lab.idle();
          const tb = r.at("toolbar")!.rect;
          const H = lab.size().height;
          expect(m.toolbar === "top" ? tb.y < H / 2 : tb.y > H / 2, `${m.toolbar}/${m.toolbarSpace}: the pill is at y ${Math.round(tb.y)}`);
          const covers = r.docs().some(([, d]) => overlap(d, tb) > 1);
          expect(m.toolbarSpace === "reserved" ? !covers : true, `${m.toolbar}/${m.toolbarSpace}: the reserved pill covers a document`);
          expect(m.toolbarSpace === "overlay" ? covers : true, `${m.toolbar}/${m.toolbarSpace}: the floating pill doesn't float over the documents`);
          settledAsLaidOut(lab, expect);
        }
      },
    };
  }
  for (const c of CONSTRUCTIONS.filter((x) => x.bottom).map((x) => x.id)) out[`bottom dock modes · ${constructionTitle(c)}`] = {
    construction: c,
    play: async (expect) => {
      lab.setOptions({ bottom: "overlay" });
      await lab.idle();
      const b = r.at(P.history)!;
      expect(b.layer > 2 && r.docs().some(([, d]) => overlap(d, b.rect) > 1), "the floating bottom dock doesn't float over the documents");
      lab.setOptions({ bottom: "off" });
      await lab.idle();
      const h = r.at(P.history)!.rect;
      expect(Math.abs(h.x - r.at(P.notes)!.rect.x) < 0.5, "with the bottom dock off, History isn't in the right dock");
      lab.setOptions({ bottom: "reserved" });
      await lab.idle();
      const b2 = r.at(P.history)!.rect;
      for (const [k, d] of r.docs()) expect(d.y + d.height <= b2.y + 0.5, `${k} runs under the reserved bottom dock`);
      settledAsLaidOut(lab, expect);
    },
  };
  return out;
}
