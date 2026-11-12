// The markdown steps behind the docs pages (data/docs.ts), which render each package's README at build time.
// Plain JS with no imports beyond node:path, so that scripts/docs-markdown.test.mjs can run them.
//
// remark (the markdown tree, before it becomes HTML):
//   - the first `# h1` leaves the body and becomes the page's h1 (file.data.astro.frontmatter.title); any other h1
//     is made an h2, so a page never has two;
//   - a GitHub alert (`> [!CAUTION]` then a heading and text) becomes a styled <aside class="docs-callout">, its
//     heading a plain title (not a heading, so it is neither in the contents list nor has an id).
// rehype (the HTML tree):
//   - relative links and images point at the repository on GitHub (main), links to this site become site-relative;
//   - a table is wrapped in a block that scrolls on its own, and a table whose header row is empty (`| | |`) loses it.
import { posix } from "node:path";

const text = (node) => (typeof node.value === "string" ? node.value : (node.children ?? []).map(text).join(""));

/** The remark plugin. */
export function remarkDocs() {
  return (tree, file) => {
    const body = tree.children;
    const first = body.findIndex((n) => n.type === "heading" && n.depth === 1);
    if (first >= 0) {
      file.data.astro ??= {};
      file.data.astro.frontmatter = { ...file.data.astro.frontmatter, title: text(body[first]).trim() };
      body.splice(first, 1);
    }
    const walk = (node) => {
      for (const child of node.children ?? []) {
        if (child.type === "heading" && child.depth === 1) child.depth = 2;
        if (child.type === "blockquote") callout(child);
        walk(child);
      }
    };
    walk(tree);
  };
}

const KINDS = ["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"];

function callout(quote) {
  const [marker, ...rest] = quote.children;
  const m = marker?.type === "paragraph" ? text(marker).trim().match(/^\[!([A-Z]+)\]$/) : null;
  if (!m || !KINDS.includes(m[1])) return;
  quote.children = rest;
  for (const child of rest) {
    if (child.type !== "heading") continue;
    // the callout's own title: a paragraph, whatever its level in the README
    child.data = { ...child.data, hName: "p", hProperties: { className: ["docs-callout-title"] } };
  }
  quote.data = { ...quote.data, hName: "aside", hProperties: { className: ["docs-callout", `docs-callout-${m[1].toLowerCase()}`], role: "note" } };
}

/**
 * Where a README's link goes. `dir` is the README's folder in the repository ("packages/motion"), `repo` the
 * repository's URL, `site` this site's origin. Returns the href, or null to leave it as it is.
 * @param {string} href
 * @param {{ dir: string, repo: string, site: string, image?: boolean }} o
 */
export function rewriteHref(href, { dir, repo, site, image = false }) {
  if (href === "" || href.startsWith("#")) return null;
  if (/^(?:https?:)?\/\//i.test(href)) {
    const own = href.match(/^(?:https?:)?\/\/([^/?#]+)([\s\S]*)$/i);
    if (own && own[1].toLowerCase() === new URL(site).host) {
      const rest = own[2];
      return rest === "" || !/^[/?#]/.test(rest) ? "/" : rest.startsWith("/") ? rest : `/${rest}`;
    }
    return null;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return null; // mailto:, tel:, data:
  const [, path, tail] = href.match(/^([^?#]*)([?#][\s\S]*)?$/);
  const resolved = posix.normalize(path.startsWith("/") ? path.slice(1) : posix.join(dir, path));
  if (resolved.startsWith("..")) throw new Error(`docs: "${href}" leaves the repository (from ${dir})`);
  const url = `${repo}/blob/main/${resolved === "." ? "" : resolved}`;
  return image ? `${url}${tail?.startsWith("?") ? `${tail}&raw=true` : `?raw=true${tail ?? ""}`}` : `${url}${tail ?? ""}`;
}

/** The rehype plugin: `rehypeDocs({ dir, repo, site })`. */
export function rehypeDocs(options) {
  const walk = (node) => {
    if (node.type === "element") {
      const p = node.properties ?? (node.properties = {});
      if (node.tagName === "a" && typeof p.href === "string") p.href = rewriteHref(p.href, options) ?? p.href;
      if (node.tagName === "img" && typeof p.src === "string") p.src = rewriteHref(p.src, { ...options, image: true }) ?? p.src;
    }
    if (node.children) {
      node.children = node.children.map((child) => {
        walk(child);
        return child.type === "element" && child.tagName === "table" ? wrapTable(child) : child;
      });
    }
  };
  return () => (tree) => walk(tree);
}

const el = (tagName, properties, children) => ({ type: "element", tagName, properties, children });

function wrapTable(table) {
  const head = table.children.find((c) => c.type === "element" && c.tagName === "thead");
  const empty = head && text(head).trim() === "";
  if (empty) table.children = table.children.filter((c) => c !== head);
  const cols = (head?.children.find((c) => c.type === "element")?.children ?? []).filter((c) => c.type === "element").length;
  // a reference table (no header: the API's name in the first column) stacks on a phone; one with headers scrolls
  return empty
    ? el("div", { className: ["docs-table", "docs-api"] }, [table])
    : el("div", { className: ["docs-table", "docs-data"], tabIndex: 0, role: "region", ariaLabel: `Table of ${cols} columns, scrolls sideways` }, [table]);
}
