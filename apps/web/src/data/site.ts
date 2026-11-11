// Shared site constants. The library's version is never written here: a page that shows it reads it from
// packages/motion/package.json.
export const site = "https://motion.n-uf.com";
/** The brand in titles, og:site_name and the WebSite node: a bare "motion" collides with motion.dev. */
export const name = "n-uf motion";

export const repoUrl = "https://github.com/n-uf/motion";
export const npmUrl = "https://www.npmjs.com/package/@n-uf/motion";

/** "2026-10-24" -> "24 Oct 2026". Used for the dates on use-case pages and articles (content.ts). */
export function releasedText(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const mon = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1];
  return `${d} ${mon} ${y}`;
}
