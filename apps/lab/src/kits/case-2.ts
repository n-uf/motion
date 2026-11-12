/**
 * 2 · Host map: placement's hosts are title, top, bottom, left and right, each with start, centre and end zones. An
 * app declares which of its places are hosts. Two layouts of the same window: one whose places match the five hosts one
 * to one, and one whose places differ from them: it maps a masthead row to title and a strip to top, and its side rail
 * and cards are not declared, so they are never a target.
 */
import type { Rect } from "@n-uf/motion";
import { HOSTS, type HostId } from "@n-uf/placement/toolbar";
import { HOST_RECT, STAGE, createViewer, inRect, sameArrangement, type Viewer } from "./viewer";
import { drag, fmt, mid, off, settle } from "./drive";
import { allIdle, caseFrame, type KitCase, type KitScenario } from "./kit-case";

const RULE = `A host is <b>title</b>, <b>top</b>, <b>bottom</b>, <b>left</b> or <b>right</b>, each with start, centre and end
zones (placement's host map). An app declares which of its places are hosts. In a <b>one-to-one layout</b> the places
match the five hosts. In a layout with <b>places of its own</b>, the app maps a masthead row to title and a strip to top;
its side rail and cards are not declared, so they are never a target. Drag a group and look at what lights up.`;

export const case2: KitCase = {
  id: "host-map",
  title: "2 · Host map",
  mount(host, loop) {
    const vs: Viewer[] = [];
    const desks = caseFrame(
      host,
      RULE,
      [
        { id: "a", caption: "<b>One to one</b> · title, top, bottom, left, right" },
        { id: "b", caption: "<b>Places of its own</b> · masthead row = title, strip = top" },
      ],
      () => vs.forEach((v) => v.reset()),
    );
    const oneToOne = createViewer(desks.a!, { title: "Quarterly plan.pdf", loop, lightUp: true });
    const ownPlaces = createViewer(desks.b!, {
      title: "Quarterly plan.pdf",
      loop,
      lightUp: true,
      hosts: ["title", "top"],
      // The places that aren't hosts carry their names (the caption names the masthead row and the strip).
      barNames: { left: "Side rail", right: "Cards", bottom: "Pages" },
    });
    vs.push(oneToOne, ownPlaces);
    return { reset: () => vs.forEach((v) => v.reset()), idle: allIdle(vs), scenarios: scenarios(oneToOne, ownPlaces) };
  },
};

/** Which bar a lit rect belongs to (the one its centre is in), or "document". */
const barOf = (r: Rect): HostId | "document" => HOSTS.find((h) => inRect(HOST_RECT[h], mid(r))) ?? "document";

function scenarios(oneToOne: Viewer, ownPlaces: Viewer): KitScenario[] {
  return [
    {
      name: "2 · A layout with places of its own offers only its masthead row (title), its strip (top) and the document; a one-to-one layout offers all five bars",
      play: async (expect) => {
        const hostsOf = (v: Viewer): string => [...new Set(v.targets("zoom").map((t) => (t.kind === "float" ? "float" : t.place.host)))].sort().join(",");
        expect(hostsOf(ownPlaces) === "float,title,top", `places of its own: targets on ${hostsOf(ownPlaces)}`);
        expect(hostsOf(oneToOne) === "bottom,float,left,right,title,top", `one to one: targets on ${hostsOf(oneToOne)}`);
      },
    },
    {
      name: "2 · While a group is dragged its hosts light up: with places of its own, the masthead row, the strip and the document only; one to one, all five bars and the document",
      play: async (expect) => {
        for (const [v, name, want] of [
          [ownPlaces, "places of its own", "document,title,top"],
          [oneToOne, "one to one", "bottom,document,left,right,title,top"],
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
      name: "2 · With places of its own, over the side rail and the cards no slot shows; a release there glides home",
      play: async (expect) => {
        for (const [spot, what] of [
          [HOST_RECT.left, "the side rail"],
          [HOST_RECT.right, "the cards"],
        ] as const) {
          ownPlaces.reset();
          await settle(ownPlaces);
          const a0 = ownPlaces.arrangement();
          const home = ownPlaces.drawn(ownPlaces.groupEl("zoom"));
          const r = await drag(ownPlaces, "zoom", mid(spot));
          const over = r.seen.filter((s) => s.t >= r.holdFrom);
          expect(over.length > 10 && over.every((s) => !s.slot), `over ${what}: a slot showed`);
          await settle(ownPlaces);
          expect(ownPlaces.lastDrag()?.landed === null && sameArrangement(ownPlaces.arrangement(), a0), `over ${what}: it landed on ${ownPlaces.lastDrag()?.landed}`);
          const back = ownPlaces.drawn(ownPlaces.groupEl("zoom"));
          expect(off(back, home) < 1.5, `over ${what}: it rests at ${fmt(back)}, home is ${fmt(home)}`);
        }
      },
    },
    {
      name: "2 · One to one, the same group drops onto the left bar",
      play: async (expect) => {
        oneToOne.reset();
        await settle(oneToOne);
        const t = oneToOne.targets("zoom").find((x) => x.id === "g:left:start:0");
        if (!t || t.kind === "float") return expect(false, "no left start target in the one-to-one layout");
        await drag(oneToOne, "zoom", mid(t.slot));
        await settle(oneToOne);
        expect(oneToOne.lastDrag()?.landed === t.id && oneToOne.arrangement().left.start.includes("zoom"), `landed on ${oneToOne.lastDrag()?.landed ?? "home"}`);
      },
    },
  ];
}
