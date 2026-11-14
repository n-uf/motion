/**
 * The Edge stack page's cases: each one a preset on the one stage (settings and a starting state), what to look at, a
 * one-sentence expectation, two or three steps to try, and a check that drives the stage with real pointer and key
 * events and says what it expected and what it saw. The cases are the docking cases C1 to C23 and the toolbar cases T1
 * to T6 (T2 and T4 are one decision, one case). `fixtures` names the scenarios of the Edge stack's check fixtures that
 * prove the same case in more depth; they run on the Checks page.
 */
import type { Rect } from "@n-uf/motion";
import type { Point } from "../shared/geometry";
import { overlap } from "../shared/geometry";
import { EDGE_BAR_LENGTH, EDGE_DEFAULTS, type Board, type EdgeSettings, type Layout } from "./board";
import type { Driver } from "./drive";
import { aimers } from "./drive";
import { fmt, near } from "./run";
import { FOLD, formsOf, titleOf, type ItemId, type Phase } from "./sample";
import { KIND_WORDS } from "./words";

export type CaseGroup = "panels" | "groups" | "drag" | "floats";
export const CASE_GROUPS: readonly { id: CaseGroup; title: string }[] = [
  { id: "panels", title: "Panels in a column" },
  { id: "groups", title: "Groups and toolbars" },
  { id: "drag", title: "Dragging" },
  { id: "floats", title: "Floats, saving, freeze" },
];

/** A case's starting state on the stage. Anything left out is the stage's default. */
export interface Preset {
  readonly settings?: Partial<EdgeSettings>;
  readonly layout?: Layout;
  readonly used?: Partial<Record<ItemId, number>>;
  readonly kept?: readonly ItemId[];
  /** First forms allowed (a panel folded by hand: 1, down to its rail: 2). */
  readonly from?: Partial<Record<ItemId, number>>;
  readonly frozen?: boolean;
  readonly meta?: Partial<Record<ItemId, { count?: number; phase?: Phase }>>;
}

/** A control of the settings strip: a setting, or the freeze, the counts, the stored layout. */
export type Control = keyof EdgeSettings | "freeze" | "counts" | "stored";

/** What to look at: items, or a whole stack, or the pages under them. */
export type Look = ItemId | "column" | "bar" | "pages";

export interface Verdict {
  readonly ok: boolean;
  readonly expected: string;
  readonly now: string;
}

export interface Ctx {
  readonly b: Board;
  readonly d: Driver;
  readonly aim: ReturnType<typeof aimers>;
}

export interface EdgeCase {
  readonly id: string;
  readonly group: CaseGroup;
  readonly title: string;
  /** The expectation, one sentence. */
  readonly expect: string;
  /** Two or three steps to try on the stage. */
  readonly tries: readonly string[];
  readonly look: readonly Look[];
  readonly preset: Preset;
  /** The check fixtures' scenarios that prove the same case (they run on the Checks page). */
  readonly fixtures: readonly string[];
  /** The settings strip's controls the Try steps use (those the preset sets are marked too). */
  readonly controls?: readonly Control[];
  check(c: Ctx): Promise<Verdict>;
}

// --- helpers -----------------------------------------------------------------------------------------------------------

const kindWords = (k: string | undefined): string => (k ? (KIND_WORDS[k] ?? (k === "fold" ? "a fold » in line" : k)) : "nowhere");
const placed = (b: Board, id: ItemId) => b.seen().find((s) => s.id === id);
const kindOf = (b: Board, id: ItemId): string | undefined => placed(b, id)?.kind;
const verdict = (ok: boolean, expected: string, now: string): Verdict => ({ ok, expected, now });
const centre = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

/** The middle of the gap `at` of a stack, for dragging `id`. */
function gapPoint(b: Board, id: ItemId, side: "column" | "bar", at: number): Point {
  const t = b.targetsFor(id).find((x) => x.kind === "dock" && x.side === side && x.at === at);
  if (!t) throw new Error(`no gap ${side}:${at} for ${titleOf(id)}`);
  return centre(t.kind === "dock" ? t.slot : t.hit);
}

/** Press and release on `el` without moving: a click as the stage sees it. */
async function click(d: Driver, el: HTMLElement, dx = 8): Promise<void> {
  await d.press(el, dx);
  await d.release();
}

/** Every item that moved more than `tol` px between two looks, `except` left out. */
function movedBetween(a: Map<ItemId, Rect>, c: Map<ItemId, Rect>, except: ItemId | null, tol = 0.5): string[] {
  const out: string[] = [];
  for (const [id, r] of a) {
    if (id === except) continue;
    const s = c.get(id);
    if (!s) out.push(`${titleOf(id)} is gone`);
    else if (!near(r, s, tol)) out.push(`${titleOf(id)} ${fmt(r)} → ${fmt(s)}`);
  }
  return out;
}

/** Drag `id` by its grip into the gap `at` of `side`, wait for the room to open, and let go. */
async function dragTo(c: Ctx, id: ItemId, side: "column" | "bar", at: number): Promise<boolean> {
  const to = gapPoint(c.b, id, side, at);
  await c.aim.lift(id, 6, 10);
  const shown = await c.aim.dock(to);
  await c.d.release();
  return shown;
}

/** The bar's groups and their kinds, for a readout. */
const barKinds = (b: Board): string =>
  b
    .fits()
    .bar.items.map((p) => `${titleOf(p.id)} ${kindWords(p.kind)}`)
    .join(", ");

