/**
 * A movable group that grows on a bar (`main.grows` on its first row form): on whichever bar it lies it takes the bar's
 * free span after the other items; for drop room it counts at its natural length; dragged, it previews and lands at its
 * natural length and grows once placed.
 */
import type { DockState } from "@n-uf/docking";
import { solve, targets } from "@n-uf/docking";
import { drive, hold, mid, through } from "./intent-presets";
import { defaultState, put, type EdgeId } from "./model";
import type { Docwin } from "./dock-state";

/** A case of the page (`./presets`' `Preset`, the fields this one sets) and its verdict. */
type Verdict = { readonly pass: boolean; readonly now: string };
type Preset = { readonly id: string; readonly title: string; readonly expected: string; readonly setup: (c: Docwin) => void; readonly check: (c: Docwin) => Verdict };

const ORIGIN = { x: 0, y: 0 };

/** The default window with Tools growing (or not) in the top bar between Views and Zoom, Review alone in the bottom bar. */
function growing(grows = true): DockState {
  const s = put(put(defaultState(), "top", ["views", "tools", "zoom"]), "bottom", ["review"]);
  const t = s.items.tools!;
  const [first, ...more] = t.forms.row!;
  const main = { min: first!.main.min, natural: first!.main.natural, ...(grows ? { grows: true } : {}) };
  return { ...s, items: { ...s.items, tools: { ...t, forms: { ...t.forms, row: [{ ...first!, main }, ...more] } } } };
}
const natural = (s: DockState): number => s.items.tools!.forms.row![0]!.main.natural;

/**
 * The free span of `edge` in `s` as laid out: its length less its pads, the other drawn items, the gaps and the free
 * space items keep on their zone's open side (`DockItem.space`, which a drop at a free spot sets: the grower starts
 * where it was dropped and grows from there).
 */
function freeSpan(s: DockState, edge: EdgeId): number {
  const l = solve(s);
  const e = s.edges.find((x) => x.id === edge)!;
  const shown = e.items.filter((id) => l.items[id]?.edge === edge && !l.items[id]!.inMenu);
  const others = shown.filter((id) => id !== "tools").reduce((sum, id) => sum + l.items[id]!.rect.width, 0);
  const kept = shown.filter((id) => (s.items[id]?.align ?? "start") !== "center").reduce((sum, id) => sum + Math.max(0, s.items[id]?.space ?? 0), 0);
  return l.edges[edge]!.rect.width - (e.pad?.start ?? 0) - (e.pad?.end ?? 0) - others - Math.max(0, shown.length - 1) * (e.gap ?? 0) - kept;
}

