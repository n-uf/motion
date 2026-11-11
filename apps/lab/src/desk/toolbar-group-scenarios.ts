/**
 * The toolbar groups' scenarios: every case lays out cleanly at the default size and at Narrow; a group drop lands in
 * each zone before all, between, or after all (and opens an empty toolbar); a toolbar moved to another edge swaps
 * with the one there; a full title bar folds into ⋯ with a count; a group's buttons stay clicks; flying shows no
 * indicator; Escape puts the arrangement back; snap glides the group into its slot; the keyboard steps through the
 * insertion points. Each scenario puts the default arrangement back when it ends.
 */
import type { Rect } from "@n-uf/motion";
import { nextFrame, type Point } from "../shared/geometry";
import { DRAG } from "./intent";
import type { DeskLab, Expect, PathKey, Scenario } from "./scenarios";
import { toolbarGroups as tg, type GroupDragResult } from "./toolbar-frame";
import { CASES, DEFAULT_ARRANGEMENT, FOLD_ORDER, HOSTS, sameArrangement, type Arrangement, type HostId } from "./toolbars";

const dist = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const fmt = (r: Rect): string => `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)} × ${Math.round(r.height)}`;
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
const shows = (r: GroupDragResult) => r.log.filter((e) => e.id !== null);
const list = (a: Arrangement, h: HostId): string => (["start", "center", "end"] as const).map((z) => a[h][z].join(",") || "·").join(" | ");

async function settle(lab: DeskLab): Promise<void> {
  await nextFrame();
  await lab.idle();
  await tg.idle();
}

/** Show `a` and wait for everything to rest. */
async function arrange(lab: DeskLab, a: Arrangement): Promise<void> {
  tg.set(a, "reserved");
  await settle(lab);
}

/** Every group rests where it is laid out, and the layout keeps its promises. */
function restsAsLaidOut(expect: Expect, what: string): void {
  const fails = tg.failures();
  expect(fails.length === 0, `${what}: ${fails.length} broken promises; first: ${fails[0]}`);
  for (const [id, p] of tg.placements()) {
    if (p.folded) continue;
    const el = tg.groupEl(id);
    if (!el) continue;
    const d = tg.rectOf(el);
    const off = Math.max(Math.abs(d.x - p.rect.x), Math.abs(d.y - p.rect.y), Math.abs(d.width - p.rect.width), Math.abs(d.height - p.rect.height));
    expect(off < 1.5, `${what}: ${id} drawn at ${fmt(d)}, laid out at ${fmt(p.rect)}`);
  }
}

/** A drag of `kind` to the middle of target `id` at an aiming pace, held there to make room, then released. */
async function dragTo(kind: string, id: string, expect: Expect): Promise<GroupDragResult | null> {
  const t = tg.targets(kind).find((x) => x.id === id);
  if (!t) {
    expect(false, `${kind} has no target ${id} (has ${tg.targets(kind).map((x) => x.id).join(", ")})`);
    return null;
  }
  return tg.path(kind, (g) => hold(through([g, mid(t.hit)], 0.8), 650));
}

/** A scenario that starts from `start` and always ends with the default arrangement back. */
const withArrangement =
  (lab: DeskLab, start: Arrangement, play: (expect: Expect) => Promise<void>) =>
  async (expect: Expect): Promise<void> => {
    await arrange(lab, start);
    try {
      await play(expect);
    } finally {
      await arrange(lab, DEFAULT_ARRANGEMENT);
    }
  };

/** The title bar: document left, zoom · ⋯ right, centre empty; view alone in the top toolbar. */
const TITLE_CASE: Arrangement = {
  ...DEFAULT_ARRANGEMENT,
  title: { start: ["doc"], center: [], end: ["zoom", "more"] },
  top: { start: [], center: ["edit", "history", "view"], end: [] },
};

