// Structured data (JSON-LD) builders for the fixed pages, the use-case pages, the blog and their index pages.
// The Organization node is the same one every n-uf site uses (id https://n-uf.com/#org); the software node is the
// SoftwareSourceCode on the home page (id #software), and every page is `about` it.
import { site, name, repoUrl } from "./site";

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
/** A reference to the home page's SoftwareSourceCode node. */
export const softwareRef = { "@id": `${site}/#software` };

/** "/drag-intent/" -> "https://motion.n-uf.com/drag-intent/" */
export const abs = (path: string) => new URL(path, site).href;
const day = (d: Date) => d.toISOString().slice(0, 10);

/** The home page's WebSite node. Its url is the home page's canonical, with the trailing slash. */
export const webSite = {
  "@context": ctx,
  "@type": "WebSite",
  "@id": `${site}/#website`,
  name,
  alternateName: ["motion n-uf", "@n-uf/motion"],
  url: abs("/"),
  publisher: orgRef,
};

/** The library itself, on the home page. */
export function software(description: string) {
  return {
    "@context": ctx,
    "@type": "SoftwareSourceCode",
    "@id": `${site}/#software`,
    name,
    description,
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

interface PageInfo { path: string; name: string; description: string; type?: "WebPage" | "CollectionPage"; published?: Date; updated?: Date; isPartOf?: boolean }

export function webPage({ path, name, description, type = "WebPage", published, updated, isPartOf = false }: PageInfo) {
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
    about: softwareRef,
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
    about: softwareRef,
    mainEntityOfPage: abs(path),
  };
}
