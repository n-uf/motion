/**
 * 4 · Fold or collapse: a folded group is its handle and »; » opens the full group. Two things to see: how the fold
 * moves (today an instant swap; proposed, @n-uf/motion/layout's size change: laid out at the new size at once and
 * revealed, never squeezed, the groups after it gliding at ω 25), and which group folds first when a bar runs out of
 * room (placement's `layoutHost` collapses trailing-first; a per-group `keep` folds the primary group, Redact, last).
 */
import type { Rect } from "@n-uf/motion";
import { checkMonotonic, checkNoOvershoot, checkTempo, type RectSample } from "@n-uf/motion/testing";
import { nextFrame } from "../shared/geometry";
import { GROUP_LABEL, createDossier, type Dossier, type GroupId } from "./dossier";
import { fmt, settle } from "./drive";
import { allIdle, caseFrame, type Expect, type KitCase, type KitScenario } from "./kit-case";

const RULE_FOLD = `Double-click a handle to fold its group; click » to open it. <b>Today</b> the group swaps to handle + » in one
frame and the groups after it jump. <b>Proposed</b>: a size change through <code>@n-uf/motion/layout</code>: the group is laid
out at its new size at once (its controls keep their size and are cut off, never squeezed) and the groups after it glide,
critically damped at ω 25. Unfolding reveals the controls the same way.`;

const RULE_ROOM = `When a bar runs out of room, <code>layoutHost</code> folds groups to handle + ». <b>Today</b>: trailing-first, so
Redact, the primary command group at the top bar's end, is the first to disappear. <b>Proposed</b>: placement's per-group
<code>keep</code> (<code>keep: { redact: 1 }</code>): a group with a higher keep folds only after every group with a lower one;
ties stay trailing-first. Narrow the window to see the order.`;

/** Widths where the top bar holds everything, then loses one, two, three groups. */
const WIDTHS = [600, 360, 320, 280] as const;
/** The primary group folds last. */
const KEEP = { redact: 1 } as const;
const T90 = (Math.log(10) / 25) * 1000;

export const case4: KitCase = {
  id: "fold",
  title: "4 · Fold or collapse",
  mount(host, loop) {
    const ds: Dossier[] = [];
    const fold = caseFrame(host, RULE_FOLD, [{ id: "today", caption: "Today · instant" }, { id: "proposed", caption: "Proposed · revealed through ./layout" }], () => {
      today.reset();
      proposed.reset();
    });
    const today = createDossier(fold.today!, { title: "Quarterly plan.pdf", loop, fold: () => "instant" });
    const proposed = createDossier(fold.proposed!, { title: "Quarterly plan.pdf", loop });
    ds.push(today, proposed);

    let width: number = WIDTHS[1];
    const room = caseFrame(host, RULE_ROOM, [{ id: "trailing", caption: "Today · trailing-first" }, { id: "keep", caption: "Proposed · trailing-first, Redact (keep 1) last" }], () => setWidth(WIDTHS[1]));
    const trailing = createDossier(room.trailing!, { title: "Quarterly plan.pdf", loop, width });
    const keep = createDossier(room.keep!, { title: "Quarterly plan.pdf", loop, width, keep: KEEP });
    ds.push(trailing, keep);
    // The width switch, in the room section's controls.
    const controls = room.trailing!.closest(".kcase")!.querySelector(".controls")!;
    const field = document.createElement("fieldset");
    field.innerHTML = `<legend>Window width</legend>${WIDTHS.map((w) => `<label><input type="radio" name="c4-width" value="${w}"${w === width ? " checked" : ""} /> ${w} px</label>`).join("")}`;
    controls.prepend(field);
    const order = document.createElement("p");
    order.className = "readout";
    room.trailing!.closest(".kcase")!.append(order);
    function setWidth(w: number): void {
      width = w;
      for (const d of [trailing, keep]) {
        d.reset();
        d.setWidth(w);
      }
      field.querySelectorAll<HTMLInputElement>("input").forEach((i) => (i.checked = Number(i.value) === w));
      showOrder();
    }
    function showOrder(): void {
      const names = (d: Dossier): string => d.folded().map((g) => GROUP_LABEL[g]).join(", ") || "none";
      order.textContent = `At ${width} px, folded: today ${names(trailing)}; proposed ${names(keep)}.`;
    }
    field.addEventListener("change", (e) => setWidth(Number((e.target as HTMLInputElement).value)));
    showOrder();

    return {
      reset: () => {
        today.reset();
        proposed.reset();
        setWidth(WIDTHS[1]);
      },
      idle: allIdle(ds),
      scenarios: scenarios({ today, proposed, trailing, keep, setWidth }),
    };
  },
};

