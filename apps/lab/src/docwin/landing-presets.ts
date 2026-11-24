/**
 * The window on the landing model (`"landing"`): `@n-uf/motion/drag`'s `createLandingModel` over
 * `@n-uf/docking`'s `lanes()`, in each of the viewer's three modes: what the modes add. A drag along its lane
 * never leaves it in any mode, every mode releases the same, and the place guides are neutral lines and boxes keyed by
 * id, never over an item and never drawn like the landing. The model's own properties are the landing rows of
 * `@n-uf/docking/testing` (`LANDING_CASES`), which the window plays too (`row:landing-*`).
 */
import type { Point, Rect } from "@n-uf/placement";
import type { DockState } from "@n-uf/docking";
import { drive, hold, through, type Key } from "./intent-presets";
import { defaultState, put } from "./model";
import { presetFrom } from "./one-preview-presets";
import type { Docwin } from "./dock-state";

type LandingPreset = ReturnType<typeof presetFrom>;

const MODES = ["indicator", "gap", "item"] as const;
const LABEL: Record<(typeof MODES)[number], string> = { indicator: "Outline", gap: "Placeholder", item: "Snap" };

/** The default window with Tools and Zoom in the left toolbar rail. */
const railState = (): DockState => put(defaultState(), "rail-left", ["tools", "zoom"]);
const fresh = (c: Docwin, mode: (typeof MODES)[number] = "item"): void => {
  c.setState(railState());
  c.setDropPreview(mode);
};
/** Overlapping by more than the 1 px a 2 px line on the joint of two touching items shares with each. */
const overlaps = (a: Rect, b: Rect): boolean => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1.5 && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1.5;
/** `a` comes within `by` px of `b`. */
const within = (a: Rect, b: Rect, by: number): boolean => a.x < b.x + b.width + by && b.x - by < a.x + a.width && a.y < b.y + b.height + by && b.y - by < a.y + a.height;
/** An element's rect in window px. */
const rectIn = (c: Docwin, el: Element): Rect => {
  const w = c.win.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { x: r.left - w.left, y: r.top - w.top, width: r.width, height: r.height };
};

const preset = (id: string, title: string, expected: string, check: (c: Docwin, bad: string[], said: string[]) => void): LandingPreset => presetFrom((c) => fresh(c), id, title, expected, check);

/** Zoom pulled straight up its rail, 6 px every 40 ms, to 10 px above the rail's top. */
const upTheRail = (c: Docwin): ((g: Point) => Key[]) => {
  const rail = c.layout.edges["rail-left"]!.rect;
  return (g) => {
    const keys: Key[] = [];
    for (let k = 0, y = g.y; y >= rail.y - 10; k++, y -= 6) keys.push([k * 40, g.x, y]);
    return hold(keys, 200);
  };
};

