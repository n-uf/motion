/**
 * The desk's sample content: what the tool panels, the documents and the toolbar show, so the stage reads like an
 * app rather than a set of boxes. Markup only: sizes come from the layouts, and every body clips to its item.
 */

/** A 24-unit line icon drawn in the current colour. */
const icon = (paths: string, size = 16): string =>
  `<svg class="glyph" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const GLYPH = {
  file: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/>',
  folder: '<path d="M3 6.5h6l2 2h10V19H3z"/>',
  outline: '<path d="M4 6h16M8 12h12M12 18h8"/>',
  note: '<path d="M5 4h14v11l-5 5H5z"/><path d="M14 20v-5h5"/>',
  inspector: '<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  pencil: '<path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 7l3 3"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  trash: '<path d="M4 7h16M10 7V4h4v3M6 7l1 13h10l1-13"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
  columns: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M10 4v16"/>',
  expand: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
} as const;

/** The toolbar's buttons in their groups: edit · history · view. */
const TOOL_GROUPS: readonly (readonly (readonly [keyof typeof GLYPH, string])[])[] = [
  [
    ["pencil", "Edit"],
    ["copy", "Duplicate"],
    ["trash", "Delete"],
  ],
  [
    ["undo", "Undo"],
    ["redo", "Redo"],
  ],
  [
    ["search", "Find"],
    ["columns", "Side panels"],
    ["expand", "Full screen"],
  ],
];

/** The toolbar's cells: icon buttons, a thin divider between groups. */
export function toolbarCells(): string {
  return TOOL_GROUPS.map((group) =>
    group.map(([g, label]) => `<button type="button" class="tb-cell" tabindex="-1" title="${label}" aria-label="${label}">${icon(GLYPH[g], 17)}</button>`).join(""),
  ).join('<span class="tb-sep" aria-hidden="true"></span>');
}

/** One of the toolbar's groups (0 edit, 1 history, 2 view) as its icon buttons, for the toolbar groups. */
export const toolGroupCells = (i: number): string =>
  (TOOL_GROUPS[i] ?? []).map(([g, label]) => `<button type="button" class="tb-cell" tabindex="-1" title="${label}" aria-label="${label}">${icon(GLYPH[g], 17)}</button>`).join("");

/** Each tool panel's rail glyph, by panel id. */
const PANEL_GLYPH: Readonly<Record<number, keyof typeof GLYPH>> = { 1: "folder", 2: "outline", 3: "note", 4: "inspector", 5: "clock" };

/** Put a panel's glyph on a rail button (its title stays the button's name). */
export function withGlyph(b: HTMLButtonElement, id: number): HTMLButtonElement {
  b.innerHTML = icon(GLYPH[PANEL_GLYPH[id] ?? "file"], 17);
  b.setAttribute("aria-label", b.title);
  return b;
}

const FILES: readonly (readonly [string, string])[] = [
  ["Quarterly plan", "4 KB"],
  ["Meeting notes", "2 KB"],
  ["Reading list", "1 KB"],
  ["Budget draft", "9 KB"],
  ["Team roster", "3 KB"],
  ["Travel checklist", "1 KB"],
];

const OUTLINE: readonly (readonly [1 | 2 | 3, string])[] = [
  [1, "Quarterly plan"],
  [2, "Goals"],
  [3, "Ship the new editor"],
  [3, "Halve support wait"],
  [2, "Scope"],
  [2, "Timeline"],
  [3, "First milestone"],
  [2, "Open questions"],
];

const NOTES: readonly string[] = ["Call back on Monday", "Book the small room", "Share the draft with the team", "Order more paper"];

const PROPS: readonly (readonly [string, string])[] = [
  ["Kind", "Document"],
  ["Size", "14 KB"],
  ["Pages", "3"],
  ["Created", "Mar 4"],
  ["Modified", "Today, 09:40"],
  ["Tags", "plan, team"],
];

const HISTORY: readonly (readonly [string, string])[] = [
  ["09:12", "Opened Meeting notes"],
  ["09:20", "Renamed Budget draft"],
  ["09:34", "Moved Reading list"],
  ["09:41", "Edited Quarterly plan"],
  ["10:05", "Added a note"],
  ["10:18", "Shared Team roster"],
];

/** A tool panel's body, by panel id. */
export function panelBody(id: number): string {
  switch (id) {
    case 1:
      return `<ul class="rows files">${FILES.map(([name, size]) => `<li>${icon(GLYPH.file, 14)}<span class="name">${name}</span><span class="aside">${size}</span></li>`).join("")}</ul>`;
    case 2:
      return `<ul class="rows outline">${OUTLINE.map(([level, text]) => `<li class="h${level}">${text}</li>`).join("")}</ul>`;
    case 3:
      return `<ul class="rows notes">${NOTES.map((n) => `<li><span class="name">${n}</span></li>`).join("")}</ul>`;
    case 4:
      return `<dl class="props">${PROPS.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>`;
    case 5:
      return `<ol class="rows history">${HISTORY.map(([t, what]) => `<li><time>${t}</time><span class="name">${what}</span></li>`).join("")}</ol>`;
    default:
      return "";
  }
}

/** Each document's page: a meta line and a few paragraphs of neutral sample text, by title. */
const PAGES: Readonly<Record<string, readonly [string, ...string[]]>> = {
  "Quarterly plan": [
    "Edited today · 3 pages",
    "This quarter we focus on two things: shipping the new editor and making support faster to reach. Everything else waits for the next plan.",
    "The editor ships in three steps, each one usable on its own. The first lands at the end of the month; the second and third follow every four weeks.",
    "Support aims to answer every request within one working day. We add a second shift and a short list of ready answers for common questions.",
  ],
  "Meeting notes": [
    "Weekly sync · 6 people",
    "We went through last week's actions. Two are done, one moves to next week, and the room booking is settled for the rest of the month.",
    "The draft schedule looks right to everyone. A few dates move by a day so that reviews never land on a Friday afternoon.",
    "Next time: a short demo of the new editor, then questions.",
  ],
  "Reading list": [
    "12 items · 4 unread",
    "A short list of articles and books on writing clearly, planning small projects and running calm meetings.",
    "Start with the two short essays at the top; the longer books can wait until the quieter weeks at the end of the season.",
  ],
  "Budget draft": [
    "Draft · not shared",
    "Spending stays close to last quarter. The largest change is a small increase for travel to the two team gatherings.",
    "Equipment is replaced only when it breaks. Subscriptions are reviewed once, at the start of the quarter, and unused ones are cancelled.",
    "The final numbers go out for review next week.",
  ],
};

/** A document's body: its page, by title. */
export function docBody(title: string): string {
  const [meta, ...paras] = PAGES[title] ?? ["Edited today", ""];
  return `<article class="page"><h3>${title}</h3><p class="meta">${meta}</p>${paras.map((p) => `<p>${p}</p>`).join("")}</article>`;
}
