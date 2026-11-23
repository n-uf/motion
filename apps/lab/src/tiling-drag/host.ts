/**
 * The Tiling drag page's host: one `StackedSplit` tree on a stage, a drag of a pane or a stack over
 * `@n-uf/placement/tiling`'s `tilingDrag`, and the frame drawn from `after(held)`.
 *
 * - **What a frame draws.** Nothing held, or a refused place: the base (the tree with the subject released). A held
 *   place: `after(held).layout`, every pane where the release puts it. For a swap the partner is not drawn in its new
 *   place yet: that place (the subject's old one, reopened) is a tinted wash with ⇄ and the partner's name, and the
 *   partner stays where it is, drawn as the subject's landing. The held pane is at the pointer.
 * - **The release** commits `after(held).tree`, or nothing when nothing is held or the place is refused.
 * - **Which place the pointer holds** is the lab's own pick, over the base: home (the gap the release leaves), a pane's
 *   title bar (a join), its middle (a swap) or an edge (`paneRegion`'s side). The library's hit half comes later.
 */
import type { Point, Rect } from "@n-uf/placement";
import {
  layoutSplitTree,
  paneRegion,
  splitTreeOps,
  tilingDrag,
  type PaneRegion,
  type StackedSplit,
  type TilingAfter,
  type TilingDrag,
  type TilingHeld,
  type TilingSubject,
} from "@n-uf/placement/tiling";

export type Tree = StackedSplit<string>;
export const ops = splitTreeOps<string>();
export const AREA: Rect = { x: 0, y: 0, width: 720, height: 440 };
export const OPTIONS = { ops, area: AREA, gap: 8, min: 80 } as const;
/** The title bar's height, px: a join's place in a pane. */
export const BAR = 26;

export const NAMES: Readonly<Record<string, string>> = { a: "01 Overview", b: "02 Notes", c: "03 Features", d: "04 Install", e: "05 Examples" };
export const nameOf = (k: string): string => NAMES[k] ?? k;

export type TreeId = "three" | "stacked" | "narrow";
export const TREES: Readonly<Record<TreeId, Tree>> = {
  /** a narrow on the left, b over c on the right: a side of a has no room for two panes. */
  narrow: { split: { axis: "x", ratio: 0.2, a: { pane: "a" }, b: { axis: "y", ratio: 0.5, a: { pane: "b" }, b: { pane: "c" } } } },
  /** The sketch's three panes: a over b on the left, c on the right. */
  three: { split: { axis: "x", ratio: 0.42, a: { axis: "y", ratio: 0.5, a: { pane: "a" }, b: { pane: "b" } }, b: { pane: "c" } } },
  /** a over b on the left, and on the right a stack of c, d and e. */
  stacked: {
    split: { axis: "x", ratio: 0.42, a: { axis: "y", ratio: 0.5, a: { pane: "a" }, b: { pane: "b" } }, b: { pane: "c" } },
    stacks: [{ id: "right", members: ["c", "d", "e"], active: "c" }],
  },
};

export interface Held {
  readonly drag: TilingDrag<Tree, string>;
  readonly subject: TilingSubject<string>;
  /** Where in the held pane the pointer holds it. */
  readonly grab: Point;
  pointer: Point;
  held: TilingHeld<string> | null;
  /** The last side region, for `paneRegion`'s hysteresis. */
  region: PaneRegion | null;
}

const contains = (r: Rect, p: Point): boolean => p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const box = (r: Rect): string => `left:${r.x}px;top:${r.y}px;width:${r.width}px;height:${r.height}px`;

export const keyOf = (s: TilingSubject<string>): string => (s.kind === "pane" ? s.pane : s.stack.active);
export const drawnAs = (t: Tree, k: string): string => ops.stackOf!(t, k)?.active ?? k;
const subjectName = (s: TilingSubject<string>): string => (s.kind === "pane" ? nameOf(s.pane) : s.stack.members.map(nameOf).join(" · "));

export function describeHeld(h: TilingHeld<string> | null): string {
  if (!h) return "nothing";
  if (h.kind === "home") return "home";
  if (h.kind === "swap") return `swap with ${nameOf(h.at)}`;
  if (h.kind === "beside") return `${h.side} of ${nameOf(h.at)}`;
  return `join ${nameOf(h.at)}${h.index === undefined ? "" : ` at ${h.index}`}`;
}

export class Host {
  tree: Tree;
  drag: Held | null = null;
  /** The tree a preset or the switch started from. */
  start: TreeId = "three";

  constructor(
    readonly stage: HTMLElement,
    readonly status: HTMLElement,
  ) {
    this.tree = TREES.three;
    stage.addEventListener("pointerdown", (e) => this.down(e));
    stage.addEventListener("pointermove", (e) => this.move(e));
    stage.addEventListener("pointerup", () => this.release());
    stage.addEventListener("pointercancel", () => this.cancel());
    this.render();
  }

  /** The committed tree laid out (no drag). */
  layout(): ReadonlyMap<string, Rect> {
    return layoutSplitTree(this.tree.split, AREA, OPTIONS).panes;
  }

  setTree(which: TreeId): void {
    this.start = which;
    this.tree = TREES[which];
    this.drag = null;
    this.render();
  }

  /** Lift `subject` with the pointer at `pointer` (default: its title bar's middle). */
  lift(subject: TilingSubject<string>, pointer?: Point): Held {
    const drag = tilingDrag(this.tree, subject, OPTIONS);
    const at = drag.lift.layout.get(drawnAs(this.tree, keyOf(subject)))!;
    const p = pointer ?? { x: at.x + at.width / 2, y: at.y + BAR / 2 };
    this.drag = { drag, subject, grab: { x: p.x - at.x, y: p.y - at.y }, pointer: p, held: null, region: null };
    this.pointTo(p);
    return this.drag;
  }

