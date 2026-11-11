/**
 * The toolbar drag's scenarios: a drag to each target sets that toolbar mode (and the Toolbar switch follows), a
 * press on a toolbar button never lifts it, flying over the documents shows no indicator, Escape and a cancelled
 * pointer put the mode back, the snap preview's toolbar glides back to the pointer when it flies off, and the
 * keyboard steps through the targets. Constructions whose toolbar is a bar across the top have no target.
 */
import type { Rect } from "@n-uf/motion";
import { nextFrame, wait, type Point } from "../shared/geometry";
import { DRAG } from "./intent";
import { CONSTRUCTIONS, type ConstructionId } from "./layouts";
import type { Options } from "./model";
import { settledAsLaidOut, type DeskLab, type DragResult, type Expect, type PathKey, type Scenario } from "./scenarios";
import { TOOLBAR, TOOLBAR_TARGETS, toolbarTargetId } from "./toolbar-drops";

const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const fmt = (r: Rect): string => `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)} × ${Math.round(r.height)}`;
const sameRect = (a: Rect, b: Rect): boolean => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.width - b.width), Math.abs(a.height - b.height)) < 0.5;

/** Keyframes through `points` at `speed` px/ms, from `t0` ms. */
function through(points: readonly Point[], speed: number, t0 = 0): PathKey[] {
  const out: PathKey[] = [[t0, points[0]!.x, points[0]!.y]];
  let t = t0;
  for (let i = 1; i < points.length; i++) {
    t += Math.max(16, dist(points[i - 1]!, points[i]!) / speed);
    out.push([t, points[i]!.x, points[i]!.y]);
  }
  return out;
}
const hold = (path: PathKey[], ms: number): PathKey[] => [...path, [path.at(-1)![0] + ms, path.at(-1)![1], path.at(-1)![2]]];
const shows = (r: DragResult) => r.log.filter((e) => e.id !== null);

/** The mode as the Toolbar switch shows it. */
const switchShows = (): string | null => document.querySelector<HTMLInputElement>("input[name=toolbar]:checked")?.value ?? null;
const modeOf = (o: Options): string => `${o.toolbar}-${o.toolbarSpace}`;

/** The toolbar's mode, in the options and on the switch, is `want`. */
function expectMode(lab: DeskLab, expect: Expect, want: string, what: string): void {
  expect(modeOf(lab.options()) === want, `${what}: the toolbar is ${modeOf(lab.options())}, not ${want}`);
  expect(switchShows() === want, `${what}: the Toolbar switch shows ${switchShows() ?? "nothing"}, not ${want}`);
}

const targetOf = (lab: DeskLab, id: string): Rect | null => lab.targets(TOOLBAR).find((t) => t.id === id)?.hit ?? null;

/** A mouse pointer event at stage point `p` (the stage's scale undone). */
function pointerAt(type: string, p: Point): PointerEvent {
  const stage = document.getElementById("stage")!;
  const s = stage.getBoundingClientRect();
  // The inverse of the page's stagePoint: client px per stage px.
  const k = s.width / (stage.offsetWidth || s.width);
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    pointerType: "mouse",
    isPrimary: true,
    button: type === "pointermove" ? -1 : 0,
    buttons: type === "pointerup" || type === "pointercancel" ? 0 : 1,
    clientX: s.left + stage.clientLeft + p.x * k,
    clientY: s.top + stage.clientTop + p.y * k,
  });
}

/** Constructions with a toolbar pill, and the order a scenario walks the modes in (each from another). */
const PILLED = CONSTRUCTIONS.filter((c) => c.pill);
const WALK = ["toolbar:bottom-reserved", "toolbar:top-overlay", "toolbar:bottom-overlay", "toolbar:top-reserved"] as const;
const short = (id: ConstructionId): string => CONSTRUCTIONS.find((c) => c.id === id)!.title.split(" · ")[0]!;

