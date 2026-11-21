// The docs pages: /docs/ (the index) and one page per library, /docs/motion/, /docs/placement/ and /docs/docking/,
// each rendered at build time from the library's own docs file with the package's version read from its package.json,
// so a page can't drift from what npm shows. Motion and placement render their package README; docking renders its
// design page (docs/docking.md: the README is only its short npm page) and links the full reference
// (docs/docking-reference.md). The pages and their SEO text live here; the rendering is the site's markdown pipeline
// (@astrojs/markdown-remark) plus the steps in docs-markdown.mjs.
// Limits (n-uf-seo): title at most 60 characters, description 120 to 155. Facts come only from the docs files.
import { createMarkdownProcessor, markdownConfigDefaults, type MarkdownHeading } from "@astrojs/markdown-remark";
import motionReadme from "../../../../packages/motion/README.md?raw";
import placementReadme from "../../../../packages/placement/README.md?raw";
import dockingDesign from "../../../../docs/docking.md?raw";
import motionPkg from "../../../../packages/motion/package.json";
import placementPkg from "../../../../packages/placement/package.json";
import dockingPkg from "../../../../packages/docking/package.json";
import { codeTheme } from "../components/code-theme";
import { remarkDocs, rehypeDocs } from "./docs-markdown.mjs";
import rehypeExternalLinks from "./rehype-external-links.mjs";
import { externalCheck, newTabNote } from "./links.mjs";
import { updated } from "./dates.mjs";
import { PARTS, type PartId } from "./parts";
import { repoUrl, npmUrl, npmPlacementUrl, npmDockingUrl, site } from "./site";

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
  /** the file the page is rendered from, as it is in the repository (the package README, or docs/docking.md) */
  readmeUrl: string;
  /** what that file's link says */
  readmeLabel: string;
  /** a fuller reference page in the repository, when the library has one (docking: docs/docking-reference.md) */
  referenceUrl?: string;
  /** the file's folder in the repository, for its relative links */
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
    readmeLabel: "README on GitHub",
    dir: "packages/motion",
    markdown: motionReadme,
    entries: entriesOf("@n-uf/motion", motionPkg),
    live: PARTS.find((p) => p.id === "motion")!.pages,
  },
  {
    part: "placement",
    slug: "placement",
    path: "/docs/placement/",
    title: "@n-uf/placement docs: popups, stacks and tiling",
    description: "Reference for @n-uf/placement: rects, the popup positioner, the edge cut, stack fit, one edge's drop places and tiling, entry by entry, with code.",
    nav: "@n-uf/placement",
    pkg: "@n-uf/placement",
    version: placementPkg.version,
    install: "npm i @n-uf/placement",
    npm: npmPlacementUrl,
    source: `${repoUrl}/tree/main/packages/placement`,
    readmeUrl: `${repoUrl}/blob/main/packages/placement/README.md`,
    readmeLabel: "README on GitHub",
    dir: "packages/placement",
    markdown: placementReadme,
    entries: entriesOf("@n-uf/placement", placementPkg),
    live: PARTS.find((p) => p.id === "placement")!.pages,
  },
  {
    part: "docking",
    slug: "docking",
    path: "/docs/docking/",
    title: "@n-uf/docking docs: dock state, targets and floats",
    description: "Reference for @n-uf/docking: DockState, solve, drop targets and refusals, storeDockState and readDockState, and the testing rows, entry by entry.",
    nav: "@n-uf/docking",
    pkg: "@n-uf/docking",
    version: dockingPkg.version,
    install: "npm i @n-uf/docking",
    npm: npmDockingUrl,
    source: `${repoUrl}/tree/main/packages/docking`,
    readmeUrl: `${repoUrl}/blob/main/docs/docking.md`,
    readmeLabel: "Design page on GitHub",
    referenceUrl: `${repoUrl}/blob/main/docs/docking-reference.md`,
    dir: "docs",
    markdown: dockingDesign,
    entries: entriesOf("@n-uf/docking", dockingPkg),
    live: PARTS.find((p) => p.id === "docking")!.pages,
  },
];

export const docsIndex = {
  path: "/docs/",
  title: "Docs: n-uf motion, placement and docking",
  description: "Reference docs for @n-uf/motion, which moves rects, @n-uf/placement, which fits them, and @n-uf/docking, which works out where panels and toolbars dock.",
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
