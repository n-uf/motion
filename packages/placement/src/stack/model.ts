/**
 * The edge stack's shapes. A stack is the items along one edge of a stage: a column (vertical, a side region) or a
 * row (horizontal, a bar). An item is a panel or a control group; it declares its forms, largest first, and the
 * solver (`fitStack`) picks one per item. Plain data in and out: no words, no time, no DOM.
 *
 * A form's kind is the host's label, the name it draws by. What a solver reads is said by fields: `setsCross` (it sets
 * the stack's cross size), `body` (it shows its body: what `open` stands for), `folded` (it shows only its bar: what
 * `header` and `fold` stand for), `compact` (icons only: what `icons` stands for), `title`, `wrap` and `hides`. Each of
 * the three flags defaults from the kind, so forms that leave them out read as before. Two kinds stay structural: a
 * `menu` form has no room of its own (the » entry stands for it), and under `ownCross` the group kinds (`row`,
 * `stacked`, `wrap`, `icons`, `fold`) are drawn at their own size across. Panel and group kinds may be mixed on one item.
 */
import type { Rect } from "../geometry";

/** `"column"` runs the stack down (its main size is a height, its cross size a width); `"row"` runs it across. */
export type StackAxis = "column" | "row";

/** How a panel draws: open (header and body), a header only, a rail icon, or an entry in the » menu. */
export type PanelFormKind = "open" | "header" | "rail" | "menu";
/**
 * How a control group draws: a row of words, the words stacked, `wrap` (the words in rows that wrap to the cross size
 * the item gets; its length follows from {@link StackForm.wrap}), icons only, `fold` (the group's handle with its own »,
 * in line at its place and with its own length) or an entry in the shared » menu.
 */
export type GroupFormKind = "row" | "stacked" | "wrap" | "icons" | "fold" | "menu";

/**
 * Words that wrap: their widths in order, the row height, the gap between words on a row (default 0) and the lead (the
 * grip's cell at the start of row one, default 0). The words wrap in their own box beside the lead, a hanging indent:
 * every row starts after it, so the grip never has a row of its own. Words flow onto a row while they fit; with two
 * words or more, every row but the last must hold at least two, or the form doesn't fit that cross size.
 */
export interface WrapSpec {
  readonly widths: readonly number[];
  readonly row: number;
  readonly gap?: number;
  readonly lead?: number;
}
export type StackFormKind = PanelFormKind | GroupFormKind;

/** Along the stack: `min` is the least it can be drawn, `natural` what it asks for; `grows` takes spare length. */
export interface MainSize {
  readonly min: number;
  readonly natural: number;
  readonly grows?: boolean;
}

