/**
 * The Tiling drag page's presets, in the lab's preset format (docs/lab-checks.md): each sets the page up, plays its
 * gesture through the host (the lab's own pick over the base, as a pointer would) and checks the page as drawn, in the
 * DOM, against `after(held)`, within 1 px.
 */
import type { Point, Rect } from "@n-uf/placement";
import type { TilingSubject } from "@n-uf/placement/tiling";
import { off, styleRect } from "../shared/geometry";
import { nameOf, type Host, type TreeId } from "./host";

export interface Verdict {
  readonly pass: boolean;
  readonly now: string;
}

export interface Preset {
  readonly id: string;
  readonly title: string;
  readonly expected: string;
  readonly pending?: boolean;
  readonly lacks?: string;
  setup(h: Host): void;
  check(h: Host): Verdict;
}

const mid = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const show = (r: Rect | undefined | null): string => (r ? `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}×${Math.round(r.height)}` : "none");

/** The drawn panes (not the held one), by key. */
function drawn(h: Host): Map<string, Rect> {
  const out = new Map<string, Rect>();
  for (const el of h.stage.querySelectorAll<HTMLElement>(".td-pane[data-pane]")) out.set(el.dataset.pane!, styleRect(el));
  return out;
}
const mark = (h: Host, kind: "swap" | "landing"): HTMLElement | null => h.stage.querySelector<HTMLElement>(`[data-mark="${kind}"]`);

/** A check's findings: what went wrong, and what it found on the way. */
class Findings {
  readonly bad: string[] = [];
  readonly said: string[] = [];
  near(what: string, got: Rect | null | undefined, want: Rect | null | undefined): void {
    if (!got || !want || off(got, want) > 1) this.bad.push(`${what} at ${show(got)}, expected ${show(want)}`);
  }
  that(ok: boolean, why: string): void {
    if (!ok) this.bad.push(why);
  }
  verdict(): Verdict {
    return this.bad.length ? { pass: false, now: this.bad.slice(0, 4).join("; ") } : { pass: true, now: this.said.join("; ") || "as expected" };
  }
}

/**
 * The frame as drawn is the held place's layout: with a place held and not refused, every pane but the subject (and a
 * swap's partner) is drawn where `after(held)` puts it, a swap's wash lies at the partner's rect there and the landing
 * at `after(held).landing`; with nothing held or a refused place, the base, with no wash and no landing.
 */
function frameIsAfter(h: Host, f: Findings): void {
  const { shown, layout, own, partner } = h.frame()!;
  const panes = drawn(h);
  for (const [k, r] of layout) {
    if (k === own || k === partner) continue;
    f.near(`pane ${k}`, panes.get(k), r);
  }
  f.that(panes.size === [...layout.keys()].filter((k) => k !== own && k !== partner).length, `${panes.size} panes drawn`);
  const wash = mark(h, "swap");
  if (partner) f.near("the wash", wash && styleRect(wash), layout.get(partner));
  else f.that(!wash, "a wash is drawn with no swap held");
  const landing = mark(h, "landing");
  if (shown) f.near("the landing", landing && styleRect(landing), shown.landing);
  else f.that(!landing, "a landing is drawn with nothing held");
}

/** The wash has no frame: no border, outline or shadow, as the page computes it. */
function noFrame(el: HTMLElement, f: Findings): void {
  const s = getComputedStyle(el);
  const border = ["Top", "Right", "Bottom", "Left"].some((side) => parseFloat(s.getPropertyValue(`border-${side.toLowerCase()}-width`)) > 0 && s.getPropertyValue(`border-${side.toLowerCase()}-style`) !== "none");
  f.that(!border, "the wash has a border");
  f.that(s.outlineStyle === "none" || parseFloat(s.outlineWidth) === 0, "the wash has an outline");
  f.that(s.boxShadow === "none", "the wash has a shadow");
}

const paneA: TilingSubject<string> = { kind: "pane", pane: "a" };

