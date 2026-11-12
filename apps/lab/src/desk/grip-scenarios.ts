/**
 * The drag handles' scenarios: one handle per panel with its glyph by state (full on an expanded header, compact on
 * a collapsed bar, across the top of a rail segment), in every construction; no fold or menu buttons anywhere; a
 * double-click, a click on a collapsed bar and Enter on the handle collapse and expand; the menu's order, Move to,
 * Float and Dock, Reset position; a frozen layout hides every grip and lifts nothing until Alt is held.
 */
import type { Rect } from "@n-uf/motion";
import { wait } from "../shared/geometry";
import type { Grips } from "./grip";
import { panelKey, type ConstructionId } from "@n-uf/placement/dock";
import { CONSTRUCTIONS, LETTER } from "./catalog";
import type { DeskLab, Expect, Scenario } from "./scenarios";

const fmt = (r: Rect): string => `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)} × ${Math.round(r.height)}`;
const short = (id: ConstructionId): string => LETTER[id];
const FILES = panelKey(1);

/** An element's rect in stage units. */
function box(lab: DeskLab, el: Element): Rect {
  const stage = document.getElementById("stage")!;
  const s = stage.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const k = (lab.size().width + 2) / s.width;
  return { x: (r.left - s.left - stage.clientLeft) * k, y: (r.top - s.top - stage.clientTop) * k, width: r.width * k, height: r.height * k };
}
const near = (a: number, b: number, tol = 0.75): boolean => Math.abs(a - b) <= tol;
const winOf = (key: string): HTMLElement | null => document.querySelector<HTMLElement>(`#stage .win[data-key="${key}"]:not(.hidden)`);

/**
 * Every shown unit has one handle, its glyph by state: an expanded header 8 × 13 at its left edge, a collapsed bar
 * 3 × 13 there, a tab row 8 × 13 at its left edge, a rail segment 13 × 3 across its top, centred.
 */
function checkGlyphs(lab: DeskLab, expect: Expect, what: string): void {
  for (const [key, p] of lab.layout().items) {
    if (p.hidden) continue;
    const el = winOf(key);
    if (!el) continue;
    if (key.startsWith("panel:") && p.look !== "bare") {
      const dots = [...el.querySelectorAll(".title .grip-dots")];
      expect(dots.length === 1, `${what}: ${key} (${p.look}) has ${dots.length} handles in its header`);
      if (dots.length !== 1) continue;
      const d = box(lab, dots[0]!);
      const at = lab.drawn(key)!;
      const w = p.look === "header" ? 3 : 8;
      expect(near(d.width, w) && near(d.height, 13), `${what}: ${key} (${p.look}) glyph is ${fmt(d)}, not ${w} × 13`);
      expect(d.x - at.x >= 2 && d.x - at.x <= 12, `${what}: ${key} glyph starts ${Math.round(d.x - at.x)} px from its left edge`);
      expect(near(d.y + d.height / 2, at.y + 11, 1.5), `${what}: ${key} glyph isn't centred on its 22 px header (${fmt(d)})`);
    }
    if (key.startsWith("tabs:")) {
      const dots = [...el.querySelectorAll(".grip-handle .grip-dots")];
      expect(dots.length === 1, `${what}: ${key} has ${dots.length} handles`);
      if (dots.length !== 1) continue;
      const d = box(lab, dots[0]!);
      expect(near(d.width, 8) && near(d.height, 13), `${what}: ${key} glyph is ${fmt(d)}, not 8 × 13`);
      expect(d.x - p.rect.x <= 12, `${what}: ${key} glyph starts ${Math.round(d.x - p.rect.x)} px from its left edge`);
    }
    if (key.startsWith("rail:")) {
      const segs = [...el.querySelectorAll(".icon")];
      expect(segs.length === (p.icons ?? []).length, `${what}: ${key} shows ${segs.length} buttons for ${(p.icons ?? []).length} panels`);
      for (const seg of segs) {
        const dots = [...seg.querySelectorAll(".grip-dots")];
        const name = seg.getAttribute("aria-label") ?? "a segment";
        expect(dots.length === 1, `${what}: ${key}'s ${name} has ${dots.length} handles`);
        if (dots.length !== 1) continue;
        const d = box(lab, dots[0]!);
        const s = box(lab, seg);
        const icon = seg.querySelector("svg.glyph");
        expect(near(d.width, 13) && near(d.height, 3), `${what}: ${key}'s ${name} glyph is ${fmt(d)}, not 13 × 3`);
        expect(near(d.x + d.width / 2, s.x + s.width / 2, 1), `${what}: ${key}'s ${name} glyph isn't centred (${fmt(d)} in ${fmt(s)})`);
        expect(!!icon && d.y + d.height <= box(lab, icon).y + 0.5 && d.y - s.y <= 10, `${what}: ${key}'s ${name} glyph isn't on top of its segment`);
      }
    }
  }
}

