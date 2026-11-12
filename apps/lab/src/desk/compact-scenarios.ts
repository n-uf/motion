/**
 * The compact forms' scenarios (the foundations' checks, the lab's part): every toolbar group fits its box in every
 * host and orientation, expanded, collapsed and floating, with no text rotated and no side edge widened; » opens a
 * popover with the group's full form whose controls work, and Escape, a press outside and a drag start close it with
 * focus back on »; every selected control shows the one selected style.
 */
import type { Rect } from "@n-uf/motion";
import { nextFrame } from "../shared/geometry";
import { overflowOpen } from "./compact";
import type { DeskLab, Expect, PathKey, Scenario } from "./scenarios";
import { hostRect, toolbarGroups as tg } from "./toolbar-frame";
import { DEFAULT_ARRANGEMENT, GROUPS, GROUP_LABEL, HOSTS, HOST_LABEL, floatGroup, insertGroup, vertical, type Arrangement, type GroupId, type HostId } from "./toolbars";

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

  return out;
}
