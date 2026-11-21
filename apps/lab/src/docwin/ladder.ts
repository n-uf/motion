/**
 * A bar's groups declared by their controls, their forms generated with `controlLadder` (`@n-uf/placement/stack`): the
 * way a host uses it, and what a host mirrors. The page does three things with a declaration:
 * 1. measures each control's length at each of its tiers, from hidden copies of the group as it draws them (`measureLadder`);
 * 2. gives the scene `controlLadder(spec).row` as the group's row forms (`ladderRow`);
 * 3. draws the group from its layout (`ladderWords`): each control in `SceneItemLayout.hidden` left out, each other
 *    control at its tier, `SceneItemLayout.tiers[id]`, and the group's » cell listing exactly `hidden` (`ladderMenu`).
 *
 * A control is the unit that folds together: a pair that never splits (Zoom's − and +) is one control. Only a scene
 * made by `ladderScene` has ladder groups; the window's other scenes keep their hand-written forms.
 */
import { controlLadder, type StackForm } from "@n-uf/placement/stack";
import type { Scene } from "@n-uf/placement/scene";
import type { Size } from "@n-uf/placement";
import { BAR, defaultScene, put, type Counts, type GroupId } from "./model";

/** What the » lists for a hidden control: one button each (a pair lists both), acting as the real one when `act` is set. */
export interface MenuEntry {
  readonly id: string;
  readonly label: string;
  /** The control it stands for. */
  readonly control: string;
  /** An attribute that makes the button act as the group's real one (`data-zoom="-"`). */
  readonly act?: string;
}

/** A control: its element (tag, class, attributes), its label per tier (longest first), and the buttons the » lists for it. */
interface ControlDecl {
  readonly id: string;
  readonly tag: "button" | "span";
  readonly cls: string;
  readonly attrs?: string;
  readonly labels: (n: Counts) => readonly string[];
  /** Its element's content at a label (default: the label). */
  readonly inner?: (label: string) => string;
  readonly menu: (n: Counts) => readonly Omit<MenuEntry, "control">[];
}

const toggle = (id: string, labels: (n: Counts) => readonly string[], menu: (n: Counts) => string): ControlDecl => ({
  id, tag: "button", cls: "dw-w dw-word", attrs: `data-toggle="${id}"`, labels, menu: (n) => [{ id, label: menu(n), act: `data-toggle="${id}"` }],
});
const word = (id: string, labels: readonly string[]): ControlDecl => ({ id, tag: "button", cls: "dw-w", labels: () => labels, menu: () => [{ id, label: labels[0]! }] });

/**
 * The groups, each declared by its controls in drawing order, in fold order from the last (the last control folds first
 * and takes each tier first). A control has 1 to 3 tiers: its label with a count, a short label, an icon.
 */
export const LADDER = {
  views: [
    toggle("pages", (n) => [`Pages ${n.pages}`, "Pages", "P"], (n) => `Pages ${n.pages}`),
    toggle("notes", (n) => [`Notes ${n.notes}`, "Notes", "N"], (n) => `Notes ${n.notes}`),
    toggle("findings", (n) => [`Findings ${n.findings}`, "Findings", "F"], (n) => `Findings ${n.findings}`),
  ],
  review: [
    { id: "marked", tag: "span", cls: "dw-w", labels: (n) => [`${n.marked} marked`, `${n.marked}`], menu: (n) => [{ id: "marked", label: `${n.marked} marked` }] },
    word("original", ["Original", "Orig", "O"]),
    word("view-marked", ["Marked", "Mark", "M"]),
    word("download", ["Download ⬇", "Save ⬇", "⬇"]),
  ],
  // The readout folds last, then the step pair, then fit.
  zoom: [
    { id: "readout", tag: "span", cls: "dw-zv", labels: (n) => [`Zoom ${n.zoom}%`, `${n.zoom}%`], menu: (n) => [{ id: "readout", label: `${n.zoom}%` }] },
    {
      id: "step",
      tag: "span",
      cls: "dw-step",
      labels: () => ["− +"],
      inner: () => '<button type="button" class="dw-w" data-zoom="-">−</button><button type="button" class="dw-w" data-zoom="+">+</button>',
      menu: () => [{ id: "-", label: "−", act: 'data-zoom="-"' }, { id: "+", label: "+", act: 'data-zoom="+"' }],
    },
    { id: "fit", tag: "button", cls: "dw-fit", attrs: 'data-zoom="fit" aria-pressed="false"', labels: () => ["H-FIT", "FIT", "⤢"], menu: () => [{ id: "fit", label: "H-FIT", act: 'data-zoom="fit"' }] },
  ],
} as const satisfies Partial<Record<GroupId, readonly ControlDecl[]>>;
export type LadderId = keyof typeof LADDER;
export const LADDER_IDS = Object.keys(LADDER) as LadderId[];
const NO_COUNTS: Counts = { notes: 0, findings: 0, marked: 0, pages: 0, zoom: 0 };
const controlsOf = (id: LadderId): readonly ControlDecl[] => LADDER[id];
/** How many tiers a control declares (its labels). */
export const ownTiers = (id: LadderId, control: string): number => controlsOf(id).find((c) => c.id === control)!.labels(NO_COUNTS).length;
const tierCount = (id: LadderId): number => Math.max(...controlsOf(id).map((c) => c.labels(NO_COUNTS).length));

/** A group's measured lengths, px: each control per tier, the gap between controls, the grip cell and the » cell. */
export interface LadderSize {
  readonly controls: readonly (readonly number[])[];
  readonly gap: number;
  readonly grip: number;
  readonly more: number;
}

