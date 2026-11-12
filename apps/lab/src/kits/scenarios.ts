/**
 * The kit toolbar cases' scenarios. Each drives a window with real pointer or key events (in client coordinates, so
 * case 10's conversion is on the path) and checks what the page drew: the slot element, the groups' drawn rects, the
 * menu's items.
 */
import type { Point, Rect } from "@n-uf/motion";
import { nextFrame } from "../shared/geometry";
import { HOST_RECT, STAGE, inRect, placements, sameArrangement, type Dossier, type GroupId } from "./dossier";

type Expect = (ok: boolean, msg: string) => void;
export interface KitScenario {
  readonly name: string;
  readonly play: (expect: Expect) => Promise<void>;
}
export interface KitContext {
  readonly c6: Dossier;
  readonly c7: Dossier;
  readonly c10: Dossier;
  readonly setScale: (s: number) => void;
  readonly setConvert: (on: boolean) => void;
}

const mid = (r: Rect): Point => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const fmt = (r: Rect | null): string => (r ? `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)} × ${Math.round(r.height)}` : "none");
const off = (a: Rect, b: Rect): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.width - b.width), Math.abs(a.height - b.height));

async function settle(d: Dossier): Promise<void> {
  await nextFrame();
  await d.idle();
  await nextFrame();
}

function pointer(type: string, on: EventTarget, c: Point): void {
  on.dispatchEvent(
    new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, pointerType: "mouse", isPrimary: true, button: type === "pointermove" ? -1 : 0, buttons: type === "pointerup" ? 0 : 1, clientX: c.x, clientY: c.y }),
  );
}

function keyOn(on: EventTarget, key: string, extra: KeyboardEventInit = {}): void {
  on.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...extra }));
  on.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true, cancelable: true, ...extra }));
}

/** What a frame of a drag drew: the pointer (page space), the slot, the dragged group. */
interface Seen {
  readonly t: number;
  readonly p: Point;
  readonly slot: Rect | null;
  readonly item: Rect;
}

/**
 * Drag `g` by its handle to `to` (page space) at an aiming pace, hold there `holdMs`, release. Every frame after the
 * lift is recorded from what the page drew. Returns the frames, when the hold began, and where the pointer started.
 */
async function drag(d: Dossier, g: GroupId, to: Point, holdMs = 650): Promise<{ seen: Seen[]; holdFrom: number; start: Point }> {
  const h = d.handle(g);
  const start = mid(d.drawn(h));
  const travel = Math.max(16, Math.hypot(to.x - start.x, to.y - start.y) / 0.8);
  const total = travel + holdMs;
  pointer("pointerdown", h, d.toClient(start));
  const seen: Seen[] = [];
  const t0 = performance.now();
  let p = start;
  for (;;) {
    await nextFrame();
    const t = Math.min(performance.now() - t0, total);
    const k = Math.min(1, t / travel);
    p = { x: start.x + (to.x - start.x) * k, y: start.y + (to.y - start.y) * k };
    pointer("pointermove", window, d.toClient(p));
    if (d.dragging()) seen.push({ t, p, slot: d.slot(), item: d.drawn(d.groupEl(g)) });
    if (t >= total) break;
  }
  pointer("pointerup", window, d.toClient(p));
  return { seen, holdFrom: travel, start };
}

