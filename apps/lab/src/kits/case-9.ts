/**
 * 9 · Vocabulary: every placement target has a default `label`; a kit may set its own. Two word sets name the same
 * places in the same order: dynia's own words, and stem's words, one set that reads the same on dynia and kavun.
 * "Move to ›" shows them; a tick marks where the group sits now. A rail is not a toolbar host (case 2), so no row
 * names it.
 */
import { withoutGroup, type Place } from "@n-uf/placement/toolbar";
import { GROUP_LABEL, createDossier, sameArrangement, type Dossier, type GroupId, type Words } from "./dossier";
import { settle } from "./drive";
import { allIdle, caseFrame, type KitCase, type KitScenario } from "./kit-case";

const name = (g: GroupId): string => GROUP_LABEL[g];

/** Where in a zone `place` is, in a word set's phrasing. */
function position(place: Place, zone: readonly GroupId[], words: { empty: string; before: (g: string) => string; after: (g: string) => string; between: (a: string, b: string) => string }): string {
  if (!zone.length) return words.empty;
  if (place.index === 0) return words.before(name(zone[0]!));
  if (place.index >= zone.length) return words.after(name(zone.at(-1)!));
  return words.between(name(zone[place.index - 1]!), name(zone[place.index]!));
}

/** stem's words: one set for both kits. */
export const STEM_WORDS: Words = (_g, place, zone) => {
  if (place === "float") return "Float over the page";
  const host = { title: "Title bar", top: "Top bar", bottom: "Bottom bar", left: "Left bar", right: "Right bar" }[place.host];
  const side = place.host === "left" || place.host === "right";
  const z = side ? { start: "top", center: "middle", end: "bottom" }[place.zone] : { start: "left", center: "centre", end: "right" }[place.zone];
  return `${host} · ${z} · ${position(place, zone, { empty: "empty", before: (g) => `before ${g}`, after: (g) => `after ${g}`, between: (a, b) => `between ${a} and ${b}` })}`;
};

/** dynia's own words. */
export const DYNIA_WORDS: Words = (_g, place, zone) => {
  if (place === "float") return "Floating";
  const host = { title: "Window title", top: "Toolbar", bottom: "Status bar", left: "Left side", right: "Right side" }[place.host];
  const z = { start: "start", center: "middle", end: "end" }[place.zone];
  return `${host}, ${z}: ${position(place, zone, { empty: "(empty)", before: (g) => `first, before ${g}`, after: (g) => `last, after ${g}`, between: (a, b) => `${a} ‹ here › ${b}` })}`;
};

const RULE = `Every placement target has a default <code>label</code>; a kit may set its own. Two word sets name the same
places in the same order: <b>dynia's</b> own words, and <b>stem's</b> words, one set that reads the same on dynia and
kavun. Right-click a handle (or Shift+F10) and open <b>Move to ›</b>: a tick marks where the group sits now. A rail is
not a toolbar host (case 2), so no row names it.`;

export const case9: KitCase = {
  id: "vocabulary",
  title: "9 · Vocabulary",
  mount(host, loop) {
    const ds: Dossier[] = [];
    const desks = caseFrame(
      host,
      RULE,
      [
        { id: "dynia", caption: "<b>dynia's words</b>" },
        { id: "stem", caption: "<b>stem's words</b> · one set for both kits" },
      ],
      () => ds.forEach((d) => d.reset()),
    );
    const dynia = createDossier(desks.dynia!, { title: "Quarterly plan.pdf", loop, words: DYNIA_WORDS });
    const stem = createDossier(desks.stem!, { title: "Quarterly plan.pdf", loop, words: STEM_WORDS });
    ds.push(dynia, stem);
    return { reset: () => ds.forEach((d) => d.reset()), idle: allIdle(ds), scenarios: scenarios(dynia, stem) };
  },
};

/** The "Move to ›" rows for `g`, as the menu draws them: target ids and labels. */
function menuRows(d: Dossier, g: GroupId): { id: string; label: string; here: boolean }[] {
  const m = d.openMenu(g);
  const rows = [...m.querySelectorAll<HTMLElement>(".k-submenu .k-menu-item")].map((b) => ({ id: b.dataset.target ?? "", label: b.textContent ?? "", here: b.classList.contains("here") }));
  d.closeMenu();
  return rows;
}

function scenarios(dynia: Dossier, stem: Dossier): KitScenario[] {
  return [
    {
      name: "9 · Both word sets name the same places in the same order; each row reads its set's words; a tick marks where it sits",
      play: async (expect) => {
        const a = menuRows(dynia, "zoom");
        const b = menuRows(stem, "zoom");
        expect(a.length > 5 && a.map((r) => r.id).join(" ") === b.map((r) => r.id).join(" "), `the sets list different places: ${a.length} and ${b.length} rows`);
        const differ = a.filter((r, i) => r.label === b[i]?.label);
        expect(differ.length === 0, `${differ.length} rows read the same in both sets, first ${differ[0]?.label}`);
        // Each row's words are its set's, for the place it names.
        for (const [d, rows, words, set] of [
          [dynia, a, DYNIA_WORDS, "dynia"],
          [stem, b, STEM_WORDS, "stem"],
        ] as const) {
          const stops = d.stops("zoom");
          const a0 = withoutGroup(d.arrangement(), "zoom");
          const wrong = rows.filter((r, i) => {
            const s = stops[i]!;
            if (!s.place) return r.label !== words("zoom", "float", []);
            const exact = words("zoom", s.place, s.home ? d.arrangement()[s.place.host][s.place.zone].filter((x) => x !== "zoom") : a0[s.place.host][s.place.zone]);
            return r.label !== (s.home ? `${exact} · current place` : exact);
          });
          expect(wrong.length === 0, `${set}: ${wrong.length} rows not in its words, first ${wrong[0]?.label}`);
          expect(rows.filter((r) => r.here).length === 1 && rows.find((r) => r.here)?.id === "home", `${set}: the tick isn't on its own place, once`);
          expect(!rows.some((r) => /rail/i.test(r.label)), `${set}: a row names a rail`);
        }
        expect(b.some((r) => r.label.startsWith("Left bar")) && b.some((r) => r.label.startsWith("Right bar")), "stem's set has no Left bar or Right bar");
        expect(a.some((r) => r.label.startsWith("Left side")) && a.some((r) => r.label.startsWith("Toolbar")), "dynia's set has no Left side or Toolbar");
      },
    },
    {
      name: "9 · A place picked by its words is where the group goes, in either set",
      play: async (expect) => {
        for (const [d, label] of [
          [stem, "Left bar · top · empty"],
          [dynia, "Left side, start: (empty)"],
        ] as const) {
          d.reset();
          await settle(d);
          const row = menuRows(d, "zoom").find((r) => r.label === label);
          if (!row) {
            expect(false, `no row reads "${label}"`);
            continue;
          }
          const stop = d.stops("zoom").find((s) => s.id === row.id)!;
          const m = d.openMenu("zoom");
          m.querySelector<HTMLButtonElement>(":scope > .k-menu-item")?.click();
          m.querySelector<HTMLButtonElement>(`.k-submenu [data-target="${row.id}"]`)?.click();
          await settle(d);
          expect(sameArrangement(d.arrangement(), stop.arrangement) && d.arrangement().left.start.includes("zoom"), `"${label}" didn't put Zoom on the left`);
        }
      },
    },
  ];
}
