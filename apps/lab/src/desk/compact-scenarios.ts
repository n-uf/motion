/**
 * The compact forms' scenarios (the foundations' checks, the lab's part): every toolbar group fits its box in every
 * host and orientation, expanded, collapsed and floating, with no text rotated and no side edge widened; » opens a
 * popover with the group's full form whose controls work, and Escape, a press outside and a drag start close it with
 * focus back on »; every selected control shows the one selected style. And two rules for every grip: the slot a
 * dragged group is shown is its own outline (never a hairline) and the drop lands on it, in every preview and target
 * kind; every element with a grip glyph drags something.
 */
import type { Rect } from "@n-uf/motion";
import { nextFrame, type Point } from "../shared/geometry";
import { overflowOpen } from "./compact";
import { CONSTRUCTIONS } from "./catalog";
import type { DeskLab, Expect, PathKey, Scenario } from "./scenarios";
import { hostRect, toolbarGroups as tg } from "./toolbar-frame";
import { HOSTS, HOST_LABEL, floatGroup, insertGroup, vertical, type HostId } from "@n-uf/placement/toolbar";
import { DEFAULT_ARRANGEMENT, GROUPS, GROUP_LABEL, type Arrangement, type GroupId } from "./groups";

const fmt = (r: Rect): string => `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)} × ${Math.round(r.height)}`;
const inside = (r: Rect, o: Rect, tol = 0.75): boolean => r.x >= o.x - tol && r.y >= o.y - tol && r.x + r.width <= o.x + o.width + tol && r.y + r.height <= o.y + o.height + tol;

async function settle(lab: DeskLab): Promise<void> {
  await nextFrame();
  await lab.idle();
  await tg.idle();
}
async function arrange(lab: DeskLab, a: Arrangement): Promise<void> {
  tg.set(a, "reserved");
  await settle(lab);
}
const withDefault =
  (lab: DeskLab, play: (expect: Expect) => Promise<void>) =>
  async (expect: Expect): Promise<void> => {
    try {
      await play(expect);
    } finally {
      await arrange(lab, DEFAULT_ARRANGEMENT);
    }
  };

/** What a group shows: every laid-out element of its content (not hidden, not collapsed away; a hit area's pseudo-element isn't one). */
const shownControls = (el: HTMLElement): HTMLElement[] =>
  [...el.querySelectorAll<HTMLElement>(".tg-in *:not(svg *)")].filter((c) => c.getClientRects().length > 0 && getComputedStyle(c).visibility !== "hidden");