  /** Hold `held` with the pointer at `pointer` (default: where it is), as if the pointer picked it. */
  hold(held: TilingHeld<string> | null, pointer?: Point): void {
    if (!this.drag) return;
    if (pointer) this.drag.pointer = pointer;
    this.drag.held = held;
    this.render();
  }

  /** The place the pointer at `p` holds, over the base. */
  pick(p: Point): TilingHeld<string> | null {
    const d = this.drag!;
    if (d.drag.home && contains(d.drag.home, p)) return { kind: "home" };
    for (const [k, r] of d.drag.base.layout) {
      if (!contains(r, p)) continue;
      if (p.y - r.y < BAR) return { kind: "join", at: k };
      const region = paneRegion(r, p, d.region);
      d.region = region;
      return region === "center" ? { kind: "swap", at: k } : { kind: "beside", at: k, side: region };
    }
    return null;
  }

  /** Move the pointer to `p` and hold what it picks. */
  pointTo(p: Point): void {
    if (!this.drag) return;
    this.drag.pointer = p;
    this.drag.held = this.pick(p);
    this.render();
  }

  /** The held place's layout, or null when nothing is held. */
  after(): TilingAfter<Tree, string> | null {
    return this.drag?.held ? this.drag.drag.after(this.drag.held) : null;
  }

  /** Commit what shows: `after(held).tree`, or nothing. */
  release(): void {
    const a = this.after();
    if (a && !a.refusal) this.tree = a.tree;
    this.drag = null;
    this.render();
  }

  cancel(): void {
    this.drag = null;
    this.render();
  }

  private local(e: PointerEvent): Point {
    const r = this.stage.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private down(e: PointerEvent): void {
    const t = e.target as HTMLElement;
    const bar = t.closest<HTMLElement>(".td-pane-bar");
    if (!bar) return;
    const tab = t.closest<HTMLElement>("[data-tab]");
    const drawn = bar.closest<HTMLElement>("[data-pane]")!.dataset.pane!;
    const stack = ops.stackOf!(this.tree, drawn);
    const subject: TilingSubject<string> = tab ? { kind: "pane", pane: tab.dataset.tab! } : stack ? { kind: "stack", stack } : { kind: "pane", pane: drawn };
    this.stage.setPointerCapture(e.pointerId);
    this.lift(subject, this.local(e));
  }

  private move(e: PointerEvent): void {
    if (this.drag) this.pointTo(this.local(e));
  }

  private paneHtml(k: string, r: Rect, tree: Tree): string {
    const stack = ops.stackOf!(tree, k);
    const title = stack
      ? stack.members.map((m) => `<span class="td-tab" data-tab="${m}"${m === stack.active ? " data-active" : ""}>${esc(nameOf(m))}</span>`).join("")
      : `<span>${esc(nameOf(k))}</span>`;
    return `<div class="td-pane" data-pane="${k}" style="${box(r)}"><div class="td-pane-bar">${title}</div><div class="td-pane-body">${esc(nameOf(k))}</div></div>`;
  }

  render(): void {
    const d = this.drag;
    if (!d) {
      this.stage.removeAttribute("data-refused");
      this.stage.innerHTML = [...this.layout()].map(([k, r]) => this.paneHtml(k, r, this.tree)).join("");
      this.status.textContent = "Nothing held.";
      return;
    }
    const a = this.after();
    const shown = a && !a.refusal ? a : null;
    const tree = shown ? shown.tree : d.drag.base.tree;
    const layout = shown ? shown.layout : d.drag.base.layout;
    const own = drawnAs(tree, keyOf(d.subject));
    const parts: string[] = [];
    let partner: string | null = null;
    if (shown && shown.held.kind === "swap") partner = drawnAs(tree, shown.held.at);
    for (const [k, r] of layout) {
      if (k === own || k === partner) continue;
      parts.push(this.paneHtml(k, r, tree));
    }
    // The partner is `at`; where it lands is drawn as its stack's when it goes into one (a member torn out swaps into it).
    const at = shown && shown.held.kind === "swap" ? shown.held.at : null;
    if (partner && at) {
      const to = layout.get(partner)!;
      parts.push(`<div class="td-wash" data-mark="swap" style="${box(to)}"><span class="td-wash-mark">⇄</span><span class="td-wash-name">${esc(nameOf(at))}</span></div>`);
    }
    if (shown?.landing) {
      const kind = shown.held.kind;
      const label = at ? nameOf(at) : "";
      parts.push(`<div class="td-landing" data-mark="landing" data-kind="${kind}" style="${box(shown.landing)}">${esc(label)}</div>`);
    }
    const size = d.drag.lift.layout.get(drawnAs(d.drag.lift.tree, keyOf(d.subject)))!;
    const heldRect = { x: d.pointer.x - d.grab.x, y: d.pointer.y - d.grab.y, width: size.width, height: size.height };
    parts.push(`<div class="td-held" data-held style="${box(heldRect)}"><div class="td-pane-bar">${esc(subjectName(d.subject))}</div></div>`);
    this.stage.innerHTML = parts.join("");
    if (a?.refusal) this.stage.dataset.refused = a.refusal.code;
    else this.stage.removeAttribute("data-refused");
    this.status.textContent = `Holding ${subjectName(d.subject)}: ${describeHeld(d.held)}${a?.refusal ? ` (refused: ${a.refusal.code})` : ""}.`;
  }
}
