/**
 * Groups declared by their controls (`./ladder`, `controlLadder` from `@n-uf/placement/stack`) in one bar, the window
 * narrowed from wide to narrow and widened back, 1 px at a time. Each frame is read as drawn: every group's form, each
 * drawn control and its tier, the » cell and its popover, and the title's length.
 */
import { LADDER, LADDER_IDS, ladderScene, ownTiers, type LadderId } from "./ladder";
import type { DocwinScene } from "./scene";

interface Verdict {
  readonly pass: boolean;
  readonly now: string;
}
interface LadderPreset {
  readonly id: string;
  readonly title: string;
  readonly expected: string;
  setup(c: DocwinScene): void;
  check(c: DocwinScene): Verdict;
}

const WIDE = 1100;
const NARROW = 150;
const HEIGHT = 640;
/** The title's natural length (`itemOf`'s title form): a growing title holds it while a group still has a step left. */
const TITLE_NATURAL = 220;

/** One group as drawn on one frame. */
interface Group {
  readonly form: string;
  /** The layout's choice: the form's index in the group's ladder, and its `tiers` (none on a fold). */
  readonly index: number;
  readonly tiers: Readonly<Record<string, number>> | null;
  /** The layout's hidden controls. */
  readonly hidden: readonly string[];
  /** The controls drawn, in order, each at the tier it shows (`data-tier`) and whether that is its last. */
  readonly drawn: readonly { readonly id: string; readonly tier: number; readonly last: boolean }[];
  /** The » cell's badge, and the controls its popover lists (`data-control`, one per button); null with no cell. */
  readonly more: { readonly badge: string; readonly lists: readonly string[]; readonly buttons: readonly string[] } | null;
  /** The first part drawn outside the group's box, or null: a form is drawn whole. */
  readonly clip: string | null;
}
interface Frame {
  readonly width: number;
  readonly groups: Readonly<Record<LadderId, Group>>;
  readonly title: number;
}

const menuList = (c: DocwinScene): HTMLElement => c.win.querySelector<HTMLElement>(".dw-menu-list")!;
const unique = (xs: readonly string[]): string[] => [...new Set(xs)];

/** The first part of `el` drawn outside its box (1 px of slack), or null. */
function clipOf(el: HTMLElement): string | null {
  const box = el.getBoundingClientRect();
  for (const p of el.querySelectorAll<HTMLElement>("button, span")) {
    const r = p.getBoundingClientRect();
    if (r.width > 0 && (r.left < box.left - 1 || r.right > box.right + 1)) return `${p.dataset.control ?? p.className} reaches ${Math.round(r.right - box.right)} px past the box`;
  }
  return null;
}

/** The window at `width` as drawn: every group's form, controls, » cell and popover, and the title's length. */
function read(c: DocwinScene, width: number): Frame {
  const groups = {} as Record<LadderId, Group>;
  for (const id of LADDER_IDS) {
    const l = c.layout.items[id]!;
    const el = c.win.querySelector<HTMLElement>(`.dw-items [data-id="${id}"]`);
    const drawn = [...(el?.querySelectorAll<HTMLElement>("[data-control]") ?? [])].map((x) => ({ id: x.dataset.control!, tier: Number(x.dataset.tier), last: x.dataset.last === "true" }));
    const cell = el?.querySelector<HTMLElement>(".dw-more") ?? null;
    let more: Group["more"] = null;
    if (cell) {
      // A drag earlier in the same run may still swallow the click that follows its pointer-up: spend it on the window.
      c.win.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      cell.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
      const buttons = [...menuList(c).querySelectorAll<HTMLElement>("[data-hidden-control]")];
      more = { badge: cell.querySelector(".dw-cnt")?.textContent ?? "", lists: unique(buttons.map((b) => b.dataset.control!)), buttons: buttons.map((b) => b.dataset.hiddenControl!) };
      c.win.querySelector(".dw-scroll")?.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 }));
    }
    groups[id] = { form: l.inMenu ? "menu" : l.formKind, index: l.form, tiers: l.tiers ?? null, hidden: l.hidden, drawn, more, clip: el ? clipOf(el) : null };
  }
  return { width, groups, title: c.layout.items.title!.rect.width };
}

