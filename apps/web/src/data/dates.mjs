// The day each fixed page's text last changed in substance (UTC, YYYY-MM-DD): the sitemap's lastmod and the pages'
// dateModified. A build time isn't a change date, so these are set by hand when a page's text changes; never bump
// one without a change (n-uf-seo: dates are real). Plain JS so astro.config.mjs can read it too.
export const updated = {
  "/": "2026-11-11",
  "/window-motion/": "2026-11-11",
  "/drag-intent/": "2026-11-11",
  "/desk-layouts/": "2026-11-11",
  "/toolbar-groups/": "2026-11-11",
};
