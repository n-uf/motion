/**
 * The toolbar groups' scenarios: every case lays out cleanly at the default size and at Narrow; a group drop lands in
 * each zone before all, between, or after all, and opens an empty toolbar; an empty zone shows the group's own
 * footprint where it lands; over the documents a group floats; the handle sits at the leading edge per axis,
 * double-clicks to collapse and opens a menu whose Move to changes the zone; toolbars collapse from the trailing end
 * at Narrow; frozen blocks a drag and Alt allows it; no menu buttons in the toolbars; a group's buttons stay clicks;
 * flying shows no indicator; Escape puts the arrangement back; snap glides the group into its slot; the keyboard
 * moves a group from slot to slot. Each scenario puts the default arrangement back when it ends.
 */
import type { Rect } from "@n-uf/motion";
import { nextFrame, type Point } from "../shared/geometry";
import { DRAG } from "./intent";
import type { DeskLab, Expect, PathKey, Scenario } from "./scenarios";
import { toolbarGroups as tg, type GroupDragResult } from "./toolbar-frame";
import { CASES, DEFAULT_ARRANGEMENT, ZONES, sameArrangement, vertical, type Arrangement, type GroupId, type HostId } from "./toolbars";

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
const list = (a: Arrangement, h: HostId): string => ZONES.map((z) => a[h][z].join(",") || "·").join(" | ");

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
    const el = tg.groupEl(id);
    if (!el) continue;
    const d = tg.rectOf(el);
    const off = Math.max(Math.abs(d.x - p.rect.x), Math.abs(d.y - p.rect.y), Math.abs(d.width - p.rect.width), Math.abs(d.height - p.rect.height));
    expect(off < 1.5, `${what}: ${id} drawn at ${fmt(d)}, laid out at ${fmt(p.rect)}`);
  }
}

/** A drag of `kind` to `to` (a point, or the middle of target `id`) at an aiming pace, held there to make room, then released. */
async function dragTo(kind: string, to: string | Point, expect: Expect, onFrame?: (t: number, end: number) => void): Promise<GroupDragResult | null> {
  let p: Point;
  if (typeof to === "string") {
    const t = tg.targets(kind).find((x) => x.id === to);
    if (!t) {
      expect(false, `${kind} has no target ${to} (has ${tg.targets(kind).map((x) => x.id).join(", ")})`);
      return null;
    }
    // On the insertion line itself (its stretch may reach into an empty zone, which wins there).
    p = t.kind === "line" ? mid(t.line) : mid(t.hit);
  } else p = to;
  let end = 0;
  return tg.path(
    kind,
    (g) => {
      const path = hold(through([g, p], 0.8), 650);
      end = path.at(-1)![0];
      return path;
    },
    onFrame ? { onFrame: (t) => onFrame(t, end) } : {},
  );
}

/** Synthetic mouse events on `on`, at window points. */
function pointer(type: string, on: Element, q: Point, extra: PointerEventInit = {}): void {
  const c = tg.toClient(q);
  on.dispatchEvent(
    new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", isPrimary: true, button: type === "pointermove" ? -1 : 0, buttons: type === "pointerup" || type === "pointercancel" ? 0 : 1, clientX: c.x, clientY: c.y, ...extra }),
  );
}

/** Press on `on`, move 60 px down in steps: was a group lifted, and how far did its ghost follow; then `end`. */
async function press(lab: DeskLab, on: Element, end: "pointerup" | "pointercancel", extra: PointerEventInit = {}): Promise<{ lifted: boolean; followed: number }> {
  const p = mid(tg.rectOf(on));
  pointer("pointerdown", on, p, extra);
  let start: number | null = null;
  for (let i = 1; i <= 6; i++) {
    pointer("pointermove", on, { x: p.x, y: p.y + i * 10 }, extra);
    await nextFrame();
    const ghost = document.querySelector(".tg-ghost");
    if (ghost && start === null) start = tg.rectOf(ghost).y - (i * 10 - 10);
  }
  await nextFrame();
  const lifted = tg.dragging();
  const ghost = document.querySelector(".tg-ghost");
  const followed = ghost && start !== null ? tg.rectOf(ghost).y - start : 0;
  pointer(end, on, { x: p.x, y: p.y + 60 }, extra);
  await settle(lab);
  return { lifted, followed };
}