function movableGrows(): Preset {
  return {
    id: "movable-grows",
    title: "A movable group grows into its bar's free span",
    expected:
      "Tools declares that it grows. In the top bar between Views and Zoom it takes the bar's free span (the bar less Views, Zoom, the pads and the gaps). Review held over the top bar has exactly the places it has beside Tools not growing. Tools dragged to the middle of the bottom bar is held and lands at its natural length on every frame, and once placed it grows into the bottom bar's free span after Review.",
    setup: (c) => c.setState(growing()),
    check(c): Verdict {
      const bad: string[] = [];
      const s = growing();
      const top = c.layout.items.tools!;
      const span = freeSpan(s, "top");
      if (top.edge !== "top" || Math.abs(top.rect.width - span) > 0.5) bad.push(`top bar: Tools is ${Math.round(top.rect.width)} wide, the free span ${Math.round(span)}`);
      const places = (x: DockState) => targets(x, "review").filter((t) => (t.place as { edge?: string }).edge === "top");
      const a = places(s).map((t) => t.id);
      const b = places(growing(false)).map((t) => t.id);
      if (a.join(" ") !== b.join(" ")) bad.push(`Review's top-bar places: ${a.join(" ")} growing, ${b.join(" ")} not`);
      for (const t of places(s)) {
        const it = t.after(ORIGIN, ORIGIN).layout.items.tools!;
        if (it.form === 0 && it.rect.width < natural(s) - 0.5) bad.push(`${t.id}: Tools squeezed to ${Math.round(it.rect.width)}`);
      }
      const bottom = c.layout.edges.bottom!.rect;
      let frames = 0;
      const wrong: string[] = [];
      const run = drive(c, "tools", (g) => hold(through([g, mid(bottom)], 0.6), 300), [], () => {
        const f = c.landingFrame;
        const held = f?.held && c.landingModel?.drag.after(f.held);
        const it = held ? held.layout.items.tools : undefined;
        if (!held?.landing || !it || it.edge !== "bottom" || it.form !== 0) return;
        frames++;
        if (Math.abs(held.landing.width - natural(s)) > 0.5 && wrong.length < 3) wrong.push(`landing ${Math.round(held.landing.width)}`);
      });
      if (!run) bad.push("the drag didn't start");
      if (frames === 0) bad.push("no frame held Tools over the bottom bar");
      if (wrong.length) bad.push(`held over the bottom bar: ${wrong.join(", ")}, not ${natural(s)}`);
      const placed = c.layout.items.tools;
      const after = c.state;
      if (placed?.edge !== "bottom") bad.push(`released in ${placed?.edge ?? "nowhere"}, not the bottom bar`);
      else if (Math.abs(placed.rect.width - freeSpan(after, "bottom")) > 0.5) bad.push(`placed, Tools is ${Math.round(placed.rect.width)}, the bottom bar's free span ${Math.round(freeSpan(after, "bottom"))}`);
      return {
        pass: bad.length === 0,
        now: `Top bar: Tools ${Math.round(top.rect.width)} (free span ${Math.round(span)}); ${frames} frames held over the bottom bar at its natural ${natural(s)}; placed ${placed ? Math.round(placed.rect.width) : "-"} wide in ${placed?.edge ?? "-"}.${bad.length ? ` Broken: ${bad.join("; ")}.` : ""}`,
      };
    },
  };
}

/** Whether two rects share more than a pixel each way. */
const over = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }): boolean =>
  Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1;

function heldBesideGrower(): Preset {
  return {
    id: "movable-grows-held-beside",
    title: "Another toolbar held beside a grown group: no guide over it",
    expected:
      "Tools grows in the top bar between Views and Zoom. Review, held from the bottom bar over Tools' grown part and on to the place after it, shows guides that never lie over an item as the frame draws it: Tools is drawn as the release would commit it, and no box or hatch covers it or any other toolbar.",
    setup: (c) => c.setState(growing()),
    check(c): Verdict {
      const bad: string[] = [];
      const tools = c.layout.items.tools!.rect;
      const zoom = c.layout.items.zoom!.rect;
      let frames = 0;
      const run = drive(c, "review", (g) => hold(through([g, { x: tools.x + tools.width * 0.6, y: tools.y + tools.height / 2 }, { x: zoom.x - 4, y: zoom.y + zoom.height / 2 }], 0.6), 300), [], () => {
        const f = c.landingFrame;
        if (!f?.held || f.held.kind !== "spot") return;
        frames++;
        const drawn = c.drawn.layout;
        for (const m of f.guides) {
          if (m.kind === "line") continue;
          for (const [id, it] of Object.entries(drawn.items)) {
            if (id === "review" || it.inMenu || !it.edge || it.floating || it.fixed) continue;
            if (over(m.rect, it.rect) && bad.length < 4) bad.push(`${m.id} over ${id}`);
          }
        }
      });
      if (!run) bad.push("the drag didn't start");
      if (frames === 0) bad.push("no frame held Review at a spot");
      return { pass: bad.length === 0, now: `${frames} frames held Review at a spot.${bad.length ? ` Broken: ${bad.join("; ")}.` : ""}` };
    },
  };
}

export function GROW_PRESETS(): Preset[] {
  return [movableGrows(), heldBesideGrower()];
}
