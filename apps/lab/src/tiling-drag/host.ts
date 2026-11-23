/**
 * The Tiling drag page's host: one `StackedSplit` tree on a stage, a drag of a pane or a stack over
 * `@n-uf/placement/tiling`'s `tilingDrag`, which place the pointer holds by its hit half fed through
 * `@n-uf/motion/drag`'s intent, and the frame drawn from what the hit reads.
 *
 * - **Which place the pointer holds** is the library's: `drag.hit(basis)`, built once at the lift on one fixed layout
 *   (the base for Snap to slot, the lift for Indicator), its targets fed to a drag intent with the hit's own options,
 *   and the intent's frame read back (`hit.read`).
 * - **What a frame draws.** Snap to slot: `hit.drawn(read)`, the held place's landed layout from the first frame, the
 *   lift at home, the base with nothing held; for a swap the partner's landing is the tinted wash with ⇄ and its name.
 *   Indicator: the lift layout, the pane's own slot open, and the mark, a region of that layout.
 * - **The release** commits `hit.release(read).tree`: the held place's, else the lift tree.
 */
import { createDragIntent, type DragIntent } from "@n-uf/motion/drag";
import type { Point, Rect } from "@n-uf/placement";
import {
  layoutSplitTree,
  splitTreeOps,
  tilingDrag,
  type StackedSplit,
  type TilingAfter,
  type TilingDrag,
  type TilingHeld,
  type TilingHit,
  type TilingHitRead,
  type TilingHitTarget,
  type TilingLaidOut,
  type TilingSubject,
} from "@n-uf/placement/tiling";

export type Tree = StackedSplit<string>;
/** The title bar's height, px: a join's place in a pane. */
const BAR = 26;
/** A tab's width in a stack's bar, px: its slot. */
const TAB = 92;
const ops = splitTreeOps<string>({ bar: BAR, tab: () => TAB });
const AREA: Rect = { x: 0, y: 0, width: 720, height: 440 };
const OPTIONS = { ops, area: AREA, gap: 8, min: 80 } as const;

const NAMES: Readonly<Record<string, string>> = { a: "01 Overview", b: "02 Notes", c: "03 Features", d: "04 Install", e: "05 Examples" };
export const nameOf = (k: string): string => NAMES[k] ?? k;

export type TreeId = "three" | "stacked" | "narrow";
export type Preview = "snap" | "indicator";
const TREES: Readonly<Record<TreeId, Tree>> = {
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
  readonly hit: TilingHit<Tree, string>;
  readonly intent: DragIntent<TilingHitTarget<string>>;
  readonly subject: TilingSubject<string>;
  /** Where in the held pane the pointer holds it. */
  readonly grab: Point;
  pointer: Point;
  /** The frame's read: the held place, the refused one, the mark. */
  read: TilingHitRead<string>;
  /** The held place (home included), or null: `read.held`. */
  held: TilingHeld<string> | null;
}

/** What a frame of a drag draws (`Host.frame`). */
interface Frame {
  /** The held place's layout when the frame draws it (Snap, a place held outside home), else null. */
  readonly shown: TilingAfter<Tree, string> | null;
  readonly tree: Tree;
  readonly layout: ReadonlyMap<string, Rect>;
  readonly own: string;
  readonly partner: string | null;
}

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const box = (r: Rect): string => `left:${r.x}px;top:${r.y}px;width:${r.width}px;height:${r.height}px`;

const keyOf = (s: TilingSubject<string>): string => (s.kind === "pane" ? s.pane : s.stack.active);
const drawnAs = (t: Tree, k: string): string => ops.stackOf!(t, k)?.active ?? k;
const subjectName = (s: TilingSubject<string>): string => (s.kind === "pane" ? nameOf(s.pane) : s.stack.members.map(nameOf).join(" · "));