export function toolbarGroupScenarios(lab: DeskLab): Record<string, Scenario> {
  const out: Record<string, Scenario> = {};

  out["toolbar groups: every case lays out with nothing overlapping and nothing off the window, at the default size and at Narrow"] = {
    construction: "docks",
    // Its moves are the frame's groups and bars, not the desk's items.
    still: true,
    play: withArrangement(lab, DEFAULT_ARRANGEMENT, async (expect) => {
      for (const [w, h] of [
        [960, 560],
        [520, 700],
      ] as const) {
        lab.setSize(w, h);
        await settle(lab);
        for (const [i, c] of CASES.entries()) {
          await arrange(lab, c.arrangement);
          restsAsLaidOut(expect, `${w} × ${h}, case ${i + 1} (${c.name})`);
        }
      }
    }),
  };

  // Each zone of the title bar, before all / between / after all; an empty zone; an empty toolbar (it opens).
  const drops: [string, string, (a: Arrangement) => boolean][] = [
    ["end, before all", "g:title:end:0", (a) => list(a, "title") === "doc | · | view,zoom,more"],
    ["end, between", "g:title:end:1", (a) => list(a, "title") === "doc | · | zoom,view,more"],
    ["end, after all", "g:title:end:2", (a) => list(a, "title") === "doc | · | zoom,more,view"],
    ["start, before all", "g:title:start:0", (a) => list(a, "title") === "view,doc | · | zoom,more"],
    ["start, after all", "g:title:start:1", (a) => list(a, "title") === "doc,view | · | zoom,more"],
    ["centre (empty)", "g:title:center:0", (a) => list(a, "title") === "doc | view | zoom,more"],
    ["the empty left toolbar", "g:left:start:0", (a) => list(a, "left") === "view | · | ·"],
  ];
  out["toolbar groups: a group dropped in each zone lands before all, between, or after all; an empty toolbar opens"] = {
    construction: "docks",
    drag: true,
    play: withArrangement(lab, TITLE_CASE, async (expect) => {
      for (const [what, id, ok] of drops) {
        await arrange(lab, TITLE_CASE);
        const r = await dragTo("g:view", id, expect);
        await settle(lab);
        if (!r) continue;
        expect(r.landed === id, `${what}: landed on ${r.landed ?? "home"}, not ${id}`);
        expect(r.releaseNote === null, `${what}: ${r.releaseNote}`);
        expect(ok(tg.arrangement()), `${what}: the title bar is ${list(tg.arrangement(), "title")}, the left toolbar ${list(tg.arrangement(), "left")}`);
        restsAsLaidOut(expect, what);
      }
      expect(tg.geometry().L > 0, "the left toolbar didn't open for its group");
    }),
  };

  out["toolbar groups: a toolbar moved to another edge swaps with the one there; the title bar stays"] = {
    construction: "docks",
    drag: true,
    play: withArrangement(lab, DEFAULT_ARRANGEMENT, async (expect) => {
      const a0 = tg.arrangement();
      const r = await dragTo("b:bottom", "b:left", expect);
      await settle(lab);
      expect(r?.landed === "b:left", `the bottom toolbar landed on ${r?.landed ?? "home"}`);
      const a1 = tg.arrangement();
      expect(JSON.stringify(a1.left) === JSON.stringify(a0.bottom) && JSON.stringify(a1.bottom) === JSON.stringify(a0.left), `left ${list(a1, "left")}, bottom ${list(a1, "bottom")}`);
      expect(JSON.stringify(a1.title) === JSON.stringify(a0.title), "the title bar changed");
      expect(tg.geometry().B === 0 && tg.geometry().L > 0, `the bars didn't follow: bottom ${tg.geometry().B}, left ${tg.geometry().L}`);
      restsAsLaidOut(expect, "after the bottom toolbar moved left");
      // The top toolbar (the pill) to the right edge, through the page's drag: it swaps with the (empty) right side.
      const swap = lab.targets("toolbar").find((t) => t.id === "toolbar:swap-right");
      if (!swap) return expect(false, "the pill has no right-edge target");
      const d = await lab.drag("toolbar", () => mid(swap.hit));
      await settle(lab);
      expect(d.landed === "toolbar:swap-right", `the pill landed on ${d.landed ?? "home"}`);
      const a2 = tg.arrangement();
      expect(JSON.stringify(a2.right) === JSON.stringify(a1.top) && JSON.stringify(a2.top) === JSON.stringify(a1.right), `right ${list(a2, "right")}, top ${list(a2, "top")}`);
      expect(!!lab.layout().items.get("toolbar")?.hidden, "the empty top toolbar still shows");
      expect(JSON.stringify(a2.title) === JSON.stringify(a0.title), "the title bar changed");
      restsAsLaidOut(expect, "after the pill moved right");
    }),
  };

  out["toolbar groups: at Narrow a full title bar folds its lowest-priority groups into ⋯ with their count, and unfolds with room"] = {
    construction: "docks",
    play: withArrangement(lab, CASES[10]!.arrangement, async (expect) => {
      lab.setSize(520, 700);
      await settle(lab);
      const folded = [...tg.placements()].filter(([, p]) => p.folded).map(([id]) => id);
      expect(folded.length > 0, "nothing folded in the title bar at Narrow");
      const want = FOLD_ORDER.filter((g) => folded.includes(g));
      expect(JSON.stringify(FOLD_ORDER.slice(0, folded.length)) === JSON.stringify(want), `folded ${folded.join(", ")}: not the lowest priorities first`);
      const badge = tg.groupEl("more")?.querySelector(".tg-badge")?.textContent ?? "";
      expect(badge === `+${folded.length}`, `⋯ shows "${badge}", not +${folded.length}`);
      restsAsLaidOut(expect, "folded at Narrow");
      lab.setSize(1440, 820);
      await settle(lab);
      const still = [...tg.placements()].filter(([, p]) => p.folded).map(([id]) => id);
      expect(still.length === 0, `still folded at 1440: ${still.join(", ")}`);
      restsAsLaidOut(expect, "unfolded at 1440");
    }),
  };

  out["toolbar groups: a press on a group's button stays a click; its handle lifts it; a cancelled pointer puts it back"] = {
    construction: "docks",
    preview: "indicator",
    play: withArrangement(lab, DEFAULT_ARRANGEMENT, async (expect) => {
      const zoom = tg.groupEl("zoom")!;
      const button = zoom.querySelector("button")!;
      const handle = zoom.querySelector(".tg-handle")!;
      const before = tg.rectOf(zoom);
      const a0 = tg.arrangement();
      const press = async (on: Element, end: "pointerup" | "pointercancel"): Promise<{ lifted: boolean; followed: number }> => {
        const p = mid(tg.rectOf(on));
        const ev = (type: string, q: Point): PointerEvent => {
          const c = tg.toClient(q);
          return new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", isPrimary: true, button: type === "pointermove" ? -1 : 0, buttons: type === "pointerup" || type === "pointercancel" ? 0 : 1, clientX: c.x, clientY: c.y });
        };
        on.dispatchEvent(ev("pointerdown", p));
        for (let i = 1; i <= 6; i++) {
          on.dispatchEvent(ev("pointermove", { x: p.x, y: p.y + i * 10 }));
          await nextFrame();
        }
        await nextFrame();
        const lifted = tg.dragging();
        const ghost = document.querySelector(".tg-ghost");
        const followed = ghost ? tg.rectOf(ghost).y - before.y : 0;
        on.dispatchEvent(ev(end, { x: p.x, y: p.y + 60 }));
        await settle(lab);
        return { lifted, followed };
      };
      const b = await press(button, "pointerup");
      expect(!b.lifted, "a press on a button lifted the group");
      expect(sameArrangement(tg.arrangement(), a0), "a press on a button changed the arrangement");
      const h = await press(handle, "pointercancel");
      expect(h.lifted && Math.abs(h.followed - 60) < 1.5, `the handle lifted ${h.lifted ? "it" : "nothing"}, following the pointer ${Math.round(h.followed)} px, not 60`);
      expect(sameArrangement(tg.arrangement(), a0), "a cancelled pointer changed the arrangement");
      restsAsLaidOut(expect, "after the cancelled pointer");
    }),
  };

  out["toolbar groups: flying across the bars shows no indicator; aiming shows one"] = {
    construction: "docks",
    drag: true,
    play: withArrangement(lab, DEFAULT_ARRANGEMENT, async (expect) => {
      const kind = "g:view";
      const all = tg.targets(kind);
      const goal = all.find((t) => t.id === "g:bottom:end:1");
      const via = [all.find((t) => t.id === "g:title:end:1"), all.find((t) => t.id === "g:title:start:1")];
      if (!goal || via.some((v) => !v)) return expect(false, `missing targets: ${all.map((t) => t.id).join(", ")}`);
      let arrival = 0;
      const r = await tg.path(kind, (g) => {
        const fly = through([g, mid(via[0]!.hit), mid(via[1]!.hit), mid(goal.hit)], 2);
        arrival = fly.at(-1)![0];
        return hold(fly, 600);
      });
      await settle(lab);
      const early = shows(r).filter((e) => e.t < arrival - 1);
      expect(early.length === 0, `the indicator showed ${early.map((e) => `${e.id} at ${Math.round(e.t)} ms`).join(", ")} while flying (arrived at ${Math.round(arrival)} ms)`);
      const snappedEarly = r.snaps.filter((e) => e.id !== null && e.t < arrival - 1);
      expect(snappedEarly.length === 0, `the group snapped into ${snappedEarly.map((e) => e.id).join(", ")} while flying`);
      expect(shows(r).length === 1 && shows(r)[0]!.id === goal.id, `aiming showed ${shows(r).map((e) => e.id).join(", ") || "nothing"}`);
      expect(r.landed === goal.id, `landed on ${r.landed ?? "home"}`);
      expect(list(tg.arrangement(), "bottom") === "panel | · | share,view", `the bottom toolbar is ${list(tg.arrangement(), "bottom")}`);
      restsAsLaidOut(expect, "after the drop");
    }),
  };

  out["toolbar groups: Escape after the room is made puts the arrangement back"] = {
    construction: "docks",
    drag: true,
    play: withArrangement(lab, DEFAULT_ARRANGEMENT, async (expect) => {
      const a0 = tg.arrangement();
      const t = tg.targets("g:edit").find((x) => x.id === "g:title:end:0");
      if (!t) return expect(false, "no title bar end target");
      // Aim, hold until the room is made, then Escape just before the release.
      let escapeAt = 0;
      const r2 = await tg.path(
        "g:edit",
        (g) => {
          const p = hold(through([g, mid(t.hit)], 0.8), 600);
          escapeAt = p.at(-1)![0] - 20;
          return p;
        },
        { escapeAt: () => escapeAt },
      );
      await settle(lab);
      expect(shows(r2).some((e) => e.id === t.id), `the drag never aimed at ${t.id}: ${r2.log.map((e) => e.id ?? "none").join(" → ")}`);
      expect(sameArrangement(tg.arrangement(), a0) && sameArrangement(tg.shown(), a0), `after Escape the title bar is ${list(tg.shown(), "title")}, the top ${list(tg.shown(), "top")}`);
      restsAsLaidOut(expect, "after Escape");
    }),
  };

  out["toolbar groups · snap: the group glides into its slot once room is made, its neighbours sliding"] = {
    construction: "docks",
    drag: true,
    preview: "snap",
    play: withArrangement(lab, DEFAULT_ARRANGEMENT, async (expect) => {
      const t = tg.targets("g:zoom").find((x) => x.id === "g:bottom:end:0");
      if (!t) return expect(false, "no bottom toolbar target before share");
      const shareBefore = tg.placements().get("share")!.rect;
      const r = await dragTo("g:zoom", t.id, expect);
      await settle(lab);
      if (!r) return;
      const snap = r.snaps.find((e) => e.id !== null);
      const showed = snap ? r.log.filter((e) => e.id === snap.id && e.t <= snap.t).at(-1) : undefined;
      expect(!!snap && snap.id === t.id, `the group snapped into ${snap?.id ?? "nothing"}`);
      expect(!!snap && !!showed && snap.t - showed.t >= DRAG.ROOM_AFTER - 1000 / 60, "the group snapped before the room was made");
      const slot = tg.placements().get("zoom")!.rect;
      const last = r.frames.at(-1)?.item;
      expect(!!last && Math.max(Math.abs(last.x - slot.x), Math.abs(last.y - slot.y)) < 1.5, `let go at ${last ? fmt(last) : "nowhere"}, its slot is ${fmt(slot)}`);
      const shareAfter = tg.placements().get("share")!.rect;
      expect(Math.abs(shareAfter.x - shareBefore.x) < 0.5, `share moved from ${fmt(shareBefore)} to ${fmt(shareAfter)} (it ends its zone)`);
      expect(r.landed === t.id && list(tg.arrangement(), "bottom") === "panel | · | zoom,share", `landed on ${r.landed}; the bottom toolbar is ${list(tg.arrangement(), "bottom")}`);
      restsAsLaidOut(expect, "after the snap drop");
    }),
  };

  out["toolbar groups: the keyboard picks a group up by its handle, steps through the insertion points, drops and cancels"] = {
    construction: "docks",
    drag: true,
    play: withArrangement(lab, DEFAULT_ARRANGEMENT, async (expect) => {
      const targets = tg.targets("g:share");
      const steps = 3;
      const want = targets[steps - 1];
      if (!want) return expect(false, "too few targets");
      const r = await tg.keyboard("g:share", steps);
      await settle(lab);
      expect(r?.landed === want.id, `the keyboard landed on ${r?.landed ?? "home"}, not ${want.id}`);
      expect(sameArrangement(tg.arrangement(), want.arrangement), `the arrangement isn't ${want.label}'s`);
      restsAsLaidOut(expect, "after the keyboard drop");
      const a1 = tg.arrangement();
      await tg.keyboard("g:zoom", 2, "Escape");
      await settle(lab);
      expect(sameArrangement(tg.arrangement(), a1), "the keyboard Escape changed the arrangement");
      restsAsLaidOut(expect, "after the keyboard Escape");
    }),
  };

  // The hosts each scenario touches are the five the model has.
  if (HOSTS.length !== 5) throw new Error("toolbar groups: five hosts expected");
  return out;
}
