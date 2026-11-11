/**
 * The desk page's scripted scenarios: each sets a construction, a stage size and options up, plays a few moves
 * through the page (`DeskLab`) and states what it expects; the page records and checks every frame of every move.
 */
import type { Rect } from "@n-uf/motion";
import { overlap, type Point } from "../shared/geometry";
import { DRAG, rawTarget, within, type Target } from "./intent";
import { CONSTRUCTIONS, type ConstructionId } from "./layouts";
import { LAYER, type DeskState, type Layout, type Options, type Side, type Size } from "./model";

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
  path(key: string, path: (grip: Point) => readonly PathKey[], opts?: { escapeAt?: number | (() => number) }): Promise<DragResult>;
  /** A keyboard drag: pick `key` up, step `steps` targets on with the arrow key, then Enter. */
  keyboard(key: string, steps: number): Promise<DragResult>;
  /** The drop targets `key` would have if it were lifted now. */
  targets(key: string): Target[];
  /** Where a drag of `key` starts. */
  grip(key: string): Point | null;
  /** Start the scenario's desk afresh. */
  restart(): void;
}

/** A pointer path keyframe: ms from the lift, x, y. */
export type PathKey = readonly [number, number, number];

/** What a drag did: the indicator's targets (ms from the lift; null: hidden) and what it landed on (null: home). */
export interface DragResult {
  readonly log: readonly { readonly t: number; readonly id: string | null }[];
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
  /** It drags. */
  readonly drag?: boolean;
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
  Object.assign(scenarios, giveWay(lab), handMoves(lab), modes(lab), drags(lab), dragModel(lab));
  return scenarios;
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
        // A border: an edge of a target where the most precise target differs 5 px either side of it.
        let border: { p: Point; dx: number; dy: number } | null = null;
        for (const t of aimable(grip)) {
          const r = t.hit;
          const edges = [
            { p: { x: r.x + r.width / 2, y: r.y }, dx: 0, dy: 1 },
            { p: { x: r.x + r.width / 2, y: r.y + r.height }, dx: 0, dy: 1 },
            { p: { x: r.x, y: r.y + r.height / 2 }, dx: 1, dy: 0 },
            { p: { x: r.x + r.width, y: r.y + r.height / 2 }, dx: 1, dy: 0 },
          ];
          for (const e of edges) {
            const a = rawTarget(all, { x: e.p.x - 5 * e.dx, y: e.p.y - 5 * e.dy });
            const b = rawTarget(all, { x: e.p.x + 5 * e.dx, y: e.p.y + 5 * e.dy });
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
            const s = i % 2 ? -4 : 4;
            keys.push([t, b.p.x + s * b.dx, b.p.y + s * b.dy]);
          }
          return hold(keys, 200);
        });
        const changes = shows(r).length - 1;
        const seq = r.log.map((e) => `${e.id ?? "none"}@${Math.round(e.t)}`).join(" → ");
        expect(changes <= 1, `the indicator changed ${changes} times on the border: ${seq}`);
        expect(r.log.every((e, i) => e.id === null || !r.log[i + 1] || r.log[i + 1]!.t - e.t >= DRAG.FLASH), `an indicator showed for under ${DRAG.FLASH} ms: ${seq} (border at ${Math.round(b.p.x)},${Math.round(b.p.y)})`);
      },
    };
    out[`${name}: the same release point by two paths lands the same`] = {
      construction: c.id,
      drag: true,
      play: async (expect) => {
        const grip = lab.grip(key)!;
        const all = lab.targets(key);
        const home = lab.shown(key) ? lab.drawn(key) : null;
        // Aim points: a target's centre, away from the item's home and on the stage.
        const spots = all.map((t) => ({ t, p: mid(t.hit) })).filter(({ p }) => dist(p, grip) > 40 && !(home && within(home, p, 12)) && p.x > 0 && p.x < lab.size().width);
        // The release point lies outside the band of every target as precise as its own: no path can keep another one.
        const clear = (s: { t: Target; p: Point }): boolean => all.every((o) => o.id === s.t.id || o.prio > s.t.prio || !within(o.hit, s.p, DRAG.BAND));
        const goal = spots.find((s) => s.t.prio <= 2 && clear(s)) ?? spots.find(clear);
        // The detour: a target whose aim point is outside the goal's band, and that can't hold the release point (a
        // less precise one that covers it gives way to the goal there).
        const other =
          goal &&
          spots
            .filter((s) => s.t.id !== goal.t.id && !within(goal.t.hit, s.p, DRAG.BAND) && (s.t.prio > goal.t.prio || !within(s.t.hit, goal.p, DRAG.BAND)))
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
    "B · drag Inspector onto Files' lower edge": {
      construction: "tree",
      drag: true,
      play: async (expect) => {
        await drag(P.inspector, () => {
          const f = rectOf(P.files);
          return { x: f.x + f.width / 2, y: f.y + f.height * 0.8 };
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
        await r.resize(960, 320);
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
    "F3 · as A: the docks fold to their rails, the bottom dock to its header": {
      construction: "dockTear",
      play: async (expect) => {
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