const controlsOf = (id: LadderId): string[] => LADDER[id].map((x) => x.id);
const at = (f: Frame, id: LadderId): Group => f.groups[id];
/** A group on its last partial fold: one control left, in a row. */
const lastPartial = (g: Group, id: LadderId): boolean => g.form === "row" && g.hidden.length === controlsOf(id).length - 1;
/** What a frame shows, as a string: equal strings are equal frames (the width aside). */
const signature = (f: Frame): string => JSON.stringify([f.groups, Math.round(f.title)]);
/** What a frame shows apart from the title's length (a growing title changes every px). */
const steps = (f: Frame): string => JSON.stringify([f.groups, f.title < TITLE_NATURAL - 0.5]);

/** Every frame from `from` down to `to` (or up), each solved after the one before (a window being resized). */
function sweep(c: DocwinScene, from: number, to: number, mark?: (f: Frame) => string | null): Frame[] {
  const out: Frame[] = [];
  const dir = to < from ? -1 : 1;
  let last = "";
  for (let w = from; dir < 0 ? w >= to : w <= to; w += dir) {
    c.setSize(w, HEIGHT);
    const f = read(c, w);
    out.push(f);
    const key = steps(f);
    if (key !== last && mark) {
      const note = mark(f);
      if (note) c.keyFrame(note);
    }
    last = key;
  }
  return out;
}

const start = (c: DocwinScene, width: number): void => c.setScene(ladderScene({ width, height: HEIGHT }));
const where = (f: Frame): string => `${f.width} px`;

/** Broken rules of one frame on its own: the » list is exactly what is hidden, the controls drawn are the rest. */
function frameRules(f: Frame, bad: string[]): void {
  for (const id of LADDER_IDS) {
    const g = at(f, id);
    const all = controlsOf(id);
    if (g.form === "menu") continue;
    const drawn = g.drawn.map((d) => d.id);
    if (g.form === "fold") {
      if (drawn.length) bad.push(`${where(f)}: ${id} is folded and still draws ${drawn.join(", ")}`);
      if (g.hidden.join() !== all.join()) bad.push(`${where(f)}: ${id} is folded and hides [${g.hidden.join(", ")}], not every control`);
    } else if (all.filter((x) => !g.hidden.includes(x)).join() !== drawn.join()) bad.push(`${where(f)}: ${id} draws [${drawn.join(", ")}] with [${g.hidden.join(", ")}] hidden`);
    const listed = g.more?.lists ?? [];
    if (listed.join() !== g.hidden.join()) bad.push(`${where(f)}: the » of ${id} lists [${listed.join(", ")}], hidden is [${g.hidden.join(", ")}]`);
    // The badge counts the buttons the » lists; a hidden pair (Zoom's step) lists both its buttons.
    if (g.more && g.more.badge !== String(g.more.buttons.length)) bad.push(`${where(f)}: the » of ${id} reads ${g.more.badge}, it lists ${g.more.buttons.length} buttons`);
    if (id === "zoom" && g.hidden.includes("step") && !(g.more?.buttons.includes("-") && g.more.buttons.includes("+"))) bad.push(`${where(f)}: zoom hides step and its » lists [${g.more?.buttons.join(", ")}], not − and +`);
    if (g.hidden.length === 0 && g.more) bad.push(`${where(f)}: ${id} hides nothing and draws a » cell`);
    if (g.hidden.length > 0 && !g.more) bad.push(`${where(f)}: ${id} hides [${g.hidden.join(", ")}] and draws no » cell`);
    if (g.clip) bad.push(`${where(f)}: ${id} is clipped: ${g.clip}`);
  }
  // The page draws each control from the layout's tiers.
  for (const id of LADDER_IDS)
    for (const d of at(f, id).drawn) if (d.tier !== at(f, id).tiers?.[d.id]) bad.push(`${where(f)}: ${id}'s ${d.id} is drawn at tier ${d.tier}, the layout says ${at(f, id).tiers?.[d.id]}`);
  // Tier steps are levelled: once a control is at tier t, every shown control that has a tier t - 1 is at least there.
  // Read from the layout's tiers, over every group.
  const shown = LADDER_IDS.filter((id) => at(f, id).form === "row").flatMap((id) => controlsOf(id).filter((c) => !at(f, id).hidden.includes(c)).map((c) => ({ id, c, tier: at(f, id).tiers?.[c] ?? 0 })));
  const top = Math.max(0, ...shown.map((s) => s.tier));
  for (const s of shown) if (top >= 1 && ownTiers(s.id, s.c) > top - 1 && s.tier < top - 1) bad.push(`${where(f)}: ${s.id}'s ${s.c} is at tier ${s.tier} while another control is at tier ${top}`);
  // Every control left is at its last tier once anything hides, whichever group hid it.
  const anyHidden = LADDER_IDS.some((id) => at(f, id).hidden.length > 0);
  if (anyHidden)
    for (const id of LADDER_IDS) {
      const early = at(f, id).drawn.filter((d) => !d.last);
      if (early.length) bad.push(`${where(f)}: a control is hidden while ${id}'s ${early.map((d) => `${d.id} (tier ${d.tier})`).join(", ")} is not at its last tier`);
    }
}

