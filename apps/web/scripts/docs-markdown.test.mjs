// Tests for src/data/docs-markdown.mjs, the steps that render a README as a docs page (run: npm test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import { remarkDocs, rehypeDocs, rewriteHref } from "../src/data/docs-markdown.mjs";

const o = { dir: "packages/motion", repo: "https://github.com/n-uf/motion", site: "https://motion.n-uf.com" };

test("relative links go to the repository on main, from the README's folder", () => {
  assert.equal(rewriteHref("./bench/RESULTS.md", o), "https://github.com/n-uf/motion/blob/main/packages/motion/bench/RESULTS.md");
  assert.equal(rewriteHref("LICENSE", o), "https://github.com/n-uf/motion/blob/main/packages/motion/LICENSE");
  assert.equal(rewriteHref("../placement/README.md#a", o), "https://github.com/n-uf/motion/blob/main/packages/placement/README.md#a");
  assert.equal(rewriteHref("/apps/web/", o), "https://github.com/n-uf/motion/blob/main/apps/web/");
  assert.throws(() => rewriteHref("../../../x", o), /leaves the repository/);
});

test("an image comes as the raw file", () => {
  assert.equal(rewriteHref("./shot.png", { ...o, image: true }), "https://github.com/n-uf/motion/blob/main/packages/motion/shot.png?raw=true");
});

test("links to this site are site-relative; anchors, other hosts and mail stay as they are", () => {
  assert.equal(rewriteHref("https://motion.n-uf.com", o), "/");
  assert.equal(rewriteHref("https://motion.n-uf.com/drag-intent/#x", o), "/drag-intent/#x");
  assert.equal(rewriteHref("https://motion.n-uf.com?a=1", o), "/?a=1");
  for (const href of ["#values", "https://motion.dev", "https://github.com/n-uf/motion/blob/main/x", "mailto:a@b.c"]) assert.equal(rewriteHref(href, o), null, href);
});

const render = async (md) => {
  const p = await createMarkdownProcessor({ smartypants: false, syntaxHighlight: false, remarkPlugins: [remarkDocs], rehypePlugins: [rehypeDocs(o)] });
  return p.render(md);
};

test("the first h1 is the page's; an alert becomes a callout whose title is not a heading", async () => {
  const { code, metadata } = await render("# @n-uf/motion\n\n> [!CAUTION]\n> ## Not yet stable\n>\n> Pin a version.\n\n## One\n\n### Two\n");
  assert.equal(metadata.frontmatter.title, "@n-uf/motion");
  assert.doesNotMatch(code, /<h1/);
  assert.match(code, /<aside class="docs-callout docs-callout-caution" role="note">\s*<p class="docs-callout-title">Not yet stable<\/p>/);
  assert.deepEqual(metadata.headings.map((h) => [h.depth, h.slug]), [[2, "one"], [3, "two"]]);
});

test("the 'Site and live demos' self-link paragraph is dropped; other paragraphs with that link stay", async () => {
  const { code } = await render("# A\n\nSite and live demos: [motion.n-uf.com](https://motion.n-uf.com)\n\nSee [motion.n-uf.com](https://motion.n-uf.com) too.\n\nSite and live demos: [x](https://example.com)\n");
  assert.doesNotMatch(code, /Site and live demos: <a href="\/"/);
  assert.match(code, /See <a href="\/">/);
  assert.match(code, /Site and live demos: <a href="https:\/\/example.com"/);
});

test("a second h1 is made an h2: one h1 per page", async () => {
  const { code } = await render("# A\n\n# B\n");
  assert.doesNotMatch(code, /<h1/);
  assert.match(code, /<h2 id="b">B<\/h2>/);
});

test("links and tables", async () => {
  const { code } = await render("[a](./x.md) and [site](https://motion.n-uf.com/drag-intent/)\n\n| | |\n|---|---|\n| `f()` | does f |\n\n| Code | Says |\n|---|---|\n| a | b |\n");
  assert.match(code, /href="https:\/\/github.com\/n-uf\/motion\/blob\/main\/packages\/motion\/x.md"/);
  assert.match(code, /href="\/drag-intent\/"/);
  assert.equal([...code.matchAll(/<div class="docs-table docs-api">/g)].length, 1);
  assert.equal([...code.matchAll(/<div class="docs-table docs-data"/g)].length, 1);
  assert.equal([...code.matchAll(/<thead>/g)].length, 1, "the empty header row is dropped, the real one kept");
});
