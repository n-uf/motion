/**
 * 8 · Frozen layout: a lock freezes the layout. Frozen hides the grips; holding Alt shows them and they work. The
 * question is when the freeze is looked at. Today's guard asks "is it frozen?" on every move, so letting go of Alt
 * mid-drag cancels the drag, and pressing Alt mid-press starts one. Proposed: the freeze gates only the start of a
 * drag (read once, at the press); after the lift the drag intent runs to its drop or Escape.
 */
import type { Point } from "@n-uf/motion";
import { nextFrame } from "../shared/geometry";
import { HOME, createDossier, sameArrangement, type Dossier, type GroupId } from "./dossier";
import { mid, pointer, settle } from "./drive";
import { allIdle, caseFrame, type Expect, type KitCase, type KitScenario } from "./kit-case";

const RULE = `Freeze the layout with the lock: the grips hide. Hold <kbd>Alt</kbd> to bring them back and drag. <b>Today</b>
the guard is checked on every move. <b>Proposed</b> the freeze (and Alt) are read once, at the press: a frozen press never
becomes a drag, and a drag that started always finishes. Play (a) starts a drag with Alt held and lets go of Alt halfway;
play (b) presses a frozen group, then holds Alt while still pressing.`;

export const case8: KitCase = {
  id: "frozen",
  title: "8 · Frozen layout",
  mount(host, loop) {
    const desks = caseFrame(host, RULE, [{ id: "today", caption: "Today · the guard checked on every move" }, { id: "proposed", caption: "Proposed · the freeze gates only the start" }], () => reset());
    const today = createDossier(desks.today!, { title: "Quarterly plan.pdf", loop, frozen: true, freezeGate: "move" });
    const proposed = createDossier(desks.proposed!, { title: "Quarterly plan.pdf", loop, frozen: true });
    const ds = [today, proposed];
    const controls = desks.today!.closest(".kcase")!.querySelector(".controls")!;
    const lock = document.createElement("label");
    lock.className = "lock";
    lock.innerHTML = `<input type="checkbox" checked aria-label="Freeze the layout" /><span class="state"></span> <span class="lockhint">· hold <kbd>Alt</kbd> to move</span>`;
    const input = lock.querySelector("input")!;
    const playA = document.createElement("button");
    playA.type = "button";
    playA.textContent = "Play (a) on both";
    const playB = document.createElement("button");
    playB.type = "button";
    playB.textContent = "Play (b) on both";
    controls.prepend(lock, playA, playB);
    function setFrozen(on: boolean): void {
      input.checked = on;
      for (const d of ds) d.setFrozen(on);
    }
    function reset(): void {
      for (const d of ds) d.reset();
      setFrozen(true);
    }
    input.addEventListener("change", () => setFrozen(input.checked));
    playA.addEventListener("click", () => void Promise.all(ds.map((d) => altLetGo(d))));
    playB.addEventListener("click", () => void Promise.all(ds.map((d) => altAfterPress(d))));
    return { reset, idle: allIdle(ds), scenarios: scenarios(today, proposed, setFrozen) };
  },
};

/** Alt down or up, as the window sees it. */
const alt = (down: boolean): void => void window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { key: "Alt", altKey: down, bubbles: true }));

/** Move the pointer from `a` to `b` in `n` frames (page space), Alt held or not. */
async function moveIn(d: Dossier, a: Point, b: Point, n: number, altKey: boolean): Promise<void> {
  for (let i = 1; i <= n; i++) {
    await nextFrame();
    pointer("pointermove", window, d.toClient({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }), { altKey });
  }
}
const bottomCentre = (d: Dossier): Point => mid(d.drawn(d.el.querySelector(".kbar-bottom")!));

/**
 * (a) Alt held, press Zoom's grip and drag towards the bottom bar; let go of Alt halfway, keep going, aim, release.
 * Returns whether a drag was running just after Alt came up.
 */
async function altLetGo(d: Dossier): Promise<{ draggingAfterAltUp: boolean }> {
  const g: GroupId = "zoom";
  alt(true);
  const start = mid(d.drawn(d.handle(g)));
  const to = bottomCentre(d);
  const half = { x: (start.x + to.x) / 2, y: (start.y + to.y) / 2 };
  pointer("pointerdown", d.handle(g), d.toClient(start), { altKey: true });
  await moveIn(d, start, half, 12, true);
  alt(false);
  await moveIn(d, half, { x: half.x + 4, y: half.y + 4 }, 2, false);
  const draggingAfterAltUp = d.dragging();
  await moveIn(d, { x: half.x + 4, y: half.y + 4 }, to, 16, false);
  for (let i = 0; i < 24; i++) {
    await nextFrame();
    pointer("pointermove", window, d.toClient(to), { altKey: false });
  }
  pointer("pointerup", window, d.toClient(to));
  return { draggingAfterAltUp };
}