/** Broken rules between two frames, `prev` and `cur`, narrowing one px. */
function stepRules(prev: Frame, cur: Frame, bad: string[]): void {
  const rose: string[] = [];
  const folded: LadderId[] = [];
  const partial: LadderId[] = [];
  for (const id of LADDER_IDS) {
    const a = at(prev, id);
    const b = at(cur, id);
    for (const d of b.drawn) {
      const was = a.drawn.find((x) => x.id === d.id);
      if (!was) continue;
      if (d.tier < was.tier) bad.push(`${where(cur)}: ${id}'s ${d.id} went back to tier ${d.tier} from ${was.tier} while narrowing`);
      if (d.tier > was.tier) rose.push(`${id}.${d.id} ${was.tier}→${d.tier}`);
    }
    if (b.form !== "menu" && (b.hidden.length < a.hidden.length || (a.form === "fold" && b.form === "row"))) bad.push(`${where(cur)}: ${id} shows controls again while narrowing`);
    if (b.form === "fold" && a.form === "row") folded.push(id);
    else if (b.form === "row" && b.hidden.length > a.hidden.length) partial.push(id);
  }
  // 1. Tier steps go one control at a time.
  if (rose.length > 1) bad.push(`${where(cur)}: ${rose.length} controls changed tier at once (${rose.join(", ")})`);
  // 2. Partial folds are levelled across the groups: the group folded had the lowest next fold (its hidden count after,
  //    over its controls) among the groups that still have a partial fold to take.
  for (const id of partial) {
    const a = at(prev, id);
    const next = (a.hidden.length + 1) / controlsOf(id).length;
    for (const other of LADDER_IDS) {
      const o = at(prev, other);
      if (other === id || o.form !== "row" || o.hidden.length >= controlsOf(other).length - 1) continue;
      if ((o.hidden.length + 1) / controlsOf(other).length < next - 1e-9) bad.push(`${where(cur)}: ${id} folded (${a.hidden.length} → ${at(cur, id).hidden.length} hidden of ${controlsOf(id).length}) while ${other} had fewer hidden (${o.hidden.length} of ${controlsOf(other).length})`);
    }
  }
  // 4. A whole group folds only when every group is on its last partial fold (or already folded).
  for (const id of folded)
    for (const other of LADDER_IDS) {
      const o = at(prev, other);
      if (other !== id && o.form === "row" && !lastPartial(o, other)) bad.push(`${where(cur)}: ${id} folded while ${other} still shows ${controlsOf(other).length - o.hidden.length} of ${controlsOf(other).length} controls`);
    }
}

/** What the narrowing run shows, in a line: where each step type first appears. */
function story(frames: readonly Frame[]): string {
  const first = (pred: (f: Frame) => boolean): string => {
    const f = frames.find(pred);
    return f ? `${f.width}` : "never";
  };
  return [
    `all controls at tier 0 down to ${first((f) => LADDER_IDS.some((id) => at(f, id).drawn.some((d) => d.tier > 0)))} px`,
    `first » at ${first((f) => LADDER_IDS.some((id) => at(f, id).hidden.length > 0))}`,
    `first whole-group fold at ${first((f) => LADDER_IDS.some((id) => at(f, id).form === "fold"))} (title ${Math.round(frames.find((f) => LADDER_IDS.some((id) => at(f, id).form === "fold"))?.title ?? 0)} px)`,
    `title under its natural ${TITLE_NATURAL} at ${first((f) => f.title < TITLE_NATURAL - 0.5)}`,
    `every group folded at ${first((f) => LADDER_IDS.every((id) => at(f, id).form === "fold" || at(f, id).form === "menu"))}`,
  ].join("; ");
}

