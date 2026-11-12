// The docs pages: /docs/ (the index) and one page per package, /docs/motion/ and /docs/placement/, each rendered at
// build time from the package's own README (packages/<name>/README.md) with the package's version read from its
// package.json, so a page can't drift from what npm shows. The pages and their SEO text live here; the rendering is
// the site's markdown pipeline (@astrojs/markdown-remark) plus the steps in docs-markdown.mjs.
// Limits (n-uf-seo): title at most 60 characters, description 120 to 155. Facts come only from the READMEs.
import { createMarkdownProcessor, markdownConfigDefaults, type MarkdownHeading } from "@astrojs/markdown-remark";
import motionReadme from "../../../../packages/motion/README.md?raw";
import placementReadme from "../../../../packages/placement/README.md?raw";
import motionPkg from "../../../../packages/motion/package.json";
import placementPkg from "../../../../packages/placement/package.json";
import { codeTheme } from "../components/code-theme";
import { remarkDocs, rehypeDocs } from "./docs-markdown.mjs";
import rehypeExternalLinks from "./rehype-external-links.mjs";
import { externalCheck, newTabNote } from "./links.mjs";
import { updated } from "./dates.mjs";
import { PARTS, type PartId } from "./parts";
import { repoUrl, npmUrl, npmPlacementUrl, site } from "./site";

export interface DocPage {
  part: PartId;
  /** "motion" in /docs/motion/ */
  slug: string;
  path: string;
  title: string;
  description: string;
  /** the name in the breadcrumb and the pager */
  nav: string;
  pkg: string;
  version: string;
  install: string;
  npm: string;
  /** the package's folder on GitHub */
  source: string;
  /** the package's README, as it is in the repository */
  readmeUrl: string;
  /** the README's folder in the repository, for its relative links */
  dir: string;
  markdown: string;
  /** the package's entries ("." and "./layout" in package.json's exports), as import paths */
  entries: string[];
  /** its interactive pages ("See it live") */
  live: string[];
}

const entriesOf = (name: string, pkg: { exports: Record<string, unknown> }) =>
  Object.keys(pkg.exports).filter((k) => k !== "./package.json").map((k) => (k === "." ? name : `${name}/${k.slice(2)}`));

export const DOCS: DocPage[] = [
  {
    part: "motion",
    slug: "motion",
    path: "/docs/motion/",
    title: "@n-uf/motion docs: springs, settle and drag intent",
    description: "Reference for @n-uf/motion: the frame loop, springs and tweens, layout motion, drag intent and the testing helpers, entry by entry, with code.",
    nav: "@n-uf/motion",
    pkg: "@n-uf/motion",
    version: motionPkg.version,
    install: "npm i @n-uf/motion",
    npm: npmUrl,
    source: `${repoUrl}/tree/main/packages/motion`,
    readmeUrl: `${repoUrl}/blob/main/packages/motion/README.md`,
    dir: "packages/motion",
    markdown: motionReadme,
    entries: entriesOf("@n-uf/motion", motionPkg),
    live: PARTS.find((p) => p.id === "motion")!.pages,
  },
  {
    part: "placement",
    slug: "placement",
    path: "/docs/placement/",
    title: "@n-uf/placement docs: docking, popups and drop targets",
    description: "Reference for @n-uf/placement: rects and positionPopup, dock constructions, toolbar groups, drop targets, keyboard stops and stored arrangements.",
    nav: "@n-uf/placement",
    pkg: "@n-uf/placement",
    version: placementPkg.version,
    install: "npm i @n-uf/placement",
    npm: npmPlacementUrl,
    source: `${repoUrl}/tree/main/packages/placement`,
    readmeUrl: `${repoUrl}/blob/main/packages/placement/README.md`,
    dir: "packages/placement",
    markdown: placementReadme,
    entries: entriesOf("@n-uf/placement", placementPkg),
    live: PARTS.find((p) => p.id === "placement")!.pages,
  },
];

export const docsIndex = {
  path: "/docs/",
  title: "Docs: n-uf motion & placement",
  description: "Reference docs for @n-uf/motion, which moves the rects it is given, and @n-uf/placement, which works out where things go and moves nothing.",
  nav: "Docs",
};

/** Every docs page with its title, description and change date: the index first. For the sitemap's dates, llms.txt and the link lists. */
export const docsPages = [docsIndex, ...DOCS].map((d) => ({ path: d.path, title: d.title, description: d.description, nav: d.nav, updated: updated[d.path as keyof typeof updated] }));

export const docOf = (slug: string): DocPage => {
  const d = DOCS.find((x) => x.slug === slug);
  if (!d) throw new Error(`no docs page ${slug}`);
  return d;
};

export interface RenderedDoc {
  /** the README's first h1: the page's h1 */
  h1: string;
  /** the body: the callout, the text, the code (highlighted), the tables */
  html: string;
  /** the h2s, for "On this page" */
  toc: MarkdownHeading[];
}

const rendered = new Map<string, Promise<RenderedDoc>>();

/** The README rendered with the site's markdown pipeline: Shiki at build with the site's token theme (light and dark
 *  come from the CSS variables), heading ids, the callout, links to GitHub, tables that scroll by themselves. */
export function renderDoc(doc: DocPage): Promise<RenderedDoc> {
  let out = rendered.get(doc.slug);
  if (!out) {
    out = (async () => {
      // Relative links depend on the README's folder, so each page has its own processor (two, built once each).
      const own = await createMarkdownProcessor({
        gfm: true,
        smartypants: false, // the README's text as written: no curly quotes in code-like prose
        syntaxHighlight: { type: "shiki", excludeLangs: [] },
        shikiConfig: { ...markdownConfigDefaults.shikiConfig, theme: codeTheme as never },
        remarkPlugins: [remarkDocs],
        rehypePlugins: [rehypeDocs({ dir: doc.dir, repo: repoUrl, site }), rehypeExternalLinks({ isExternal: externalCheck(site), note: newTabNote })],
      });
      const { code, metadata } = await own.render(doc.markdown);
      const h1 = String(metadata.frontmatter.title ?? "");
      if (!h1) throw new Error(`docs: ${doc.dir}/README.md has no # heading for the page's h1`);
      return { h1, html: withAnchors(code), toc: metadata.headings.filter((h) => h.depth === 2) };
    })();
    rendered.set(doc.slug, out);
  }
  return out;
}

/** Each h2 and h3 gets a link to itself after its text (empty: CSS draws the "#"; its name is the heading's own text). */
const withAnchors = (html: string) =>
  html.replace(/<(h[23]) id="([^"]+)">([\s\S]*?)<\/\1>/g, (_m, tag: string, id: string, inner: string) => `<${tag} id="${id}">${inner}<a class="hanchor" href="#${id}" aria-labelledby="${id}"></a></${tag}>`);
