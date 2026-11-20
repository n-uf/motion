// The day each fixed page's text last changed in substance (UTC, YYYY-MM-DD): the sitemap's lastmod and the pages'
// dateModified. A build time isn't a change date, so these are set by hand when a page's text changes; never bump
// one without a change (n-uf-seo: dates are real). Plain JS so astro.config.mjs can read it too.
//
// TODO(docking release, held work on fl/docking-pages): on the release day, set RELEASE_DAY below to that day and give
// every page marked TODO-RELEASE the value RELEASE_DAY. Until then they keep their last real date, because the new
// text is not live yet. /docs/docking/ has no earlier date: it stays "TODO" and breaks the build ("Invalid time
// value") if the docking docs file is added and this is forgotten. Do not invent a date. Not bumped, because only a
// link changed: /window-motion/, /drag-intent/. See apps/web/DOCKING-RELEASE-TODO.md.
export const RELEASE_DAY = "TODO";

export const updated = {
  "/": "2026-11-12", // TODO-RELEASE: home FAQ and description changed for three libraries
  "/window-motion/": "2026-11-12",
  "/drag-intent/": "2026-11-12",
  "/docking-layouts/": "2026-11-12", // TODO-RELEASE: renamed from /desk-layouts/ (that page's last change was 2026-11-12); new title, description, copy and FAQ
  "/toolbar-groups/": "2026-11-12", // TODO-RELEASE: built-with line, about and FAQ answers changed
  // the docs pages are rendered from the docs files: bump a date when that file's text changes in substance
  "/docs/": "2026-11-12", // TODO-RELEASE: index title, description and cells
  "/docs/motion/": "2026-11-12",
  "/docs/placement/": "2026-11-12", // TODO-RELEASE: new title, description and the "moved to @n-uf/docking" box
  "/docs/docking/": RELEASE_DAY, // TODO-RELEASE: a new page, built only when docs/docking.md exists
};