/** (b) Frozen, no Alt: press Zoom's group and move; then hold Alt while still pressing and move on; release. */
async function altAfterPress(d: Dossier): Promise<{ beforeAlt: boolean; afterAlt: boolean }> {
  const g: GroupId = "zoom";
  alt(false);
  const start = mid(d.drawn(d.handle(g)));
  const to = bottomCentre(d);
  pointer("pointerdown", d.handle(g), d.toClient(start), { altKey: false });
  const half = { x: start.x, y: start.y + 40 };
  await moveIn(d, start, half, 8, false);
  const beforeAlt = d.dragging();
  alt(true);
  await moveIn(d, half, to, 14, true);
  const afterAlt = d.dragging();
  pointer("pointerup", window, d.toClient(to), { altKey: true });
  alt(false);
  return { beforeAlt, afterAlt };
}

function scenarios(today: Dossier, proposed: Dossier, setFrozen: (on: boolean) => void): KitScenario[] {
  const gripsShown = (d: Dossier): number => [...d.el.querySelectorAll<HTMLElement>(".kg-handle")].filter((h) => getComputedStyle(h).visibility !== "hidden").length;
  return [
    {
      name: "8 · Frozen hides every grip and folds nothing; holding Alt shows the grips; unfrozen they show",
      play: async (expect: Expect) => {
        setFrozen(true);
        alt(false);
        expect(gripsShown(proposed) === 0, `frozen: ${gripsShown(proposed)} grips show`);
        proposed.handle("navigate").dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
        await settle(proposed);
        expect(!proposed.folded().includes("navigate"), "frozen: a double-click folded Navigate");
        alt(true);
        expect(gripsShown(proposed) === 5, `Alt held: ${gripsShown(proposed)} of 5 grips show`);
        alt(false);
        setFrozen(false);
        expect(gripsShown(proposed) === 5, `unfrozen: ${gripsShown(proposed)} of 5 grips show`);
        setFrozen(true);
      },
    },
    {
      name: "8 · (a) A drag started with Alt, Alt let go halfway: it finishes and lands where the outline showed; today it is cancelled at once",
      play: async (expect: Expect) => {
        setFrozen(true);
        const a0 = proposed.arrangement();
        const p = await altLetGo(proposed);
        await settle(proposed);
        expect(p.draggingAfterAltUp, "proposed: the drag stopped when Alt came up");
        const rec = proposed.lastDrag();
        expect(!!rec && rec.landed !== null, `proposed: landed on ${rec?.landed ?? "home"}`);
        expect(proposed.arrangement().bottom.center.includes("zoom") || proposed.arrangement().bottom.start.includes("zoom") || proposed.arrangement().bottom.end.includes("zoom"), "proposed: Zoom isn't in the bottom bar");
        expect(!sameArrangement(proposed.arrangement(), a0), "proposed: nothing moved");
        expect(gripsShown(proposed) === 0, `proposed: after the drop ${gripsShown(proposed)} grips still show (frozen, no Alt)`);
        const t = await altLetGo(today);
        await settle(today);
        expect(!t.draggingAfterAltUp, "today: the drag went on after Alt came up (today's guard should cancel it; the comparison is off)");
        expect(sameArrangement(today.arrangement(), HOME), "today: the arrangement changed");
      },
    },
    {
      name: "8 · (b) A frozen press, then Alt held while still pressing: nothing starts; today a drag starts. A fresh press with Alt does start",
      play: async (expect: Expect) => {
        setFrozen(true);
        const p = await altAfterPress(proposed);
        await settle(proposed);
        expect(!p.beforeAlt && !p.afterAlt, `proposed: dragging before Alt ${p.beforeAlt}, after ${p.afterAlt}`);
        expect(sameArrangement(proposed.arrangement(), HOME), "proposed: the arrangement changed");
        const t = await altAfterPress(today);
        await settle(today);
        expect(!t.beforeAlt && t.afterAlt, `today: dragging before Alt ${t.beforeAlt}, after ${t.afterAlt} (today's guard lets the frozen press start)`);
        // A fresh press with Alt held starts a drag.
        const r = await altLetGo(proposed);
        await settle(proposed);
        expect(r.draggingAfterAltUp && proposed.lastDrag()?.landed !== null, "proposed: a press with Alt held didn't drag");
      },
    },
  ];
}