/** One way to draw an item. A `menu` form takes no room in the stack (the » entry stands for it). */
export interface StackForm {
  readonly kind: StackFormKind;
  readonly main: MainSize;
  /**
   * Across the stack: `natural` is what this form asks for (it sets the stack's cross size when `setsCross`); `min`
   * is the least it can be drawn across (default `natural`). A form that doesn't set the cross size takes its next
   * form only when its `min` is over the stack's cross size, so a header stays in a column an open panel made
   * narrow when it has a small `min`.
   */
  readonly cross: { readonly natural: number; readonly min?: number };
  /**
   * Whether this form sets the stack's cross size (the column's width, the bar's height). Default: true for a
   * panel's `open`, false for everything else (a group never sets a column's width).
   */
  readonly setsCross?: boolean;
  /**
   * It shows its body: an open panel. Default: true for the kind `open`. It sets the cross size unless `setsCross` says
   * otherwise, and a window model reads it as the item being open.
   */
  readonly body?: boolean;
  /**
   * It shows only its bar: a panel folded to its header, a group folded to its grip and ». Default: true for the kinds
   * `header` and `fold`. A window model reads it as folded: a hand fold takes the first such form, and a float in it
   * keeps its bar's height.
   */
  readonly folded?: boolean;
  /** Icons only. Default: true for the kind `icons`. A window model's compact (icons-only) edge takes it. */
  readonly compact?: boolean;
  /**
   * Give-way order (default 0). When the stack is too long, the step taken is the one into the lowest-ranked next
   * form across all items (the form the item would take, not the one it leaves); ties go unkept before kept, then the
   * item used longest ago, then the later in the stack. A pinned primary's last forms get a higher rank, so every
   * other group collapses before it does.
   */
  readonly rank?: number;
  /**
   * A form whose length depends on the cross size it gets (meant for a column of words). With it, `main` and `cross` are
   * computed and the given ones ignored: the rows are laid once the stack's cross size is known (beside the lead, a
   * hanging indent), and `main.min` and `main.natural` are rows × `row`. It fits a cross size only when no row but the
   * last holds a single word (`formFitsCross`); below that it is too wide and takes its next form, and `cross.min` is the
   * narrowest cross where it fits (`formCrossMin`). Its one-row width (lead, words and gaps) counts as `cross.natural` only
   * with `setsCross: true`; such a setter is clamped to the stack's limits like any setter and, without `strictCross`,
   * never goes to its next form. Give-way, fits, `previous` and growth use the computed length; under `ownCross` the item
   * is drawn as wide as its rows need. A word group needs an `icons` form after it: vertical places skip `wrap` forms.
   */
  readonly wrap?: WrapSpec;
  /**
   * A grip at the form's start along the stack, this long (an icons strip's horizontal grip on top). A window model (`@n-uf/docking`)
   * reports its rect; a `wrap` form's grip is its lead cell instead.
   */
  readonly grip?: number;
  /**
   * The control ids this form leaves out, against the item's first form: a compact variant of a toolbar (a row form
   * between the full row and its wrap, smaller, its "+N" cell counted in its size) hides some controls a "+N" control
   * reaches. Any form may set it (a wrap, icons or menu form too). The ladder reads it nowhere: a variant is a form like
   * any other, taken in order, giving way and coming back by the usual rules. `@n-uf/docking` reports the chosen form's ids
   * as `hidden`.
   */
  readonly hides?: readonly string[];
  /**
   * A `rail` form that draws the item's title along the rail (its name and count, turned to run along it) instead of
   * its tile. Put it just before the item's tile `rail` form: in a rail the two are steps on the ladder, the title giving
   * way to the tile by the usual rules and coming back in exact reverse. Its `main` is the title's length along the rail,
   * measured by the host. A stack offers it only with `StackInput.titles`; otherwise it is passed over like a form that
   * isn't there (never started in, stepped into or grown back to). `@n-uf/docking` offers it in a rail whose side shows
   * titles (`DockState.railModes`, default `"titles"`) and reports the side it reads from (`DockItemLayout.railTitle`).
   */
  readonly title?: boolean;
}

const nonNeg = (x: number | undefined): number => (typeof x === "number" && Number.isFinite(x) ? Math.max(0, x) : 0);

/**
 * The least a form can be drawn across the stack: its `cross.min` (default its `natural`), or for a `wrap` form the
 * narrowest cross size at which its rows fit (no single word on a row but the last). A window model's size clamp and
 * column shrink read it too.
 */
export function formCrossMin(f: StackForm): number {
  if (f.wrap) return wrapCross(f.wrap).min;
  const v = f.cross.min ?? f.cross.natural;
  return Number.isFinite(v) ? v : 0;
}

/** A form's length along the stack: its `main` size, or for a `wrap` form its rows at cross size `cross` times the row height. */
export function formMain(f: StackForm, which: "min" | "natural", cross: number): number {
  if (f.kind === "menu") return 0;
  if (f.wrap) return wrapRows(f.wrap, cross).rows * nonNeg(f.wrap.row);
  return nonNeg(f.main[which]);
}

/**
 * Whether a `wrap` form fits cross size `cross`: every word fits beside the lead, and no row but the last holds a single
 * word. True for any other form (their `cross.min` decides).
 */
