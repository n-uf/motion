// n-uf's rule for external links: a link to another host opens in a new tab, with rel="noopener"
// (no "noreferrer": the sites we link to may see the visit came from here) and a note for screen readers.
// External = an http(s) link to another host than this site's (n-uf.com, GitHub, npm).
// Plain JS so that astro.config.mjs and scripts/links.test.mjs can load it.

/** A function that is true for an http(s) link to a host other than the one of `siteUrl`. Relative links, links to the
 *  site itself and mailto: or tel: are not external. */
export function externalCheck(siteUrl) {
  const siteHost = new URL(siteUrl).host;
  return (href) => {
    try {
      const url = new URL(href, siteUrl);
      return (url.protocol === "http:" || url.protocol === "https:") && url.host !== siteHost;
    } catch {
      return false;
    }
  };
}

/** Text for screen readers after an external link's own text. */
export const newTabNote = " (opens in a new tab)";