/** Click a menu item by its label (a submenu's items too). */
function pick(menu: HTMLElement, ...labels: string[]): boolean {
  let at: HTMLElement = menu;
  for (const label of labels) {
    const b = [...at.querySelectorAll<HTMLButtonElement>(":scope > li > button")].find((x) => x.querySelector(".tg-menu-label")?.textContent === label);
    if (!b || b.disabled) return false;
    b.click();
    at = b.parentElement?.querySelector<HTMLElement>(":scope > .tg-submenu") ?? at;
  }
  return true;
}

/** A scenario that starts from `start` and always ends with the default arrangement back (unfrozen). */
const withArrangement =
  (lab: DeskLab, start: Arrangement, play: (expect: Expect) => Promise<void>) =>
  async (expect: Expect): Promise<void> => {
    await arrange(lab, start);
    try {
      await play(expect);
    } finally {
      tg.freeze(false);
      tg.alt(false);
      await arrange(lab, DEFAULT_ARRANGEMENT);
    }
  };

const at = (base: Arrangement, patch: Partial<Record<HostId, Partial<Record<"start" | "center" | "end", readonly GroupId[]>>>>): Arrangement => {
  const out = { ...base } as Record<string, unknown>;
  for (const [h, z] of Object.entries(patch)) out[h] = { start: [], center: [], end: [], ...z };
  return out as unknown as Arrangement;
};

