/**
 * Fixed items in the title bar, checked on the DockState directly (the document window is left as it is):
 * - a fixed item that still takes steps (`DockItem.stepping`): a page readout with a ladder of its own;
 * - a growing title's growth is spare room for a drop: a drop that only steps a neighbor to a compact variant lands.
 */
import { controlLadder } from "@n-uf/placement/stack";
import type { DockItem, DockState } from "@n-uf/docking";
import { solve, stops, targets } from "@n-uf/docking";
import { defaultState, put } from "./model";

interface Verdict {
  readonly pass: boolean;
  readonly now: string;
}
interface Preset {
  readonly id: string;
  readonly title: string;
  readonly expected: string;
  setup(): void;
  check(): Verdict;
}

const ORIGIN = { x: 0, y: 0 };

/** A page readout: fixed at the title bar's end, before the window controls, with a ladder of its own. */
const readout = (stepping: boolean): DockItem => ({
  id: "page",
  kind: "chrome",
  used: 0,
  fixed: true,
  align: "end",
  ...(stepping ? { stepping: true } : {}),
  forms: { row: controlLadder({ controls: [{ id: "count", tiers: [72, 40] }, { id: "of", tiers: [40, 24] }], gap: 4, grip: 0, more: 14, cross: 28 }).row },
});

/** The default window at `width`, the readout in the title bar between Zoom and the controls. */
function withReadout(width: number, stepping = true): DockState {
  const s = defaultState({ width, height: 640 });
  return {
    ...s,
    edges: s.edges.map((e) => (e.id === "title" ? { ...e, items: ["title", "zoom", "page", "controls"] } : e)),
    items: { ...s.items, page: readout(stepping) },
  };
}

const WIDTHS = [1100, 900, 760, 680, 620, 580, 540, 500, 460, 420, 380, 340, 300, 260, 220];

function steppingReadout(): Preset {
  return {
    id: "fixed-readout-steps",
    title: "A fixed page readout steps down its own ladder and folds",
    expected:
      "A page readout at the title bar's end, fixed (never dragged, nothing lands between it and the controls) but declared `stepping`: as the window narrows from 1100 to 220 px it shortens its labels and folds in its turn (its fold or the bar's » at the narrowest), never coming back up while narrowing, and laid out exactly as a movable toolbar with the same forms. Declared plain `fixed`, it keeps its full form at every width. At every width Zoom's title-bar places include none between the readout and the controls, drawn or in the ».",
    setup: () => undefined,
    check(): Verdict {
      const bad: string[] = [];
      const seen: string[] = [];
      let last = -1;
      for (const w of WIDTHS) {
        const s = withReadout(w);
        const l = solve(s);
        const p = l.items.page!;
        seen.push(`${w}: ${p.inMenu ? "»" : `${p.formKind} ${p.form}`}`);
        if (p.form < last) bad.push(`${w}: came back up to form ${p.form}`);
        last = p.form;
        const movable = solve({ ...s, items: { ...s.items, page: { ...readout(false), fixed: false } } }).items.page!;
        if (movable.form !== p.form || Math.abs(movable.rect.x - p.rect.x) > 0.5 || Math.abs(movable.rect.width - p.rect.width) > 0.5) bad.push(`${w}: not as a movable item (${movable.form} vs ${p.form})`);
        const plain = solve(withReadout(w, false)).items.page!;
        if (plain.form !== 0) bad.push(`${w}: plain fixed stepped to ${plain.form}`);
        if (targets(s, "page").length > 0) bad.push(`${w}: the readout has targets`);
        const out = put(s, "bottom", ["zoom"]);
        const ends = stops(out, "zoom").map((t) => t.id).filter((id) => id.startsWith("gap:title:end"));
        if (ends.some((id) => id !== "gap:title:end:0")) bad.push(`${w}: Zoom may land between the readout and the controls (${ends.join(" ")})`);
      }
      const end = solve(withReadout(WIDTHS[WIDTHS.length - 1]!)).items.page!;
      if (!end.inMenu && end.formKind !== "fold") bad.push(`at the narrowest it is ${end.formKind}, not folded`);
      return { pass: bad.length === 0, now: `${seen.join("; ")}.${bad.length ? ` Broken: ${bad.join("; ")}.` : ""}` };
    },
  };
}

/**
 * The title zone that takes drops: the title (220, min = natural) with Views after it, Zoom moved to the bottom bar and
 * held. With `grows` off the title is a fixed item of exactly that length.
 */
function titleZone(width: number, grows: boolean): DockState {
  const s = put(put(defaultState({ width, height: 640 }), "title", ["views"]), "bottom", ["zoom", "review"]);
  // A title that never shrinks under its natural width (min = natural), growing or not: growth is all it may yield.
  const row = { kind: "row" as const, main: { min: 220, natural: 220, ...(grows ? { grows: true } : {}) }, cross: { natural: 32 } };
  return { ...s, items: { ...s.items, title: { ...s.items.title!, forms: { row: [row] } } } };
}
const TITLE_WIDTHS = [1080, 980, 880, 800, 760, 720, 680, 640, 600, 560, 520];

function titleGrowthIsSpareRoom(): Preset {
  return {
    id: "title-growth-spare-room",
    title: "A growing title's growth is spare room for a drop",
    expected:
      "In a title bar whose zones take drops (a title that grows but never shrinks under its natural width, then Views), Zoom held over it keeps every place it has beside the same title not growing (a fixed item of its natural width), at every width from 1080 to 520 px (where the edge fit's title rule makes more room, a few more), each landing Zoom in the title bar (which forms the bar's items then take is the edge fit's, whose title rule differs for a growing title). The title yields its growth to the landing and is never drawn under its natural width; where growth alone makes room, nothing beside it steps.",
    setup: () => undefined,
    check(): Verdict {
      const bad: string[] = [];
      const seen: string[] = [];
      const titlePlaces = (s: DockState) => targets(s, "zoom").filter((t) => (t.place as { edge?: string }).edge === "title");
      for (const w of TITLE_WIDTHS) {
        const grown = titleZone(w, true);
        const a = titlePlaces(grown);
        const b = titlePlaces(titleZone(w, false));
        seen.push(`${w}: ${a.length}`);
        const missing = b.filter((t) => !a.some((x) => x.id === t.id)).map((t) => t.id);
        if (missing.length) bad.push(`${w}: ${missing.join(" ")} offered beside the title not growing, refused beside it growing`);
        const rest = solve(grown);
        const roomy = (rest.items.title?.rect.width ?? 0) - 220 >= 300;
        for (const t of a) {
          const la = t.after(ORIGIN, ORIGIN).layout;
          if ((la.items.title?.rect.width ?? 0) < 220 - 0.5) bad.push(`${w} ${t.id}: the title at ${Math.round(la.items.title!.rect.width)}`);
          if (la.items.zoom?.edge !== "title" || la.items.zoom.inMenu) bad.push(`${w} ${t.id}: Zoom doesn't land in the title bar`);
          for (const id of ["views", "controls"]) if (roomy && la.items[id]?.form !== rest.items[id]?.form) bad.push(`${w} ${t.id}: ${id} stepped though growth alone made room`);
        }
      }
      return { pass: bad.length === 0, now: `Title-bar places for Zoom by width: ${seen.join(", ")}.${bad.length ? ` Broken: ${bad.join("; ")}.` : ""}` };
    },
  };
}

export function FIXED_PRESETS(): Preset[] {
  return [steppingReadout(), titleGrowthIsSpareRoom()];
}