export function kitScenarios(ctx: KitContext): KitScenario[] {
  const { c6, c7, c10 } = ctx;
  const out: KitScenario[] = [];

  /** Over `spot` the group has no target: no slot, the group under the pointer every frame, and a release goes home. */
  async function forbidden(expect: Expect, g: GroupId, spot: Point, what: string): Promise<void> {
    c6.reset();
    await settle(c6);
    const a0 = c6.arrangement();
    const home = c6.drawn(c6.groupEl(g));
    const r = await drag(c6, g, spot);
    const grab = { x: r.start.x - home.x, y: r.start.y - home.y };
    // On the way the pointer crosses places the group may use (a slot there is right); over the spot, none.
    const over = r.seen.filter((s) => s.t >= r.holdFrom);
    const slotted = over.filter((s) => s.slot);
    expect(over.length > 10 && slotted.length === 0, `${what}: a slot showed in ${slotted.length} of ${over.length} frames, first ${fmt(slotted[0]?.slot ?? null)}`);
    // Free: held 1:1 under the pointer (once any glide back from a slot it passed has caught up).
    const loose = over.filter((s) => s.t >= r.holdFrom + 250 && Math.max(Math.abs(s.item.x - (s.p.x - grab.x)), Math.abs(s.item.y - (s.p.y - grab.y))) > 1.5);
    expect(loose.length === 0, `${what}: not under the pointer in ${loose.length} frames, first at ${fmt(loose[0]?.item ?? null)}`);
    const rec = c6.lastDrag();
    const late = rec ? rec.frames.slice(-20) : [];
    expect(late.length > 0 && late.every((f) => f.shown === null), `${what}: the intent showed ${late.find((f) => f.shown)?.shown} over the spot`);
    expect(!!rec && rec.landed === null, `${what}: landed on ${rec?.landed}`);
    await settle(c6);
    expect(sameArrangement(c6.arrangement(), a0), `${what}: the arrangement changed`);
    const back = c6.drawn(c6.groupEl(g));
    expect(off(back, home) < 1.5, `${what}: rests at ${fmt(back)}, home is ${fmt(home)}`);
  }

  out.push({
    name: "6 · Redact over the bottom bar and over the document: no target, no slot, the group under the pointer; a release glides home",
    play: async (expect) => {
      const kept = c6.targets("redact");
      expect(kept.length > 0 && kept.every((t) => t.kind !== "float" && t.place.host === "top"), `Redact keeps ${kept.map((t) => t.id).join(", ")}`);
      expect(c6.allTargets("redact").some((t) => t.kind !== "float" && t.place.host === "bottom"), "the bottom bar offers no target at all (nothing to filter)");
      await forbidden(expect, "redact", mid(HOST_RECT.bottom), "over the bottom bar");
      await forbidden(expect, "redact", mid(STAGE), "over the document");
    },
  });

  out.push({
    name: "6 · Share can't float: over the document no target and a release goes home; on the bottom bar it lands",
    play: async (expect) => {
      expect(!c6.targets("share").some((t) => t.kind === "float"), "Share keeps the float target");
      await forbidden(expect, "share", mid(STAGE), "over the document");
      c6.reset();
      await settle(c6);
      const t = c6.targets("share").find((x) => x.id === "g:bottom:center:0");
      if (!t || t.kind === "float") return expect(false, "no bottom centre target for Share");
      await drag(c6, "share", mid(placements(t.arrangement).get("share")!.rect));
      await settle(c6);
      expect(c6.lastDrag()?.landed === t.id, `landed on ${c6.lastDrag()?.landed ?? "home"}`);
      expect(c6.arrangement().bottom.center.includes("share"), "Share isn't in the bottom bar");
    },
  });

  out.push({
    name: "6 · Navigate is free: over the document it shows a slot and floats",
    play: async (expect) => {
      const r = await drag(c6, "navigate", mid(STAGE));
      await settle(c6);
      expect(r.seen.some((s) => s.t >= r.holdFrom && s.slot), "no slot over the document");
      expect(c6.lastDrag()?.landed === "g:float", `landed on ${c6.lastDrag()?.landed ?? "home"}`);
      expect(c6.arrangement().floating.some((f) => f.id === "navigate"), "Navigate isn't floating");
    },
  });

  out.push({
    name: "7 · The arrows step through the places in order, the slot on each and the group gliding there; Move to › lists the same places in the same order; Esc glides home",
    play: async (expect) => {
      const g: GroupId = "zoom";
      const h = c7.handle(g);
      const home = c7.drawn(c7.groupEl(g));
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
      // Every arrow: the next place, its slot drawn, the group gliding (not jumping) there.
      const first = c7.firstStop(g, true);
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
      expect(off(back, home) < 1.5, `after Escape it rests at ${fmt(back)}, home is ${fmt(home)}`);
    },
  });

  out.push({
    name: "7 · Enter drops at the place shown; a place picked in Move to › is where it goes",
    play: async (expect) => {
      const g: GroupId = "annotate";
      const h = c7.handle(g);
      h.focus();
      const stops = c7.stops(g);
      const want = stops[(c7.firstStop(g, true) + 1) % stops.length]!;
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
      const pick = list.at(-1)!;
      h.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
      const menu = c7.menu();
      menu?.querySelector<HTMLButtonElement>(":scope > .k-menu-item")?.click();
      menu?.querySelector<HTMLButtonElement>(`.k-submenu [data-target="${pick.id}"]`)?.click();
      await settle(c7);
      expect(sameArrangement(c7.arrangement(), pick.arrangement), `Move to › ${pick.label} didn't move it there`);
    },
  });

  /** Drag Zoom onto the bottom bar's start, its pointer on where it would land: what the intent read, and the slot. */
  async function scaled(expect: Expect, s: number): Promise<{ read: Point[]; slots: (Rect | null)[]; aim: Point; landed: string | null }> {
    ctx.setScale(s);
    c10.reset();
    await settle(c10);
    const t = c10.allTargets("zoom").find((x) => x.id === "g:bottom:start:0");
    if (!t || t.kind === "float") {
      expect(false, "no bottom start target for Zoom");
      return { read: [], slots: [], aim: { x: 0, y: 0 }, landed: null };
    }
    const aim = mid(placements(t.arrangement).get("zoom")!.rect);
    const r = await drag(c10, "zoom", aim);
    const late = r.seen.filter((x) => x.t >= r.holdFrom + 300);
    await settle(c10);
    const rec = c10.lastDrag();
    const reads = rec ? rec.frames.slice(-10).map((f) => f.read) : [];
    return { read: reads, slots: late.map((x) => x.slot), aim, landed: rec?.landed ?? null };
  }

  out.push({
    name: "10 · Scaled page: at 0.7 (and 0.5, 1) the intent reads the point under the pointer and the slot is under it",
    play: async (expect) => {
      ctx.setConvert(true);
      for (const s of [0.7, 0.5, 1]) {
        const r = await scaled(expect, s);
        const wrong = r.read.filter((p) => Math.hypot(p.x - r.aim.x, p.y - r.aim.y) > 1);
        expect(r.read.length > 0 && wrong.length === 0, `at ${s}: the intent read ${wrong[0] ? `${Math.round(wrong[0].x)},${Math.round(wrong[0].y)}` : "nothing"}, the pointer is at ${Math.round(r.aim.x)},${Math.round(r.aim.y)}`);
        const away = r.slots.filter((x) => !x || !inRect(x, r.aim));
        expect(r.slots.length > 0 && away.length === 0, `at ${s}: the slot was ${fmt(away[0] ?? null)}, not under the pointer, in ${away.length} of ${r.slots.length} frames`);
        expect(r.landed === "g:bottom:start:0", `at ${s}: landed on ${r.landed ?? "home"}`);
      }
    },
  });

  out.push({
    name: "10 · Without the conversion, at 0.7 the intent reads a point away from the pointer and no slot is under it (the bug the conversion fixes)",
    play: async (expect) => {
      ctx.setConvert(false);
      const r = await scaled(expect, 0.7);
      ctx.setConvert(true);
      expect(r.read.length > 0 && r.read.every((p) => Math.hypot(p.x - r.aim.x, p.y - r.aim.y) > 20), "unconverted, the intent still read the point under the pointer");
      expect(!r.slots.some((x) => x && inRect(x, r.aim)), "unconverted, a slot still showed under the pointer");
      expect(r.landed !== "g:bottom:start:0", "unconverted, it still landed where the pointer was");
    },
  });

  return out;
}