function describeHeld(h: TilingHeld<string> | null): string {
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
  /** How a drag previews its place, fixed at the lift. */
  preview: Preview = "snap";
  /** The intent's clock: one frame per pointer sample. */
  private time = 0;

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

  setPreview(preview: Preview): void {
    this.preview = preview;
    this.drag = null;
    this.render();
  }

  /** Lift `subject` with the pointer at `pointer` (default: its title bar's middle): the hit is built now, on the preview's basis. */
  lift(subject: TilingSubject<string>, pointer?: Point): Held {
    const drag = tilingDrag(this.tree, subject, OPTIONS);
    const at = drag.lift.layout.get(drawnAs(this.tree, keyOf(subject)))!;
    const p = pointer ?? { x: at.x + at.width / 2, y: at.y + BAR / 2 };
    const hit = drag.hit(this.preview === "snap" ? "base" : "lift");
    const intent = createDragIntent<TilingHitTarget<string>>({ ...hit.intent, lift: p });
    const read: TilingHitRead<string> = { held: null, refused: null, mark: null };
    this.drag = { drag, hit, intent, subject, grab: { x: p.x - at.x, y: p.y - at.y }, pointer: p, read, held: null };
    this.pointTo(p);
    return this.drag;
  }

  /** Move the pointer to `p`: one intent frame, read by the hit. */
  pointTo(p: Point): void {
    const d = this.drag;
    if (!d) return;
    d.pointer = p;
    const frame = d.intent.update(p, (this.time += 16), d.hit.targets);
    d.read = d.hit.read(frame, p);
    d.held = d.read.held;
    this.render();
  }

  /** The held place's layout, or null when nothing is held outside home. */
  after(): TilingAfter<Tree, string> | null {
    return this.drag?.held ? this.drag.drag.after(this.drag.held) : null;
  }

  /**
   * What a frame of the drag draws, or null with no drag: Snap draws `hit.drawn(read)` (`shown` when it is a held
   * place's), Indicator the lift; the subject's drawn key in it, and a swap's partner (drawn as the wash, not as a pane).
   */
  frame(): Frame | null {
    const d = this.drag;
    if (!d) return null;
    const laid: TilingLaidOut<Tree, string> = d.hit.drawn(d.read);
    const held = d.read.held;
    const shown = this.preview === "snap" && held && held.kind !== "home" ? d.drag.after(held) : null;
    const partner = shown && shown.held.kind === "swap" ? drawnAs(laid.tree, shown.held.at) : null;
    return { shown, tree: laid.tree, layout: laid.layout, own: drawnAs(laid.tree, keyOf(d.subject)), partner };
  }

  /** Commit what shows: `hit.release(read).tree` (the lift tree when nothing is held). */
  release(): void {
    if (this.drag) this.tree = this.drag.hit.release(this.drag.read).tree;
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
    const { shown, tree, layout, own, partner } = this.frame()!;
    const parts: string[] = [];
    for (const [k, r] of layout) {
      if (k === partner) continue;
      // Indicator keeps the lift: the subject's own slot is drawn open (its stack stays drawn when a tab is torn out).
      if (k === own && (this.preview === "snap" || d.drag.home)) continue;
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
    // Indicator: the mark, a region of the lift layout; a swap's wash in the open slot.
    const m = d.read.mark;
    if (m) {
      if (m.kind === "swap" && m.wash) parts.push(`<div class="td-wash" data-mark="swap" style="${box(m.wash)}"><span class="td-wash-mark">⇄</span><span class="td-wash-name">${esc(nameOf(m.at))}</span></div>`);
      parts.push(`<div class="td-mark" data-mark="mark" data-kind="${m.kind}" style="${box(m.kind === "join" && m.slot ? m.slot : m.rect)}"></div>`);
    }
    const size = d.drag.lift.layout.get(drawnAs(d.drag.lift.tree, keyOf(d.subject)))!;
    const heldRect = { x: d.pointer.x - d.grab.x, y: d.pointer.y - d.grab.y, width: size.width, height: size.height };
    parts.push(`<div class="td-held" data-held style="${box(heldRect)}"><div class="td-pane-bar">${esc(subjectName(d.subject))}</div></div>`);
    this.stage.innerHTML = parts.join("");
    const refused = d.read.refused ? d.drag.after(d.read.refused).refusal : null;
    if (refused) this.stage.dataset.refused = refused.code;
    else this.stage.removeAttribute("data-refused");
    this.status.textContent = `Holding ${subjectName(d.subject)}: ${describeHeld(d.held)}${refused ? ` (here: ${describeHeld(d.read.refused)}, refused: ${refused.code})` : ""}.`;
  }
}
