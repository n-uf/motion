/**
 * 7 · Keyboard moves: the arrows step through placement's `keyboardStops` (every place in reading order, the
 * group's own place among them), the slot shows each and the group glides there; Enter drops, Escape glides home;
 * "Move to ›" lists the same places in the same order.
 */
import { nextFrame } from "../shared/geometry";
import { createViewer, placements, sameArrangement, type GroupId, type Viewer } from "./viewer";
import { fmt, keyOn, off, settle } from "./drive";
import { allIdle, caseFrame, type KitCase, type KitScenario } from "./kit-case";

const RULE = `Tab to a handle. <b>→ ↓</b> step to the next place and <b>← ↑</b> to the previous one: the slot shows it
and the group glides there. <b>Enter</b> or <b>Space</b> drops; <b>Esc</b> glides home. <b>Shift+F10</b> (or a right-click
on the handle) opens the menu, whose <b>Move to ›</b> lists the same places in the same order. Both read placement's
<code>keyboardStops</code>: title → top → left → right → bottom, zones start → centre → end, each insertion point in
order, the group's own place among them (where the arrows start).`;

export const case7: KitCase = {
  id: "keyboard",
  title: "7 · Keyboard moves",
  mount(host, loop) {
    let d: Viewer | null = null;
    const desks = caseFrame(host, RULE, [{ id: "w" }], () => d?.reset());
    d = createViewer(desks.w!, { title: "Quarterly plan.pdf", loop });
    // The focused group's places, in order, the one shown marked.
    const list = document.createElement("ol");
    list.className = "k-stops";
    list.innerHTML = "<li>Focus a handle to see its places.</li>";
    host.querySelector(".kcase")!.append(list);
    const viewer = d;
    const show = (): void => {
      const g = (document.activeElement?.closest(".kgroup") as HTMLElement | null)?.dataset.group as GroupId | undefined;
      if (!g || !viewer.el.contains(document.activeElement)) return;
      const k = viewer.keyMove();
      list.replaceChildren(
        ...viewer.stops(g).map((t, i) => {
          const li = document.createElement("li");
          li.textContent = t.label;
          li.classList.toggle("on", !!k && k.g === g && k.i === i);
          return li;
        }),
      );
    };
    for (const type of ["focusin", "keyup", "click"]) d.el.addEventListener(type, show);
    return { reset: () => viewer.reset(), idle: allIdle([viewer]), scenarios: scenarios(viewer) };
  },
};

function scenarios(c7: Viewer): KitScenario[] {
  return [
    {
      name: "7 · The arrows step through the places in order, the slot on each and the group gliding there; Move to › lists the same places in the same order; Esc glides home",
      play: async (expect) => {
        const g: GroupId = "zoom";
        const h = c7.handle(g);
        const homeRect = c7.drawn(c7.groupEl(g));
        const a0 = c7.arrangement();
        h.focus();
        // The menu first: its places, in its order.
        keyOn(h, "F10", { shiftKey: true });
        const menu = c7.menu();
        const menuIds = menu ? [...menu.querySelectorAll<HTMLElement>(".k-submenu .k-menu-item")].map((b) => b.dataset.target ?? "") : [];
        keyOn(document, "Escape");
        expect(!c7.menu(), "Escape didn't close the menu");
        const stops = c7.stops(g);
        const n = stops.length;
        expect(n > 5, `only ${n} places`);
        expect(menuIds.join(" ") === stops.map((t) => t.id).join(" "), `Move to › lists ${menuIds.join(", ")}`);
        // Every arrow: the next place, its slot drawn, the group gliding (not jumping) there. The arrows start at its
        // own place (a stop of its own), so the first goes to the one after it.
        const home = c7.homeIndex(g);
        expect(home >= 0 && stops[home]!.home, "its own place isn't among the stops");
        const first = (home + 1) % n;
        const visited: string[] = [];
        let glided = false;
        for (let k = 0; k < n; k++) {
          const before = c7.drawn(c7.groupEl(g));
          keyOn(h, "ArrowRight");
          const km = c7.keyMove();
          if (!km) return expect(false, `arrow ${k + 1} started no move`);
          visited.push(stops[km.i]!.id);
          const want = placements(stops[km.i]!.arrangement).get(g)!.rect;
          const slot = c7.slot();
          expect(!!slot && off(slot, want) < 1.5, `arrow ${k + 1}: the slot is ${fmt(slot)}, the place ${fmt(want)}`);
          if (Math.hypot(want.x - before.x, want.y - before.y) > 40) {
            await nextFrame();
            await nextFrame();
            const midway = c7.drawn(c7.groupEl(g));
            if (off(midway, want) > 1 && off(midway, before) > 1) glided = true;
          }
          await settle(c7);
          const at = c7.drawn(c7.groupEl(g));
          expect(off(at, want) < 1.5, `arrow ${k + 1}: the group rests at ${fmt(at)}, the place is ${fmt(want)}`);
        }
        expect(glided, "the group never glided between places (it jumped)");
        // The arrows visit the places in the menu's order (starting just after its own place).
        const rotated = [...menuIds.slice(first), ...menuIds.slice(0, first)];
        expect(visited.join(" ") === rotated.join(" "), `the arrows visited ${visited.join(", ")}`);
        keyOn(h, "Escape");
        expect(!c7.keyMove() && !c7.slot(), "Escape left the move or its slot");
        await settle(c7);
        expect(sameArrangement(c7.arrangement(), a0), "Escape changed the arrangement");
        const back = c7.drawn(c7.groupEl(g));
        expect(off(back, homeRect) < 1.5, `after Escape it rests at ${fmt(back)}, home is ${fmt(homeRect)}`);
      },
    },
    {
      name: "7 · Enter drops at the place shown; a place picked in Move to › is where it goes",
      play: async (expect) => {
        const g: GroupId = "annotate";
        const h = c7.handle(g);
        h.focus();
        const stops = c7.stops(g);
        const want = stops[(c7.homeIndex(g) + 2) % stops.length]!;
        keyOn(h, "ArrowDown");
        keyOn(h, "ArrowDown");
        keyOn(h, "Enter");
        await settle(c7);
        expect(sameArrangement(c7.arrangement(), want.arrangement), `Enter dropped elsewhere than ${want.label}`);
        expect(!c7.slot(), "the slot still shows after the drop");
        const at = c7.drawn(c7.groupEl(g));
        const place = placements(c7.arrangement()).get(g)!.rect;
        expect(off(at, place) < 1.5, `it rests at ${fmt(at)}, its place is ${fmt(place)}`);
        // The menu: Move to › → the last place.
        const list = c7.stops(g);
        const pick = list.filter((s) => !s.home).at(-1)!;
        h.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
        const menu = c7.menu();
        menu?.querySelector<HTMLButtonElement>(":scope > .k-menu-item")?.click();
        menu?.querySelector<HTMLButtonElement>(`.k-submenu [data-target="${pick.id}"]`)?.click();
        await settle(c7);
        expect(sameArrangement(c7.arrangement(), pick.arrangement), `Move to › ${pick.label} didn't move it there`);
      },
    },
  ];
}
