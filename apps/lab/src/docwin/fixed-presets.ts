/**
 * Fixed items in the title bar, checked on the DockState directly (the document window is left as it is): a fixed item
 * that still takes steps (`DockItem.stepping`), a page readout with a ladder of its own.
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

export function FIXED_PRESETS(): Preset[] {
  return [steppingReadout()];
}