/** A preset's setup: start from `tree`, lift `subject`, then hold with `then` (the pointer moved over the base). */
const lifted =
  (tree: TreeId, subject: TilingSubject<string> | ((h: Host) => TilingSubject<string>), then?: (h: Host) => void) =>
  (h: Host): void => {
    h.setTree(tree);
    h.lift(typeof subject === "function" ? subject(h) : subject);
    then?.(h);
  };

/** `k`'s base rect. */
const baseOf = (h: Host, k: string): Rect => h.drag!.drag.base.layout.get(k)!;

/** The pointer at `dx`, `dy` px from `k`'s base rect's top left (a negative one from its far edge, a fraction of 1 or less of its size). */
function at(h: Host, k: string, dx: number, dy: number): void {
  const r = baseOf(h, k);
  const along = (v: number, size: number): number => (Math.abs(v) <= 1 ? size * v : v < 0 ? size + v : v);
  h.pointTo({ x: r.x + along(dx, r.width), y: r.y + along(dy, r.height) });
}

/**
 * The frame as drawn is the held place's layout (`frameIsAfter`), and the release commits exactly its tree: the held
 * place's `after`, as the release committed it.
 */
function releaseCommits(h: Host, f: Findings, what: string) {
  frameIsAfter(h, f);
  const a = h.after()!;
  h.release();
  f.that(h.tree === a.tree, `the release did not commit after(${what}).tree`);
  return a;
}

/**
 * The pointer over the middle of `k`'s base rect (a swap, by the lab's pick): the point of its middle third nearest
 * the center that is not over home (home lies over the panes that grew into it, and the pick holds it first).
 */
function overMiddle(h: Host, k: string): void {
  const r = h.drag!.drag.base.layout.get(k)!;
  const home = h.drag!.drag.home;
  const c = mid(r);
  const points: Point[] = [];
  for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) points.push({ x: r.x + r.width * (0.36 + 0.035 * i), y: r.y + r.height * (0.36 + 0.035 * j) });
  const free = points.filter((p) => !home || p.x < home.x || p.x > home.x + home.width || p.y < home.y || p.y > home.y + home.height);
  free.sort((p, q) => Math.hypot(p.x - c.x, p.y - c.y) - Math.hypot(q.x - c.x, q.y - c.y));
  h.pointTo(free[0] ?? c);
}

/** 01 lifted in the three panes and held over 03's middle: a swap. */
const aOverC = lifted("three", paneA, (h) => overMiddle(h, "c"));

