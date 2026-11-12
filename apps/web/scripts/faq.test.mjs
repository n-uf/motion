// The FAQ lists in src/data/faq.ts: 5 questions on the home and 3 to 5 on each other page, each answer 40 to 60 words
// (the length Google lifts into a snippet) with no code block in it, and no mention of the unshipped tiling entry.
// The list is read as text, since the data is TypeScript (run: npm test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../src/data/faq.ts"), "utf8");
const body = src.slice(src.indexOf("export const FAQS"));
const lists = new Map();
let path = "";
for (const line of body.split("\n")) {
  const p = line.match(/^ {2}"([^"]+)": \[/);
  if (p) { path = p[1]; lists.set(path, []); continue; }
  const q = line.match(/^ {6}q: "(.*)",$/);
  if (q) lists.get(path).push({ q: JSON.parse(`"${q[1]}"`) });
  const a = line.match(/^ {6}a: "(.*)",$/);
  if (a) lists.get(path).at(-1).a = JSON.parse(`"${a[1]}"`);
}
const words = (html) => html.replace(/<[^>]+>/g, "").trim().split(/\s+/).length;

test("the five pages each have a list, 5 on the home and 3 to 5 elsewhere", () => {
  assert.deepEqual([...lists.keys()].sort(), ["/", "/desk-layouts/", "/drag-intent/", "/toolbar-groups/", "/window-motion/"]);
  for (const [p, items] of lists) {
    if (p === "/") assert.equal(items.length, 5, p);
    else assert.ok(items.length >= 3 && items.length <= 5, `${p}: ${items.length}`);
  }
});

test("every answer is one paragraph of 40 to 60 words, opening with its answer", () => {
  for (const [p, items] of lists) {
    for (const { q, a } of items) {
      assert.ok(a, `${p}: ${q} has no answer`);
      const n = words(a);
      assert.ok(n >= 40 && n <= 60, `${p}: "${q}" is ${n} words`);
      assert.doesNotMatch(a, /<(p|pre|ul|ol|br)\b/i, `${p}: "${q}" holds more than inline markup`);
    }
  }
});

test("no answer or question mentions tiling", () => {
  for (const [p, items] of lists) for (const { q, a } of items) assert.doesNotMatch(`${q} ${a}`, /tiling/i, `${p}: ${q}`);
});
