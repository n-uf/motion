// Tests for src/data/links.mjs and src/data/rehype-external-links.mjs (run: npm test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { externalCheck, newTabNote } from "../src/data/links.mjs";
import rehypeExternalLinks from "../src/data/rehype-external-links.mjs";

const isExternal = externalCheck("https://motion.n-uf.com");

test("another host is external, this site, relative links, anchors and mail are not", () => {
  for (const href of ["https://n-uf.com", "https://hypr-tiling.n-uf.com/x/", "http://example.com", "https://github.com/n-uf/motion"]) assert.equal(isExternal(href), true, href);
  for (const href of ["/faq/", "install/", "#a", "https://motion.n-uf.com/faq/", "mailto:a@b.c", "tel:123"]) assert.equal(isExternal(href), false, href);
});

const link = (href, text = "text") => ({ type: "element", tagName: "a", properties: { href }, children: [{ type: "text", value: text }] });
const el = (tagName, ...children) => ({ type: "element", tagName, properties: {}, children });
const run = (...blocks) => {
  const tree = { type: "root", children: blocks };
  rehypeExternalLinks({ isExternal, note: newTabNote })()(tree);
  return tree.children;
};

test("an external link in markdown opens in a new tab with rel noopener, the arrow and a screen-reader note", () => {
  const [[a]] = run(el("p", link("https://n-uf.com", "n-uf"))).map((p) => p.children);
  assert.equal(a.properties.target, "_blank");
  assert.deepEqual(a.properties.rel, ["noopener"]);
  assert.equal(a.children.length, 3);
  assert.equal(a.children[2].children[0].value, " (opens in a new tab)");
});

test("an internal link is left alone", () => {
  const [[a]] = run(el("p", link("/faq/"))).map((p) => p.children);
  assert.equal(a.properties.target, undefined);
  assert.equal(a.children.length, 1);
});

test("in a heading the link opens in a new tab but gets no arrow and no note", () => {
  for (const tag of ["h1", "h2", "h3"]) {
    const [[a]] = run(el(tag, link("https://n-uf.com", "n-uf"))).map((h) => h.children);
    assert.equal(a.properties.target, "_blank", tag);
    assert.equal(a.children.length, 1, tag);
  }
});