export const PRESETS: readonly Preset[] = [
  {
    id: "swap-reopens-old-place",
    title: "A pane held over another's middle reopens its old place for the partner",
    expected:
      "Lift 01 and hold it over the middle of 03: the held place is a swap. 02, which grew into 01's place at the lift, is back at its lift rect; 01's old place shows a tinted wash with ⇄ and 03's name, with no border, outline or shadow; 03's place is 01's landing. Every pane and mark is where after(swap) puts it.",
    setup: aOverC,
    check: (h) => {
      const f = new Findings();
      const d = h.drag!;
      f.that(d.held?.kind === "swap" && d.held.at === "c", `held ${JSON.stringify(d.held)}`);
      f.near("02 (room given back)", drawn(h).get("b"), d.drag.lift.layout.get("b"));
      const wash = mark(h, "swap");
      f.near("the wash", wash && styleRect(wash), d.drag.home);
      f.that(!!wash && wash.textContent!.includes("⇄") && wash.textContent!.includes(nameOf("c")), `the wash reads "${wash?.textContent ?? ""}"`);
      if (wash) noFrame(wash, f);
      const landing = mark(h, "landing");
      f.near("the landing", landing && styleRect(landing), d.drag.lift.layout.get("c"));
      frameIsAfter(h, f);
      f.said.push(`wash at ${show(d.drag.home)}, 02 back at ${show(d.drag.lift.layout.get("b"))}`);
      return f.verdict();
    },
  },
  {
    id: "swap-release-does-what-shown",
    title: "The release of a swap does exactly what was shown",
    expected: "Held as above, then released: 03 is drawn where the wash was, 01 where the landing was, 02 where it was drawn while held; the committed tree is after(swap).tree.",
    setup: aOverC,
    check: (h) => {
      const f = new Findings();
      const a = h.after()!;
      const wash = styleRect(mark(h, "swap")!);
      const landing = styleRect(mark(h, "landing")!);
      const b = drawn(h).get("b");
      h.release();
      const now = drawn(h);
      f.near("03", now.get("c"), wash);
      f.near("01", now.get("a"), landing);
      f.near("02", now.get("b"), b);
      f.that(h.tree === a.tree, "the committed tree is not after(swap).tree");
      return f.verdict();
    },
  },
  {
    id: "swap-leave-grows-back",
    title: "Leaving the swap target lets the neighbor grow back",
    expected: "Held over 03's middle, then off the stage: nothing is held, the frame is the base (02 fills 01's old place), and there is no wash and no landing. Then over 03's left edge: a side place, drawn as after(beside), with no wash.",
    setup: aOverC,
    check: (h) => {
      const f = new Findings();
      const d = h.drag!;
      h.pointTo({ x: -40, y: 200 });
      f.that(d.held === null, `held ${JSON.stringify(d.held)} off the stage`);
      f.near("02 (grown back)", drawn(h).get("b"), d.drag.base.layout.get("b"));
      frameIsAfter(h, f);
      at(h, "c", 6, 0.5);
      f.that(d.held?.kind === "beside" && d.held.side === "left", `held ${JSON.stringify(d.held)} at 03's left edge`);
      frameIsAfter(h, f);
      f.that(!mark(h, "swap"), "a wash over a side place");
      return f.verdict();
    },
  },
  {
    id: "swap-whole-stack",
    title: "A whole stack swaps as one",
    expected: "Lift the stack (03, 04, 05) by its bar and hold it over 01's middle: the wash, with ⇄ and 01's name, is at the stack's old place; released, the stack (all three, in order) is where 01 was and 01 where the stack was.",
    setup: lifted("stacked", (h) => ({ kind: "stack", stack: h.tree.stacks![0]! }), (h) => overMiddle(h, "a")),
    check: (h) => {
      const f = new Findings();
      const d = h.drag!;
      const wash = mark(h, "swap");
      f.near("the wash", wash && styleRect(wash), d.drag.home);
      f.that(!!wash && wash.textContent!.includes(nameOf("a")), `the wash reads "${wash?.textContent ?? ""}"`);
      frameIsAfter(h, f);
      const homeRect = d.drag.home;
      const aWas = d.drag.lift.layout.get("a");
      h.release();
      const now = drawn(h);
      f.near("01", now.get("a"), homeRect);
      f.near("the stack", now.get("c"), aWas);
      f.that(JSON.stringify(h.tree.stacks?.[0]?.members) === JSON.stringify(["c", "d", "e"]), `the stack is ${JSON.stringify(h.tree.stacks)}`);
      return f.verdict();
    },
  },
  {
    id: "home-commits-nothing",
    title: "Held at home, the frame is the lift and the release changes nothing",
    expected: "Lift 01 and hold it over its own old place: home is held, every pane is drawn at its lift rect, the landing is 01's old place, no wash; released, the tree is the same object as before.",
    setup: lifted("three", paneA, (h) => h.pointTo(mid(h.drag!.drag.home!))),
    check: (h) => {
      const f = new Findings();
      const d = h.drag!;
      f.that(d.held?.kind === "home", `held ${JSON.stringify(d.held)}`);
      f.near("02", drawn(h).get("b"), d.drag.lift.layout.get("b"));
      f.near("03", drawn(h).get("c"), d.drag.lift.layout.get("c"));
      frameIsAfter(h, f);
      const before = h.tree;
      h.release();
      f.that(h.tree === before, "the release on home changed the tree");
      return f.verdict();
    },
  },
  {
    id: "torn-tab-no-gap",
    title: "A tab torn out of a stack leaves no gap, and joins back by its bar",
    expected: "Tear 04 out of the stack: home is null and the base is the lift layout. Over the stack's middle the swap is refused (self) and the frame is the base; over the stack's bar it joins (after the last tab), and the release commits after(join).tree with 04 drawn.",
    setup: lifted("stacked", { kind: "pane", pane: "d" }),
    check: (h) => {
      const f = new Findings();
      const d = h.drag!;
      f.that(d.drag.home === null, `home ${show(d.drag.home)}`);
      for (const [k, r] of d.drag.lift.layout) f.near(`base ${k}`, d.drag.base.layout.get(k), r);
      overMiddle(h, "c");
      f.that(h.after()?.refusal?.code === "self", `over the stack: ${JSON.stringify(h.after()?.refusal)}`);
      f.that(h.stage.dataset.refused === "self", "the stage does not show the refusal");
      frameIsAfter(h, f);
      at(h, "c", 0.5, 8);
      f.that(d.held?.kind === "join" && d.held.at === "c", `held ${JSON.stringify(d.held)} on the bar`);
      releaseCommits(h, f, "join");
      f.that(JSON.stringify(h.tree.stacks?.[0]) === JSON.stringify({ id: "right", members: ["c", "e", "d"], active: "d" }), `the stack is ${JSON.stringify(h.tree.stacks)}`);
      return f.verdict();
    },
  },
  {
    id: "refused-side-draws-rest",
    title: "A side with no room is refused, and the frame stays at rest",
    expected: "One narrow: lift 03 and hold it at 01's right edge: 01 is too narrow for two panes (room-along); the frame is the base (02 fills the column), no landing, no wash; released, nothing changes.",
    setup: lifted("narrow", { kind: "pane", pane: "c" }, (h) => at(h, "a", -4, 0.5)),
    check: (h) => {
      const f = new Findings();
      const d = h.drag!;
      const a = h.after();
      f.that(d.held?.kind === "beside" && d.held.side === "right", `held ${JSON.stringify(d.held)}`);
      f.that(a?.refusal?.code === "room-along", `refusal ${JSON.stringify(a?.refusal)}`);
      f.near("02 (the base)", drawn(h).get("b"), d.drag.base.layout.get("b"));
      frameIsAfter(h, f);
      const before = h.tree;
      h.release();
      f.that(h.tree === before, "a refused release changed the tree");
      if (a?.refusal?.code === "room-along") f.said.push(`need ${a.refusal.need} px, have ${Math.round(a.refusal.have)}`);
      return f.verdict();
    },
  },
  {
    id: "beside-frame-is-commit",
    title: "A side place draws its commit",
    expected: "Lift 01 and hold it at 03's bottom edge: 03 and 01 share 03's place half and half, 02 fills the column; the frame is after(beside), and the release commits it.",
    setup: lifted("three", paneA, (h) => at(h, "c", 0.5, -6)),
    check: (h) => {
      const f = new Findings();
      const d = h.drag!;
      f.that(d.held?.kind === "beside" && d.held.side === "bottom", `held ${JSON.stringify(d.held)}`);
      const a = releaseCommits(h, f, "beside");
      f.near("01", drawn(h).get("a"), a.landing);
      return f.verdict();
    },
  },
  {
    id: "join-makes-a-stack",
    title: "A pane held on another's bar joins it",
    expected: "Lift 01 and hold it on 03's bar: a join; the landing is the stack's place (03's), 02 fills the column; released, 03 and 01 are one stack with 01 drawn.",
    setup: lifted("three", paneA, (h) => at(h, "c", 0.5, 8)),
    check: (h) => {
      const f = new Findings();
      const d = h.drag!;
      f.that(d.held?.kind === "join" && d.held.at === "c", `held ${JSON.stringify(d.held)}`);
      releaseCommits(h, f, "join");
      f.that(JSON.stringify(h.tree.stacks) === JSON.stringify([{ id: "stack:c", members: ["c", "a"], active: "a" }]), `stacks ${JSON.stringify(h.tree.stacks)}`);
      return f.verdict();
    },
  },
];
