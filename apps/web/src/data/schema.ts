// Structured data (JSON-LD) builders for the fixed pages, the use-case pages, the blog and their index pages.
// The Organization node is the same one every n-uf site uses (id https://n-uf.com/#org). The pair is two
// SoftwareSourceCode nodes on the home page, one per package (#motion, #placement); each page is `about` the one(s)
// it shows (data/parts.ts), the home page about both.
import { site, name, repoUrl } from "./site";
import type { PartId } from "./parts";

const ctx = "https://schema.org";

/** A reference to the shared n-uf Organization node. */
export const orgRef = { "@id": "https://n-uf.com/#org" };
/** The full Organization node; include it once on every page that refers to orgRef. */
export const orgNode = {
  "@context": ctx,
  "@type": "Organization",
  "@id": "https://n-uf.com/#org",
  name: "n-uf",
  url: "https://n-uf.com",
  sameAs: ["https://github.com/n-uf"],
};
/** A reference to a package's SoftwareSourceCode node on the home page. */
export const softwareRef = (part: PartId) => ({ "@id": `${site}/#${part}` });

/** "/drag-intent/" -> "https://motion.n-uf.com/drag-intent/" */
export const abs = (path: string) => new URL(path, site).href;
const day = (d: Date) => d.toISOString().slice(0, 10);

/** The home page's WebSite node. Its url is the home page's canonical, with the trailing slash. */
export const webSite = {
  "@context": ctx,
  "@type": "WebSite",
  "@id": `${site}/#website`,
  name,
  alternateName: ["n-uf motion", "@n-uf/motion", "@n-uf/placement"],
  url: abs("/"),
  publisher: orgRef,
};

const SOFTWARE: Record<PartId, { name: string; description: string }> = {
  motion: {
    name: "@n-uf/motion",
    description: "How things move: a TypeScript library for windows, panels and toolbars with one frame loop on an injected clock, a settle that never overshoots, reveal without stretching, held drags and drag intent. No DOM in the core, no framework.",
  },
  placement: {
    name: "@n-uf/placement",
    description: "Where things go: a TypeScript library that works out where windows, panels and toolbar groups go. Desks of docks, rails and palettes, panel columns and bands, desk presets, toolbar hosts and zones, and the drop targets for each, as plain state in and rects out.",
  },
};

/**
 * One package of the pair: @n-uf/motion (#motion) or @n-uf/placement (#placement). The home page carries both; each inner
 * page carries the one it is `about`, so every reference resolves on the page itself.
 */
export function software(part: PartId) {
  return {
    "@context": ctx,
    "@type": "SoftwareSourceCode",
    "@id": `${site}/#${part}`,
    name: SOFTWARE[part].name,
    description: SOFTWARE[part].description,
    url: abs("/"),
    codeRepository: repoUrl,
    programmingLanguage: "TypeScript",
    license: "https://polyformproject.org/licenses/perimeter/1.0.1",
    author: orgRef,
  };
}

export interface Crumb { name: string; path: string }

export function breadcrumbs(items: Crumb[]) {
  return {
    "@context": ctx,
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: abs(c.path) })),
  };
}

export function faqPage(faq: { q: string; a: string }[]) {
  return {
    "@context": ctx,
    "@type": "FAQPage",
    mainEntity: faq.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  };
}

interface PageInfo { path: string; name: string; description: string; type?: "WebPage" | "CollectionPage"; published?: Date; updated?: Date; isPartOf?: boolean; about?: PartId[] }

/** A page, `about` the package(s) it shows (default @n-uf/motion). */
export function webPage({ path, name, description, type = "WebPage", published, updated, isPartOf = false, about = ["motion"] }: PageInfo) {
  return {
    "@context": ctx,
    "@type": type,
    "@id": `${abs(path)}#webpage`,
    url: abs(path),
    name,
    description,
    inLanguage: "en",
    ...(isPartOf && { isPartOf: { "@id": `${site}/#website` } }),
    ...(published && { datePublished: day(published) }),
    ...(updated && { dateModified: day(updated) }),
    about: about.length === 1 ? softwareRef(about[0]!) : about.map(softwareRef),
    author: orgRef,
    publisher: orgRef,
  };
}

interface ArticleInfo { path: string; headline: string; description: string; published: Date; updated: Date; image?: string }

export function article({ path, headline, description, published, updated, image }: ArticleInfo) {
  return {
    "@context": ctx,
    "@type": "Article",
    "@id": `${abs(path)}#article`,
    headline,
    description,
    // the article's first image, else the site's share image (Google prefers articles with an image)
    image: abs(image ?? "/og.png"),
    datePublished: day(published),
    dateModified: day(updated),
    inLanguage: "en",
    author: orgRef,
    publisher: orgRef,
    about: softwareRef("motion"),
    mainEntityOfPage: abs(path),
  };
}