/** The narrowing run's rules over all its frames. */
function narrowRules(frames: readonly Frame[]): string[] {
  const bad: string[] = [];
  frames.forEach((f, i) => {
    frameRules(f, bad);
    if (i > 0) stepRules(frames[i - 1]!, f, bad);
  });
  // 5. The growing title gives way last: it keeps its natural length until every group is on its last partial fold or beyond.
  for (const f of frames) {
    const waiting = LADDER_IDS.filter((id) => at(f, id).form === "row" && !lastPartial(at(f, id), id));
    if (f.title < TITLE_NATURAL - 0.5 && waiting.length) bad.push(`${where(f)}: the title gave way to ${Math.round(f.title)} px while ${waiting.join(", ")} still had steps left`);
  }
  // It gives way before the whole folds: at the first frame where any group is folded, the title is already shorter.
  const folding = frames.find((f) => LADDER_IDS.some((id) => at(f, id).form === "fold"));
  if (folding && folding.title >= TITLE_NATURAL - 0.5) bad.push(`${where(folding)}: a group folded while the title still had its natural ${Math.round(folding.title)} px`);
  return bad;
}

const report = (bad: readonly string[]): string => (bad.length ? ` Broken: ${bad.slice(0, 6).join("; ")}${bad.length > 6 ? ` (+${bad.length - 6})` : ""}.` : "");

const note = (f: Frame): string => `${f.width} px`;

export function LADDER_PRESETS(): LadderPreset[] {
  return [
    {
      id: "ladder-narrow",
      title: "Groups declared by their controls: a bar narrowed control by control",
      expected:
        "Views, Review and Zoom side by side in one bar, each declared by its controls (`controlLadder`), the window narrowed from 1100 to 150 px in 1 px steps. In order: (1) the tier steps, one control's label shortening per frame and never two at once; no control hides before every control of every group is at its last tier; (2) then partial folds, one control into the group's » at a time, levelled across the groups (the group folded has the lowest next fold among those that still have one); (3) the » cell's popover lists exactly the layout's hidden controls on every frame (a hidden Zoom step lists both its − and + buttons) and its badge counts those buttons, the controls drawn are the rest, and nothing is drawn clipped; (4) then whole-group folds, only when every group is on its last partial fold; (5) the growing title keeps its natural length until every group is on its last partial fold (it gives way to the folds' steps, not before a group's row step), and a hidden control's group never shows it again while narrowing.",
      setup: (c) => start(c, WIDE),
      check(c) {
        start(c, WIDE);
        const frames = sweep(c, WIDE, NARROW, note);
        const bad = narrowRules(frames);
        return { pass: bad.length === 0, now: `${frames.length} widths; ${story(frames)}.${report(bad)}` };
      },
    },
    {
      id: "ladder-widen",
      title: "Groups declared by their controls: the narrowed bar widened back, the exact reverse",
      expected:
        "The bar of `ladder-narrow`, narrowed to 150 px and widened back 1 px at a time to 1100: every frame equals the frame the narrowing showed at that width (the same forms, tiers, hidden controls, » lists and title), so growing back undoes the steps in the exact reverse.",
      setup: (c) => start(c, NARROW),
      check(c) {
        start(c, WIDE);
        const down = sweep(c, WIDE, NARROW);
        const up = sweep(c, NARROW, WIDE, note);
        const bad: string[] = [];
        for (const f of up) {
          const was = down[WIDE - f.width]!;
          if (signature(f) !== signature(was)) {
            const g = LADDER_IDS.find((id) => JSON.stringify(at(f, id)) !== JSON.stringify(at(was, id)));
            bad.push(`${where(f)}: ${g ? `${g} is ${at(f, g).form} [hides ${at(f, g).hidden.join(",")}] growing back, ${at(was, g).form} [hides ${at(was, g).hidden.join(",")}] on the way down` : `the title is ${Math.round(f.title)} px growing back, ${Math.round(was.title)} on the way down`}`);
          }
        }
        return { pass: bad.length === 0, now: `${up.length} widths, each compared with the way down.${report(bad)}` };
      },
    },
  ];
}
