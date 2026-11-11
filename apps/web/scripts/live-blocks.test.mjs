// Tests for src/data/live-blocks.mjs ({{live:/path/}}…{{/live}}) with a fake "is this path built" lookup (run: npm test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyLiveBlocks } from "../src/data/live-blocks.mjs";

const PAGES = {
  "/blog/live-page/": "built",
  "/blog/draft-page/": "unbuilt", // a draft in production
  "/faq/": "built",
};
const status = (p) => PAGES[p] ?? "none";
const run = (html) => applyLiveBlocks(html, status, "src/content/blog/host.md");
const fails = (html, re) => assert.throws(() => run(html), (e) => re.test(e.message) && e.message.startsWith("src/content/blog/host.md: "));

const link = '<a href="/blog/draft-page/">the draft</a>';

test("a block whose target is built keeps its inner HTML and loses the markers", () => {
  assert.equal(run('<p>One. {{live:/blog/live-page/}}See <a href="/blog/live-page/">it</a>.{{/live}} Two.</p>'),
    '<p>One. See <a href="/blog/live-page/">it</a>. Two.</p>');
});

test("a fixed page counts as built, and a path without the trailing slash is accepted", () => {
  assert.equal(run("<p>{{live:/faq}}Read the FAQ.{{/live}}</p>"), "<p>Read the FAQ.</p>");
});

test("a draft target: the block is removed, markers and inner link included", () => {
  assert.equal(run(`<p>One. {{live:/blog/draft-page/}}See ${link}.{{/live}} Two.</p>`), "<p>One. Two.</p>");
});

test("a removed block at the end of a paragraph takes the space before it", () => {
  assert.equal(run(`<p>One. {{live:/blog/draft-page/}}See ${link}.{{/live}}</p>`), "<p>One.</p>");
});

test("a paragraph that was only the block is dropped, not left as <p></p>", () => {
  assert.equal(run(`<p>Before.</p>\n<p>{{live:/blog/draft-page/}}See ${link}.{{/live}}</p>\n<p>After.</p>`),
    "<p>Before.</p>\n<p>After.</p>");
});

test("a list item that was only the block is dropped too", () => {
  assert.equal(run(`<ul>\n<li>A</li>\n<li>{{live:/blog/draft-page/}}${link}{{/live}}</li>\n</ul>`), "<ul>\n<li>A</li>\n</ul>");
});

test("several blocks in one page are resolved one by one", () => {
  assert.equal(run(`<p>{{live:/blog/live-page/}}A.{{/live}} {{live:/blog/draft-page/}}B.{{/live}} C.</p>`), "<p>A. C.</p>");
});

test("a block may span lines inside one paragraph", () => {
  assert.equal(run("<p>{{live:/blog/live-page/}}one\ntwo{{/live}}</p>"), "<p>one\ntwo</p>");
});

test("a removed block with no space before it and text after keeps one space between the sentences", () => {
  assert.equal(run(`<p>One.{{live:/blog/draft-page/}} See ${link}.{{/live}} Two.</p>`), "<p>One. Two.</p>");
  assert.equal(run(`<li>Split it by you.{{live:/blog/draft-page/}} ${link} tells you how.{{/live}} Count the pages.</li>`),
    "<li>Split it by you. Count the pages.</li>");
  // and not at the start of a block, where there is nothing to separate
  assert.equal(run(`<p>{{live:/blog/draft-page/}}See ${link}.{{/live}} Two.</p>`), "<p>Two.</p>");
});

test("a block that cuts through formatting fails the build: a tag opened or closed outside it", () => {
  // "**Intro {{live:/x/}}see** more.{{/live}}"
  fails("<p><strong>Intro <a href=\"/faq/\">{{live:/blog/live-page/}}see</a></strong> more.{{/live}}</p>", /cuts through formatting/);
  fails("<p><strong>Intro {{live:/blog/live-page/}}see</strong> more.{{/live}}</p>", /<\/strong> closes a tag that was opened outside the block/);
  fails("<p>Intro {{live:/blog/live-page/}}see <em>more.{{/live}}</em></p>", /<em> is opened inside the block and closed outside it/);
  fails("<p>{{live:/blog/draft-page/}}a <code>b{{/live}} c</code></p>", /cuts through formatting/);
});

test("formatting that opens and closes inside the block, and void tags, are fine", () => {
  assert.equal(run('<p>One. {{live:/blog/draft-page/}}See <strong>this <em>page</em></strong>, <a href="/blog/draft-page/">it</a>, <code>x</code><br>or an <img src="a.png">.{{/live}} Two.</p>'), "<p>One. Two.</p>");
  assert.equal(run("<p>{{live:/blog/live-page/}}<strong>All bold</strong>{{/live}}</p>"), "<p><strong>All bold</strong></p>");
});

