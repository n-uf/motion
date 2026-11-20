// Checks the built package (dist/) after `tsup`:
// - every entry (the root, stack, tiling, popup) and its type definitions exist;
// - the JavaScript imports only its own chunks (no dependencies at all, @n-uf/motion included);
// - no file touches a host global, and no type mentions a DOM type;
// - Node can import every entry, and a stack gives way, a gap fits, the cut follows its order and a pane splits from the
//   built code.
// Exits 1 with a list of problems.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const ENTRIES = ["index", "stack", "tiling", "popup"];
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
    else problems.push(`${name}: imports ${spec}; the package has no dependencies`);
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

if (problems.length === 0) {
  try {
    const m = {};
    for (const entry of ENTRIES) m[entry] = await import(pathToFileURL(join(dist, `${entry}.js`)).href);
    if (typeof m.popup.positionPopup !== "function") problems.push("popup.js: no positionPopup");
    const form = (kind, natural, cross, extra = {}) => ({ kind, main: { min: natural, natural, ...extra }, cross: { natural: cross } });
    const item = (id, used) => ({ id, used, forms: [form("open", 200, 240, { grows: true }), form("header", 28, 240), form("rail", 30, 30), form("menu", 0, 0)] });
    const stackFit = m.stack.fitStack({ axis: "column", length: 300, cross: { min: 100, max: 400 }, items: [item("a", 1), item("b", 2)] });
    if (stackFit.items[0]?.kind !== "header" || stackFit.items[1]?.kind !== "open") problems.push("stack.js: the panel used longest ago didn't fold first");
    const gaps = m.stack.stackGaps({ axis: "column", length: 600, cross: { min: 100, max: 400 }, items: [item("a", 1)] }, item("b", 2));
    if (gaps.length !== 2 || gaps.some((g) => !g.fits)) problems.push("stack.js: a stack of one item doesn't have two gaps that fit");
    const cut = m.stack.cutEdges({ x: 0, y: 0, width: 800, height: 600 }, [{ id: "top", side: "top", size: 40 }, { id: "left", side: "left", size: 200 }]);
    if (cut.bands.left?.y !== 40 || cut.rest.x !== 200) problems.push("stack.js: the cut didn't follow the band order");
    const t = m.tiling;
    const split = t.dropOnPane(t.splitFromOrder(["a", "b"]), "c", "b", "top");
    const tiles = t.layoutSplit(split, { x: 0, y: 0, width: 800, height: 400 });
    if (tiles.get("c")?.height !== 200 || tiles.get("c")?.x !== 400 || t.paneRegion(tiles.get("a"), { x: 5, y: 200 }) !== "left") problems.push("tiling.js: a drop on a pane's top didn't split it on top");
  } catch (error) {
    problems.push(`import: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (problems.length > 0) {
  console.error(`dist check failed:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("dist check: ok");