interface Windows {
  readonly today: Dossier;
  readonly proposed: Dossier;
  readonly trailing: Dossier;
  readonly keep: Dossier;
  readonly setWidth: (w: number) => void;
}

/** Every frame's drawn rect of `el` in `d`, for `frames` frames, after `act`. */
async function sample(d: Dossier, el: Element, act: () => void, frames = 30): Promise<RectSample[]> {
  const out: RectSample[] = [{ t: performance.now(), rect: d.drawn(el) }];
  act();
  for (let i = 0; i < frames; i++) {
    await nextFrame();
    out.push({ t: performance.now(), rect: d.drawn(el) });
  }
  return out;
}
/** What shows of `el`: its drawn rect less the clip the layout motion draws it with (a reveal). */
function visible(d: Dossier, el: HTMLElement): Rect {
  const r = d.drawn(el);
  const m = /inset\(\s*0(?:px)?\s+([\d.]+)px\s+([\d.]+)px/.exec(el.style.clipPath);
  return m ? { ...r, width: r.width - Number(m[1]), height: r.height - Number(m[2]) } : r;
}
const dblclick = (el: Element): void => void el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
const frameStrictlyBetween = (s: readonly RectSample[], from: Rect, to: Rect): number => s.filter((x) => Math.abs(x.rect.x - from.x) > 1 && Math.abs(x.rect.x - to.x) > 1).length;

function scenarios(w: Windows): KitScenario[] {
  /** Fold Navigate in `d`: Zoom, after it, moves left by Navigate's lost length. */
  async function foldNavigate(d: Dossier): Promise<{ zoom: RectSample[]; nav: Rect; from: Rect; to: Rect }> {
    await settle(d);
    const zoomEl = d.groupEl("zoom");
    const zoom = await sample(d, zoomEl, () => dblclick(d.handle("navigate")));
    await settle(d);
    return { zoom, nav: d.drawn(d.groupEl("navigate")), from: zoom[0]!.rect, to: d.drawn(zoomEl) };
  }

  return [
    {
      name: "4 · A fold by hand: the group becomes handle + » at once and the groups after it glide (ω 25, no overshoot); today they jump",
      play: async (expect: Expect) => {
        const p = await foldNavigate(w.proposed);
        expect(w.proposed.folded().includes("navigate"), "Navigate isn't folded");
        expect(Math.abs(p.nav.width - 36) < 1.5, `folded Navigate is ${Math.round(p.nav.width)} px wide, handle + » is 36`);
        expect(p.to.x < p.from.x - 30, `Zoom didn't move left: ${fmt(p.from)} → ${fmt(p.to)}`);
        const between = frameStrictlyBetween(p.zoom, p.from, p.to);
        expect(between >= 3, `Zoom showed ${between} frames on its way: it jumped`);
        for (const f of checkNoOvershoot(p.zoom, p.from, p.to).failures) expect(false, `Zoom: ${f}`);
        for (const f of checkMonotonic(p.zoom, p.to).failures) expect(false, `Zoom: ${f}`);
        for (const f of checkTempo(p.zoom, p.from, p.to, T90, 0.3, p.zoom[0]!.t).failures) expect(false, `Zoom: ${f}`);
        const t = await foldNavigate(w.today);
        expect(w.today.folded().includes("navigate"), "today: Navigate isn't folded");
        expect(frameStrictlyBetween(t.zoom, t.from, t.to) === 0, "today: Zoom glided (today's swap is instant)");
      },
    },
    {
      name: "4 · Unfolding reveals the controls: the group grows, its controls keep their size (never squeezed)",
      play: async (expect: Expect) => {
        const d = w.proposed;
        dblclick(d.handle("navigate"));
        await settle(d);
        const el = d.groupEl("navigate");
        const cell = el.querySelector(".kg-cell")!;
        const cells: number[] = [];
        const grow: RectSample[] = [{ t: performance.now(), rect: visible(d, el) }];
        dblclick(d.handle("navigate"));
        // What shows of the group, and a control's own width, every frame while it grows.
        for (let i = 0; i < 24; i++) {
          await nextFrame();
          grow.push({ t: performance.now(), rect: visible(d, el) });
          cells.push(d.drawn(cell).width);
        }
        await settle(d);
        const to = d.drawn(el);
        expect(!d.folded().includes("navigate"), "Navigate is still folded");
        expect(grow.some((s) => s.rect.width > 40 && s.rect.width < to.width - 1), "the group never showed a width between folded and open: no reveal");
        for (const f of checkMonotonic(grow.map((s) => ({ t: s.t, rect: { ...s.rect, x: to.x, y: to.y, height: to.height } })), to).failures) expect(false, `the width: ${f}`);
        expect(cells.every((c) => Math.abs(c - 24) < 0.5), `a control was squeezed: ${cells.map((c) => c.toFixed(1)).join(", ")} px`);
      },
    },
    {
      name: "4 · » opens the folded group's full form; a control there presses the original; Escape closes it",
      play: async (expect: Expect) => {
        const d = w.proposed;
        dblclick(d.handle("zoom"));
        await settle(d);
        const ovf = d.groupEl("zoom").querySelector<HTMLButtonElement>(".kg-ovf")!;
        expect(getComputedStyle(ovf).display !== "none", "no » on folded Zoom");
        ovf.click();
        const pop = d.popover();
        expect(!!pop && pop.querySelectorAll(".kg-cell").length === 3, `the popover holds ${pop?.querySelectorAll(".kg-cell").length ?? 0} controls, Zoom has 3`);
        let pressed = 0;
        const original = d.groupEl("zoom").querySelectorAll<HTMLButtonElement>(".kg-cell")[2]!;
        const count = (): void => void pressed++;
        original.addEventListener("click", count);
        pop?.querySelectorAll<HTMLButtonElement>(".kg-cell")[2]?.click();
        original.removeEventListener("click", count);
        expect(pressed === 1, `the original control was pressed ${pressed} times`);
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        expect(!d.popover(), "Escape left the popover open");
      },
    },
    {
      name: "4 · Out of room: trailing-first folds Redact first; with keep, Annotate and Zoom fold and Redact stays open",
      play: async (expect: Expect) => {
        const expected: Record<number, { trailing: GroupId[]; keep: GroupId[] }> = {
          600: { trailing: [], keep: [] },
          360: { trailing: ["redact"], keep: ["annotate"] },
          320: { trailing: ["annotate", "redact"], keep: ["zoom", "annotate"] },
          280: { trailing: ["zoom", "annotate", "redact"], keep: ["zoom", "annotate"] },
        };
        for (const width of WIDTHS) {
          w.setWidth(width);
          await settle(w.trailing);
          await settle(w.keep);
          const want = expected[width]!;
          const same = (a: readonly GroupId[], b: readonly GroupId[]): boolean => a.length === b.length && a.every((g) => b.includes(g));
          expect(same(w.trailing.folded(), want.trailing), `at ${width} px today folds ${w.trailing.folded().join(", ") || "none"}, expected ${want.trailing.join(", ") || "none"}`);
          expect(same(w.keep.folded(), want.keep), `at ${width} px proposed folds ${w.keep.folded().join(", ") || "none"}, expected ${want.keep.join(", ") || "none"}`);
          // What the page drew: a folded group is handle + », an open one its full length.
          for (const d of [w.trailing, w.keep]) {
            for (const g of d.folded()) expect(Math.abs(d.drawn(d.groupEl(g)).width - 36) < 1.5, `at ${width} px folded ${g} is drawn ${Math.round(d.drawn(d.groupEl(g)).width)} px wide`);
          }
          // Nothing spills off the top bar.
          for (const d of [w.trailing, w.keep]) {
            const bar = d.drawn(d.el.querySelector(".kbar-top")!);
            const out = (["navigate", "zoom", "annotate", "redact"] as const).filter((g) => {
              const r = d.drawn(d.groupEl(g));
              return r.x < bar.x - 0.5 || r.x + r.width > bar.x + bar.width + 0.5;
            });
            expect(out.length === 0, `at ${width} px ${out.join(", ")} spill off the top bar`);
          }
        }
        w.setWidth(WIDTHS[1]);
      },
    },
  ];
}