test("a removed block right after an opening inline tag leaves no visible space there", () => {
  assert.equal(run("<p>(<em>{{live:/blog/draft-page/}}A.{{/live}} two</em>)</p>"), "<p>(<em>two</em>)</p>");
  assert.equal(run("<p>“<strong>{{live:/blog/draft-page/}}A.{{/live}} two</strong>”</p>"), "<p>“<strong>two</strong>”</p>");
  // after a sentence the space is kept, whatever inline tag the block sits in
  assert.equal(run("<p>One.<em>{{live:/blog/draft-page/}}A.{{/live}} two</em></p>"), "<p>One.<em> two</em></p>");
  assert.equal(run("<p><strong>One.</strong>{{live:/blog/draft-page/}} A.{{/live}} Two.</p>"), "<p><strong>One.</strong> Two.</p>");
  // and none at the start of a paragraph or list item
  assert.equal(run("<ul>\n<li><em>{{live:/blog/draft-page/}}A.{{/live}} Two.</em></li>\n</ul>"), "<ul>\n<li><em>Two.</em></li>\n</ul>");
});

test("html with no block comes back unchanged, empty paragraphs included", () => {
  const html = "<p>Plain.</p>\n<p></p>\n";
  assert.equal(run(html), html);
});

test("a target that is no page at all fails, built or not", () => {
  fails("<p>{{live:/blog/nope/}}x{{/live}}</p>", /\/blog\/nope\/ is no page/);
});

test("a target that isn't a site path fails", () => {
  fails("<p>{{live:https://example.com/}}x{{/live}}</p>", /not a site path/);
  fails("<p>{{live:}}x{{/live}}</p>", /not a site path/);
  fails("<p>{{live:/Blog/X y/}}x{{/live}}</p>", /not a site path/);
});

test("a nested block fails", () => {
  fails("<p>{{live:/blog/live-page/}}a {{live:/faq/}}b{{/live}} c{{/live}}</p>", /nested/);
});

test("a stray {{/live}} fails", () => {
  fails("<p>text{{/live}}</p>", /stray \{\{\/live\}\}/);
  fails("<p>{{live:/faq/}}a{{/live}}{{/live}}</p>", /stray \{\{\/live\}\}/);
});

test("a {{live:}} never closed fails", () => {
  fails("<p>{{live:/faq/}}text</p>", /never closed/);
});

test("a malformed marker fails as stray", () => {
  fails("<p>{{live:/faq/}text{{/live}}</p>", /stray|never closed|not a site path/);
  fails("<p>{{ live:/faq/ }}text</p>", /stray/);
});

test("a block that spans paragraphs fails", () => {
  fails("<p>{{live:/blog/live-page/}}one</p>\n<p>two{{/live}}</p>", /spans more than one paragraph/);
});

test("a block that contains a list or a heading fails", () => {
  fails("<p>{{live:/faq/}}x<ul><li>y</li></ul>{{/live}}</p>", /spans more than one paragraph/);
  fails("<h2>{{live:/faq/}}x</h2><p>y{{/live}}</p>", /inside a heading|spans more than one paragraph/);
});

test("a block inside a heading fails, built or not (an empty heading, raw markers in the table of contents)", () => {
  fails('<h2 id="a">{{live:/faq/}}Read the FAQ{{/live}}</h2>', /inside a heading/);
  fails("<h3>Next {{live:/blog/draft-page/}}step{{/live}}</h3>", /inside a heading/);
  // after a closed heading, a block in the next paragraph is fine
  assert.equal(run("<h2>Title</h2>\n<p>{{live:/faq/}}Read the FAQ.{{/live}}</p>"), "<h2>Title</h2>\n<p>Read the FAQ.</p>");
});

test("a loose list item (<li><p>…</p></li>) that was only a removed block goes, and so does a list left empty", () => {
  assert.equal(run(`<ul>\n<li>\n<p>Keep.</p>\n</li>\n<li>\n<p>{{live:/blog/draft-page/}}See ${link}.{{/live}}</p>\n</li>\n</ul>`),
    "<ul>\n<li>\n<p>Keep.</p>\n</li>\n</ul>");
  assert.equal(run(`<p>Before.</p>\n<ul>\n<li>{{live:/blog/draft-page/}}See ${link}.{{/live}}</li>\n</ul>\n<p>After.</p>`),
    "<p>Before.</p>\n<p>After.</p>");
});