/** Group `id` fits its box where it is now: no overflow, every control inside it, no text turned, a side edge not widened. */
function checkFit(id: GroupId, where: string, expect: Expect): void {
  const el = tg.groupEl(id);
  const p = tg.placements().get(id);
  if (!el || !p) return void expect(false, `${where}: ${GROUP_LABEL[id]} isn't placed`);
  const box = tg.rectOf(el);
  for (const c of shownControls(el)) {
    const r = tg.rectOf(c);
    expect(inside(r, box), `${where}: ${GROUP_LABEL[id]}'s ${c.getAttribute("aria-label") ?? c.className} at ${fmt(r)} leaves its box ${fmt(box)}`);
  }
  // A button's own text (a title, a value) doesn't spill out of it.
  for (const b of el.querySelectorAll<HTMLElement>(".tg-in .tb-cell"))
    if (b.getClientRects().length > 0 && getComputedStyle(b).overflow === "visible" && (b.scrollWidth > b.clientWidth + 1 || b.scrollHeight > b.clientHeight + 1))
      expect(false, `${where}: ${GROUP_LABEL[id]}'s ${b.getAttribute("aria-label") ?? b.className} holds ${b.scrollWidth} × ${b.scrollHeight} in ${b.clientWidth} × ${b.clientHeight}`);
  if (p.host !== "float") {
    const host = hostRect(tg.geometry(), p.host);
    expect(inside(box, host), `${where}: ${GROUP_LABEL[id]} at ${fmt(box)} is clipped by the ${HOST_LABEL[p.host]} ${fmt(host)}`);
    if (vertical(p.host)) expect(box.width <= host.width + 0.5, `${where}: ${GROUP_LABEL[id]} is ${Math.round(box.width)} wide on a ${Math.round(host.width)} px edge`);
  }
  for (const t of [el, ...el.querySelectorAll<HTMLElement>("*")]) {
    const cs = getComputedStyle(t);
    if (cs.writingMode !== "horizontal-tb" || (cs.transform !== "none" && t !== el && /matrix\((?!1, 0, 0, 1)/.test(cs.transform)))
      expect(false, `${where}: ${GROUP_LABEL[id]} turns its text (${t.className || t.tagName}: ${cs.writingMode}, ${cs.transform})`);
  }
}

export function compactScenarios(lab: DeskLab): Record<string, Scenario> {
  const out: Record<string, Scenario> = {};

  out["toolbar groups: every group fits its box in every host and orientation, expanded, collapsed and floating; no text turns"] = {
    construction: "docks",
    size: [1200, 760],
    play: withDefault(lab, async (expect) => {
      for (const id of GROUPS) {
        for (const h of HOSTS as readonly HostId[]) {
          for (const collapsed of [false, true]) {
            const a0 = insertGroup(DEFAULT_ARRANGEMENT, id, h, "start", 0);
            await arrange(lab, { ...a0, collapsed: collapsed ? [id] : [] });
            const where = `${HOST_LABEL[h]}${collapsed ? ", collapsed" : ""}`;
            checkFit(id, where, expect);
            const fails = tg.failures();
            expect(fails.length === 0, `${GROUP_LABEL[id]} on the ${where}: ${fails[0]}`);
          }
        }
        await arrange(lab, floatGroup(DEFAULT_ARRANGEMENT, id, 60, 80));
        checkFit(id, "floating", expect);
      }
    }),
  };

  out["toolbar groups: on a side edge » opens the group's full form beside it; its controls work; Escape, a press outside and a drag start close it, focus back on »"] = {
    construction: "docks",
    size: [1200, 760],
    play: withDefault(lab, async (expect) => {
      await arrange(lab, insertGroup(DEFAULT_ARRANGEMENT, "doc", "left", "start", 0));
      const el = tg.groupEl("doc")!;
      const over = el.querySelector<HTMLButtonElement>(".tg-over")!;
      expect(getComputedStyle(over).display !== "none", "the document's » doesn't show on the left edge");
      expect(getComputedStyle(el.querySelector(".tg-ctl")!).display === "none", "the document's title still shows on the left edge");
      expect(over.tabIndex === 0 && over.getAttribute("aria-haspopup") === "dialog" && over.getAttribute("aria-expanded") === "false", "» isn't a real button (focusable, aria-haspopup, aria-expanded)");
      over.click();
      let pop = overflowOpen();
      expect(!!pop && over.getAttribute("aria-expanded") === "true", "» opened nothing");
      if (pop) {
        expect((pop.textContent ?? "").includes("Quarterly plan"), `the popover shows "${pop.textContent}", not the title`);
        const r = tg.rectOf(pop);
        const o = tg.rectOf(over);
        expect(r.x >= o.x + o.width, `the popover at ${fmt(r)} isn't beside the left edge's » ${fmt(o)}`);
        const own = el.querySelector<HTMLButtonElement>(".tg-ctl button")!;
        let pressed = 0;
        own.addEventListener("click", () => pressed++, { once: true });
        pop.querySelector<HTMLButtonElement>("button")!.click();
        expect(pressed === 1, "a control in the popover didn't press the group's own one");
      }
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      expect(!overflowOpen() && document.activeElement === over, `Escape left the popover ${overflowOpen() ? "open" : "closed"}, focus on ${document.activeElement?.className}`);
      over.click();
      document.getElementById("stage")!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, buttons: 1 }));
      document.getElementById("stage")!.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, buttons: 0 }));
      expect(!overflowOpen() && document.activeElement === over, "a press outside didn't close the popover with focus back on »");
      over.click();
      pop = overflowOpen();
      const grip = tg.grip("g:edit")!;
      const keys: PathKey[] = [
        [0, grip.x, grip.y],
        [120, grip.x + 40, grip.y + 30],
        [160, grip.x + 40, grip.y + 30],
      ];
      await tg.path("g:edit", () => keys, { escapeAt: () => 140 });
      await settle(lab);
      expect(!!pop && !overflowOpen(), "a drag start didn't close the popover");
    }),
  };

  out["toolbar groups and the lab's switches: every selected control shows the one selected style, the accent inset ring"] = {
    construction: "docks",
    play: withDefault(lab, async (expect) => {
      const sel = [...document.querySelectorAll<HTMLElement>(".deskwin [aria-pressed='true'], .controls [aria-pressed='true']")].filter((e) => e.getClientRects().length > 0);
      expect(sel.length > 0, "nothing is selected to check");
      const look = (e: HTMLElement): string => {
        const cs = getComputedStyle(e);
        return `${cs.boxShadow} | ${cs.textDecorationLine} | ${cs.borderBottomStyle}`;
      };
      const looks = new Set(sel.map(look));
      expect(looks.size === 1, `${looks.size} selected styles: ${[...looks].join(" ; ")}`);
      for (const e of sel) expect(/inset/.test(getComputedStyle(e).boxShadow) && getComputedStyle(e).textDecorationLine === "none", `${e.textContent?.trim().slice(0, 30)} isn't the accent ring: ${look(e)}`);
    }),
  };

  out["toolbar groups: the slot shown is the group's own outline, never a hairline, at a line, an empty zone and a float; the drop lands on it"] = {
    construction: "docks",
    size: [1200, 760],
    drag: true,
    play: withDefault(lab, async (expect) => {
      const mid = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
      const pick = [
        ["a line in the title bar", (t: { id: string; kind: string }) => t.kind === "line" && t.id.startsWith("g:title:")],
        ["an empty zone", (t: { id: string; kind: string }) => t.kind === "zone"],
        ["a float", (t: { id: string; kind: string }) => t.kind === "float"],
      ] as const;
      for (const [what, is] of pick) {
        await arrange(lab, DEFAULT_ARRANGEMENT);
        const t = tg.targets("g:edit").find(is);
        if (!t) {
          expect(false, `edit has no target for ${what}`);
          continue;
        }
        const to = t.kind === "line" ? mid(t.line) : t.kind === "float" ? { x: t.hit.x + t.hit.width / 2, y: t.hit.y + t.hit.height / 2 } : mid(t.hit);
        let shown: Rect | null = null;
        let thinnest = Infinity;
        const r = await tg.path(
          "g:edit",
          (g) => {
            const keys: PathKey[] = [[0, g.x, g.y]];
            const d = Math.hypot(to.x - g.x, to.y - g.y);
            keys.push([Math.max(200, d / 0.8), to.x, to.y], [Math.max(200, d / 0.8) + 650, to.x, to.y]);
            return keys;
          },
          {
            onFrame: () => {
              const ind = tg.indicator();
              if (!ind) return;
              shown = ind.rect;
              thinnest = Math.min(thinnest, ind.rect.width, ind.rect.height);
            },
          },
        );
        await settle(lab);
        const mode = lab.preview();
        expect(r.landed === t.id, `${mode}, ${what}: landed on ${r.landed}, not ${t.id}`);
        expect(thinnest >= 6, `${mode}, ${what}: the slot was ${Math.round(thinnest)} px thin (a hairline)`);
        const landed = tg.placements().get("edit")?.rect;
        const s = shown as Rect | null;
        if (s && landed)
          expect(
            Math.max(Math.abs(s.x - landed.x), Math.abs(s.y - landed.y), Math.abs(s.width - landed.width), Math.abs(s.height - landed.height)) <= 1.5,
            `${mode}, ${what}: the outline was ${fmt(s)}, it landed at ${fmt(landed)}`,
          );
        else expect(mode === "snap", `${mode}, ${what}: no slot was shown`);
      }
    }),
  };

  out["every element with a grip glyph drags something, in every construction (a grip shows only on what moves)"] = {
    construction: "docks",
    size: [1200, 760],
    preview: "indicator",
    play: withDefault(lab, async (expect) => {
      const at = (el: Element): Point => {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      };
      const fire = (type: string, on: Element, p: Point): void =>
        void on.dispatchEvent(
          new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", isPrimary: true, button: type === "pointermove" ? -1 : 0, buttons: type === "pointerup" ? 0 : 1, clientX: p.x, clientY: p.y }),
        );
      const lifted = (): boolean => !!document.querySelector(".deskwin .lifted, #stage .win.lifted") || tg.dragging();
      for (const c of CONSTRUCTIONS) {
        lab.use(c.id);
        await settle(lab);
        // What shows a grip glyph: group handles, panel and tab-row handles, rail segments, the pill's grip, any loose dots.
        const shows = (e: Element): boolean => e.getClientRects().length > 0 && getComputedStyle(e).visibility === "visible" && getComputedStyle(e).display !== "none";
        const grips = [...document.querySelectorAll<HTMLElement>(".deskwin .tg-handle, .deskwin .tf-glyph, #stage .grip-handle, #stage .win.chrome .segment, #stage .tb-grip")].filter(shows);
        const loose = [...document.querySelectorAll<HTMLElement>(".deskwin .grip-dots")].filter((d) => shows(d) && !d.closest(".grip-handle, .segment"));
        expect(loose.length === 0, `${c.title}: ${loose.length} grip glyphs belong to nothing that drags`);
        expect(!document.querySelector(".deskwin .tf-title .tf-glyph"), `${c.title}: the window's title bar shows a grip, but the window doesn't move`);
        for (const g of grips) {
          if (!g.isConnected || !shows(g)) continue;
          const name = g.getAttribute("aria-label") ?? g.className;
          const p = at(g);
          fire("pointerdown", g, p);
          for (let i = 1; i <= 6; i++) {
            fire("pointermove", g, { x: p.x + i * 6, y: p.y + i * 8 });
            await nextFrame();
          }
          const moved = lifted();
          document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
          fire("pointerup", g, { x: p.x + 36, y: p.y + 48 });
          await settle(lab);
          expect(moved, `${c.title}: ${name} shows a grip but a drag on it lifted nothing`);
        }
      }
    }),
  };

  return out;
}
