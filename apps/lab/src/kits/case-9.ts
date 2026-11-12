/**
 * 9 · Vocabulary: every placement target has a default `label`; an app may set its own. Two word sets name the same
 * places in the same order: Word set 1, an app's own words set on each target's label (one set that several apps can
 * share), and Word set 2, placement's own labels. "Move to ›" shows them; a tick marks where the group sits now. A side
 * rail is not a toolbar host (case 2), so no row names it.
 */
import { withoutGroup, type Place } from "@n-uf/placement/toolbar";
import { GROUP_LABEL, createViewer, sameArrangement, type GroupId, type Viewer, type Words } from "./viewer";
import { settle } from "./drive";
import { allIdle, caseFrame, type KitCase, type KitScenario } from "./kit-case";

const name = (g: GroupId): string => GROUP_LABEL[g];

/** Where in a zone `place` is: empty, before the first group, after the last, or between two. */
function position(place: Place, zone: readonly GroupId[]): string {
  if (!zone.length) return "empty";
  if (place.index === 0) return `before ${name(zone[0]!)}`;
  if (place.index >= zone.length) return `after ${name(zone.at(-1)!)}`;
  return `between ${name(zone[place.index - 1]!)} and ${name(zone[place.index]!)}`;
}

/** Word set 1: an app's own words, one set several apps can share. */
export const WORD_SET_1: Words = (_g, place, zone) => {
  if (place === "float") return "Float over the page";
  const host = { title: "Title bar", top: "Top bar", bottom: "Bottom bar", left: "Left bar", right: "Right bar" }[place.host];
  const side = place.host === "left" || place.host === "right";
  const z = side ? { start: "top", center: "middle", end: "bottom" }[place.zone] : { start: "left", center: "centre", end: "right" }[place.zone];
  // Its own separator too, so no row reads like placement's "Host · zone · position".
  return `${host} › ${z} › ${position(place, zone)}`;
};

const RULE = `Every placement target has a default <code>label</code>; an app may set its own. Two word sets name the same
places in the same order: <b>Word set 1</b>, an app's own words set on each target's label (one set several apps can
share), and <b>Word set 2</b>, placement's own labels. Right-click a handle (or Shift+F10) and open <b>Move to ›</b>: a
tick marks where the group sits now. A side rail is not a toolbar host (case 2), so no row names it.`;

export const case9: KitCase = {
  id: "vocabulary",
  title: "9 · Vocabulary",
  mount(host, loop) {
    const vs: Viewer[] = [];
    const desks = caseFrame(
      host,
      RULE,
      [
        { id: "one", caption: "<b>Word set 1</b> · the app's own words" },
        { id: "two", caption: "<b>Word set 2</b> · placement's labels" },
      ],
      () => vs.forEach((v) => v.reset()),
    );
    const one = createViewer(desks.one!, { title: "Quarterly plan.pdf", loop, words: WORD_SET_1 });
    const two = createViewer(desks.two!, { title: "Quarterly plan.pdf", loop });
    vs.push(one, two);
    return { reset: () => vs.forEach((v) => v.reset()), idle: allIdle(vs), scenarios: scenarios(one, two) };
  },
};

/** The "Move to ›" rows for `g`, as the menu draws them: target ids and labels. */
function menuRows(v: Viewer, g: GroupId): { id: string; label: string; here: boolean }[] {
  const m = v.openMenu(g);
  const rows = [...m.querySelectorAll<HTMLElement>(".k-submenu .k-menu-item")].map((b) => ({ id: b.dataset.target ?? "", label: b.textContent ?? "", here: b.classList.contains("here") }));
  v.closeMenu();
  return rows;
}

function scenarios(one: Viewer, two: Viewer): KitScenario[] {
  return [
    {
      name: "9 · Both word sets name the same places in the same order; each row reads its set's words; a tick marks where it sits",
      play: async (expect) => {
        const a = menuRows(one, "zoom");
        const b = menuRows(two, "zoom");
        expect(a.length > 5 && a.map((r) => r.id).join(" ") === b.map((r) => r.id).join(" "), `the sets list different places: ${a.length} and ${b.length} rows`);
        const same = a.filter((r, i) => r.label === b[i]?.label);
        expect(same.length === 0, `${same.length} rows read the same in both sets, first ${same[0]?.label}`);
        // Word set 1: each row is the app's words for the place it names.
        const stops = one.stops("zoom");
        const a0 = withoutGroup(one.arrangement(), "zoom");
        const wrong = a.filter((r, i) => {
          const s = stops[i]!;
          if (!s.place) return r.label !== WORD_SET_1("zoom", "float", []);
          const exact = WORD_SET_1("zoom", s.place, s.home ? one.arrangement()[s.place.host][s.place.zone].filter((x) => x !== "zoom") : a0[s.place.host][s.place.zone]);
          return r.label !== (s.home ? `${exact} · current place` : exact);
        });
        expect(wrong.length === 0, `Word set 1: ${wrong.length} rows not in its words, first ${wrong[0]?.label}`);
        // Word set 2: placement's labels, as its keyboard stops carry them.
        const own = two.stops("zoom").map((s) => s.label);
        expect(b.map((r) => r.label).join(" | ") === own.join(" | "), `Word set 2 isn't placement's labels: ${b[0]?.label}`);
        for (const [rows, set] of [
          [a, "Word set 1"],
          [b, "Word set 2"],
        ] as const) {
          expect(rows.filter((r) => r.here).length === 1 && rows.find((r) => r.here)?.id === "home", `${set}: the tick isn't on its own place, once`);
          expect(!rows.some((r) => /rail/i.test(r.label)), `${set}: a row names a rail`);
        }
        expect(a.some((r) => r.label.startsWith("Left bar")) && a.some((r) => r.label.startsWith("Right bar")), "Word set 1 has no Left bar or Right bar");
        expect(b.some((r) => r.label.startsWith("Left edge")) && b.some((r) => r.label.startsWith("Top bar")), "Word set 2 has no Left edge or Top bar");
      },
    },
    {
      name: "9 · A place picked by its words is where the group goes, in either set",
      play: async (expect) => {
        for (const [v, label] of [
          [one, "Left bar › top › empty"],
          [two, "Left edge · top"],
        ] as const) {
          v.reset();
          await settle(v);
          const row = menuRows(v, "zoom").find((r) => r.label === label);
          if (!row) {
            expect(false, `no row reads "${label}"`);
            continue;
          }
          const stop = v.stops("zoom").find((s) => s.id === row.id)!;
          const m = v.openMenu("zoom");
          m.querySelector<HTMLButtonElement>(":scope > .k-menu-item")?.click();
          m.querySelector<HTMLButtonElement>(`.k-submenu [data-target="${row.id}"]`)?.click();
          await settle(v);
          expect(sameArrangement(v.arrangement(), stop.arrangement) && v.arrangement().left.start.includes("zoom"), `"${label}" didn't put Zoom on the left`);
        }
      },
    },
  ];
}
