/**
 * 8 · Frozen layout: a lock freezes the layout. Frozen hides the grips; holding Alt shows them and they work. The
 * question is when the freeze is looked at. A per-move guard asks "is it frozen?" on every move, so letting go of Alt
 * mid-drag cancels the drag, and pressing Alt mid-press starts one. With a gate at the press, the freeze gates only
 * the start of a drag (read once, at the press); after the lift the drag intent runs to its drop or Escape.
 */
import type { Point } from "@n-uf/motion";
import { nextFrame } from "../shared/geometry";
import { HOME, createViewer, sameArrangement, type Viewer, type GroupId } from "./viewer";
import { mid, pointer, settle } from "./drive";
import { allIdle, caseFrame, type Expect, type KitCase, type KitScenario } from "./kit-case";

const RULE = `Freeze the layout with the lock: the grips hide. Hold <kbd>Alt</kbd> to bring them back and drag. A
<b>per-move guard</b> checks the freeze on every move. With a <b>gate at the press</b>, the freeze (and Alt) are read once,
at the press: a frozen press never becomes a drag, and a drag that started always finishes. Play (a) starts a drag with
Alt held and lets go of Alt halfway; play (b) presses a frozen group, then holds Alt while still pressing.`;

export const case8: KitCase = {
  id: "frozen",
  title: "8 · Frozen layout",
  mount(host, loop) {
    const desks = caseFrame(host, RULE, [{ id: "perMove", caption: "Per-move guard · the freeze checked on every move" }, { id: "atPress", caption: "Gate at the press · the freeze gates only the start" }], () => reset());
    const perMove = createViewer(desks.perMove!, { title: "Quarterly plan.pdf", loop, frozen: true, freezeGate: "move" });
    const atPress = createViewer(desks.atPress!, { title: "Quarterly plan.pdf", loop, frozen: true });
    const ds = [perMove, atPress];
    const controls = desks.perMove!.closest(".kcase")!.querySelector(".controls")!;
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
    return { reset, idle: allIdle(ds), scenarios: scenarios(perMove, atPress, setFrozen) };
  },
};

/** Alt down or up, as the window sees it. */
const alt = (down: boolean): void => void window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { key: "Alt", altKey: down, bubbles: true }));

/** Move the pointer from `a` to `b` in `n` frames (page space), Alt held or not. */
async function moveIn(d: Viewer, a: Point, b: Point, n: number, altKey: boolean): Promise<void> {
  for (let i = 1; i <= n; i++) {
    await nextFrame();
    pointer("pointermove", window, d.toClient({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }), { altKey });
  }
}
const bottomCentre = (d: Viewer): Point => mid(d.drawn(d.el.querySelector(".kbar-bottom")!));

/**
 * (a) Alt held, press Zoom's grip and drag towards the bottom bar; let go of Alt halfway, keep going, aim, release.
 * Returns whether a drag was running just after Alt came up.
 */
async function altLetGo(d: Viewer): Promise<{ draggingAfterAltUp: boolean }> {
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
async function altAfterPress(d: Viewer): Promise<{ beforeAlt: boolean; afterAlt: boolean }> {
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

function scenarios(perMove: Viewer, atPress: Viewer, setFrozen: (on: boolean) => void): KitScenario[] {
  const gripsShown = (d: Viewer): number => [...d.el.querySelectorAll<HTMLElement>(".kg-handle")].filter((h) => getComputedStyle(h).visibility !== "hidden").length;
  return [
    {
      name: "8 · Frozen hides every grip and folds nothing; holding Alt shows the grips; unfrozen they show",
      play: async (expect: Expect) => {
        setFrozen(true);
        alt(false);
        expect(gripsShown(atPress) === 0, `frozen: ${gripsShown(atPress)} grips show`);
        atPress.handle("navigate").dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
        await settle(atPress);
        expect(!atPress.folded().includes("navigate"), "frozen: a double-click folded Navigate");
        alt(true);
        expect(gripsShown(atPress) === 5, `Alt held: ${gripsShown(atPress)} of 5 grips show`);
        alt(false);
        setFrozen(false);
        expect(gripsShown(atPress) === 5, `unfrozen: ${gripsShown(atPress)} of 5 grips show`);
        setFrozen(true);
      },
    },
    {
      name: "8 · (a) A drag started with Alt, Alt let go halfway: with the gate at the press it finishes and lands where the outline showed; a per-move guard cancels it at once",
      play: async (expect: Expect) => {
        setFrozen(true);
        const a0 = atPress.arrangement();
        const p = await altLetGo(atPress);
        await settle(atPress);
        expect(p.draggingAfterAltUp, "gate at the press: the drag stopped when Alt came up");
        const rec = atPress.lastDrag();
        expect(!!rec && rec.landed !== null, `gate at the press: landed on ${rec?.landed ?? "home"}`);
        expect(atPress.arrangement().bottom.center.includes("zoom") || atPress.arrangement().bottom.start.includes("zoom") || atPress.arrangement().bottom.end.includes("zoom"), "gate at the press: Zoom isn't in the bottom bar");
        expect(!sameArrangement(atPress.arrangement(), a0), "gate at the press: nothing moved");
        expect(gripsShown(atPress) === 0, `gate at the press: after the drop ${gripsShown(atPress)} grips still show (frozen, no Alt)`);
        const t = await altLetGo(perMove);
        await settle(perMove);
        expect(!t.draggingAfterAltUp, "per-move guard: the drag went on after Alt came up (the guard should cancel it; the comparison is off)");
        expect(sameArrangement(perMove.arrangement(), HOME), "per-move guard: the arrangement changed");
      },
    },
    {
      name: "8 · (b) A frozen press, then Alt held while still pressing: with the gate at the press nothing starts; a per-move guard starts a drag. A fresh press with Alt does start",
      play: async (expect: Expect) => {
        setFrozen(true);
        const p = await altAfterPress(atPress);
        await settle(atPress);
        expect(!p.beforeAlt && !p.afterAlt, `gate at the press: dragging before Alt ${p.beforeAlt}, after ${p.afterAlt}`);
        expect(sameArrangement(atPress.arrangement(), HOME), "gate at the press: the arrangement changed");
        const t = await altAfterPress(perMove);
        await settle(perMove);
        expect(!t.beforeAlt && t.afterAlt, `per-move guard: dragging before Alt ${t.beforeAlt}, after ${t.afterAlt} (the guard lets the frozen press start)`);
        // A fresh press with Alt held starts a drag.
        const r = await altLetGo(atPress);
        await settle(atPress);
        expect(r.draggingAfterAltUp && atPress.lastDrag()?.landed !== null, "gate at the press: a press with Alt held didn't drag");
      },
    },
  ];
}
