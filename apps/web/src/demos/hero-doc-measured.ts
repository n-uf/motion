// What the lab's `measureGroups` and `measureTitles` (apps/lab/src/docwin/dock-state.ts) read from the rendered buttons at its font
// (12 px), measured once from the hero's copy of that markup (styles/hero-doc.css): each group's one-row width, its words'
// widths, the wrapped row's height and lead, the icons forms and the fold, and each panel's rail title length. The dock
// state's items hug what is drawn. Measure again if the markup or the CSS of the copy changes.
export const MEASURED = {
  zoom: { row: 162, words: [20, 34, 20, 55], gap: 4, wrapRow: 28, lead: 17, icons: { width: 32, height: 108 }, iconsRow: 108, fold: 48, variants: [128, 80] },
  tools: { row: 168, words: [26, 26, 26, 26, 26], gap: 4, wrapRow: 28, lead: 17, icons: { width: 32, height: 168 }, iconsRow: 168, fold: 48, variants: [] },
  views: { row: 227, words: [47, 57, 79], gap: 12, wrapRow: 28, lead: 17, icons: { width: 32, height: 108 }, iconsRow: 108, fold: 48, variants: [] },
  review: { row: 230, words: [73, 56, 55, 24], gap: 0, wrapRow: 28, lead: 19, icons: { width: 32, height: 138 }, iconsRow: 138, fold: 48, variants: [] },
} as const;
export const TITLE_SIZES = { pages: 74, notes: 66, findings: 88 } as const;