export function LANDING_PRESETS(): LandingPreset[] {
  return [
    preset(
      "landing-rail-repro",
      "Landing model: Zoom pulled up its rail stays in the rail",
      "With Tools and Zoom in the left toolbar rail, Zoom's grip pulled straight up, 6 px every 40 ms, to 10 px above the rail: in every mode, every frame keeps the rail's lane (never the float, never nowhere), and the release docks Zoom above Tools.",
      (c, bad, said) => {
        for (const mode of MODES) {
          fresh(c, mode);
          const lanesSeen = new Set<string>();
          const r = drive(c, "zoom", upTheRail(c), [], () => {
            const f = c.landingFrame;
            if (f) lanesSeen.add(`${f.region}:${f.lane}`);
          });
          if (!r) {
            bad.push(`${LABEL[mode]}: no drag`);
            continue;
          }
          const off = [...lanesSeen].filter((k) => k !== "lane:rail-left");
          if (off.length) bad.push(`${LABEL[mode]}: left the rail (${off.join(", ")})`);
          const zoom = c.layout.items.zoom;
          const tools = c.layout.items.tools;
          if (!zoom || zoom.edge !== "rail-left" || !tools || zoom.rect.y > tools.rect.y) bad.push(`${LABEL[mode]}: Zoom isn't above Tools in the rail`);
          else said.push(`${LABEL[mode]}: in the rail every frame, docked above Tools`);
        }
      },
    ),
    preset(
      "landing-same-release",
      "Landing model: every mode releases the same",
      "One path for Zoom (up its rail, along the title bar, down into the bottom bar, resting there): Outline, Placeholder and Snap release it to the same place.",
      (c, bad, said) => {
        const out: string[] = [];
        for (const mode of MODES) {
          fresh(c, mode);
          const rail = c.layout.edges["rail-left"]!.rect;
          const bottom = c.layout.edges.bottom!.rect;
          drive(c, "zoom", (g) => hold(through([g, { x: g.x, y: rail.y + 20 }, { x: 15, y: 16 }, { x: 600, y: 16 }, { x: 600, y: bottom.y + bottom.height / 2 }], 0.4), 300));
          out.push(`${c.lastDrop?.target ?? "nothing"}`);
        }
        if (new Set(out).size !== 1) bad.push(`the modes differ: ${MODES.map((m, i) => `${LABEL[m]} ${out[i]}`).join(", ")}`);
        else said.push(`all three release on ${out[0]}`);
      },
    ),
    preset(
      "landing-guides",
      "Landing model: guides are neutral lines and boxes, never over an item",
      "Zoom held in its rail and moved along it, in all three modes (guides near): the guides are the rail's marks, each a line, a box or a hatch keyed by its id; none lies under a docked item but a hatch over a docked neighbor that gives way (a line on the joint of two touching items shares at most 1 px with each), none within 2 px of the held item or its landing, none drawn with the landing's accent; a box is 1.5 px dashed with a 3 px radius. With Shift held there are none.",
      (c, bad, said) => {
        for (const mode of MODES) {
          fresh(c, mode);
          c.setPlaceGuides(mode === "indicator" ? "outline" : mode === "gap" ? "placeholder" : "snap", "near");
          const sets = new Set<string>();
          let over = 0;
          let overNote = "";
          let kinds = new Set<string>();
          let accent = 0;
          let look = 0;
          const rail = c.layout.edges["rail-left"]!.rect;
          drive(c, "zoom", (g) => hold(through([g, { x: g.x, y: g.y + 30 }, { x: g.x, y: rail.y + rail.height - 40 }], 0.2), 200), [], () => {
            if (c.landingFrame?.lane !== "rail-left") return;
            const els = [...c.win.querySelectorAll<HTMLElement>(".dw-guide[data-kind]")].filter((el) => !el.hasAttribute("data-off"));
            sets.add(els.map((el) => el.dataset.guide).sort().join());
            kinds = new Set([...kinds, ...els.map((el) => el.dataset.kind!)]);
            // The items drawn in the window; 2 px around the held copy's accent outline (1 px outside its rect) and the
            // landing's outline.
            const items = [...c.win.querySelectorAll<HTMLElement>(".dw-items .dw-item")].filter((el) => el.offsetWidth > 0).map((el) => ({ id: el.dataset.id ?? "item", r: rectIn(c, el), clear: 0 }));
            const heldEl = c.win.querySelector<HTMLElement>("[data-drag-held]");
            const slotEl = c.win.querySelector<HTMLElement>(".dw-slot");
            if (heldEl) items.push({ id: "the held item", r: rectIn(c, heldEl), clear: heldEl.hasAttribute("data-placed") ? 3 : 2 });
            if (slotEl && !slotEl.hidden) items.push({ id: "the landing", r: rectIn(c, slotEl), clear: 2 });
            const slotColor = slotEl ? getComputedStyle(slotEl).borderTopColor : "";
            for (const el of els) {
              const g = rectIn(c, el);
              // A hatch lies over the docked neighbor that gives way (its place), never over the held item, the landing or a float.
              const docked = (id: string): boolean => id !== "zoom" && !!c.layout.items[id as keyof typeof c.layout.items] && !c.layout.items[id as keyof typeof c.layout.items]!.floating;
              const hit = items.find((it) => (it.clear ? within(g, it.r, it.clear) : overlaps(g, it.r) && !(el.dataset.kind === "hatch" && docked(it.id))));
              if (hit) {
                over++;
                if (!overNote) overNote = `${el.dataset.guide} at ${hit.id}`;
              }
              const s = getComputedStyle(el);
              if (s.borderTopColor === slotColor || s.backgroundColor === slotColor) accent++;
              // A box: a 3 px radius, and its dash a 3 px stroke on the edge, half of it inside (1.5 px).
              const dash = getComputedStyle(el, "::after");
              // eslint-disable-next-line @typescript-eslint/no-deprecated -- `webkitMaskImage` is the fallback for Safari, which reports the mask under the prefixed name
              if (el.dataset.kind === "box" && (parseFloat(s.borderTopLeftRadius) !== 3 || !/stroke-width='3'/.test(decodeURIComponent(dash.maskImage || dash.webkitMaskImage || "")))) look++;
            }
          });
          c.setPlaceGuides(mode === "indicator" ? "outline" : mode === "gap" ? "placeholder" : "snap", null);
          if (kinds.size === 0) bad.push(`${LABEL[mode]}: no guides while the rail was held`);
          if ([...kinds].some((k) => k !== "line" && k !== "box" && k !== "hatch")) bad.push(`${LABEL[mode]}: a guide of kind ${[...kinds].join("/")}`);
          if (over) bad.push(`${LABEL[mode]}: a guide too near an item on ${over} frames (${overNote})`);
          if (accent) bad.push(`${LABEL[mode]}: a guide in the landing's accent`);
          if (look) bad.push(`${LABEL[mode]}: a box not 1.5 px dashed with a 3 px radius`);
          said.push(`${LABEL[mode]}: ${[...kinds].join(" and ")} guides, ${sets.size} sets by id while held`);
          fresh(c, mode);
          let shifted = 0;
          drive(c, "zoom", (g) => hold(through([g, { x: g.x, y: g.y + 40 }], 0.2), 200), [
            { t: () => 100, run: () => c.keys({ shift: true }) },
          ], () => {
            if (c.landingFrame?.shift) shifted += [...c.win.querySelectorAll(".dw-guide[data-kind]")].filter((el) => !el.hasAttribute("data-off")).length;
          });
          if (shifted) bad.push(`${LABEL[mode]}: guides with Shift held`);
        }
      },
    ),
    preset(
      "landing-guides-floats",
      "Landing model: no guide over a float",
      "In the default window Tools floats over the empty top bar's band: with Views held along that bar in Placeholder and Snap (guides near), no guide lies over the float, the held item, or any other item drawn (but an empty lane's mark over a docked panel, which moves aside when it opens).",
      (c, bad, said) => {
        for (const mode of ["gap", "item"] as const) {
          c.setState(defaultState());
          c.setDropPreview(mode);
          const top = c.layout.edges.top!.rect;
          let over = 0;
          let note = "";
          let shown = 0;
          drive(c, "views", (g) => hold(through([g, { x: 60, y: top.y + 10 }, { x: c.state.stage.width - 60, y: top.y + 10 }], 0.3), 200), [], () => {
            const els = [...c.win.querySelectorAll<HTMLElement>(".dw-guide[data-kind]")].filter((el) => !el.hasAttribute("data-off"));
            shown += els.length;
            const items = [...c.win.querySelectorAll<HTMLElement>(".dw-items .dw-item")].filter((el) => el.offsetWidth > 0).map((el) => ({ id: el.dataset.id ?? "item", r: rectIn(c, el) }));
            for (const el of els) {
              // A hatch over a docked neighbor is its place; over a float, never.
              // Only an empty lane's mark (at its real size or as an edge) may lie on a docked panel, which moves aside when
              // it opens; never on a float, a toolbar or the held item.
              const lane = (el.dataset.guide ?? "").split("/")[0]!;
              const emptyLane = (c.layout.edges[lane as keyof typeof c.layout.edges]?.cross ?? 0) <= 0;
              const dockedPanel = (id: string): boolean => {
                const it = c.layout.items[id as keyof typeof c.layout.items];
                return !!it && !it.floating && c.state.items[id as keyof typeof c.state.items]?.kind === "panel";
              };
              const hit = items.find((it) => overlaps(rectIn(c, el), it.r) && !(emptyLane && it.id !== "views" && dockedPanel(it.id)));
              if (hit) {
                over++;
                note ||= `${el.dataset.guide} over ${hit.id}`;
              }
            }
          });
          if (!shown) bad.push(`${LABEL[mode]}: no guides along the top bar`);
          if (over) bad.push(`${LABEL[mode]}: a guide over an item on ${over} frames (${note})`);
          else said.push(`${LABEL[mode]}: guides along the top bar, none over Tools' float`);
        }
      },
    ),
    preset(
      "landing-guides-room",
      "Landing model: the room beside the held toolbar is marked",
      "Zoom glided slowly along the title bar, along its own rail and along the bottom bar, in Placeholder and Snap (guides near): on every frame its lane holds it, where at least a pitch (40 px) of free room lies between its landing and the next item or the lane's end, on either side, a box guide lies in that room (what the held copy leaves of it, 3 px clear); and in Snap no box beside it blinks (goes and is back within 4 frames).",
      (c, bad, said) => {
        const PITCH = 40;
        for (const mode of ["gap", "item"] as const) {
          for (const lane of ["title", "rail-left", "bottom"] as const) {
            fresh(c, mode);
            c.setPlaceGuides(mode === "gap" ? "placeholder" : "snap", "near");
            const r = c.layout.edges[lane]!.rect;
            const axis: "x" | "y" = lane === "rail-left" ? "y" : "x";
            const lo = (q: Rect): number => (axis === "x" ? q.x : q.y);
            const hi = (q: Rect): number => (axis === "x" ? q.x + q.width : q.y + q.height);
            // Along the lane's middle, from near one end to near the other, slowly enough to stop on every spot.
            const path = (g: Point): Point[] =>
              lane === "rail-left"
                ? [g, { x: r.x + r.width / 2, y: r.y + 30 }, { x: r.x + r.width / 2, y: r.y + r.height - 30 }]
                : [g, { x: g.x, y: g.y - 40 }, { x: 40, y: r.y + r.height / 2 }, { x: r.x + r.width - 40, y: r.y + r.height / 2 }];
            let frames = 0;
            let missing = 0;
            let note = "";
            // A blink: a box beside the held toolbar that goes and is back within 4 frames (passing an item, the box
            // after it rightly goes for good, or until the toolbar passes back).
            const runs = new Map<string, { on: boolean; goneAt: number; gone?: string }>();
            const blinked: string[] = [];
            let n = 0;
            drive(c, "zoom", (g) => hold(through(path(g), 0.12), 200), [], () => {
              const f = c.landingFrame;
              n++;
              const boxes = [...c.win.querySelectorAll<HTMLElement>(".dw-guide[data-kind='box']")].filter((el) => !el.hasAttribute("data-off"));
              const ids = new Set(boxes.map((el) => el.dataset.guide ?? ""));
              const at = `${f?.region ?? "?"}:${f?.spot ?? "-"}`;
              for (const [id, run] of runs)
                if (run.on && !ids.has(id)) {
                  run.on = false;
                  run.goneAt = n;
                  run.gone = at;
                }
              for (const id of ids) {
                const run = runs.get(id);
                if (run && !run.on && n - run.goneAt <= 4 && /:(before|after)/.test(id)) blinked.push(`${id}: gone at ${run.gone}, back at ${at}`);
                runs.set(id, { on: true, goneAt: run?.goneAt ?? 0, ...(run?.gone ? { gone: run.gone } : {}) });
              }
              if (!f || f.region !== "lane" || f.lane !== lane || !f.landing) return;
              frames++;
              const land = f.landing;
              // The items drawn in the lane (not the held one), their extents along it.
              const items = [...c.win.querySelectorAll<HTMLElement>(".dw-items .dw-item")]
                .filter((el) => el.offsetWidth > 0 && el.dataset.id !== "zoom")
                .map((el) => rectIn(c, el))
                .filter((q) => (axis === "x" ? q.y + q.height / 2 > r.y && q.y + q.height / 2 < r.y + r.height : q.x + q.width / 2 > r.x && q.x + q.width / 2 < r.x + r.width));
              const before = Math.max(lo(r), ...items.filter((q) => hi(q) <= lo(land) + 0.5).map(hi));
              const after = Math.min(hi(r), ...items.filter((q) => lo(q) >= hi(land) - 0.5).map(lo));
              // No guide lies under the held copy (in Placeholder it follows the pointer, over the room at times): the
              // room it leaves, 3 px clear of it, is what must be boxed.
              const heldEl = c.win.querySelector<HTMLElement>("[data-drag-held]");
              const copy = heldEl ? rectIn(c, heldEl) : null;
              const crossesLane = copy && (axis === "x" ? copy.y < r.y + r.height && r.y < copy.y + copy.height : copy.x < r.x + r.width && r.x < copy.x + copy.width);
              for (const [a0, b0, side] of [
                [before, lo(land), "before"],
                [hi(land), after, "after"],
              ] as const) {
                let pieces: [number, number][] = [[a0, b0]];
                if (copy && crossesLane) pieces = pieces.flatMap(([p, q]): [number, number][] => [[p, Math.min(q, lo(copy) - 3)], [Math.max(p, hi(copy) + 3), q]]);
                for (const [a, b] of pieces) {
                  if (b - a < PITCH + 1) continue;
                  const has = boxes.some((el) => {
                    const g = rectIn(c, el);
                    return hi(g) > a + 1 && lo(g) < b - 1 && Math.min(hi(g), b) - Math.max(lo(g), a) >= 20;
                  });
                  if (!has) {
                    missing++;
                    note ||= `${Math.round(b - a)} px ${side} the landing at ${Math.round(lo(land))}`;
                  }
                }
              }
            });
            // In Snap the copy lies on its landing: a box beside it never blinks. (In Placeholder the copy at the pointer
            // may pass over one, which hides it under the copy.)
            const blinks = mode === "item" ? blinked : [];
            if (!frames) bad.push(`${LABEL[mode]} ${lane}: the lane never held Zoom`);
            else if (missing) bad.push(`${LABEL[mode]} ${lane}: room beside the held toolbar without a box on ${missing} of ${frames} frames (${note})`);
            if (blinks.length) bad.push(`${LABEL[mode]} ${lane}: a box beside the held toolbar blinked (${blinks.join(", ")})`);
            if (frames && !missing && !blinks.length) said.push(`${LABEL[mode]} ${lane}: the room beside Zoom boxed on all ${frames} frames`);
            c.setPlaceGuides(mode === "gap" ? "placeholder" : "snap", null);
          }
        }
      },
    ),
    preset(
      "landing-guides-cues",
      "Landing model: the cues say only \"you can drop here\", and never lie on a toolbar",
      "Views held in the left rail below Tools and Zoom, in Placeholder and Snap (guides all), with empty lanes at their real size and as an edge: the rail's head, with no free room, is a 2 px line, never stripes; the empty right rail by the Findings column is a box one rail wide over the column's outer strip (real size) or a thin striped edge at most 8 px at the window's side with no box (edge); no guide of any kind covers a docked toolbar or the held one, and only an empty lane's mark lies on a panel; nothing in the landing's accent; every guide 2 px inside the window.",
      (c, bad, said) => {
        for (const empty of ["real", "edge"] as const)
        for (const mode of ["gap", "item"] as const) {
          c.setEmptyLanes(empty);
          fresh(c, mode);
          c.setPlaceGuides(mode === "gap" ? "placeholder" : "snap", "all");
          const rail = c.layout.edges["rail-left"]!.rect;
          let frames = 0;
          let headLine = 0;
          let edges = 0;
          let onItem = 0;
          let accent = 0;
          let outside = 0;
          let note = "";
          // The window's inside, as `rectIn` measures (from its border box: the 1 px border first).
          const inner = { x: 1, y: 1, width: c.win.clientWidth, height: c.win.clientHeight };
          drive(c, "views", (g) => hold(through([g, { x: rail.x + rail.width / 2, y: rail.y + rail.height - 60 }, { x: rail.x + rail.width / 2, y: rail.y + rail.height - 150 }], 0.2), 200), [], () => {
            const f = c.landingFrame;
            if (!f || f.region !== "lane" || f.lane !== "rail-left") return;
            frames++;
            const els = [...c.win.querySelectorAll<HTMLElement>(".dw-guide[data-kind]")].filter((el) => !el.hasAttribute("data-off"));
            if (els.some((el) => el.dataset.kind === "line" && (el.dataset.guide ?? "").includes("rail-left/line/^|tools"))) headLine++;
            // A growing item (the title filling its bar) at its natural length: past it is free room, marked like any.
            const natural = (id: string, r: Rect): Rect => {
              const main = c.state.items[id as keyof typeof c.state.items]?.forms.row?.[0]?.main;
              return main?.grows && main.natural < r.width ? { ...r, width: main.natural } : r;
            };
            const items = [...c.win.querySelectorAll<HTMLElement>(".dw-items .dw-item")].filter((el) => el.offsetWidth > 0).map((el) => ({ id: el.dataset.id ?? "item", r: natural(el.dataset.id ?? "", rectIn(c, el)), panel: el.querySelector("[data-grip].dw-head") !== null || el.classList.contains("dw-panel") }));
            const heldEl = c.win.querySelector<HTMLElement>("[data-drag-held]");
            if (heldEl) items.push({ id: "the held item", r: rectIn(c, heldEl), panel: false });
            const slotEl = c.win.querySelector<HTMLElement>(".dw-slot");
            const slotColor = slotEl ? getComputedStyle(slotEl).borderTopColor : "";
            for (const el of els) {
              const g = rectIn(c, el);
              const id = el.dataset.guide ?? "";
              const lane = id.split("/")[0]!;
              // An empty lane's mark (its edge not drawn): at its real size or as a thin edge, it may lie on a panel.
              const emptyLane = (c.layout.edges[lane as keyof typeof c.layout.edges]?.cross ?? 0) <= 0;
              const thinEdge = el.dataset.kind === "hatch" && !/:(before|after)/.test(id) && Math.min(g.width, g.height) <= 8.5;
              if (lane === "rail-right") {
                if (empty === "edge" && thinEdge) edges++;
                // One rail wide (30), less the 2 px box inset and the 2 px off the window's inside.
                if (empty === "real" && el.dataset.kind === "box" && g.width >= 20 && g.width <= 28) edges++;
                if ((empty === "edge" && el.dataset.kind === "box") || (empty === "real" && el.dataset.kind === "hatch")) {
                  onItem++;
                  note ||= `${id} drawn as a ${el.dataset.kind} with empty lanes ${empty}`;
                }
              }
              // On an item: a toolbar or the held one never; a panel only an empty lane's mark.
              const hit = items.find((it) => overlaps(g, it.r) && !(emptyLane && it.panel));
              if (hit) {
                onItem++;
                note ||= `${el.dataset.guide} on ${hit.id}`;
              }
              const s = getComputedStyle(el);
              if (slotColor && (s.borderTopColor === slotColor || s.backgroundColor === slotColor)) accent++;
              // 2 px inside the window's inside (its 1 px border).
              if (g.x < inner.x + 2 - 0.5 || g.y < inner.y + 2 - 0.5 || g.x + g.width > inner.x + inner.width - 2 + 0.5 || g.y + g.height > inner.y + inner.height - 2 + 0.5) {
                outside++;
                note ||= `${el.dataset.guide} within 2 px of the window's edge`;
              }
            }
          });
          c.setPlaceGuides(mode === "gap" ? "placeholder" : "snap", null);
          const at = `${LABEL[mode]}, empty lanes ${empty}`;
          if (!frames) bad.push(`${at}: the rail never held Views`);
          else if (headLine < frames) bad.push(`${at}: no line at the rail's head on ${frames - headLine} of ${frames} frames`);
          if (frames && !edges) bad.push(`${at}: the empty right rail isn't drawn as ${empty === "real" ? "a box one rail wide" : "a thin striped edge"}`);
          if (onItem) bad.push(`${at}: a guide where it may not be on ${onItem} counts (${note})`);
          if (accent) bad.push(`${at}: a guide in the landing's accent`);
          if (outside) bad.push(`${at}: a guide within 2 px of the window's edge on ${outside} counts (${note})`);
          if (frames && headLine === frames && edges && !onItem && !accent && !outside) said.push(`${at}: head line, the empty right rail as set, nothing on a toolbar, all inside the window, on all ${frames} frames`);
        }
        c.setEmptyLanes("real");
      },
    ),
    preset(
      "landing-held-form",
      "Landing model: the held toolbar takes its landing's form, in every mode",
      "Zoom taken out of its rail into the page, held, and back into the rail, held, in Outline, Placeholder and Snap at 150 and 600 px/s: on every settled frame (the landing unchanged for 200 ms) the held toolbar's form (a row or a column) is its landing's, and its form switches at most once per crossing. Where the item follows the hand (Outline, Placeholder, and Snap while no spot is shown) its grip stays within 2 px of where the pointer holds it; in Snap with a spot shown the item itself sits in its place (one preview), so its rect is the landing's.",
      (c, bad, said) => {
        for (const mode of MODES)
          for (const speed of [0.15, 0.6]) {
            fresh(c, mode);
            const rail = c.layout.edges["rail-left"]!.rect;
            const at = `${LABEL[mode]} at ${speed * 1000} px/s`;
            let settled = 0;
            let wrongForm = 0;
            let drift = 0;
            /** Settled frames where Snap shows a spot (the item sits in its place), and those where it isn't the landing. */
            let placed = 0;
            let offPlace = 0;
            let note = "";
            const switches: number[] = [0];
            let region = "";
            let lastRow: boolean | null = null;
            let lastLanding = "";
            let since = 0;
            let leg = 0;
            let path: Key[] = [];
            /** The pointer at `t` along the path (linear between keys). */
            const pointerAt = (t: number): Point => {
              let i = 0;
              while (i < path.length - 1 && path[i + 1]![0] <= t) i++;
              const a = path[i]!;
              const b = path[Math.min(i + 1, path.length - 1)]!;
              const u = b[0] > a[0] ? Math.min(1, Math.max(0, (t - a[0]) / (b[0] - a[0]))) : 1;
              return { x: a[1] + (b[1] - a[1]) * u, y: a[2] + (b[2] - a[2]) * u };
            };
            drive(
              c,
              "zoom",
              (g) => {
                const out = { x: rail.x + rail.width + 320, y: g.y + 40 };
                const keys = through([g, { x: g.x, y: g.y + 4 }, out], speed);
                const t1 = keys.at(-1)![0] + 400;
                keys.push([t1, out.x, out.y]);
                const back = through([out, { x: rail.x + rail.width / 2, y: g.y + 40 }], speed, t1);
                keys.push(...back, [back.at(-1)![0] + 400, rail.x + rail.width / 2, g.y + 40]);
                path = keys;
                return keys;
              },
              [],
              (t) => {
                const f = c.landingFrame;
                const heldEl = c.win.querySelector<HTMLElement>("[data-drag-held]");
                if (!f || !heldEl || !f.landing) return;
                const h = rectIn(c, heldEl);
                const row = h.width >= h.height;
                // A crossing is a change of the landing's region (the rail to open space, and back): at most one switch each.
                if (f.region !== region) {
                  region = f.region;
                  leg = switches.push(0) - 1;
                }
                if (lastRow !== null && row !== lastRow) switches[leg]!++;
                lastRow = row;
                const grip = heldEl.querySelector<HTMLElement>("[data-grip]");
                const key = `${f.region}:${f.spot ?? ""}:${Math.round(f.landing.x)},${Math.round(f.landing.y)}`;
                if (key !== lastLanding) {
                  lastLanding = key;
                  since = t;
                  return;
                }
                if (t - since < 200) return;
                settled++;
                const landingRow = f.landing.width >= f.landing.height;
                if (row !== landingRow) {
                  wrongForm++;
                  note ||= `${f.region} landing ${landingRow ? "row" : "column"}, held ${row ? "row" : "column"}`;
                }
                // One preview: in Snap with a spot shown the item is drawn at its landing, not under the hand.
                if (mode === "item" && f.region === "lane" && f.spot) {
                  placed++;
                  const l = f.landing;
                  // The landing is in the window's inside (past its border); `h` is from the window's outer corner.
                  const bx = c.win.clientLeft;
                  const by = c.win.clientTop;
                  const d = Math.max(Math.abs(h.x - bx - l.x), Math.abs(h.y - by - l.y), Math.abs(h.width - l.width), Math.abs(h.height - l.height));
                  if (d > 0.5) {
                    offPlace++;
                    note ||= `in its place ${Math.round(d)} px off the landing`;
                  }
                } else if (grip) {
                  const gr = rectIn(c, grip);
                  const p = pointerAt(t);
                  const d = Math.hypot(Math.max(gr.x - p.x, 0, p.x - (gr.x + gr.width)), Math.max(gr.y - p.y, 0, p.y - (gr.y + gr.height)));
                  if (d > 2) {
                    drift++;
                    note ||= `the grip ${Math.round(d)} px from the pointer`;
                  }
                }
              },
            );
            if (!settled) bad.push(`${at}: no settled frame`);
            if (wrongForm) bad.push(`${at}: the held form isn't the landing's on ${wrongForm} of ${settled} settled frames (${note})`);
            if (drift) bad.push(`${at}: the grip off the pointer on ${drift} settled frames (${note})`);
            if (offPlace) bad.push(`${at}: in its place but not at the landing on ${offPlace} of ${placed} settled frames (${note})`);
            if (mode === "item" && !placed) bad.push(`${at}: Snap never showed a spot, so the item was never seen in its place`);
            if (switches.some((s) => s > 1)) bad.push(`${at}: the form switched more than once within one landing region (${switches.join("/")})`);
            if (switches.reduce((a, b) => a + b, 0) < 2) bad.push(`${at}: the form didn't follow out and back (${switches.join("/")} switches)`);
            if (settled && !wrongForm && !drift && !offPlace && switches.every((s) => s <= 1))
              said.push(`${at}: the held form the landing's on all ${settled} settled frames, ${placed ? `in its place on ${placed}, the grip under the pointer on the rest` : "the grip under the pointer"}, ${switches.join("/")} switches`);
          }
      },
    ),
  ];
}