export function toolbarScenarios(lab: DeskLab): Record<string, Scenario> {
  const out: Record<string, Scenario> = {};

  for (const c of PILLED) {
    out[`${short(c.id)} · toolbar: a drag to each target sets its mode; the Toolbar switch follows`] = {
      construction: c.id,
      drag: true,
      play: async (expect) => {
        for (const id of WALK) {
          const hit = targetOf(lab, id);
          if (!hit) {
            expect(false, `no target ${id}`);
            continue;
          }
          const r = await lab.drag(TOOLBAR, () => mid(hit));
          await lab.idle();
          const m = TOOLBAR_TARGETS.find((t) => t.id === id)!;
          expect(r.landed === id, `aimed at ${id}, landed on ${r.landed ?? "home"}`);
          expectMode(lab, expect, `${m.toolbar}-${m.toolbarSpace}`, `after the drop on ${id}`);
          settledAsLaidOut(lab, expect);
        }
      },
    };
  }

  out["B, D, E · toolbar: a bar across the top has no targets and never lifts"] = {
    still: true,
    play: async (expect) => {
      for (const id of ["tree", "strip", "drawers"] as const) {
        lab.use(id);
        await lab.idle();
        const ts = lab.targets(TOOLBAR);
        expect(ts.length === 0, `${short(id)}: the bar offers ${ts.map((t) => t.id).join(", ")}`);
        const before = lab.drawn(TOOLBAR)!;
        const r = await lab.drag(TOOLBAR, () => ({ x: lab.size().width / 2, y: lab.size().height - 20 }));
        await lab.idle();
        expect(!r.frames && r.landed === null, `${short(id)}: the bar lifted`);
        expect(sameRect(lab.drawn(TOOLBAR)!, before), `${short(id)}: the bar moved to ${fmt(lab.drawn(TOOLBAR)!)}`);
      }
    },
  };

  out["A · toolbar: a press on a toolbar button stays a click; the grip and empty space lift it; a cancelled pointer puts it back"] = {
    construction: "docks",
    preview: "indicator",
    play: async (expect) => {
      const el = document.querySelector<HTMLElement>(".win.toolbar")!;
      const cell = el.querySelector<HTMLElement>(".tb-cell")!;
      const grip = el.querySelector<HTMLElement>(".tb-grip");
      const before = lab.drawn(TOOLBAR)!;
      const mode = modeOf(lab.options());
      const box = (e: Element): Rect => {
        const s = document.getElementById("stage")!.getBoundingClientRect();
        const r = e.getBoundingClientRect();
        const k = (lab.size().width + 2) / s.width;
        return { x: (r.left - s.left) * k, y: (r.top - s.top) * k, width: r.width * k, height: r.height * k };
      };
      /** Press at `p` on `on`, move 60 px down in steps, and say how far the toolbar followed. */
      const press = async (on: Element, p: Point, end: "pointerup" | "pointercancel"): Promise<number> => {
        on.dispatchEvent(pointerAt("pointerdown", p));
        for (let i = 1; i <= 6; i++) {
          on.dispatchEvent(pointerAt("pointermove", { x: p.x, y: p.y + i * 10 }));
          await nextFrame();
        }
        await nextFrame();
        const moved = lab.drawn(TOOLBAR)!.y - before.y;
        on.dispatchEvent(pointerAt(end, { x: p.x, y: p.y + 60 }));
        await lab.idle();
        return moved;
      };
      const onButton = await press(cell, mid(box(cell)), "pointerup");
      expect(Math.abs(onButton) < 0.5, `a press on a button lifted the toolbar ${Math.round(onButton)} px`);
      expect(sameRect(lab.drawn(TOOLBAR)!, before) && modeOf(lab.options()) === mode, "a press on a button changed the toolbar");
      expect(!!grip, "the pill has no grip");
      if (grip) {
        const onGrip = await press(grip, mid(box(grip)), "pointercancel");
        expect(Math.abs(onGrip - 60) < 1.5, `a press on the grip moved the toolbar ${Math.round(onGrip)} px with the pointer, not 60`);
        expect(sameRect(lab.drawn(TOOLBAR)!, before), `a cancelled pointer left the toolbar at ${fmt(lab.drawn(TOOLBAR)!)}, home is ${fmt(before)}`);
        expectMode(lab, expect, mode, "after the cancelled pointer");
      }
      // Empty space: just inside the pill's right end, past its last button.
      const r = lab.drawn(TOOLBAR)!;
      const spot = { x: r.x + r.width - 4, y: r.y + r.height / 2 };
      const at = pointerAt("pointermove", spot);
      const top = document.elementFromPoint(at.clientX, at.clientY);
      expect(!!top && el.contains(top) && !top.closest(".tb-cell"), `the pill's right end is ${top ? top.className || top.tagName : "nothing"}, not its empty space`);
      const onSpace = await press(el, spot, "pointerup");
      expect(Math.abs(onSpace - 60) < 1.5, `a press on the pill's empty space moved it ${Math.round(onSpace)} px with the pointer, not 60`);
      settledAsLaidOut(lab, expect);
    },
  };

  out["A · toolbar: flying over the documents shows no indicator; aiming at the bottom band shows it"] = {
    construction: "docks",
    drag: true,
    play: async (expect) => {
      const goal = targetOf(lab, "toolbar:bottom-reserved");
      const over = [targetOf(lab, "toolbar:top-overlay"), targetOf(lab, "toolbar:bottom-overlay")];
      if (!goal || over.some((o) => !o)) return expect(false, "no bottom band or documents' area");
      let arrival = 0;
      const r = await lab.path(TOOLBAR, (g) => {
        // Down across both floating targets at 2 px/ms (flying), then aim at the bottom band.
        const fly = through([g, mid(over[0]!), mid(over[1]!), mid(goal)], 2);
        arrival = fly.at(-1)![0];
        return hold(fly, 600);
      });
      await lab.idle();
      const early = shows(r).filter((e) => e.t < arrival - 1);
      expect(early.length === 0, `the indicator showed ${early.map((e) => `${e.id} at ${Math.round(e.t)} ms`).join(", ")} while flying (arrived at ${Math.round(arrival)} ms)`);
      const snappedEarly = (r.snaps ?? []).filter((e) => e.id !== null && e.t < arrival - 1);
      expect(snappedEarly.length === 0, `the toolbar snapped into ${snappedEarly.map((e) => e.id).join(", ")} while flying`);
      expect(shows(r).length === 1 && shows(r)[0]!.id === "toolbar:bottom-reserved", `aiming showed ${shows(r).map((e) => e.id).join(", ") || "nothing"}`);
      expect(r.landed === "toolbar:bottom-reserved", `landed on ${r.landed ?? "home"}`);
      expectMode(lab, expect, "bottom-reserved", "after the drop");
      settledAsLaidOut(lab, expect);
    },
  };

  out["A · toolbar: Escape mid-drag, with room made, puts the mode and the desk back"] = {
    construction: "docks",
    drag: true,
    play: async (expect) => {
      const goal = targetOf(lab, "toolbar:bottom-overlay");
      if (!goal) return expect(false, "no bottom floating target");
      const mode = modeOf(lab.options());
      const rects = [...lab.layout().items].filter(([, p]) => !p.hidden).map(([k, p]) => [k, { ...p.rect }] as const);
      let escapeAt = 0;
      const r = await lab.path(
        TOOLBAR,
        (g) => {
          const there = hold(through([g, mid(goal)], 0.8), 600);
          escapeAt = there.at(-1)![0] - 20;
          return there;
        },
        { escapeAt: () => escapeAt },
      );
      await lab.idle();
      expect(shows(r).some((e) => e.id === "toolbar:bottom-overlay"), `the drag never aimed at the bottom floating target: ${r.log.map((e) => e.id ?? "none").join(" → ")}`);
      expectMode(lab, expect, mode, "after Escape");
      for (const [k, rr] of rects) {
        const now = lab.layout().items.get(k);
        expect(!!now && sameRect(now.rect, rr), `${k} isn't back home (${now ? fmt(now.rect) : "gone"}, was ${fmt(rr)})`);
      }
      settledAsLaidOut(lab, expect);
    },
  };

  out["A · toolbar · snap: flying off a snapped band glides the toolbar back to the pointer"] = {
    construction: "docks",
    drag: true,
    preview: "snap",
    play: async (expect) => {
      const goal = targetOf(lab, "toolbar:bottom-reserved");
      if (!goal) return expect(false, "no bottom band");
      // Over the left dock: no toolbar target there.
      const empty = { x: 90, y: lab.size().height / 2 };
      if (lab.targets(TOOLBAR).some((t) => t.hit.x <= empty.x && empty.x <= t.hit.x + t.hit.width && t.hit.y <= empty.y && empty.y <= t.hit.y + t.hit.height)) return expect(false, "the empty spot is a toolbar target");
      let stop = 0;
      const r = await lab.path(TOOLBAR, (g) => {
        const there = hold(through([g, mid(goal)], 0.8), 600);
        const flick = [...there, ...through([mid(goal), empty], 2.5, there.at(-1)![0]).slice(1)];
        stop = flick.at(-1)![0];
        return hold(flick, 500);
      });
      await lab.idle();
      const snap = (r.snaps ?? []).find((e) => e.id !== null);
      expect(snap?.id === "toolbar:bottom-reserved", `the toolbar snapped into ${snap?.id ?? "nothing"}`);
      const showed = snap ? r.log.filter((e) => e.id === snap.id && e.t <= snap.t).at(-1) : undefined;
      expect(!!snap && !!showed && snap.t - showed.t >= DRAG.ROOM_AFTER - 1000 / 60, `the toolbar snapped before the model made room`);
      const off = (r.snaps ?? []).find((e) => e.id === null);
      expect(!!off && !!off.flying, `the toolbar didn't leave its slot as the pointer flew off: ${(r.snaps ?? []).map((e) => `${e.id ?? (e.flying ? "flying" : "none")}@${Math.round(e.t)}`).join(" → ")}`);
      // It glides back: a frame or two after leaving the slot it is still on its way, not at the pointer at once.
      const g0 = r.grab ?? { x: 0, y: 0 };
      const soon = off ? (r.frames ?? []).filter((f) => f.t > off.t && f.t <= off.t + 50) : [];
      const away = (f: NonNullable<DragResult["frames"]>[number]): number => Math.max(Math.abs(f.item.x - (f.x - g0.x)), Math.abs(f.item.y - (f.y - g0.y)));
      expect(soon.some((f) => away(f) > 1), `the toolbar jumped back to the pointer instead of gliding (${soon.map((f) => away(f).toFixed(1)).join(", ")} px in the first 50 ms)`);
      // Once the pointer stops, the way back closes as a settle does: within its 99 % time, at most 1 % is left;
      // and the toolbar ends up held under the pointer, at the size it was lifted at.
      const lifted = (r.frames ?? []).find((f) => f.t < stop);
      const g = r.grab ?? { x: 0, y: 0 };
      const gap = (f: NonNullable<DragResult["frames"]>[number]): number =>
        Math.max(Math.abs(f.item.x - (f.x - g.x)), Math.abs(f.item.y - (f.y - g.y)), Math.abs(f.item.width - lifted!.item.width), Math.abs(f.item.height - lifted!.item.height));
      const tempo = (2 * Math.log(10) * 1000) / 25;
      const atStop = (r.frames ?? []).find((f) => f.t >= stop);
      const later = (r.frames ?? []).find((f) => f.t >= stop + tempo + 1000 / 60);
      const last = (r.frames ?? []).at(-1);
      expect(!!lifted && !!atStop && !!later && gap(later) <= 0.01 * gap(atStop) + 0.5, `${atStop ? Math.round(gap(atStop)) : "?"} px from the pointer when it stopped, still ${later ? gap(later).toFixed(1) : "?"} px ${Math.round(tempo)} ms later`);
      expect(!!last && gap(last) < 0.5, `the toolbar isn't under the pointer at the end (${last ? gap(last).toFixed(1) : "?"} px off)`);
      expect(r.landed === null, `released over no target, it landed on ${r.landed}`);
      expectMode(lab, expect, "top-reserved", "after the release over no target");
      settledAsLaidOut(lab, expect);
    },
  };

  out["A · toolbar: the keyboard picks it up by its grip, steps through its targets, drops, and cancels"] = {
    construction: "docks",
    drag: true,
    play: async (expect) => {
      const grip = document.querySelector<HTMLElement>(".win.toolbar .tb-grip");
      if (!grip) return expect(false, "the pill has no grip");
      const key = (k: string, on: EventTarget = document): void => void on.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
      const order = TOOLBAR_TARGETS.map((t) => t.id);
      // The four modes first, top to bottom (the side edges' swaps follow).
      expect(JSON.stringify(lab.targets(TOOLBAR).map((t) => t.id).slice(0, order.length)) === JSON.stringify(order), `the targets' order is ${lab.targets(TOOLBAR).map((t) => t.id).join(", ")}`);
      // Space on the grip, four steps (top reserved, top floating, bottom floating, bottom reserved), Enter.
      grip.focus();
      key(" ", grip);
      // Each step held past the room delay and a flash (a snap waits for the room, then shows at least 150 ms).
      const STEP = DRAG.ROOM_AFTER + DRAG.FLASH + 90;
      for (let i = 0; i < 4; i++) {
        key("ArrowDown");
        await wait(i === 3 ? 650 : STEP);
      }
      key("Enter");
      await lab.idle();
      expectMode(lab, expect, "bottom-reserved", "after the keyboard drop");
      settledAsLaidOut(lab, expect);
      // Again: two steps, then Escape: nothing changes.
      key(" ", document.querySelector<HTMLElement>(".win.toolbar .tb-grip")!);
      key("ArrowDown");
      await wait(STEP);
      key("ArrowDown");
      await wait(STEP);
      key("Escape");
      await lab.idle();
      expectMode(lab, expect, "bottom-reserved", "after the keyboard Escape");
      settledAsLaidOut(lab, expect);
    },
  };

  // Every target id is a mode the switch has.
  for (const t of TOOLBAR_TARGETS) if (toolbarTargetId(t) !== t.id) throw new Error(`toolbar target ${t.id} isn't its mode's id`);
  return out;
}
