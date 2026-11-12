/**
 * 6 · Constraints: an app's rule for where a group may go is placement's `allows(group, place)`. hostTargets and floatTarget leave a
 * forbidden place out, so the drag intent never sees it: no target, no slot, the group follows the pointer, and a
 * release glides home.
 */
import type { Point } from "@n-uf/motion";
import type { Allows } from "@n-uf/placement/targets";
import { HOST_RECT, STAGE, createViewer, placements, sameArrangement, type GroupId, type Viewer } from "./viewer";
import { drag, fmt, mid, off, settle } from "./drive";
import { allIdle, caseFrame, type Expect, type KitCase, type KitScenario } from "./kit-case";

/** Redact stays in the top bar; Share can't float. */
export const constraint: Allows<GroupId> = (g, place) => {
  if (g === "redact") return place !== "float" && place.host === "top";
  if (g === "share") return place !== "float";
  return true;
};

const RULE = `The app's rule is placement's <code>allows(group, place)</code>: <code>hostTargets</code> and <code>floatTarget</code>
leave a forbidden place out, so <code>createDragIntent</code> never sees it. <b>Redact</b> stays in the top bar (no other
bar, no float); <b>Share</b> can't float. Over a forbidden spot there is no target and no slot, the group follows the
pointer, and a release glides home. Navigate, Zoom and Annotate go anywhere.`;

export const case6: KitCase = {
  id: "constraints",
  title: "6 · Constraints",
  mount(host, loop) {
    let d: Viewer | null = null;
    const desks = caseFrame(host, RULE, [{ id: "w" }], () => d?.reset());
    d = createViewer(desks.w!, { title: "Quarterly plan.pdf", loop, allows: constraint });
    return { reset: () => d!.reset(), idle: allIdle([d]), scenarios: scenarios(d) };
  },
};

function scenarios(c6: Viewer): KitScenario[] {
  /** Over `spot` the group has no target: no slot, the group under the pointer, and a release goes home. */
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

  return [
    {
      name: "6 · Redact over the bottom bar and over the document: no target, no slot, the group under the pointer; a release glides home",
      play: async (expect) => {
        const kept = c6.targets("redact");
        expect(kept.length > 0 && kept.every((t) => t.kind !== "float" && t.place.host === "top"), `Redact keeps ${kept.map((t) => t.id).join(", ")}`);
        expect(c6.allTargets("redact").some((t) => t.kind !== "float" && t.place.host === "bottom"), "the bottom bar offers no target at all (nothing to filter)");
        await forbidden(expect, "redact", mid(HOST_RECT.bottom), "over the bottom bar");
        await forbidden(expect, "redact", mid(STAGE), "over the document");
      },
    },
    {
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
    },
    {
      name: "6 · Navigate is free: over the document it shows a slot and floats",
      play: async (expect) => {
        const r = await drag(c6, "navigate", mid(STAGE));
        await settle(c6);
        expect(r.seen.some((s) => s.t >= r.holdFrom && s.slot), "no slot over the document");
        expect(c6.lastDrag()?.landed === "g:float", `landed on ${c6.lastDrag()?.landed ?? "home"}`);
        expect(c6.arrangement().floating.some((f) => f.id === "navigate"), "Navigate isn't floating");
      },
    },
  ];
}
