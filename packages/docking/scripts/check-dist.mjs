// Checks the built package (dist/) after `tsup`:
// - both entries (the model, testing) and their type definitions exist;
// - the JavaScript imports only its own chunks and @n-uf/placement (never @n-uf/motion: the testing entry's landing
//   check is a type, erased from the JavaScript);
// - no file touches a host global, and no type mentions a DOM type;
// - Node can import both entries, with @n-uf/placement read from its own dist/ (built first), and a window lays out,
//   a drop's preview is its result and the conformance rows pass on the reference host from the built code.
// Exits 1 with a list of problems.

import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "..", "dist");
const placementDist = join(here, "..", "..", "placement", "dist");
const ENTRIES = ["index", "testing"];
const DEPENDENCY = /^@n-uf\/placement(\/[a-z]+)?$/;
const HOST = /\b(requestAnimationFrame|cancelAnimationFrame|performance|setTimeout|clearTimeout|window|globalThis|matchMedia)\b/;
const DOM_TYPES = /\b(Window|Document|Element|HTMLElement|Event|PointerEvent|MouseEvent|DOMRect)\b/;
const problems = [];

const specifiersOf = (code) =>
  [
    ...code.matchAll(/(?:^|[\s;])(?:import|export)\s[^"';]*?from\s*["']([^"']+)["']/g),
    ...code.matchAll(/(?:^|[\s;])import\s*["']([^"']+)["']/g),
    ...code.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g),
  ].map((m) => m[1]);

const seen = new Set();
const visit = (name) => {
  if (seen.has(name)) return;
  seen.add(name);
  const path = join(dist, name);
  if (!existsSync(path)) {
    problems.push(`${name}: missing`);
    return;
  }
  const code = readFileSync(path, "utf8");
  for (const spec of specifiersOf(code)) {
    if (spec.startsWith("./")) visit(spec.slice(2));
    else if (!DEPENDENCY.test(spec)) problems.push(`${name}: imports ${spec}; the package depends on @n-uf/placement alone`);
  }
  const host = code.replace(/(["'`])(?:(?!\1)[^\\\n]|\\.)*\1/g, '""').match(HOST);
  if (host) problems.push(`${name}: reaches the host through ${host[0]}`);
};
for (const entry of ENTRIES) visit(`${entry}.js`);

for (const entry of ENTRIES) {
  const types = join(dist, `${entry}.d.ts`);
  if (!existsSync(types)) {
    problems.push(`${entry}.d.ts: missing`);
    continue;
  }
  const code = readFileSync(types, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  const match = code.match(DOM_TYPES);
  if (match) problems.push(`${entry}.d.ts: uses the DOM type ${match[0]}`);
}

if (problems.length === 0 && !existsSync(join(placementDist, "index.js"))) problems.push("@n-uf/placement has no dist/: build it first");

if (problems.length === 0) {
  try {
    // The built code imports @n-uf/placement by name: read it from placement's own build.
    const base = pathToFileURL(placementDist).href;
    registerHooks({
      resolve(spec, ctx, next) {
        const m = /^@n-uf\/placement(?:\/([a-z]+))?$/.exec(spec);
        return m ? { url: `${base}/${m[1] ?? "index"}.js`, shortCircuit: true } : next(spec, ctx);
      },
    });
    const m = {};
    for (const entry of ENTRIES) m[entry] = await import(pathToFileURL(join(dist, `${entry}.js`)).href);
    const form = (kind, natural, cross, extra = {}) => ({ kind, main: { min: natural, natural, ...extra }, cross: { natural: cross } });
    const open = form("open", 200, 240, { grows: true });
    const state = {
      stage: { x: 0, y: 0, width: 800, height: 500 },
      edges: [{ id: "left", side: "left", ring: 0, accepts: ["panel"], items: ["a"], cross: { min: 100, max: 400 } }],
      items: { a: { id: "a", kind: "panel", used: 1, forms: { column: [open] } }, b: { id: "b", kind: "panel", used: 2, forms: { column: [open] } } },
      floats: [],
      floatKinds: [],
    };
    const solved = m.index.solve(state);
    if (solved.content.x !== 240 || solved.items.a?.edge !== "left") problems.push("index.js: the left column didn't take its panel's width");
    const drops = m.index.targets(state, "b");
    if (drops.length !== 2 || drops.some((t) => JSON.stringify(m.index.solve(t.after({ x: 0, y: 0 }).state)) !== JSON.stringify(t.after({ x: 0, y: 0 }).layout))) problems.push("index.js: a column of one panel doesn't have two gaps whose preview is the result");
    // The conformance rows run on the in-memory host from the built code, and a wrong expectation fails. Rows that name
    // a rule the library lacks (`lacks`) are expected to fail until it lands; rows that need a drag intent
    // (`requires.intent`) are skipped on a host without one.
    const t = m.testing;
    if (!Array.isArray(t.CASES) || t.CASES.length < 80) problems.push(`testing.js: ${t.CASES?.length} rows`);
    const failed = t.CASES.filter((row) => !row.lacks && !row.requires?.intent && !t.runCase(row, t.createReferenceHost()).ok).map((row) => row.id);
    if (failed.length > 0) problems.push(`testing.js: rows fail on the reference host: ${failed.slice(0, 5).join(", ")}`);
    const broken = { ...t.CASES[0], expectLayout: { items: { pages: { rect: { x: 9999 } } } } };
    if (t.runCase(broken, t.createReferenceHost()).ok) problems.push("testing.js: a wrong expectation passed");
  } catch (error) {
    problems.push(`import: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (problems.length > 0) {
  console.error(`dist check failed:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("dist check: ok");