/**
 * Measures `id` from hidden copies of its row: `draw(tiers, hidden)` returns a copy of the group drawn that way (as
 * `ladderWords` draws it), appended and invisible; this removes it. A control's length at a tier is its element's width
 * with every control at that tier.
 */
export function measureLadder(id: LadderId, draw: (tiers: Readonly<Record<string, number>>, hidden: readonly string[]) => HTMLElement): LadderSize {
  const ids = controlsOf(id).map((c) => c.id);
  const n = ids.length;
  const len = (x: number): number => Math.ceil(x - 0.01);
  const rowAt = (tier: number, hidden: readonly string[] = []): { widths: number[]; box: number; span: number } => {
    // Every control at this tier, or at its own last when it declares fewer: the host's knowledge, as the library's `tiers` are.
    const el = draw(Object.fromEntries(controlsOf(id).map((c) => [c.id, Math.min(tier, c.labels(NO_COUNTS).length - 1)])), hidden);
    const rects = [...el.querySelectorAll<HTMLElement>("[data-control]")].map((x) => x.getBoundingClientRect());
    const out = { widths: rects.map((r) => len(r.width)), box: len(Math.max(el.getBoundingClientRect().width, el.scrollWidth)), span: rects.length > 1 ? rects[rects.length - 1]!.right - rects[0]!.left - rects.reduce((s, r) => s + r.width, 0) : 0 };
    el.remove();
    return out;
  };
  const tiers = Array.from({ length: tierCount(id) }, (_, t) => rowAt(t));
  const first = tiers[0]!;
  const gap = n > 1 ? first.span / (n - 1) : 0;
  // The grip cell is what the row draws beside its controls and gaps (the dots, the padding, the border, a capsule's edge).
  const grip = first.box - first.widths.reduce((s, w) => s + w, 0) - gap * (n - 1);
  // The » cell is what the row grows by when it draws one (a made-up hidden id, so every control is still drawn).
  const more = rowAt(0, ["·"]).box - first.box;
  // Each control lists only the tiers it declares: `controlLadder` holds a shorter list to its last, as the page draws it.
  return { controls: controlsOf(id).map((c, i) => tiers.slice(0, c.labels(NO_COUNTS).length).map((t) => t.widths[i]!)), gap, grip, more };
}

let sizes: Readonly<Record<LadderId, LadderSize>> | null = null;
/** The groups' measured lengths, which every `ladderScene` built afterwards uses. */
export function setLadderSizes(m: Readonly<Record<LadderId, LadderSize>>): void {
  sizes = m;
}

const ROWS = new WeakSet<readonly StackForm[]>();
/** A group's row forms, generated from its controls and measured lengths: the ladder. */
function ladderRow(id: LadderId): readonly StackForm[] {
  const m = sizes?.[id];
  if (!m) throw new Error("docwin: the ladder groups are measured on the page before a scene is built");
  const { row } = controlLadder({ controls: controlsOf(id).map((c, i) => ({ id: c.id, tiers: m.controls[i]! })), gap: m.gap, grip: m.grip, more: m.more, cross: BAR });
  ROWS.add(row);
  return row;
}

/** Whether `id`'s row forms in `s` are generated by `ladderRow`: a lab scene holds both kinds of group. */
export const isLadder = (s: Scene, id: string): boolean => !!s.items[id]?.forms.row && ROWS.has(s.items[id]!.forms.row!);

/**
 * The words of `id`'s row from its layout: each control but the `hidden` ones, drawn with its label at `tiers[id]` (a
 * valid index into its labels, as the layout reports it), each carrying its id and the tier it is drawn at.
 */
export function ladderWords(id: LadderId, tiers: Readonly<Record<string, number>>, hidden: readonly string[], counts: Counts, open: (control: string) => boolean): string[] {
  return controlsOf(id).flatMap((c) => {
    if (hidden.includes(c.id)) return [];
    const labels = c.labels(counts);
    const tier = tiers[c.id]!;
    const pressed = id === "views" ? ` aria-pressed="${open(c.id)}"` : "";
    const name = tier > 0 ? ` aria-label="${labels[0]}" title="${labels[0]}"` : "";
    const type = c.tag === "button" ? ' type="button"' : "";
    return [`<${c.tag} class="${c.cls}"${type} ${c.attrs ?? ""}${pressed} data-control="${c.id}" data-tier="${tier}" data-last="${tier === labels.length - 1}"${name}>${c.inner ? c.inner(labels[tier]!) : labels[tier]}</${c.tag}>`];
  });
}

/** The buttons the group's » lists: those of each hidden control, in control order. */
export const ladderMenu = (id: LadderId, hidden: readonly string[], counts: Counts): MenuEntry[] =>
  controlsOf(id).flatMap((c) => (hidden.includes(c.id) ? c.menu(counts).map((e) => ({ ...e, control: c.id })) : []));

/**
 * The default window with the three ladder groups side by side in the title bar, all at the same priority (the window's
 * own priorities would offset their ranks), each with its ladder as its row forms. Columns and floats are as ever.
 */
export function ladderScene(size: Size = { width: 1160, height: 640 }): Scene {
  const base = put(defaultScene(size), "title", [...LADDER_IDS]);
  const items = { ...base.items };
  for (const id of LADDER_IDS) {
    const { priority: _priority, ...item } = items[id]!;
    items[id] = { ...item, forms: { ...item.forms, row: ladderRow(id) } };
  }
  return { ...base, items };
}