export function formFitsCross(f: StackForm, cross: number): boolean {
  if (!f.wrap) return true;
  const widest = Math.max(0, ...f.wrap.widths.map(nonNeg));
  return cross + 1e-6 >= nonNeg(f.wrap.lead) + widest && wrapLines(f.wrap, cross).fits;
}

/** The widths a row can take: the lead and a run of neighboring words, narrowest first. */
function rowWidths(spec: WrapSpec): number[] {
  const gap = nonNeg(spec.gap);
  const lead = nonNeg(spec.lead);
  const widths = spec.widths.map(nonNeg);
  const out: number[] = [];
  for (let i = 0; i < widths.length; i++) {
    let run = 0;
    for (let j = i; j < widths.length; j++) {
      run += widths[j]! + (j > i ? gap : 0);
      out.push(lead + run);
    }
  }
  return out.sort((a, b) => a - b);
}

/**
 * A wrap form's rows at cross size `cross`: the word indexes per row, how wide the widest row is (the lead included),
 * and whether the form fits (with two words or more, no row but the last holds a single word). Greedy rows can leave a
 * single word on a row at one width and not at a narrower one, so when the rows at `cross` don't fit they are laid at
 * the widest narrower width that fits: a form that fits a cross size fits every wider one, and widening never turns
 * its words into icons.
 */
export function wrapLines(spec: WrapSpec, cross: number): { lines: number[][]; width: number; fits: boolean } {
  const g = greedyLines(spec, cross);
  if (g.fits) return g;
  const narrower = rowWidths(spec).filter((c) => c <= cross + 1e-6);
  for (let i = narrower.length - 1; i >= 0; i--) {
    const h = greedyLines(spec, narrower[i]!);
    if (h.fits) return h;
  }
  return g;
}

/** Rows laid greedily at cross size `cross`: each takes words while they fit, and always takes one. */
function greedyLines(spec: WrapSpec, cross: number): { lines: number[][]; width: number; fits: boolean } {
  const gap = nonNeg(spec.gap);
  const lead = nonNeg(spec.lead);
  const widths = spec.widths.map(nonNeg);
  if (widths.length === 0) return { lines: [], width: lead, fits: true };
  // A hanging indent: every row starts after the lead; a row takes words while they fit, and always takes one.
  const box = cross - lead;
  const lines: number[][] = [[]];
  let x = 0;
  let widest = 0;
  widths.forEach((w, i) => {
    const row = lines[lines.length - 1]!;
    if (row.length > 0 && x + gap + w > box + 1e-6) {
      widest = Math.max(widest, x);
      lines.push([i]);
      x = w;
    } else {
      x = row.length > 0 ? x + gap + w : w;
      row.push(i);
    }
  });
  widest = Math.max(widest, x);
  const fits = widths.length < 2 || lines.slice(0, -1).every((l) => l.length >= 2);
  return { lines, width: lead + widest, fits };
}

/** A wrap form's rows at cross size `cross`: how many, how wide the widest is, and whether it fits. */
export function wrapRows(spec: WrapSpec, cross: number): { rows: number; width: number; fits: boolean } {
  const w = wrapLines(spec, cross);
  return { rows: Math.max(1, w.lines.length), width: w.width, fits: w.fits };
}

/**
 * A wrap form's one-row width, and the narrowest cross size at which it fits: its rows hold no single word on a row but
 * the last (with one word, the lead and that word). Looked for among the widths a row can take (the lead and a run of
 * words), the narrowest that fits.
 */
export function wrapCross(spec: WrapSpec): { natural: number; min: number } {
  const gap = nonNeg(spec.gap);
  const lead = nonNeg(spec.lead);
  const widths = spec.widths.map(nonNeg);
  const natural = lead + widths.reduce((s, w) => s + w, 0) + Math.max(0, widths.length - 1) * gap;
  if (widths.length < 2) return { natural, min: natural };
  // The narrowest cross where some width no wider fits (`wrapLines` lays the rows there) and every word fits beside the lead.
  const first = rowWidths(spec).find((c) => greedyLines(spec, c).fits) ?? natural;
  const min = Math.max(lead + Math.max(...widths), first);
  return { natural, min };
}

