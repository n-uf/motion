// The day each fixed page's text last changed in substance (UTC, YYYY-MM-DD): the sitemap's lastmod and the pages'
// dateModified. A build time isn't a change date, so these are set by hand when a page's text changes; never bump
// one without a change (n-uf-seo: dates are real). Plain JS so astro.config.mjs can read it too.
//
// RELEASE_DAY is the day the three libraries went out at 26.11.54 (UTC) and the pages below took their new text:
// the home, the docking and toolbar pages, the docs index, the motion docs (the README changed in substance), the
// placement docs and the new docking docs. /drag-intent/ took its new text the same day (its demo runs the library's
// intent, its rules were corrected). Not bumped, because only a link changed: /window-motion/.
const RELEASE_DAY = "2026-11-21";

export const updated = {
  "/": RELEASE_DAY, // home FAQ, description and hero for three libraries
  "/window-motion/": "2026-11-12",
  "/drag-intent/": RELEASE_DAY, // the demo runs the library's intent; rules for band, touch lift, auto-scroll and keys corrected
  "/docking-layouts/": RELEASE_DAY, // renamed from /desk-layouts/ (that page's last change was 2026-11-12); new title, description, copy and FAQ
  "/toolbar-groups/": RELEASE_DAY, // built-with line, about and FAQ answers changed
  // the docs pages are rendered from the docs files: bump a date when that file's text changes in substance
  "/docs/": RELEASE_DAY, // index title, description and cells
  "/docs/motion/": RELEASE_DAY, // the README changed: entries, drag and landing models, the browser entry
  "/docs/placement/": RELEASE_DAY, // new title, description and the "moved to @n-uf/docking" box
  "/docs/docking/": RELEASE_DAY, // a new page, built from docs/docking.md
};
