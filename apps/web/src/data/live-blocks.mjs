// Links into a future page: in a markdown body, {{live:/path/}}…{{/live}} wraps a sentence that should show only
// once /path/ is built. So a link line can merge together with a draft page and appear on the day the draft goes
// live (drafts are flipped by hand until a publish workflow is added), with no second commit. In production a draft
// is not built, so its block is removed; in dev and Vercel previews drafts are built, so the block stays.
//
// This file is plain JS with no Astro imports so that scripts/live-blocks.test.mjs can run it; src/data/live.ts
// adds the real "is this path built" lookup and is what the pages call.
//
// Build errors (each names `where`, the file, and the reason): a target that is no page at all; a nested block;
// a stray {{live: or {{/live}}; a block that spans paragraphs (or any other block element); a block in a heading
// (it would leave an empty heading, and the table of contents would show its raw markers).

const MARK = /\{\{live:([^{}]*)\}\}|\{\{\/live\}\}/g;
const BLOCK_TAG = /<\/?(?:p|ul|ol|li|h[1-6]|blockquote|pre|table|figure|div|hr)\b/i;
const SITE_PATH = /^\/(?:[a-z0-9-]+\/)*$/;

/**
 * The HTML with each {{live:/path/}}…{{/live}} block resolved.
 * @param {string} html the rendered markdown body
 * @param {(path: string) => "built" | "unbuilt" | "none"} status "built": a page exists in this build (live, or a
 *   draft shown in dev/preview); "unbuilt": a page whose draft is hidden in this build; "none": no such page at all
 * @param {string} where the file name, for error messages
 * @returns {string}
 */
export function applyLiveBlocks(html, status, where) {
  const fail = (reason) => { throw new Error(`${where}: ${reason}`); };
  let out = "", pos = 0, open = null, removed = false;

  for (const m of html.matchAll(MARK)) {
    if (m[0] !== "{{/live}}") {
      if (open) fail(`nested live block: {{live:${m[1]}}} starts inside the one for ${open.path}`);
      let path = m[1].trim();
      if (path !== "" && !path.endsWith("/")) path += "/";
      if (!SITE_PATH.test(path)) fail(`{{live:${m[1]}}} is not a site path like /blog/some-page/`);
      const before = html.slice(0, m.index);
      const lastOpenH = Math.max(...[...before.matchAll(/<h[1-6]\b/gi)].map((x) => x.index), -1);
      const lastCloseH = Math.max(...[...before.matchAll(/<\/h[1-6]>/gi)].map((x) => x.index), -1);
      if (lastOpenH > lastCloseH) fail(`the live block for ${path} is inside a heading: put it in a paragraph or list item`);
      open = { path, start: m.index, end: m.index + m[0].length };
      continue;
    }
    if (!open) fail("stray {{/live}} with no {{live:...}} before it");
    const inner = html.slice(open.end, m.index);
    const tag = inner.match(BLOCK_TAG);
    if (tag) fail(`the live block for ${open.path} spans more than one paragraph (it contains ${tag[0]}>): keep it inside one sentence`);
    const unbalanced = unbalancedInlineTag(inner);
    if (unbalanced) fail(`the live block for ${open.path} cuts through formatting (${unbalanced}): put the markers inside or outside the whole **bold**, *italic* or link, not across its edge`);
    const s = status(open.path);
    if (s === "none") fail(`the live block target ${open.path} is no page: not a use case, an article or a fixed page of this site`);
    out += html.slice(pos, open.start);
    pos = m.index + m[0].length;
    if (s === "built") {
      out += inner;
    } else {
      removed = true;
      ({ out, pos } = closeGap(html, pos, out));
    }
    open = null;
  }
  if (open) fail(`{{live:${open.path}}} is never closed with {{/live}}`);
  out += html.slice(pos);
  if (/\{\{\s*\/?\s*live/i.test(out)) fail("stray {{live: or {{/live}} (not a complete {{live:/path/}}…{{/live}} pair)");
  return removed ? dropEmpty(out) : out;
}

const VOID_TAGS = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);

/**
 * Does the HTML of a block close a tag it did not open, or leave one open? ("**Intro {{live:/x/}}see** more.{{/live}}"
 * renders as <strong>Intro <span…>see</strong> more., and the marker would wrap half of it.) Returns what is wrong, or
 * null when the tags nest properly.
 * @param {string} html
 * @returns {string | null}
 */
function unbalancedInlineTag(html) {
  const stack = [];
  for (const m of html.matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/?)>/g)) {
    const [, closing, name, selfClosing] = m;
    const tag = name.toLowerCase();
    if (VOID_TAGS.has(tag) || selfClosing) continue;
    if (!closing) {
      stack.push(tag);
    } else if (stack.at(-1) === tag) {
      stack.pop();
    } else {
      return `</${tag}> closes a tag that was opened outside the block`;
    }
  }
  return stack.length > 0 ? `<${stack.at(-1)}> is opened inside the block and closed outside it` : null;
}

const BLOCK_OPENING_TAG = /<(?:p|li|ul|ol|h[1-6]|td|th|div|blockquote)(?:\s[^>]*)?>/i;
// characters after which a space would look wrong: the start of a bracket or a quotation
const OPENING_PUNCTUATION = /[\s(\[{“‘"']/;

/**
 * What is left around a block that was just removed (`out` is the HTML before it, `pos` where the HTML after it starts):
 * the space after the block goes with it, and the space before it too when a closing tag or the end follows. When text
 * follows and no space came before the block ("one.{{live:…}} two.{{/live}} Three."), one space is kept between the
 * two sentences, so they don't run together. Inline tags don't count as text: "(<em>{{live:…}}A{{/live}} two</em>)"
 * stays "(<em>two</em>)", not "( two)"; and no space is added at the start of a paragraph or list item.
 * @param {string} html
 * @param {number} pos
 * @param {string} out
 * @returns {{ out: string, pos: number }}
 */
function closeGap(html, pos, out) {
  const start = pos;
  while (pos < html.length && /\s/.test(html[pos])) pos++;
  if (pos >= html.length || html.startsWith("</", pos)) return { out: out.trimEnd(), pos };
  if (pos > start && out !== "") {
    const tags = out.match(/(?:<[^>]*>)+$/)?.[0] ?? "";
    const lastText = out.slice(0, out.length - tags.length).slice(-1);
    if (lastText !== "" && !OPENING_PUNCTUATION.test(lastText) && !BLOCK_OPENING_TAG.test(tags)) out += " ";
  }
  return { out, pos };
}

/**
 * A paragraph or list item that was only a removed block is left empty: drop it, and then a list item (a loose list
 * wraps items in <p>) or a whole list that this leaves empty, until nothing more changes.
 * @param {string} html
 * @returns {string}
 */
function dropEmpty(html) {
  let out = html;
  for (let prev = ""; prev !== out; ) {
    prev = out;
    out = out.replace(/<(p|li|ul|ol)(?:\s[^>]*)?>\s*<\/\1>\n?/g, "");
  }
  return out;
}