export interface StackItem {
  readonly id: string;
  /** Largest first. The solver starts at `from` and steps down one at a time. An item with none is left out. */
  readonly forms: readonly StackForm[];
  /** How recently it was used: the smaller, the longer ago, the sooner it gives way. */
  readonly used: number;
  /** Kept: gives way after every item that isn't. */
  readonly kept?: boolean;
  /**
   * The first form the item may take, an index into `forms` (default 0; a panel folded by hand starts at its header).
   * The solver never goes above it. `form` in the result and in the notes are indexes into `forms`, not into what is
   * left after `from`.
   */
  readonly from?: number;
  /**
   * A fixed item is a reserved room, such as the title and the window controls of a title bar. It never gives way:
   * it keeps its first allowed form (`forms[from]`) whatever the length or the cross size, so it is never in the » menu
   * unless that is the form it starts in, and it doesn't take part in `previous`'s growing back. It counts toward the
   * length like any item (the others give way around it, and a stack too short for it overflows). It is never dropped:
   * `stackGaps` refuses every gap for it, and a drop beside it never squeezes it. Whether it may sit among others (or
   * first, or last) is the host's; placement lays out the items it is given.
   */
  readonly fixed?: boolean;
}

/** The cross size a stack may take. With no form setting it, the stack is a `rail` wide (default {@link DEFAULT_RAIL}). */
export interface CrossLimits {
  readonly min: number;
  readonly max: number;
  readonly rail?: number;
}

export interface StackInput {
  readonly axis: StackAxis;
  /** The stack's length along the axis. */
  readonly length: number;
  readonly cross: CrossLimits;
  /** In order, from the start of the stack. */
  readonly items: readonly StackItem[];
  /** The » menu entry's size along the stack, taken only while an item is in the menu (default {@link DEFAULT_MENU}). */
  readonly menu?: { readonly main: number };
  /**
   * The space between neighboring drawn items, px (default 0). The » entry is a neighbor of the last drawn item. It
   * counts toward the length and the rects include it, so an app draws at the solver's rects.
   */
  readonly gap?: number;
  /** Space before the first item and after the last (or after the » entry), px (default 0 each). Counts toward the length. */
  readonly pad?: { readonly start?: number; readonly end?: number };
  /**
   * Strict cross sizes (default false): a form is never drawn thinner than its `cross.min` (default its `natural`), so a
   * form that sets the cross size and has a `cross.min` over `cross.max` steps down to its next form (never into the
   * menu: with only the menu left it keeps its last drawn form and a `too-wide` note says so). Without it such a form is
   * only clamped to `cross.max`, as it always was.
   */
  readonly strictCross?: boolean;
  /**
   * Which items this stack takes (default: every item). `stackGaps` refuses every gap for an item it doesn't accept, so
   * a toolbar-only stack takes no panel and a panel-only one no group. What an item's kind is
   * stays the host's: placement only calls this, on the dragged item, and `fitStack` never does (items already in the
   * stack are laid out as given).
   */
  readonly accepts?: (item: StackItem) => boolean;
  /**
   * Groups take their own size across (default false: every item spans the stack's cross size). With it, an item whose
   * current form is a group kind (`row`, `stacked`, `wrap`, `icons`, `fold`; a `wrap` form as wide as its rows need) is drawn `cross.natural` across, clamped to the
   * stack's cross size, from the stack's start edge across (the left of a column, the top of a bar), so a group in a
   * side column is as wide as its own form asks, not as the column. Panel kinds (`open`, `header`, `rail`) and the »
   * entry still span it: every open panel and header fills the column. The kind decides, not `setsCross`, which still
   * decides the stack's cross size as before: a group's form that sets it (words in a column: `stacked` with
   * `setsCross: true`) widens the column to the widest such group but is drawn at its own width. The stack's cross
   * size, the forms, the notes and the lengths are as without it; only the rects of group forms are narrower.
   */
  readonly ownCross?: boolean;
  /**
   * Offer the forms marked `title` (default false: they are passed over, so a stack without it lays out as if they
   * weren't declared). A rail showing titles sets it.
   */
  readonly titles?: boolean;
}