// --- the cases ---------------------------------------------------------------------------------------------------------

const COLUMN3: Layout = { column: ["pages", "annotations", "findings"], bar: ["views", "tools", "zoom"], floats: [] };

export const EDGE_CASES: readonly EdgeCase[] = [
  // --- panels in a column ---------------------------------------------------------------------------------------------
  {
    id: "C6",
    group: "panels",
    title: "A column taller than its content",
    expect: "Groups and folded panels take only their own length; the rest of the column goes to the open panel.",
    tries: ["Raise the column length: Pages grows, Views keeps its height.", "Fold Pages by double-clicking its header: the column shrinks to what is left, a rail if nothing is open."],
    look: ["pages", "views", "column"],
    preset: { layout: { column: ["views", "pages"], bar: ["tools", "zoom"], floats: [{ id: "annotations", rect: { x: 420, y: 120, width: 240, height: 150 } }, { id: "findings", rect: { x: 600, y: 290, width: 220, height: 190 } }] } },
    fixtures: ["C6: spare room goes to the open panels"],
    controls: ["height"],
    async check({ b }) {
      const fit = b.fits().column;
      const views = fit.items.find((p) => p.id === "views")!;
      const pages = fit.items.find((p) => p.id === "pages")!;
      // A group's form never grows: it is as long as its form says, whatever the column's length.
      const own = formsOf("views", "column", true)[views.form]!.main.natural;
      const spare = fit.length - views.rect.height;
      const ok = pages.kind === "open" && Math.abs(pages.rect.height - spare) <= 0.5 && Math.abs(views.rect.height - own) <= 0.5;
      return verdict(ok, `Views ${own} px tall (${kindWords(views.kind)}, its own length), Pages open and ${Math.round(spare)} px tall (the rest)`, `Views ${Math.round(views.rect.height)} px, Pages ${kindWords(pages.kind)} and ${Math.round(pages.rect.height)} px tall`);
    },
  },
  {
    id: "C8",
    group: "panels",
    title: "Independent panels",
    expect: "Any combination of panels can be open: opening or docking one never closes another.",
    tries: ["Click Annotations' ▸ to open it: Pages and Findings stay open.", "Fold any two by double-clicking their headers, then open one: the other stays as it was."],
    look: ["pages", "annotations", "findings"],
    preset: { layout: COLUMN3, from: { annotations: 1 } },
    fixtures: ["C8: panels open independently", "The column and the bar are independent examples"],
    async check({ b, d }) {
      const caret = b.itemEl("annotations")?.querySelector<HTMLElement>(".st-caret");
      if (!caret) return verdict(false, "Annotations folded to its header, with a ▸", `Annotations ${kindWords(kindOf(b, "annotations"))}`);
      const g = d.domRect(caret);
      d.pointer("pointerdown", { x: g.x + 2, y: g.y + g.height / 2 }, caret);
      await d.frames(1);
      await d.release();
      const kinds = (["pages", "annotations", "findings"] as const).map((id) => `${titleOf(id)} ${kindWords(kindOf(b, id))}`);
      const ok = (["pages", "annotations", "findings"] as const).every((id) => kindOf(b, id) === "open");
      return verdict(ok, "Pages, Annotations and Findings all open", kinds.join(", "));
    },
  },
  {
    id: "C9",
    group: "panels",
    title: "Give-way",
    expect: "When the open panels don't fit their minimum heights, the one used longest ago folds to its header first, then to a rail icon.",
    tries: ["Lower the column length: Annotations (used longest ago, though second in the list) folds first, then Findings.", "Click Annotations' ▸ to open it: it is now the newest, so another panel gives way instead."],
    look: ["pages", "annotations", "findings"],
    // The use order is not the list order: Annotations is the oldest, Findings next, Pages the newest.
    preset: { layout: COLUMN3, settings: { height: 300 }, used: { annotations: 1, findings: 2, pages: 3 } },
    fixtures: ["C9: give-way by age, kept last", "The status lists the notes"],
    controls: ["height"],
    async check({ b }) {
      const k = (id: ItemId) => kindOf(b, id);
      const first = k("annotations") !== "open" && k("pages") === "open" && k("findings") === "open";
      // Shorter still, the next oldest (Findings) goes before the newest (Pages).
      b.setEdge({ height: 240 });
      const pagesLast = k("findings") !== "open" && !(k("pages") !== "open" && k("findings") === "open");
      const now = `Annotations ${kindWords(k("annotations"))}, Findings ${kindWords(k("findings"))}, Pages ${kindWords(k("pages"))} at 240 px`;
      b.setEdge({ height: 300 });
      return verdict(first && pagesLast, "Annotations (oldest) steps down first, not Pages (first in the list); Pages, the newest, last", `${first ? "Annotations first" : "not Annotations first"}; ${now}`);
    },
  },
  {
    id: "C18",
    group: "panels",
    title: "A rail icon opens on click",
    expect: "A click on a panel's rail icon opens that panel; a click is never a drag, and a drag never opens.",
    tries: ["Click the P icon in the column: Pages opens.", "Drag the icon instead: it moves, and stays a rail icon wherever it lands."],
    look: ["pages"],
    preset: { layout: { column: ["pages", "annotations"], bar: ["views", "tools", "zoom"], floats: [{ id: "findings", rect: { x: 440, y: 130, width: 220, height: 190 } }] }, from: { pages: 2 } },
    fixtures: ["A click opens a collapsed panel"],
    async check({ b, d }) {
      const before = kindOf(b, "pages");
      const badge = b.itemEl("pages")?.querySelector<HTMLElement>(".st-badge");
      if (!badge) return verdict(false, "Pages starts as a rail icon", `Pages ${kindWords(before)}`);
      await click(d, badge, 4);
      const after = kindOf(b, "pages");
      return verdict(before === "rail" && after === "open", "A rail icon, then open after one click", `${kindWords(before)}, then ${kindWords(after)}`);
    },
  },
  {
    id: "C23",
    group: "panels",
    title: "A press is not a reshape",
    expect: "A press on a grip or a header, with no drag and nothing opened, never changes another item's form or rect.",
    tries: ["Press each header and grip in turn without moving: nothing else moves.", "Lower the column length after a press: give-way still goes by age."],
    look: ["pages", "annotations", "findings", "column"],
    preset: { layout: COLUMN3, settings: { height: 300 } },
    fixtures: ["C23: a press is not a reshape", "N1: a press, then a count gaining a digit, reshapes nothing else", "N2: a press, then a count losing a digit, reshapes nothing else"],
    controls: ["height"],
    async check({ b, d }) {
      const moved: string[] = [];
      for (const id of ["pages", "annotations", "findings", "views", "tools", "zoom"] as const) {
        const grip = b.gripOf(id);
        if (!grip) continue;
        const before = b.drawnNow();
        await click(d, grip, 3);
        moved.push(...movedBetween(before, b.drawnNow(), id).map((m) => `press on ${titleOf(id)}: ${m}`));
      }
      return verdict(moved.length === 0, "No other item moves on any press", moved.length ? moved.slice(0, 3).join("; ") : "Nothing else moved on six presses");
    },
  },

  // --- groups and toolbars --------------------------------------------------------------------------------------------
  {
    id: "C2",
    group: "groups",
    title: "A group alone in a column",
    expect: "A group never sets the column's width: alone, the column is a rail of about 30 px with the group as icons.",
    tries: ["Drag Pages into the column: it opens to the panel's width.", "Drag Pages out again: the column falls back to a rail."],
    look: ["views", "column"],
    preset: { layout: { column: ["views"], bar: ["tools", "zoom", "pages"], floats: [{ id: "annotations", rect: { x: 420, y: 120, width: 240, height: 150 } }, { id: "findings", rect: { x: 600, y: 290, width: 220, height: 190 } }] } },
    fixtures: ["C2: a group alone gives a rail"],
    async check({ b }) {
      const cross = b.fits().column.cross;
      const k = kindOf(b, "views");
      return verdict(cross <= 32 && k === "icons", "Column about 30 px wide, Views as icons", `Column ${cross} px wide, Views ${kindWords(k)}`);
    },
  },
  {
    id: "C10",
    group: "groups",
    title: "Group forms by space",
    expect: "A group takes the largest form that fits its column or bar: a row of words, stacked words, icons, then the » menu.",
    tries: ["Move the column width up and down: Views and Tools step between a row, stacked words and icons.", "Shorten the bar: its groups fold in line, then go to the » menu."],
    look: ["views", "tools", "column"],
    preset: { layout: { column: ["pages", "views", "tools"], bar: ["zoom"], floats: [{ id: "annotations", rect: { x: 420, y: 120, width: 240, height: 150 } }, { id: "findings", rect: { x: 600, y: 290, width: 220, height: 190 } }] }, settings: { widthLimit: 140 } },
    fixtures: ["C10: group forms by space"],
    controls: ["widthLimit", "barLength"],
    async check({ b }) {
      const fit = b.fits().column;
      const groups = fit.items.filter((p) => p.id === "views" || p.id === "tools");
      // The largest form that fits: every larger form of the group is wider than the column, the one taken is not.
      const wrong = groups.filter((p) => {
        const forms = formsOf(p.id as ItemId, "column", true);
        const fits = (i: number): boolean => forms[i]!.cross.natural <= fit.cross + 0.5;
        const largest = forms.findIndex((_, i) => forms[i]!.kind !== "menu" && fits(i));
        return p.form !== largest || p.rect.width > fit.cross + 0.5;
      });
      const expected = groups.map((p) => {
        const forms = formsOf(p.id as ItemId, "column", true);
        const i = forms.findIndex((f) => f.kind !== "menu" && f.cross.natural <= fit.cross + 0.5);
        return `${titleOf(p.id)} ${kindWords(forms[i]?.kind)}`;
      });
      return verdict(wrong.length === 0, `In the ${fit.cross} px column, the largest form that fits: ${expected.join(", ")}`, groups.map((p) => `${titleOf(p.id)} ${kindWords(p.kind)} (${Math.round(p.rect.width)} px)`).join(", "));
    },
  },
  {
    id: "C11",
    group: "groups",
    title: "Draggable groups",
    expect: "Every control group, the zoom group too, is a movable group with a grip.",
    tries: ["Drag Zoom by its grip into the column.", "Drag it back into the bar, before Views."],
    look: ["views", "tools", "zoom"],
    preset: {},
    fixtures: ["Every drawn item has a grab handle"],
    async check({ b }) {
      const missing = (["views", "tools", "zoom"] as const).filter((id) => {
        const g = b.gripOf(id);
        return !g || g.getBoundingClientRect().width === 0;
      });
      return verdict(missing.length === 0, "Views, Tools and Zoom each show a grip", missing.length ? `No grip on ${missing.map(titleOf).join(", ")}` : "All three show a grip");
    },
  },
  {
    id: "C12",
    group: "groups",
    title: "No grip where nothing moves",
    expect: "A grip is drawn only on an item that moves; window controls that don't move and the pages carry none.",
    tries: ["Look over the stage: every grip belongs to a panel or a group, one each.", "Freeze the layout: every grip hides, since nothing moves."],
    look: ["pages"],
    preset: {},
    fixtures: [],
    controls: ["freeze"],
    async check({ b }) {
      const shown = (): HTMLElement[] => [...b.stage.querySelectorAll<HTMLElement>(".st-grip")].filter((g) => !g.closest("[hidden]") && getComputedStyle(g).visibility !== "hidden");
      const grips = shown();
      // The movable items: every item drawn (docked, not in the » menu, or floating).
      const items = [...b.stage.querySelectorAll<HTMLElement>(".st-item[data-id]")].filter((el) => !el.hidden && !el.classList.contains("st-held"));
      const owners = grips.map((g) => g.closest<HTMLElement>(".st-item[data-id]"));
      const stray = owners.filter((o) => !o).length;
      const inPages = grips.filter((g) => b.scroller.contains(g)).length;
      const once = items.every((el) => owners.filter((o) => o === el).length === 1);
      b.setFrozen(true);
      const frozen = b.visibleGrips();
      b.setFrozen(false);
      const ok = stray === 0 && inPages === 0 && once && grips.length === items.length && frozen === 0;
      return verdict(ok, `${items.length} grips, one per movable item, none in the pages; frozen, none`, `${grips.length} grips for ${items.length} items, ${stray} on nothing that moves, ${inPages} in the pages; frozen, ${frozen}`);
    },
  },
  {
    id: "C19",
    group: "groups",
    title: "A group in icon form keeps its grip",
    expect: "A group drawn as icons still has a grip, and it drags by it.",
    tries: ["Narrow the column width: Views turns to icons with a small grip above them.", "Drag Views by that grip onto the pages: it floats."],
    look: ["views"],
    preset: { layout: { column: ["pages", "views"], bar: ["tools", "zoom"], floats: [{ id: "annotations", rect: { x: 420, y: 120, width: 240, height: 150 } }, { id: "findings", rect: { x: 600, y: 290, width: 220, height: 190 } }] }, settings: { widthLimit: 60 } },
    fixtures: ["A group docked into a column of rails can be dragged out again"],
    controls: ["widthLimit"],
    async check({ b, d, aim }) {
      const k = kindOf(b, "views");
      const g = b.gripOf("views");
      if (k !== "icons" || !g) return verdict(false, "Views as icons with a grip", `Views ${kindWords(k)}${g ? "" : ", no grip"}`);
      const r = d.domRect(g);
      await aim.lift("views", Math.min(4, r.width / 2), Math.min(4, r.height / 2));
      const floated = await aim.float({ x: 520, y: 260 });
      await d.release();
      const now = kindOf(b, "views");
      return verdict(floated && placed(b, "views")?.where.kind === "float", "Views as icons, then a float after a drag by its grip", `Views ${kindWords(k)}, then ${placed(b, "views")?.where.kind === "float" ? "a float" : kindWords(now)}`);
    },
  },
  {
    id: "C21",
    group: "groups",
    title: "The toolbar never grows tall",
    expect: "The top bar is 40 px tall at most, whatever is in it: a panel there takes its header.",
    tries: ["Drag Pages from the column into the bar: it lands as a header, the bar stays 40 px.", "Raise a count to 12345: the bar's height doesn't change."],
    look: ["bar", "findings"],
    preset: { layout: { column: ["pages", "annotations"], bar: ["views", "tools", "findings"], floats: [] } },
    fixtures: ["T6: a form too thick for the bar steps down"],
    controls: ["barLength", "height", "counts"],
    async check(c) {
      const { b } = c;
      const seen: string[] = [];
      const look = (when: string): boolean => {
        const cross = b.fits().bar.cross;
        const h = b.views.bar.el.getBoundingClientRect().height;
        seen.push(`${when} ${cross} px`);
        return cross <= 40 && h <= 40.5;
      };
      let ok = look("at start") && kindOf(b, "findings") === "header";
      b.setEdge({ barLength: 300, height: 260 });
      ok = look("resized") && ok;
      b.setMeta("findings", { count: 12345 });
      ok = look("12345") && ok;
      b.setEdge({ barLength: EDGE_DEFAULTS.barLength, height: EDGE_DEFAULTS.height });
      const shown = await dragTo(c, "pages", "bar", 0);
      const k = kindOf(b, "pages");
      ok = look("Pages dropped in") && shown && (k === "header" || k === "rail" || k === "menu") && ok;
      return verdict(ok, "Bar ≤ 40 px tall at the start, resized, with a long count and with Pages dropped in (as a header)", `${seen.join(", ")}; Pages ${kindWords(k)}`);
    },
  },
  {
    id: "T1",
    group: "groups",
    title: "A » per folded group, in line",
    expect: "Short of room, a group folds to its own grip and », in its place in the bar; the shared » entry comes only after the folds.",
    tries: ["Shorten the bar: Views folds where it stands, then Zoom.", "Shorten it further: Tools goes to its icons, then everything folds, and only then the » entry appears."],
    look: ["views", "bar"],
    preset: { settings: { barLength: 640 } },
    fixtures: ["T1: a » per collapsed group, in line"],
    controls: ["barLength"],
    async check({ b }) {
      const fit = b.fits().bar;
      const views = fit.items.find((p) => p.id === "views");
      const tools = fit.items.find((p) => p.id === "tools");
      const ok = !!views && views.kind === "fold" && Math.abs(views.rect.width - FOLD) <= 0.5 && !!tools && views.rect.x < tools.rect.x && !fit.menu;
      return verdict(ok, `Views a ${FOLD} px fold before Tools, no » entry`, `${barKinds(b)}${fit.menu ? `, » entry with ${fit.menu.items.length}` : ", no » entry"}`);
    },
  },
  {
    id: "T2/T4",
    group: "groups",
    title: "A step goes only to a shorter form",
    expect: "Zoom's stacked words are as long as its row, so a give-way step never takes them; a form that doesn't shorten the bar is skipped.",
    tries: ["Shorten the bar slowly: Zoom goes from its row straight to its fold.", "Lengthen it: Zoom comes back to its row, never stacked."],
    look: ["zoom", "bar"],
    preset: { used: { zoom: 1 } },
    fixtures: ["T2/T4: a step goes only to a shorter form"],
    controls: ["barLength"],
    async check({ b }) {
      const kinds: string[] = [];
      let form = -1;
      let grew = "";
      for (let w = EDGE_DEFAULTS.barLength; w >= EDGE_BAR_LENGTH.min; w -= 10) {
        b.setEdge({ barLength: w });
        const p = b.fits().bar.items.find((x) => x.id === "zoom")!;
        if (kinds[kinds.length - 1] !== p.kind) kinds.push(p.kind);
        // Shortening the bar only ever steps Zoom down: its form index never goes back up.
        if (p.form < form && !grew) grew = `at ${w} px from form ${form} back to ${p.form}`;
        form = Math.max(form, p.form);
      }
      b.setEdge({ barLength: EDGE_DEFAULTS.barLength });
      const ok = kinds[0] === "row" && kinds[1] === "fold" && !kinds.includes("stacked") && !grew;
      return verdict(ok, `From ${EDGE_DEFAULTS.barLength} down to ${EDGE_BAR_LENGTH.min} px: Zoom a row, then a fold (never stacked), only ever shorter`, `Zoom was ${kinds.map(kindWords).join(" → ")}${grew ? `; grew ${grew}` : ""}`);
    },
  },
  {
    id: "T3",
    group: "groups",
    title: "The ranked primary gives way last",
    expect: "Tools, the primary, goes to its icons first and folds only after every other group has folded, even when it was used longest ago.",
    tries: ["Shorten the bar: Views and Zoom fold, Tools shows its icons.", "Shorten further: Tools folds last."],
    look: ["tools", "bar"],
    preset: { used: { tools: 0 } },
    fixtures: ["T3: the ranked primary gives way last"],
    controls: ["barLength"],
    async check({ b }) {
      const bad: string[] = [];
      const tools: string[] = [];
      let foldAt = 0;
      for (let w = EDGE_DEFAULTS.barLength; w >= EDGE_BAR_LENGTH.min; w -= 10) {
        b.setEdge({ barLength: w });
        const fit = b.fits().bar;
        const t = fit.items.find((p) => p.id === "tools")!.kind;
        if (tools[tools.length - 1] !== t) tools.push(t);
        if (t === "fold" && !foldAt) foldAt = w;
        // Tools folded while another group still shows more than its fold: the primary didn't give way last.
        if (t === "fold" && fit.items.some((p) => p.id !== "tools" && p.kind !== "fold" && p.kind !== "menu")) bad.push(`${w} px: ${barKinds(b)}`);
      }
      b.setEdge({ barLength: EDGE_DEFAULTS.barLength });
      const ok = bad.length === 0 && foldAt > 0 && tools.indexOf("icons") >= 0 && tools.indexOf("icons") < tools.indexOf("fold");
      const now = bad.length ? `folded too early at ${bad[0]!}` : foldAt ? `Tools was ${tools.map(kindWords).join(" → ")}, folding at ${foldAt} px with every other group already folded` : `Tools never folded (${tools.map(kindWords).join(" → ")})`;
      return verdict(ok, `From ${EDGE_DEFAULTS.barLength} down to ${EDGE_BAR_LENGTH.min} px: Tools a row, then icons, and its fold only once every other group is folded`, now);
    },
  },
  {
    id: "T5",
    group: "groups",
    title: "Gaps and padding are real",
    expect: "The bar's gap and padding count in its length and in every rect, so the groups are drawn exactly where the solver puts them.",
    tries: ["Move Gap and Pad: the groups move apart and in from the ends.", "Drag a group past the bar's last end: the end gap still takes it."],
    look: ["bar"],
    preset: { settings: { gap: 14, pad: 20 } },
    fixtures: ["T5: gaps, padding and the ends' reach", "The page draws the solver's rects"],
    controls: ["gap", "pad"],
    async check({ b }) {
      const fit = b.fits().bar;
      const items = fit.items.filter((p) => p.kind !== "menu");
      const gaps = items.slice(1).map((p, i) => Math.round((p.rect.x - (items[i]!.rect.x + items[i]!.rect.width)) * 10) / 10);
      const drawn = b.drawnNow();
      const solved = b.solved();
      const off = items.filter((p) => !near(drawn.get(p.id as ItemId)!, solved.get(p.id)!, 0.5));
      const ok = Math.abs(items[0]!.rect.x - 20) <= 0.5 && gaps.every((g) => Math.abs(g - 14) <= 0.5) && off.length === 0;
      return verdict(ok, "First group 20 px in, 14 px between groups, drawn at the solver's rects", `First at ${items[0]!.rect.x} px, gaps ${gaps.join(", ")} px, ${off.length} drawn off its rect`);
    },
  },
  {
    id: "T6",
    group: "groups",
    title: "A panel dropped into the bar lands as a header",
    expect: "An open panel is too thick for a 40 px bar, so dropped there it lands as its header and the bar stays 40 px.",
    tries: ["Drag Findings (the float) into the bar's last gap: it lands as a header.", "Drag it back out onto the pages: it floats open again."],
    look: ["findings", "bar"],
    preset: {},
    fixtures: ["T6: a form too thick for the bar steps down"],
    async check(c) {
      const shown = await dragTo(c, "findings", "bar", c.b.orders.bar.length);
      const fit = c.b.fits().bar;
      const k = kindOf(c.b, "findings");
      return verdict(shown && fit.cross <= 40 && k === "header", "Findings in the bar as a header; the bar 40 px tall", `${shown ? "" : "no gap shown; "}Findings ${kindWords(k)} in the ${placed(c.b, "findings")?.where.kind === "dock" ? "bar" : "float"}, bar ${fit.cross} px`);
    },
  },

  // --- dragging -------------------------------------------------------------------------------------------------------
  {
    id: "C1",
    group: "drag",
    title: "The drop preview is the rect it gets",
    expect: "The dashed preview is the exact rect the item gets after the drop: the same solve with the item inserted.",
    tries: ["Drag Annotations above Pages and hold: the dashed rectangle opens there.", "Let go: Annotations lands on that rectangle, not a pixel off."],
    look: ["annotations", "pages"],
    preset: {},
    fixtures: ["C1: the preview is the rect the item gets"],
    controls: ["preview"],
    async check(c) {
      const shown = await dragTo(c, "annotations", "column", 0);
      const drop = c.b.lastDrop;
      const ok = shown && !!drop?.previewDom && !!drop.landedDom && near(drop.previewDom, drop.landedDom, 0.5) && c.b.orders.column[0] === "annotations";
      return verdict(ok, "Preview and landed rect the same", `preview ${fmt(drop?.previewDom)}, landed ${fmt(drop?.landedDom)}`);
    },
  },
  {
    id: "C3",
    group: "drag",
    title: "Drop into any gap",
    expect: "Every gap of a column opens a slot: above, between and below its panels and groups.",
    tries: ["Drag Findings over the column: a slot opens above Pages, between, and below the last item.", "Do the same along the bar."],
    look: ["column"],
    preset: { layout: { column: ["pages", "annotations", "views"], bar: ["tools", "zoom"], floats: [{ id: "findings", rect: { x: 440, y: 130, width: 220, height: 190 } }] } },
    fixtures: ["C3: every gap opens a slot"],
    async check({ b }) {
      const gaps = b.targetsFor("findings").filter((t) => t.kind === "dock" && t.side === "column");
      const n = b.orders.column.length + 1;
      return verdict(gaps.length === n, `${n} gaps in the column for 3 items`, `${gaps.length} gaps`);
    },
  },
  {
    id: "C4",
    group: "drag",
    title: "A group into the panel column",
    expect: "A group dragged into the column opens a slot and takes the largest column form that fits.",
    tries: ["Drag Views from the bar below Annotations.", "Narrow the column width: Views steps to stacked words, then icons."],
    look: ["views", "column"],
    preset: {},
    fixtures: ["C4: a group dragged into a column"],
    async check(c) {
      const shown = await dragTo(c, "views", "column", c.b.orders.column.length);
      const s = placed(c.b, "views");
      const ok = shown && s?.where.kind === "dock" && s.where.side === "column" && ["row", "stacked", "icons"].includes(s.kind);
      return verdict(ok, "Views in the column as a row, stacked words or icons", `Views ${s?.where.kind === "dock" ? `in the ${s.where.side}` : "floating"}, ${kindWords(s?.kind)}`);
    },
  },
  {
    id: "C20",
    group: "drag",
    title: "Back over its own place",
    expect: "Dragged away and back over its own place, the item shows that place, and a release puts it back.",
    tries: ["Drag Pages onto the sheet, then back over where it was: the dashed rectangle says Back to its place.", "Let go: nothing else moved."],
    look: ["pages"],
    preset: {},
    fixtures: ["Back over its own place shows where a drop returns it"],
    async check(c) {
      const home = c.d.domRect(c.b.itemEl("pages")!);
      const before = c.b.orders;
      await c.aim.lift("pages", 20, 12);
      await c.d.approach({ x: home.x + 300, y: home.y + 120 });
      await c.d.frames(6);
      await c.d.approach({ x: home.x + 20, y: home.y + 12 });
      const homing = await c.d.until(() => /Back to its place/.test(c.b.status));
      await c.d.release();
      const after = c.b.orders;
      const ok = homing && JSON.stringify(before) === JSON.stringify(after);
      return verdict(ok, "Back to its place shown, the same order after the release", `${homing ? "shown" : "not shown"}; column ${after.column.map(titleOf).join(", ")}`);
    },
  },
  {
    id: "C22",
    group: "drag",
    title: "The whole preview",
    expect: "While a drop is previewed, every other item, floats too, is drawn at its rect after the drop, not only the dropped one.",
    tries: ["Drag Findings into the column's last gap and hold: Pages and Annotations shrink and the float moves clear, before you let go.", "Let go: nothing moves again."],
    look: ["pages", "annotations", "views"],
    preset: { layout: { column: ["pages", "annotations"], bar: ["tools", "zoom"], floats: [{ id: "findings", rect: { x: 440, y: 130, width: 220, height: 190 } }, { id: "views", rect: { x: 236, y: 330, width: 244, height: 34 } }] }, settings: { height: 400 } },
    fixtures: [],
    async check(c) {
      const to = gapPoint(c.b, "findings", "column", c.b.orders.column.length);
      const lifted = c.b.drawnNow();
      await c.aim.lift("findings", 10, 10);
      const shown = await c.aim.dock(to);
      await c.d.frames(2);
      const during = c.b.drawnNow();
      await c.d.release();
      const after = c.b.drawnNow();
      const off = movedBetween(during, after, "findings");
      const changed = movedBetween(lifted, after, "findings").length;
      const ok = shown && off.length === 0 && changed > 0;
      return verdict(ok, "Every other item drawn during the preview where it is after the drop (some do move)", `${shown ? "" : "no gap shown; "}${changed} items moved with the drop; ${off.length ? `off during the preview: ${off.slice(0, 2).join("; ")}` : "all drawn at their rects after it"}`);
    },
  },

  // --- floats, saving, freeze -----------------------------------------------------------------------------------------
  {
    id: "C5",
    group: "floats",
    title: "Floats stay put while the pages scroll",
    expect: "A float lies above the pages in the window's px: scrolling the pages never moves it.",
    tries: ["Scroll the pages with the wheel: Findings stays where it is.", "The bar and the column don't move either."],
    look: ["findings", "pages"],
    preset: {},
    fixtures: ["C5: floats stay put while the pages scroll"],
    async check({ b, d }) {
      const f0 = d.domRect(b.itemEl("findings")!);
      const m0 = b.sheetMark();
      b.scroller.scrollTop = 300;
      await d.frames(2);
      const f1 = d.domRect(b.itemEl("findings")!);
      const m1 = b.sheetMark();
      b.scroller.scrollTop = 0;
      const ok = near(f0, f1, 0.5) && m0.y - m1.y > 100;
      return verdict(ok, "The pages move up, Findings stays", `pages moved ${Math.round(m0.y - m1.y)} px, Findings moved ${Math.round(Math.hypot(f1.x - f0.x, f1.y - f0.y))} px`);
    },
  },
  {
    id: "C7",
    group: "floats",
    title: "A float over a docked panel",
    expect: "A float never covers a docked item's content: dropped over one, it lands beside it, and the preview says so.",
    tries: ["Drag Findings over the column and hold: the dashed rectangle sits beside the column.", "Let go: Findings lands there."],
    look: ["findings", "column"],
    preset: {},
    fixtures: ["C7: a float never covers a docked item's content"],
    async check(c) {
      // Held near its right end, the pointer stays off the column's gaps while the float's body lies over the column.
      const grab = await c.aim.lift("findings", 200, 10);
      const ok1 = await c.aim.float({ x: 60 + grab.x, y: 220 + grab.y });
      await c.d.release();
      const f = c.b.floats.find((x) => x.id === "findings")?.rect;
      const covered = f ? c.b.avoidRects("findings").filter((r) => overlap(r, f) > 0.5).length : -1;
      const drop = c.b.lastDrop;
      const ok = ok1 && !!f && covered === 0 && !!drop?.previewDom && !!drop.landedDom && near(drop.previewDom, drop.landedDom, 0.5);
      return verdict(ok, "Findings lands clear of every docked item, on its preview", `${f ? fmt(f) : "not a float"}, covering ${covered} docked items; preview ${fmt(drop?.previewDom)}`);
    },
  },
  {
    id: "C13",
    group: "floats",
    title: "A reload restores the layout",
    expect: "A reload restores every item's place and form from the stored form.",
    tries: ["Move things about, fold a panel, then press Reload: the page reloads and everything is where you left it.", "Rebuild from the stored form does the same without a reload."],
    look: ["column", "bar"],
    preset: { layout: { column: ["annotations", "pages"], bar: ["zoom", "views", "tools"], floats: [{ id: "findings", rect: { x: 520, y: 200, width: 220, height: 190 } }] }, from: { pages: 1 }, kept: ["annotations"] },
    fixtures: ["C13: a reload restores every item's place and form"],
    controls: ["stored"],
    async check({ b }) {
      const look = () => b.seen().map((s) => `${s.id}:${s.where.kind === "dock" ? `${s.where.side}${s.where.at}` : "float"}:${s.kind}:${Math.round(s.rect.x)},${Math.round(s.rect.y)},${Math.round(s.rect.width)},${Math.round(s.rect.height)}`);
      const before = look();
      const rep = b.rebuild();
      const after = look();
      const diff = before.filter((x, i) => x !== after[i]);
      return verdict(rep.restored && diff.length === 0, "Every item back in its place and form", rep.restored ? (diff.length ? `different: ${diff.slice(0, 2).join("; ")}` : "Every item back") : `not restored: ${rep.errors.join("; ")}`);
    },
  },
  {
    id: "C14",
    group: "floats",
    title: "Frozen",
    expect: "Frozen, the grips hide and nothing moves; holding Alt shows them and everything works.",
    tries: ["Tick Freeze and try to drag Pages: nothing moves.", "Hold Alt: the grips come back; drag Pages, and let go of Alt mid-drag: the drag finishes."],
    look: ["pages", "views"],
    preset: { frozen: true },
    fixtures: ["C14: frozen hides the grips and moves nothing; Alt moves"],
    controls: ["freeze"],
    async check({ b, d }) {
      const hidden = b.visibleGrips();
      const head = b.itemEl("pages")!.querySelector<HTMLElement>("[data-grab]")!;
      await d.press(head, 20, 10);
      await d.glide({ x: d.at.x + 80, y: d.at.y + 40 }, 6);
      const draggedFrozen = !!b.dragging;
      await d.release();
      d.alt(true);
      const shown = b.visibleGrips();
      await d.press(head, 20, 10, true);
      await d.glide({ x: d.at.x + 80, y: d.at.y + 40 }, 6);
      const draggedAlt = !!b.dragging;
      d.escape();
      await d.release();
      d.alt(false);
      const ok = hidden === 0 && !draggedFrozen && shown > 0 && draggedAlt;
      return verdict(ok, "0 grips and no drag; with Alt, grips and a drag", `${hidden} grips, ${draggedFrozen ? "a drag" : "no drag"}; with Alt ${shown} grips, ${draggedAlt ? "a drag" : "no drag"}`);
    },
  },
  {
    id: "C15",
    group: "floats",
    title: "No jump",
    expect: "No item moves more than 0.5 px when another item's count or phase changes.",
    tries: ["Set Views' count to 12345 (the badge says 99+): nothing else moves.", "Set Pages' phase to busy: nothing else moves."],
    look: ["views", "pages"],
    preset: {},
    fixtures: ["C15: no jump when a count or a phase changes"],
    controls: ["counts"],
    async check({ b, d }) {
      const moved: string[] = [];
      const steps: [ItemId, { count?: number; phase?: Phase }][] = [["views", { count: 12345 }], ["pages", { phase: "busy" }], ["tools", { count: 0 }], ["findings", { count: 100 }]];
      for (const [id, patch] of steps) {
        const before = b.drawnNow();
        b.setMeta(id, patch);
        await d.frames(1);
        moved.push(...movedBetween(before, b.drawnNow(), id));
      }
      return verdict(moved.length === 0, "No other item moves on four count and phase changes", moved.length ? moved.slice(0, 2).join("; ") : "Nothing else moved");
    },
  },
  {
    id: "C16",
    group: "floats",
    title: "A float has no pin",
    expect: "There is one kind of float, in the window's px: the stored form writes no pinned flag, and an old one loads as a plain float.",
    tries: ["Open the stored form below the stage: the floats carry no pinned flag.", "Scroll the pages: every float stays put, there is nothing to pin."],
    look: ["findings"],
    preset: {},
    fixtures: ["C16: a float has no pinned flag"],
    controls: ["stored"],
    async check({ b }) {
      b.save();
      const written = b.stored().floats;
      try {
        // An old stored form, as written before floats lost their pin: every float pinned.
        const old = JSON.parse(written) as { v: 1; floats: Record<string, unknown>[] };
        localStorage.setItem(b.storageKeys.floats, JSON.stringify({ ...old, floats: old.floats.map((f) => ({ ...f, pinned: true })) }));
      } catch {
        // No storage: the rebuild below reads nothing and the check says so.
      }
      const rep = b.rebuild();
      const again = b.stored().floats;
      const ok = !/pinned/.test(written) && rep.restored && placed(b, "findings")?.where.kind === "float" && !/pinned/.test(again);
      return verdict(ok, "No pinned flag written; an old pinned float loads as a float", `${/pinned/.test(written) ? "pinned written" : "no pinned flag written"}; Findings ${placed(b, "findings")?.where.kind ?? "nowhere"} after reading pinned: true`);
    },
  },
  {
    id: "C17",
    group: "floats",
    title: "A drop past the stage's edge",
    expect: "A float dropped with the pointer past the stage's edge is clamped into the stage, and the preview shows it clamped; it never cancels.",
    tries: ["Drag Findings past the stage's right edge and hold: the dashed rectangle stays inside.", "Let go: it lands there. Only Escape cancels."],
    look: ["findings"],
    preset: {},
    fixtures: ["C17: a float dropped past the stage's edge is clamped, never cancelled"],
    async check(c) {
      await c.aim.lift("findings", 40, 10);
      const shown = await c.aim.float({ x: c.b.settings.width + 80, y: 240 });
      await c.d.release();
      const f = c.b.floats.find((x) => x.id === "findings")?.rect;
      const w = c.b.settings.width;
      const inside = !!f && f.x >= -0.5 && f.x + f.width <= w + 0.5 && f.y >= -0.5;
      const drop = c.b.lastDrop;
      return verdict(shown && inside && !drop?.cancelled, `Findings inside the ${w} px stage, not cancelled`, `${f ? fmt(f) : "not a float"}${drop?.cancelled ? ", cancelled" : ""}`);
    },
  },
];
