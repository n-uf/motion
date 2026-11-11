// Tests for scripts/check-links.mjs on small dist folders built by the test (run: npm test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const script = join(dirname(fileURLToPath(import.meta.url)), "check-links.mjs");

/** a dist with / and /a/ built, plus a page /links/ whose body is `anchors` */
function dist(anchors) {
  const d = mkdtempSync(join(tmpdir(), "check-links-"));
  const page = (path, body) => {
    mkdirSync(join(d, path), { recursive: true });
    writeFileSync(join(d, path, "index.html"), `<!doctype html><body>${body}</body>`);
  };
  page("", "");
  page("a", "");
  page("links", anchors);
  return d;
}
const check = (d) => spawnSync("node", [script, d], { encoding: "utf8" });
const a = (href) => `<a href="${href}">x</a>`;

test("absolute links to this site's own host that resolve pass, and count as internal", () => {
  const r = check(dist([
    "https://motion.n-uf.com/", "https://motion.n-uf.com/a/", "https://motion.n-uf.com/a/#top",
    "https://motion.n-uf.com", "https://motion.n-uf.com?x=1", "http://motion.n-uf.com/a", "//motion.n-uf.com/a/",
  ].map(a).join("")));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /ok \(3 pages, \d+ internal links\)/);
});

test("an absolute link to this site's own host with no built page fails, naming the page and the link", () => {
  const r = check(dist(a("https://motion.n-uf.com/draft-page/")));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /\/links\/ -> \/draft-page\//);
});

test("links to other hosts are ignored, including look-alike hosts", () => {
  const r = check(dist([
    "https://example.com/nope/", "https://motion.n-uf.com.evil.example/nope/", "https://notmotion.n-uf.com/nope/",
    "https://docs.motion.n-uf.com/nope/", "//example.com/nope/", "mailto:a@b.c",
  ].map(a).join("")));
  assert.equal(r.status, 0, r.stderr);
});

test("the share images named by og:image and twitter:image must be built files", () => {
  const meta = (name, url) => `<meta property="${name}" content="${url}">`;
  const d = dist(meta("og:image", "https://motion.n-uf.com/og/x.png") + meta("twitter:image", "https://motion.n-uf.com/og/x.png"));
  const r = check(d);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /\/links\/ -> image \/og\/x\.png/);
  writeFileSync(join(d, "x.png"), "");
  mkdirSync(join(d, "og"), { recursive: true });
  writeFileSync(join(d, "og", "x.png"), "");
  assert.equal(check(d).status, 0);
});

test("relative-to-root links still work: a built one passes, a missing one fails", () => {
  assert.equal(check(dist(a("/a/") + a("/a"))).status, 0);
  const r = check(dist(a("/missing/")));
  assert.equal(r.status, 1);
  assert.match(r.stderr, /\/links\/ -> \/missing\//);
});