/** The width of a stack nothing open holds, px. */
export const DEFAULT_RAIL = 30;
/** The » menu entry's size along the stack, px. */
export const DEFAULT_MENU = 28;

const finite = (x: number, fallback: number): number => (Number.isFinite(x) ? x : fallback);

/**
 * The cross limits with a non-number replaced: `min` and `rail` that aren't finite become 0 and the default rail, a
 * `max` that is NaN becomes no limit (Infinity is one already), and `max` is never under `min`.
 */
export function limitsOf(input: StackInput): { readonly min: number; readonly max: number; readonly rail: number } {
  const min = Math.max(0, finite(input.cross.min, 0));
  const max = Number.isNaN(input.cross.max) ? Infinity : input.cross.max;
  return { min, max: Math.max(min, max), rail: Math.max(0, finite(input.cross.rail ?? DEFAULT_RAIL, DEFAULT_RAIL)) };
}
export const menuMain = (input: StackInput): number => Math.max(0, finite(input.menu?.main ?? DEFAULT_MENU, DEFAULT_MENU));

/** The gap and padding with a non-number or a negative one replaced by 0. */
export function spacingOf(input: StackInput): { readonly gap: number; readonly start: number; readonly end: number } {
  const px = (x: number | undefined): number => Math.max(0, finite(x ?? 0, 0));
  return { gap: px(input.gap), start: px(input.pad?.start), end: px(input.pad?.end) };
}

/** Whether a form shows its body (`body`, default: the kind `open`). */
export const formBody = (f: StackForm): boolean => f.body ?? f.kind === "open";
/** Whether a form shows only its bar (`folded`, default: the kinds `header` and `fold`). */
export const formFolded = (f: StackForm): boolean => f.folded ?? (f.kind === "header" || f.kind === "fold");
/** Whether a form is icons only (`compact`, default: the kind `icons`). */
export const formCompact = (f: StackForm): boolean => f.compact ?? f.kind === "icons";

/** Whether a form sets the stack's cross size: its own say, else whether it shows its body. */
export const formSetsCross = (f: StackForm): boolean => f.setsCross ?? formBody(f);

/** `input` with `item` inserted at index `at` (clamped to the items' range). */
export function withItem(input: StackInput, item: StackItem, at: number): StackInput {
  const k = Math.min(Math.max(0, Math.floor(at)), input.items.length);
  return { ...input, items: [...input.items.slice(0, k), item, ...input.items.slice(k)] };
}

/** An item drawn: the form it took, its kind and its rect (stack-local px). One in the menu has the menu entry's rect. */
export interface PlacedStackItem {
  readonly id: string;
  /** Index into the item's `forms`. */
  readonly form: number;
  readonly kind: StackFormKind;
  readonly rect: Rect;
}

export interface StackMenu {
  /** The » entry's rect. */
  readonly rect: Rect;
  /** The items in it, in the stack's order: exactly the items whose kind is `menu`. */
  readonly items: readonly string[];
}

/**
 * Why a stack looks as it does:
 * - `form-down`: an item took a smaller form than the one it started in (`from`, an index into its forms), by length
 *   or by cross size.
 * - `to-menu`: an item is in the » menu.
 * - `too-wide`: an item's form doesn't set the cross size and its `cross.min` is over the stack's, or (with `strictCross`)
 *   it does and its `cross.min` is over the limits' `max`. Cross size never puts an item in the menu, so it keeps its last drawn form
 *   and the app clips it.
 * - `no-forms`: an item with no forms, left out of `items`.
 * - `overflow`: no item can give more way and the stack is still `over` px too long (forms that don't end in a `menu`
 *   form can't give more; neither can a stack where going into the menu would only make it longer).
 */