/** The title bar: document left, zoom and panels right, centre empty. */
const TITLE_CASE = at(DEFAULT_ARRANGEMENT, { title: { start: ["doc"], end: ["zoom", "panel"] }, bottom: { end: ["share"] } });
/** The top bar empty (its groups in the bottom bar). */
const EMPTY_TOP = at(DEFAULT_ARRANGEMENT, { top: {}, bottom: { start: ["panel", "edit", "history"], end: ["view", "share"] } });

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

  const drops: [string, string, (a: Arrangement) => boolean][] = [
    ["end, before all", "g:title:end:0", (a) => list(a, "title") === "doc | · | view,zoom,panel"],
    ["end, between", "g:title:end:1", (a) => list(a, "title") === "doc | · | zoom,view,panel"],
    ["end, after all", "g:title:end:2", (a) => list(a, "title") === "doc | · | zoom,panel,view"],
    ["start, before all", "g:title:start:0", (a) => list(a, "title") === "view,doc | · | zoom,panel"],
    ["start, after all", "g:title:start:1", (a) => list(a, "title") === "doc,view | · | zoom,panel"],
    ["centre (empty)", "g:title:center:0", (a) => list(a, "title") === "doc | view | zoom,panel"],
    ["the empty left edge", "g:left:start:0", (a) => list(a, "left") === "view | · | ·"],
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
        expect(ok(tg.arrangement()), `${what}: the title bar is ${list(tg.arrangement(), "title")}, the left edge ${list(tg.arrangement(), "left")}`);
        restsAsLaidOut(expect, what);
      }
      expect(tg.geometry().L > 0, "the left toolbar didn't open for its group");
    }),
  };

  out["toolbar groups: into an empty top bar at 20, 50 and 80 % the indicator is the group's footprint, where it lands"] = {
    construction: "docks",
    drag: true,
    play: withArrangement(lab, EMPTY_TOP, async (expect) => {
      for (const [f, zone] of [
        [0.2, "start"],
        [0.5, "center"],
        [0.8, "end"],
      ] as const) {
        await arrange(lab, EMPTY_TOP);
        const strip = tg.geometry().hosts.top;
        const p = { x: strip.origin.x + strip.spec.length * f, y: strip.origin.y + strip.spec.thickness / 2 };
        let seen: { rect: Rect; target: string } | null = null;
        let ghost: Rect | null = null;
        const r = await dragTo("g:zoom", p, expect, (t, end) => {
          if (t < end - 40) return;
          seen = tg.indicator() ?? seen;
          const g = document.querySelector(".tg-ghost");
          if (g) ghost = tg.rectOf(g);
        });
        await settle(lab);
        const want = `g:top:${zone}:0`;
        expect(r?.landed === want, `${f * 100} %: landed on ${r?.landed ?? "home"}, not ${want}`);
        const landed = tg.placements().get("zoom")?.rect;
        if (!landed) {
          expect(false, `${f * 100} %: zoom isn't placed`);
          continue;
        }
        // Indicator mode: the outline sits where it lands; snap: the group itself glided there.
        const shown: Rect | null = lab.preview() === "snap" ? ghost : (seen as { rect: Rect } | null)?.rect ?? null;
        expect(!!shown && Math.abs(shown.x - landed.x) <= 2 && Math.abs(shown.width - landed.width) <= 2, `${f * 100} %: ${lab.preview() === "snap" ? "the group glided to" : "the outline was at"} ${shown ? fmt(shown) : "nowhere"}, it landed at ${fmt(landed)}`);
        const top = tg.geometry().hosts.top;
        const x0 = top.origin.x + 8;
        const x1 = top.origin.x + top.spec.length - 8;
        const where = zone === "start" ? Math.abs(landed.x - x0) : zone === "end" ? Math.abs(landed.x + landed.width - x1) : Math.abs(landed.x + landed.width / 2 - (top.origin.x + top.spec.length / 2));
        expect(where < 1, `${f * 100} %: zoom at ${fmt(landed)} isn't flush ${zone === "center" ? "in the middle" : `to the ${zone}`} of the top bar (${Math.round(x0)}…${Math.round(x1)})`);
      }
    }),
  };

  out["toolbar groups: over the documents a group floats where it is dropped; its menu docks it back"] = {
    construction: "docks",
    drag: true,
    play: withArrangement(lab, DEFAULT_ARRANGEMENT, async (expect) => {
      const g = tg.geometry();
      const spot = { x: g.stage.x + (g.SW - 2) / 2, y: g.stage.y + (g.SH - 2) / 2 };
      const r = await dragTo("g:view", spot, expect);
      await settle(lab);
      expect(r?.landed === "g:float", `landed on ${r?.landed ?? "home"}, not floating`);
      const f = tg.arrangement().floating.find((x) => x.id === "view");
      expect(!!f, "view isn't floating");
      expect(!!tg.groupEl("view")?.classList.contains("floating"), "the floating group has no frame");
      restsAsLaidOut(expect, "floating");
      const menu = tg.menu("view");
      expect(pick(menu, "Dock"), "the menu has no Dock");
      await settle(lab);
      expect(list(tg.arrangement(), "top") === list(DEFAULT_ARRANGEMENT, "top"), `docked back: the top bar is ${list(tg.arrangement(), "top")}`);
      restsAsLaidOut(expect, "docked back");
    }),
  };

  out["toolbar groups: the handle leads its group, on the left in a row and on top in a column"] = {
    construction: "docks",
    play: withArrangement(lab, DEFAULT_ARRANGEMENT, async (expect) => {
      const check = (what: string, v: boolean): void => {
        const el = tg.groupEl("zoom")!;
        const g = tg.rectOf(el);
        const h = tg.rectOf(tg.handle("zoom")!);
        const dots = [...tg.handle("zoom")!.querySelectorAll("i")].map((d) => mid(tg.rectOf(d)));
        if (!v) {
          expect(Math.abs(h.width - 3) < 0.6 && Math.abs(h.height - 13) < 0.6, `${what}: the handle is ${fmt(h)}, not 3 × 13`);
          expect(Math.abs(h.x - g.x) < 1 && Math.abs(mid(h).y - mid(g).y) < 1, `${what}: the handle at ${fmt(h)} isn't at the left edge of ${fmt(g)}`);
          expect(dots.length === 3 && dots[0]!.y < dots[1]!.y && dots[1]!.y < dots[2]!.y && Math.abs(dots[0]!.x - dots[2]!.x) < 0.5, `${what}: the dots don't run top to bottom`);
        } else {
          expect(Math.abs(h.width - 13) < 0.6 && Math.abs(h.height - 3) < 0.6, `${what}: the handle is ${fmt(h)}, not 13 × 3`);
          expect(Math.abs(h.y - g.y) < 1 && Math.abs(mid(h).x - mid(g).x) < 1, `${what}: the handle at ${fmt(h)} isn't on top of ${fmt(g)}, centred`);
          expect(dots.length === 3 && dots[0]!.x < dots[1]!.x && dots[1]!.x < dots[2]!.x && Math.abs(dots[0]!.y - dots[2]!.y) < 0.5, `${what}: the dots don't run left to right`);
        }
      };
      check("in the title bar", false);
      expect(pick(tg.menu("zoom"), "Move to", "Left edge"), "the menu can't move zoom to the left edge");
      await settle(lab);
      expect(vertical("left") && tg.placements().get("zoom")?.host === "left", "zoom isn't on the left edge");
      check("on the left edge", true);
      // The handle is the separator: 12 px from the previous group, 3 px from its own controls.
      await arrange(lab, DEFAULT_ARRANGEMENT);
      const prev = tg.rectOf(tg.groupEl("edit")!);
      const next = tg.rectOf(tg.groupEl("history")!);
      const h = tg.rectOf(tg.handle("history")!);
      const ctl = tg.rectOf(tg.groupEl("history")!.querySelector(".tg-ctl")!);
      expect(Math.abs(next.x - (prev.x + prev.width) - 12) < 1, `history starts ${Math.round(next.x - prev.x - prev.width)} px after edit, not 12`);
      expect(Math.abs(ctl.x - (h.x + h.width) - 3) < 1, `history's controls start ${Math.round(ctl.x - h.x - h.width)} px after its handle, not 3`);
      // Focusing a handle dims the other groups of its toolbar.
      tg.handle("history")!.focus();
      // The dimming fades in (120 ms).
      await new Promise((r) => setTimeout(r, 250));
      const op = (id: GroupId): number => Number(getComputedStyle(tg.groupEl(id)!).opacity);
      expect(op("edit") < 0.5 && op("view") < 0.5 && op("history") > 0.99 && op("doc") > 0.99, `focus on history's handle: edit ${op("edit")}, view ${op("view")}, history ${op("history")}, doc (title bar) ${op("doc")}`);
      tg.handle("history")!.blur();
    }),
  };

  out["toolbar groups: double-clicking a handle collapses its group to handle + », and again expands it"] = {
    construction: "docks",
    play: withArrangement(lab, DEFAULT_ARRANGEMENT, async (expect) => {
      const w0 = tg.rectOf(tg.groupEl("edit")!).width;
      tg.handle("edit")!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
      await settle(lab);
      const r = tg.rectOf(tg.groupEl("edit")!);
      const over = tg.groupEl("edit")!.querySelector(".tg-over")!;
      expect(tg.arrangement().collapsed.includes("edit"), "edit isn't collapsed");
      expect(r.width < w0 - 20 && getComputedStyle(over).display !== "none", `collapsed: ${Math.round(r.width)} px wide (was ${Math.round(w0)}), » ${getComputedStyle(over).display}`);
      restsAsLaidOut(expect, "collapsed");
      (over as HTMLButtonElement).click();
      const hidden = tg.menuOpen();
      expect(!!hidden && hidden.querySelectorAll("button").length === 3, `» showed ${hidden?.querySelectorAll("button").length ?? 0} hidden controls, not 3`);
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      tg.handle("edit")!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
      await settle(lab);
      expect(!tg.arrangement().collapsed.includes("edit") && Math.abs(tg.rectOf(tg.groupEl("edit")!).width - w0) < 1, "a second double-click didn't expand it");
      restsAsLaidOut(expect, "expanded");
    }),
  };

  out["toolbar groups: the handle's menu moves a group (Move to), a bar's groups, and puts it back; the title bar opens the window menu"] = {
    construction: "docks",
    play: withArrangement(lab, DEFAULT_ARRANGEMENT, async (expect) => {
      const handle = tg.handle("history")!;
      handle.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
      const menu = tg.menuOpen();
      const labels = menu ? [...menu.querySelectorAll(":scope > li > button .tg-menu-label")].map((x) => x.textContent) : [];
      expect(JSON.stringify(labels) === JSON.stringify(["Collapse", "Move to", "Move this bar's groups to", "Float", "Reset position"]), `the menu reads ${labels.join(" · ")}`);
      const checked = menu?.querySelector(".tg-submenu [aria-checked=true] .tg-menu-label")?.textContent;
      expect(checked === "Top bar", `Move to checks ${checked ?? "nothing"}, not the top bar`);
      expect(!!menu && pick(menu, "Move to", "Right edge"), "no Move to › Right edge");
      await settle(lab);
      expect(list(tg.arrangement(), "right") === "history | · | ·" && tg.geometry().R > 0, `Move to: the right edge is ${list(tg.arrangement(), "right")}`);
      restsAsLaidOut(expect, "moved to the right edge");
      expect(pick(tg.menu("share"), "Move this bar's groups to", "Left edge"), "no Move this bar's groups to › Left edge");
      await settle(lab);
      expect(list(tg.arrangement(), "left") === "panel | · | share" && tg.geometry().B === 0, `the bottom bar's groups: left ${list(tg.arrangement(), "left")}, bottom bar ${tg.geometry().B} px`);
      restsAsLaidOut(expect, "the bottom bar's groups on the left edge");
      expect(pick(tg.menu("history"), "Reset position"), "no Reset position");
      await settle(lab);
      expect(list(tg.arrangement(), "top") === list(DEFAULT_ARRANGEMENT, "top"), `reset: the top bar is ${list(tg.arrangement(), "top")}`);
      const title = tg.window()!.querySelector(".tf-title")!;
      const p = tg.toClient({ x: 300, y: 19 });
      title.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y }));
      const wm = tg.menuOpen();
      expect(!!wm && wm.getAttribute("aria-label") === "Window", "the title bar didn't open the window menu");
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      const glyph = tg.window()!.querySelector(".tf-glyph");
      expect(!!glyph && glyph.querySelectorAll("i").length === 6 && Math.abs(tg.rectOf(glyph).width - 8) < 0.6 && Math.abs(tg.rectOf(glyph).height - 13) < 0.6, `the title bar's glyph is ${glyph ? fmt(tg.rectOf(glyph)) : "missing"}, not the full 8 × 13`);
    }),
  };

  out["toolbar groups: at Narrow toolbars never wrap: groups collapse to handle + » from the trailing end, and expand with room"] = {
    construction: "docks",
    play: withArrangement(lab, CASES[10]!.arrangement, async (expect) => {
      lab.setSize(520, 700);
      await settle(lab);
      const order = ZONES.flatMap((z) => tg.arrangement().title[z]);
      const collapsed = order.filter((g) => tg.placements().get(g)?.collapsed);
      expect(collapsed.length > 0, "nothing collapsed in the title bar at Narrow");
      const trailing = order.slice(order.length - collapsed.length);
      expect(JSON.stringify(collapsed) === JSON.stringify(trailing), `collapsed ${collapsed.join(", ")}: not the trailing ${trailing.join(", ")}`);
      const rows = new Set(order.map((g) => Math.round(tg.placements().get(g)!.rect.y)));
      expect(rows.size === 1, "the title bar wrapped");
      for (const g of collapsed) expect(getComputedStyle(tg.groupEl(g)!.querySelector(".tg-over")!).display !== "none", `${g} collapsed without »`);
      restsAsLaidOut(expect, "collapsed at Narrow");
      lab.setSize(1440, 820);
      await settle(lab);
      const still = order.filter((g) => tg.placements().get(g)?.collapsed);
      expect(still.length === 0, `still collapsed at 1440: ${still.join(", ")}`);
      restsAsLaidOut(expect, "expanded at 1440");
    }),
  };

  out["toolbar groups: frozen, a handle doesn't drag (it fades, says why, its menu greys the moves); holding Alt it does"] = {
    construction: "docks",
    preview: "indicator",
    play: withArrangement(lab, DEFAULT_ARRANGEMENT, async (expect) => {
      tg.freeze(true);
      await nextFrame();
      const handle = tg.handle("zoom")!;
      expect(Number(getComputedStyle(handle).opacity) < 0.6 && getComputedStyle(handle).cursor === "not-allowed" && handle.title === "Frozen: hold Alt to move", `frozen handle: opacity ${getComputedStyle(handle).opacity}, cursor ${getComputedStyle(handle).cursor}, "${handle.title}"`);
      const a0 = tg.arrangement();
      const off = await press(lab, handle, "pointerup");
      expect(!off.lifted && sameArrangement(tg.arrangement(), a0), "frozen, the handle lifted its group");
      const menu = tg.menu("zoom");
      const note = menu.querySelector(".tg-menu-note")?.textContent ?? "";
      const greyed = [...menu.querySelectorAll<HTMLButtonElement>(":scope > li > button")].filter((b) => b.disabled).length;
      expect(note.includes("hold Alt") && greyed === 5, `frozen menu: note "${note}", ${greyed} of 5 items greyed`);
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      tg.alt(true);
      await nextFrame();
      const on = await press(lab, handle, "pointercancel", { altKey: true });
      expect(on.lifted && Math.abs(on.followed - 50) < 12, `holding Alt, the handle lifted ${on.lifted ? "it" : "nothing"} (followed ${Math.round(on.followed)} px)`);
      tg.alt(false);
      expect(sameArrangement(tg.arrangement(), a0), "the cancelled Alt drag changed the arrangement");
    }),
  };

  out["toolbar groups: no menu buttons (⋯, ⋮, ▾) and no toolbar grips in the toolbars"] = {
    construction: "docks",
    still: true,
    play: withArrangement(lab, DEFAULT_ARRANGEMENT, async (expect) => {
      const places = [...tg.window()!.querySelectorAll(".tf-bar, .tg-host, .tg-floats")];
      const text = places.map((p) => p.textContent ?? "").join(" ");
      for (const ch of ["⋯", "⋮", "▾"]) expect(!text.includes(ch), `"${ch}" in a toolbar`);
      expect(!tg.window()!.querySelector(".tb-grip, .tf-grip"), "a whole-toolbar grip");
      for (const id of ["doc", "edit", "history", "view", "zoom", "panel", "share"] as const) {
        const n = tg.groupEl(id)!.querySelectorAll(".tg-ctl button").length;
        expect(n >= 2, `the ${id} group has ${n} control${n === 1 ? "" : "s"}: a group has two or more`);
        expect(tg.groupEl(id)!.querySelectorAll(".tg-handle").length === 1, `the ${id} group hasn't exactly one handle`);
        expect(getComputedStyle(tg.groupEl(id)!.querySelector(".tg-over")!).display === "none", `the expanded ${id} group shows »`);
      }
    }),
  };

  out["toolbar groups: a press on a group's button stays a click; its handle lifts it; a cancelled pointer puts it back"] = {
    construction: "docks",
    preview: "indicator",
    play: withArrangement(lab, DEFAULT_ARRANGEMENT, async (expect) => {
      const zoom = tg.groupEl("zoom")!;
      const a0 = tg.arrangement();
      const b = await press(lab, zoom.querySelector(".tg-ctl button")!, "pointerup");
      expect(!b.lifted, "a press on a button lifted the group");
      expect(sameArrangement(tg.arrangement(), a0), "a press on a button changed the arrangement");
      const h = await press(lab, tg.handle("zoom")!, "pointercancel");
      expect(h.lifted && Math.abs(h.followed - 50) < 12, `the handle lifted ${h.lifted ? "it" : "nothing"}, its ghost following the pointer ${Math.round(h.followed)} px`);
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
      const via = [all.find((t) => t.id === "g:title:end:0"), all.find((t) => t.id === "g:title:start:1")];
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
      expect(list(tg.arrangement(), "bottom") === "panel | · | share,view", `the bottom bar is ${list(tg.arrangement(), "bottom")}`);
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
      let escapeAt = 0;
      const r = await tg.path(
        "g:edit",
        (g) => {
          const p = hold(through([g, mid(t.hit)], 0.8), 600);
          escapeAt = p.at(-1)![0] - 20;
          return p;
        },
        { escapeAt: () => escapeAt },
      );
      await settle(lab);
      expect(shows(r).some((e) => e.id === t.id), `the drag never aimed at ${t.id}: ${r.log.map((e) => e.id ?? "none").join(" → ")}`);
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
      if (!t) return expect(false, "no bottom bar target before share");
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
      expect(r.landed === t.id && list(tg.arrangement(), "bottom") === "panel | · | zoom,share", `landed on ${r.landed}; the bottom bar is ${list(tg.arrangement(), "bottom")}`);
      restsAsLaidOut(expect, "after the snap drop");
    }),
  };

  out["toolbar groups: from the keyboard a handle takes focus, the arrows move its group slot by slot, Enter drops, Escape cancels, Space collapses"] = {
    construction: "docks",
    drag: true,
    play: withArrangement(lab, DEFAULT_ARRANGEMENT, async (expect) => {
      const handle = tg.handle("share")!;
      expect(handle.tabIndex === 0, "the handle isn't in the tab order");
      const targets = tg.targets("g:share").filter((t) => t.kind !== "float");
      const here = targets.findIndex((t) => sameArrangement(t.make({ x: 0, y: 0 }), tg.arrangement()));
      const want = targets[(here + 2) % targets.length];
      if (here < 0 || !want) return expect(false, `no keyboard stops (here ${here})`);
      const r = await tg.keyboard("g:share", 2);
      await settle(lab);
      expect(r?.landed === want.id, `two arrows landed on ${r?.landed ?? "home"}, not ${want.id}`);
      expect(sameArrangement(tg.arrangement(), want.make({ x: 0, y: 0 })), `the arrangement isn't ${want.label}'s`);
      restsAsLaidOut(expect, "after the keyboard move");
      const a1 = tg.arrangement();
      await tg.keyboard("g:zoom", 2, "Escape");
      await settle(lab);
      expect(sameArrangement(tg.arrangement(), a1), "Escape changed the arrangement");
      tg.handle("zoom")!.focus();
      tg.handle("zoom")!.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
      await settle(lab);
      expect(tg.arrangement().collapsed.includes("zoom"), "Space didn't collapse the group");
      tg.handle("zoom")!.dispatchEvent(new KeyboardEvent("keydown", { key: "F10", shiftKey: true, bubbles: true, cancelable: true }));
      expect(tg.menuOpen()?.getAttribute("aria-label") === "Zoom group", "Shift+F10 didn't open the handle's menu");
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      tg.handle("zoom")!.blur();
    }),
  };

  return out;
}
