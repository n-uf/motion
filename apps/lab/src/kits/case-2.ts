/**
 * 2 · Host map: placement's hosts are title, top, bottom, left and right, each with start, centre and end zones. A
 * kit declares which of its places are hosts: dynia maps all five one to one; kavun maps its Header to title and its
 * Deck to top. Its rail and its cards are not declared, so they are never a target.
 */
import type { Rect } from "@n-uf/motion";
import { HOSTS, type HostId } from "@n-uf/placement/toolbar";
import { HOST_RECT, STAGE, createDossier, inRect, sameArrangement, type Dossier } from "./dossier";
import { drag, fmt, mid, off, settle } from "./drive";
import { allIdle, caseFrame, type KitCase, type KitScenario } from "./kit-case";

const RULE = `A host is <b>title</b>, <b>top</b>, <b>bottom</b>, <b>left</b> or <b>right</b>, each with start, centre and end
zones (placement's host map). The kit declares which of its places are hosts: <b>dynia</b> maps all five one to one;
<b>kavun</b> maps its Header to title and its Deck to top. kavun's rail and cards are not declared, so they are never a
target. Drag a group and look at what lights up.`;

export const case2: KitCase = {
  id: "host-map",
  title: "2 · Host map",
  mount(host, loop) {
    const ds: Dossier[] = [];
    const desks = caseFrame(
      host,
      RULE,
      [
        { id: "dynia", caption: "<b>dynia</b> · title, top, bottom, left, right" },
        { id: "kavun", caption: "<b>kavun</b> · Header = title, Deck = top" },
      ],
      () => ds.forEach((d) => d.reset()),
    );
    const dynia = createDossier(desks.dynia!, { title: "Quarterly plan.pdf", loop, lightUp: true });
    const kavun = createDossier(desks.kavun!, {
      title: "Quarterly plan.pdf",
      loop,
      lightUp: true,
      hosts: ["title", "top"],
      // The places that aren't hosts carry their names (the caption names Header and Deck).
      barNames: { left: "Rail", right: "Cards", bottom: "Pages" },
    });
    ds.push(dynia, kavun);
    return { reset: () => ds.forEach((d) => d.reset()), idle: allIdle(ds), scenarios: scenarios(dynia, kavun) };
  },
};

/** Which bar a lit rect belongs to (the one its centre is in), or "document". */
const barOf = (r: Rect): HostId | "document" => HOSTS.find((h) => inRect(HOST_RECT[h], mid(r))) ?? "document";

function scenarios(dynia: Dossier, kavun: Dossier): KitScenario[] {
  return [
    {
      name: "2 · kavun offers only its Header (title), its Deck (top) and the document; dynia offers all five bars",
      play: async (expect) => {
        const hostsOf = (d: Dossier): string => [...new Set(d.targets("zoom").map((t) => (t.kind === "float" ? "float" : t.place.host)))].sort().join(",");
        expect(hostsOf(kavun) === "float,title,top", `kavun's targets are on ${hostsOf(kavun)}`);
        expect(hostsOf(dynia) === "bottom,float,left,right,title,top", `dynia's targets are on ${hostsOf(dynia)}`);
      },
    },
    {
      name: "2 · While a group is dragged its hosts light up: kavun's Header, Deck and document only; dynia's five bars and document",
      play: async (expect) => {
        for (const [d, name, want] of [
          [kavun, "kavun", "document,title,top"],
          [dynia, "dynia", "bottom,document,left,right,title,top"],
        ] as const) {
          d.reset();
          await settle(d);
          const n = d.targets("zoom").length;
          let lit: Rect[] = [];
          const probe = setInterval(() => {
            if (d.dragging()) lit = [...d.el.querySelectorAll(".k-hit")].map((e) => d.drawn(e));
          }, 50);
          await drag(d, "zoom", mid(STAGE), 300);
          clearInterval(probe);
          await settle(d);
          expect(lit.length > 0 && lit.length === n, `${name}: ${lit.length} rects lit for ${n} targets`);
          const bars = [...new Set(lit.map(barOf))].sort().join(",");
          expect(bars === want, `${name}: lit on ${bars}`);
        }
      },
    },
    {
      name: "2 · In kavun, over the rail and the cards no slot shows; a release there glides home",
      play: async (expect) => {
        for (const [spot, what] of [
          [HOST_RECT.left, "the rail"],
          [HOST_RECT.right, "the cards"],
        ] as const) {
          kavun.reset();
          await settle(kavun);
          const a0 = kavun.arrangement();
          const home = kavun.drawn(kavun.groupEl("zoom"));
          const r = await drag(kavun, "zoom", mid(spot));
          const over = r.seen.filter((s) => s.t >= r.holdFrom);
          expect(over.length > 10 && over.every((s) => !s.slot), `over ${what}: a slot showed`);
          await settle(kavun);
          expect(kavun.lastDrag()?.landed === null && sameArrangement(kavun.arrangement(), a0), `over ${what}: it landed on ${kavun.lastDrag()?.landed}`);
          const back = kavun.drawn(kavun.groupEl("zoom"));
          expect(off(back, home) < 1.5, `over ${what}: it rests at ${fmt(back)}, home is ${fmt(home)}`);
        }
      },
    },
    {
      name: "2 · In dynia the same group drops onto the left bar",
      play: async (expect) => {
        dynia.reset();
        await settle(dynia);
        const t = dynia.targets("zoom").find((x) => x.id === "g:left:start:0");
        if (!t || t.kind === "float") return expect(false, "no left start target in dynia");
        await drag(dynia, "zoom", mid(t.slot));
        await settle(dynia);
        expect(dynia.lastDrag()?.landed === t.id && dynia.arrangement().left.start.includes("zoom"), `landed on ${dynia.lastDrag()?.landed ?? "home"}`);
      },
    },
  ];
}