/** The labels of the open menu (or of its open submenu), in order. */
const labels = (menu: Element | null): string[] => [...(menu?.querySelectorAll(".grip-item .label") ?? [])].map((l) => l.textContent ?? "");
const itemIn = (menu: Element | null, label: string): HTMLButtonElement | undefined =>
  [...(menu?.querySelectorAll<HTMLButtonElement>(".grip-item") ?? [])].find((b) => b.querySelector(".label")!.textContent === label);

/** Open `key`'s menu and pick `path` (a submenu's item after its owner), as the pointer does. */
async function choose(lab: DeskLab, grips: Grips, key: string, path: readonly string[], expect: Expect): Promise<boolean> {
  let menu = grips.test.open(key);
  for (const label of path) {
    const b = itemIn(menu, label);
    expect(!!b, `${key}'s menu has no "${label}" (it has ${labels(menu).join(", ") || "nothing"})`);
    if (!b) {
      grips.test.close();
      return false;
    }
    b.click();
    menu = document.querySelector("#stage .grip-menu.sub");
  }
  await lab.idle();
  return true;
}

export function gripScenarios(lab: DeskLab, grips: Grips): Record<string, Scenario> {
  const out: Record<string, Scenario> = {};
  const look = (key: string): string => lab.layout().items.get(key)?.look ?? "gone";

  out["grip · one handle per panel: full on a header, compact on a collapsed bar and across a rail segment, in every construction"] = {
    construction: "docks",
    play: async (expect) => {
      checkGlyphs(lab, expect, "A as it starts");
      lab.fold(1);
      await lab.idle();
      expect(look(FILES) === "header", `Files didn't collapse (${look(FILES)})`);
      checkGlyphs(lab, expect, "A, Files collapsed");
      // Its dock folds to its rail: the panels become rail segments.
      lab.icon("left", 2);
      await lab.idle();
      expect(!!lab.layout().items.get("rail:left")?.icons?.length && !lab.layout().items.get("rail:left")?.hidden, "A: the left dock didn't fold to its rail");
      checkGlyphs(lab, expect, "A, left dock on its rail");
      for (const c of CONSTRUCTIONS) {
        if (c.id === "docks") continue;
        lab.use(c.id);
        await lab.idle();
        checkGlyphs(lab, expect, short(c.id));
      }
    },
  };

  out["grip · no fold, ⋯ or ⋮ button on any panel or tab row"] = {
    construction: "docks",
    play: async (expect) => {
      for (const c of CONSTRUCTIONS) {
        lab.use(c.id);
        await lab.idle();
        const extra = [...document.querySelectorAll<HTMLElement>("#stage .win.panel button, #stage .win.chrome[data-look=tabs] button, #stage .fold")].filter(
          (b) => b.classList.contains("fold") || /[▾▸⋯⋮…]/.test(b.textContent ?? ""),
        );
        expect(extra.length === 0, `${short(c.id)}: ${extra.map((b) => `"${b.textContent}" in ${b.closest(".win")?.getAttribute("data-key")}`).join(", ")}`);
      }
    },
  };

  out["A · grip: a double-click collapses and expands; a click on a collapsed bar expands it; Enter and Space on the handle too"] = {
    construction: "docks",
    // Tall enough that every section starts open.
    size: [1280, 820],
    play: async (expect) => {
      expect(look(FILES) === "section", `Files starts ${look(FILES)}`);
      const title = (): HTMLElement => winOf(FILES)!.querySelector<HTMLElement>(".title .name")!;
      const dbl = (): boolean => title().dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, detail: 2 }));
      dbl();
      await lab.idle();
      expect(look(FILES) === "header", `a double-click left Files ${look(FILES)}`);
      // A click as the pointer makes it: a press and a release in place, then the click.
      const t = title();
      const r = t.getBoundingClientRect();
      const at = { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", isPrimary: true, button: 0, clientX: r.left + 4, clientY: r.top + r.height / 2 };
      t.dispatchEvent(new PointerEvent("pointerdown", { ...at, buttons: 1 }));
      t.dispatchEvent(new PointerEvent("pointerup", { ...at, buttons: 0 }));
      t.dispatchEvent(new MouseEvent("click", { ...at, detail: 1 }));
      await lab.idle();
      expect(look(FILES) === "section", `a click on the collapsed bar left Files ${look(FILES)}`);
      // Past the double-click time, so this isn't the end of that click's double-click.
      await wait(650);
      dbl();
      await lab.idle();
      expect(look(FILES) === "header", `a second double-click left Files ${look(FILES)}`);
      await wait(650);
      dbl();
      await lab.idle();
      expect(look(FILES) === "section", `a third double-click left Files ${look(FILES)}`);
      const handle = winOf(FILES)!.querySelector<HTMLElement>(".grip-handle")!;
      handle.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
      await lab.idle();
      expect(look(FILES) === "header", `Enter on the handle left Files ${look(FILES)}`);
      handle.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true, cancelable: true }));
      await lab.idle();
      expect(look(FILES) === "section", `Space on the handle left Files ${look(FILES)}`);
    },
  };

  out["F3 · grip menu: Collapse, Move to, Float in that order; Move to › Right dock docks it there; Reset position puts it back"] = {
    construction: "dockTear",
    play: async (expect) => {
      const menu = grips.test.open(FILES);
      expect(labels(menu).join(" | ") === "Collapse | Move to | Float", `the menu reads ${labels(menu).join(" | ")}`);
      expect(itemIn(menu, "Collapse")?.querySelector(".hint")?.textContent === "double-click", "Collapse doesn't name the double-click");
      itemIn(menu, "Move to")?.click();
      const sub = document.querySelector("#stage .grip-menu.sub");
      expect(labels(sub).join(" | ") === "Left dock | Right dock | Bottom dock", `Move to lists ${labels(sub).join(" | ")}`);
      expect(itemIn(sub, "Left dock")?.getAttribute("aria-checked") === "true", "Move to doesn't check the left dock Files is in");
      itemIn(sub, "Right dock")?.click();
      await lab.idle();
      expect(!document.querySelector("#stage .grip-menu"), "the menu stayed open after a choice");
      expect(lab.state().right.includes(1) && !lab.state().left.includes(1), `Files is on ${lab.state().right.includes(1) ? "the right" : "the left"}`);
      const d = lab.drawn(FILES)!;
      expect(d.x > lab.size().width / 2, `Files rests at ${fmt(d)}, not in the right dock`);
      const again = grips.test.menu(FILES).entries.map((e) => e.label);
      expect(again.at(-1) === "Reset position", `once moved, the menu reads ${again.join(" | ")}`);
      await choose(lab, grips, FILES, ["Reset position"], expect);
      expect(lab.state().left[0] === 1, `Reset put Files at ${JSON.stringify({ left: lab.state().left, right: lab.state().right })}`);
      expect(!grips.test.menu(FILES).entries.some((e) => e.label === "Reset position"), "Reset position is still offered where Files starts");
    },
  };

  out["grip menu: Move to › docks a panel in the chosen zone in the tree, the navigator and the palettes"] = {
    construction: "tree",
    play: async (expect) => {
      const cases: [ConstructionId, string, () => boolean][] = [
        ["tree", "Right column", () => lab.state().tree.R.includes(FILES)],
        ["navigator", "Right side", () => lab.state().right.includes(1)],
        ["floatAround", "Right stack", () => lab.state().stacks.right.includes(1)],
      ];
      for (const [c, zone, there] of cases) {
        lab.use(c);
        await lab.idle();
        if (await choose(lab, grips, FILES, ["Move to", zone], expect)) expect(there(), `${short(c)}: Move to › ${zone} left Files elsewhere`);
      }
    },
  };

  out["grip menu: Float floats a docked panel or a stacked palette; Dock takes it back"] = {
    construction: "dockTear",
    play: async (expect) => {
      await choose(lab, grips, FILES, ["Float"], expect);
      expect(lab.state().torn.some((f) => f.id === 1), "F3: Float didn't tear Files off");
      expect(look(FILES) === "float", `F3: Files is ${look(FILES)}, not floating`);
      const m = grips.test.menu(FILES).entries.map((e) => e.label);
      expect(m.includes("Dock") && !m.includes("Float"), `F3: a floating Files' menu reads ${m.join(" | ")}`);
      await choose(lab, grips, FILES, ["Dock"], expect);
      expect(lab.state().left.includes(1) && !lab.state().torn.length, "F3: Dock didn't take Files back to the left dock");
      lab.use("floatAround");
      await lab.idle();
      await choose(lab, grips, FILES, ["Float"], expect);
      expect(lab.state().free.some((f) => f.id === 1) && !lab.state().stacks.left.includes(1), "F2: Float didn't take Files out of its stack");
    },
  };

  out["A · grip: a frozen layout hides every grip, lifts nothing and greys the menu's moves; holding Alt shows them and lets it move"] = {
    construction: "docks",
    preview: "indicator",
    play: async (expect) => {
      const toRight = () => ({ x: lab.size().width - 120, y: lab.size().height / 3 });
      /** The glyphs laid out on the stage (headers, rail segments, tab rows), and how many of them show. */
      const glyphs = (): { all: number; shown: number } => {
        const els = [...document.querySelectorAll<HTMLElement>("#stage .win:not(.hidden) .grip-dots")].filter((e) => e.getClientRects().length > 0);
        return { all: els.length, shown: els.filter((e) => getComputedStyle(e).visibility !== "hidden").length };
      };
      const before = glyphs();
      expect(before.all > 0 && before.shown === before.all, `before freezing, ${before.shown} of ${before.all} grips show`);
      grips.test.setFrozen(true);
      try {
        const stage = document.getElementById("stage")!;
        const title = winOf(FILES)!.querySelector<HTMLElement>(".title")!;
        expect(stage.classList.contains("frozen"), "the stage isn't marked frozen");
        const frozen = glyphs();
        expect(frozen.shown === 0, `frozen, ${frozen.shown} of ${frozen.all} grips still show`);
        expect(title.title === "Frozen: hold Alt to move", `frozen, the title bar's tooltip reads "${title.title}"`);
        expect(getComputedStyle(title).cursor === "not-allowed", `frozen, the title bar's cursor is ${getComputedStyle(title).cursor}`);
        const r = await lab.drag(FILES, toRight);
        await lab.idle();
        expect(r.landed === null && lab.state().left.includes(1), `frozen, Files moved (landed on ${r.landed})`);
        const m = grips.test.menu(FILES);
        expect(m.note === "Frozen: hold Alt to move or collapse", `the frozen menu's first line is ${m.note}`);
        const greyed = m.entries.filter((e) => e.disabled).map((e) => e.label);
        expect(greyed.includes("Collapse") && greyed.includes("Move to"), `frozen, greyed: ${greyed.join(", ") || "nothing"}`);
        winOf(FILES)!.querySelector(".title .name")!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true, detail: 2 }));
        await lab.idle();
        expect(look(FILES) === "section", `frozen, a double-click left Files ${look(FILES)}`);
        grips.test.setAlt(true);
        expect(!stage.classList.contains("frozen"), "with Alt held the stage is still marked frozen");
        const alt = glyphs();
        expect(alt.shown === alt.all, `with Alt held, ${alt.shown} of ${alt.all} grips show`);
        expect(grips.test.menu(FILES).note === null, "with Alt held the menu still says frozen");
        const r2 = await lab.drag(FILES, toRight);
        await lab.idle();
        expect(r2.landed !== null && lab.state().right.includes(1), `with Alt held, Files didn't move (landed on ${r2.landed})`);
        grips.test.setAlt(false);
        const again = glyphs();
        expect(again.shown === 0, `Alt let go, ${again.shown} of ${again.all} grips still show`);
      } finally {
        grips.test.setAlt(false);
        grips.test.setFrozen(false);
      }
    },
  };

  return out;
}
