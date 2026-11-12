// Checks the built package (dist/) after `tsup`:
// - every entry (the root, tiling, dock, toolbar, targets) and its type definitions exist;
// - the JavaScript imports only its own chunks (no dependencies at all, @n-uf/motion included);
// - no file touches a host global, and no type mentions a DOM type;
// - Node can import every entry, and a desk lays out, a host collapses and a drop lands from the built code.
// Exits 1 with a list of problems.

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const ENTRIES = ["index", "tiling", "dock", "toolbar", "targets"];
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
    if (typeof m.index.positionPopup !== "function") problems.push("index.js: no positionPopup");
    const tree = m.tiling.splitLeaf(m.tiling.treeFromOrder([1, 2]), 2, 3, false);
    if (m.tiling.layoutTree(tree, { x: 0, y: 0, width: 1006, height: 600 }, 6).size !== 3) problems.push("tiling.js: a tree of three didn't lay out three tiles");
    const desk = m.dock.createDesk({ panels: [{ id: 1, title: "Files", natural: 160 }, { id: 2, title: "History", natural: 160 }], start: { left: [1], right: [], bottom: [2] } });
    if (desk.constructions.length !== 9) problems.push(`dock.js: ${desk.constructions.length} constructions, expected 9`);
    const c = desk.constructionOf("dockTear");
    const l = c.layout(c.initial([1]), { width: 960, height: 420 }, m.dock.DEFAULT_OPTIONS);
    if (l.items.get("panel:2")?.look !== "header") problems.push("dock.js: the bottom dock didn't fold on a short stage");
    const a = m.toolbar.arrangement({ top: { start: ["a", "b"] } });
    const host = m.toolbar.layoutHost(a.top, "top", { length: 100, thickness: 34, lead: 0, tail: 0 }, (_g, _v, col) => ({ along: col ? 30 : 80, across: 28 }));
    if (host.overflow[0] !== "b") problems.push("toolbar.js: the trailing group didn't collapse first");
    const input = { c, s0: m.dock.liftOut(c.initial([1]), "panel:1"), key: "panel:1", size: { width: 1200, height: 700 }, opt: m.dock.DEFAULT_OPTIONS };
    const float = m.targets.deskTargets(input).find((t) => t.id === "float");
    const drop = float && m.targets.deskDrop(input, float, { x: 600, y: 300 }, { x: 20, y: 10 });
    if (!drop || drop.slot.x !== 580 || drop.slot.y !== 290) problems.push("targets.js: a float drop didn't land where it was let go");
  } catch (error) {
    problems.push(`import: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (problems.length > 0) {
  console.error(`dist check failed:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("dist check: ok");