export type StackNote =
  | { readonly code: "form-down"; readonly id: string; readonly from: number; readonly to: number }
  | { readonly code: "to-menu"; readonly id: string }
  | { readonly code: "too-wide"; readonly id: string }
  | { readonly code: "no-forms"; readonly id: string }
  | { readonly code: "overflow"; readonly over: number };
export type StackNoteCode = StackNote["code"];

export interface StackFit {
  readonly axis: StackAxis;
  readonly length: number;
  /** The stack's size across: the widest `open` (clamped to the limits), or the rail. */
  readonly cross: number;
  /** One per input item that has forms, in order. */
  readonly items: readonly PlacedStackItem[];
  /** The » entry, or null while no item is in the menu. */
  readonly menu: StackMenu | null;
  /** `no-forms` first, then `form-down` per item in the order they gave way, `to-menu`, `too-wide`, and `overflow`. */
  readonly notes: readonly StackNote[];
  /**
   * The length the chosen forms need at least: their smallest sizes, the » entry, the gaps and the padding. Over `length`
   * only when the stack overflows. `fitStack`'s `previous` reads it to tell room coming back from a change of ages.
   */
  readonly need?: number;
  /**
   * The give-way history: every step down from the items' starting forms to the forms chosen, in the order taken (items
   * that went into the » menu together share a `batch`). `fitStack`'s `previous` carries it on, and room coming back
   * undoes it from the last step: growing back is exactly the reverse of giving way.
   */
  readonly steps?: readonly StackStep[];
}

/** One give-way step: item `id` went from form `from` to form `to`; steps sharing a `batch` were taken together. */
export interface StackStep {
  readonly id: string;
  readonly from: number;
  readonly to: number;
  readonly batch?: number;
}

/** What `fitStack` takes besides the input. */
export interface FitOptions {
  /**
   * The fit the stack had before. While the forms it chose still fit, they are kept: a change of `used` ages alone (a press
   * on a header) reshapes nothing. Ages decide only who gives way anew (the length shrank, an item was added or opened),
   * and room that came back is used, but growing never re-ranks: the fresh fit is taken when the stack got wider across;
   * otherwise room comes back by undoing the give-way history (`StackFit.steps`, carried on from fit to fit) from its
   * last step: a batch that went into the » menu together comes out together, an item goes back to the nearest earlier
   * form the stack fits with (the last item out of the menu takes the » entry with it), and the first step that can't
   * be undone stops all growth. Growing back is exactly the reverse of giving way, the menu included: at every length
   * the way back holds what the way down held, whatever presses changed the ages since; an item made `kept` after its
   * step comes back in step order, it doesn't jump ahead. A `previous` without a history
   * (built by hand, or by an older version) grows the old way: a fresh fit that is a pure gain, else the item that gave
   * way most recently (highest rank, then `kept`, the newest used, the earlier in the stack) first, menu items out only
   * while that keeps the order.
   * One px of room moves nothing. Results under `previous` depend on history: a shrink then a grow may end at another
   * arrangement than a fresh solve of the same input, and more room never undoes a growth along successive solves.
   * Growing back is meant for stacks of up to about 50 items (60 small menu items take about 9 ms; the cost grows with
   * about the cube of the count). Items it doesn't know start from their largest form; an item whose `from` went down
   * since (a panel opened), or whose form at the kept index is of another kind, starts over. A form that was only
   * re-measured keeps its place: smaller, it frees room that grows the kept forms; larger, it gives way from the kept
   * forms.
   *
   * Not covered: a lowered `cross.min` (or any change of the forms' cross sizes) doesn't bring a form back under
   * `previous`. After changing cross sizes, solve once without `previous`.
   */
  readonly previous?: StackFit;
}
