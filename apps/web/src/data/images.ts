// Images in use-case pages and articles: captures of the site's own demos (sample data only), in public/img/guides,
// saved as WebP under 100 KB with no metadata.
// In markdown: ![alt text under 60 characters](/img/guides/<name>.webp "the caption").
// At build time each becomes a <figure> with its width and height (from guide-images.json, the CSS size of the 2×
// capture), so nothing moves when it loads, lazy loading, and the caption under it.
import sizes from "./guide-images.json";

const IMG = /<p>\s*(<img\b[^>]*\bsrc="\/img\/guides\/([^"]+)"[^>]*>)\s*<\/p>|(<img\b[^>]*\bsrc="\/img\/guides\/([^"]+)"[^>]*>)/g;
const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];

/** The rendered HTML with each guide image as a sized, lazy figure with its caption. */
export function withImages(html: string): string {
  return html.replace(IMG, (_m, pTag, pName, bareTag, bareName) => {
    const tag: string = pTag ?? bareTag, name: string = pName ?? bareName;
    const size = (sizes as Record<string, { width: number; height: number }>)[name];
    if (!size) throw new Error(`image ${name} is not in src/data/guide-images.json`);
    const alt = attr(tag, "alt") ?? "", caption = attr(tag, "title");
    if (alt.length > 60) throw new Error(`alt text of ${name} is ${alt.length} characters (60 at most)`);
    const img = `<img src="/img/guides/${name}" alt="${alt}" width="${size.width}" height="${size.height}" loading="lazy" decoding="async">`;
    return `<figure class="shot">${img}${caption ? `<figcaption>${caption}</figcaption>` : ""}</figure>`;
  });
}
