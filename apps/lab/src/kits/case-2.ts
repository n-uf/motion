/**
 * 2 · Host map: placement's hosts are title, top, bottom, left and right, each with start, centre and end zones. An
 * app declares which of its places are hosts. Kit A's places match the five hosts one to one; Kit B is an app whose
 * places don't: it maps its Masthead row to title and its Strip to top, and its side rail and cards are not declared,
 * so they are never a target.
 */
import type { Rect } from "@n-uf/motion";
import { HOSTS, type HostId } from "@n-uf/placement/toolbar";
import { HOST_RECT, STAGE, createViewer, inRect, sameArrangement, type Viewer } from "./viewer";
import { drag, fmt, mid, off, settle } from "./drive";
import { allIdle, caseFrame, type KitCase, type KitScenario } from "./kit-case";

const RULE = `A host is <b>title</b>, <b>top</b>, <b>bottom</b>, <b>left</b> or <b>right</b>, each with start, centre and end
zones (placement's host map). An app declares which of its places are hosts. <b>Kit A</b>'s places match the five hosts
one to one. <b>Kit B</b> is an app whose places don't: it maps its Masthead row to title and its Strip to top; its side
rail and cards are not declared, so they are never a target. Drag a group and look at what lights up.`;

export const case2: KitCase = {
  id: "host-map",
  title: "2 · Host map",
  mount(host, loop) {
    const vs: Viewer[] = [];
    const desks = caseFrame(
      host,
      RULE,
      [
        { id: "a", caption: "<b>Kit A</b> · title, top, bottom, left, right" },
        { id: "b", caption: "<b>Kit B</b> · Masthead row = title, Strip = top" },
      ],
      () => vs.forEach((v) => v.reset()),
    );
    const kitA = createViewer(desks.a!, { title: "Quarterly plan.pdf", loop, lightUp: true });
    const kitB = createViewer(desks.b!, {
      title: "Quarterly plan.pdf",
      loop,
      lightUp: true,
      hosts: ["title", "top"],
      // The places that aren't hosts carry their names (the caption names the Masthead row and the Strip).
      barNames: { left: "Side rail", right: "Cards", bottom: "Pages" },
    });
    vs.push(kitA, kitB);
    return { reset: () => vs.forEach((v) => v.reset()), idle: allIdle(vs), scenarios: scenarios(kitA, kitB) };
  },
};

/** Which bar a lit rect belongs to (the one its centre is in), or "document". */
const barOf = (r: Rect): HostId | "document" => HOSTS.find((h) => inRect(HOST_RECT[h], mid(r))) ?? "document";

function scenarios(kitA: Viewer, kitB: Viewer): KitScenario[] {
  return [
    {
      name: "2 · Kit B offers only its Masthead row (title), its Strip (top) and the document; Kit A offers all five bars",
      play: async (expect) => {
        const hostsOf = (v: Viewer): string => [...new Set(v.targets("zoom").map((t) => (t.kind === "float" ? "float" : t.place.host)))].sort().join(",");
        expect(hostsOf(kitB) === "float,title,top", `Kit B's targets are on ${hostsOf(kitB)}`);
        expect(hostsOf(kitA) === "bottom,float,left,right,title,top", `Kit A's targets are on ${hostsOf(kitA)}`);
      },
    },
    {
      name: "2 · While a group is dragged its hosts light up: Kit B's Masthead row, Strip and document only; Kit A's five bars and document",
      play: async (expect) => {
        for (const [v, name, want] of [
          [kitB, "Kit B", "document,title,top"],
          [kitA, "Kit A", "bottom,document,left,right,title,top"],
        ] as const) {
          v.reset();
          await settle(v);
          const n = v.targets("zoom").length;
          let lit: Rect[] = [];
          const probe = setInterval(() => {
            if (v.dragging()) lit = [...v.el.querySelectorAll(".k-hit")].map((e) => v.drawn(e));
          }, 50);
          await drag(v, "zoom", mid(STAGE), 300);
          clearInterval(probe);
          await settle(v);
          expect(lit.length > 0 && lit.length === n, `${name}: ${lit.length} rects lit for ${n} targets`);
          const bars = [...new Set(lit.map(barOf))].sort().join(",");
          expect(bars === want, `${name}: lit on ${bars}`);
        }
      },
    },
    {
      name: "2 · In Kit B, over the side rail and the cards no slot shows; a release there glides home",
      play: async (expect) => {
        for (const [spot, what] of [
          [HOST_RECT.left, "the side rail"],
          [HOST_RECT.right, "the cards"],
        ] as const) {
          kitB.reset();
          await settle(kitB);
          const a0 = kitB.arrangement();
          const home = kitB.drawn(kitB.groupEl("zoom"));
          const r = await drag(kitB, "zoom", mid(spot));
          const over = r.seen.filter((s) => s.t >= r.holdFrom);
          expect(over.length > 10 && over.every((s) => !s.slot), `over ${what}: a slot showed`);
          await settle(kitB);
          expect(kitB.lastDrag()?.landed === null && sameArrangement(kitB.arrangement(), a0), `over ${what}: it landed on ${kitB.lastDrag()?.landed}`);
          const back = kitB.drawn(kitB.groupEl("zoom"));
          expect(off(back, home) < 1.5, `over ${what}: it rests at ${fmt(back)}, home is ${fmt(home)}`);
        }
      },
    },
    {
      name: "2 · In Kit A the same group drops onto the left bar",
      play: async (expect) => {
        kitA.reset();
        await settle(kitA);
        const t = kitA.targets("zoom").find((x) => x.id === "g:left:start:0");
        if (!t || t.kind === "float") return expect(false, "no left start target in Kit A");
        await drag(kitA, "zoom", mid(t.slot));
        await settle(kitA);
        expect(kitA.lastDrag()?.landed === t.id && kitA.arrangement().left.start.includes("zoom"), `landed on ${kitA.lastDrag()?.landed ?? "home"}`);
      },
    },
  ];
}
