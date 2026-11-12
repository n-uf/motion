// Checks the built package (dist/) after `tsup`:
// - every entry (the root, clock, signals, values, gestures, testing, drag, browser) and
//   its type definitions exist;
// - the JavaScript imports only its own chunks and alien-signals/system;
// - the signal graph is in exactly one file, so importing two entries gives
//   one graph, not two that can't see each other;
// - the core entries (and every chunk they load) touch no host global
//   (requestAnimationFrame, performance, setTimeout, window, document,
//   globalThis, matchMedia), and their types mention no DOM type;
// - Node can import every entry, and a spring on a frame loop on the fake
//   clock settles: the built core runs with no host at all.
// Exits 1 with a list of problems.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const dist = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const CORE = ["index", "clock", "signals", "values", "gestures", "testing", "drag"];
const ENTRIES = [...CORE, "browser"];
const ALLOWED = /^alien-signals\/system$/;
const HOST = /\b(requestAnimationFrame|cancelAnimationFrame|performance|setTimeout|clearTimeout|window|document|globalThis|matchMedia)\b/;
const DOM_TYPES = /\b(Window|Document|Element|HTMLElement|Event|PointerEvent|MouseEvent|WheelEvent|DOMHighResTimeStamp|FrameRequestCallback|MediaQueryList)\b/;
// A string only the signals module has (its effect-loop error).
const SIGNALS_MARK = "kept re-triggering each other";
const problems = [];

const specifiersOf = (code) =>
  [
    ...code.matchAll(/(?:^|[\s;])(?:import|export)\s[^"';]*?from\s*["']([^"']+)["']/g),
    ...code.matchAll(/(?:^|[\s;])import\s*["']([^"']+)["']/g),
    ...code.matchAll(/import\(\s*["']([^"']+)["']\s*\)/g),
  ].map((m) => m[1]);

/** The entry file and every local chunk it reaches. */
function closure(file) {
  const seen = new Set();
  const visit = (name) => {
    if (seen.has(name)) return;
    seen.add(name);
    const path = join(dist, name);
    if (!existsSync(path)) {
      problems.push(`${name}: missing`);
      return;
    }
    for (const spec of specifiersOf(readFileSync(path, "utf8"))) {
      if (spec.startsWith("./")) visit(spec.slice(2));
      else if (!ALLOWED.test(spec)) problems.push(`${name}: imports ${spec}, not an allowed dependency`);
    }
  };
  visit(file);
  return [...seen];
}

for (const entry of ENTRIES) closure(`${entry}.js`);

const coreFiles = new Set(CORE.flatMap((entry) => closure(`${entry}.js`)));
for (const name of coreFiles) {
  const path = join(dist, name);
  if (!existsSync(path)) continue;
  const match = readFileSync(path, "utf8").match(HOST);
  if (match) problems.push(`${name} (core): reaches the host through ${match[0]}`);
}

if (existsSync(dist)) {
  const withSignals = readdirSync(dist).filter(
    (name) => name.endsWith(".js") && readFileSync(join(dist, name), "utf8").includes(SIGNALS_MARK),
  );
  if (withSignals.length !== 1) {
    problems.push(`the signal graph is in ${withSignals.length} files (${withSignals.join(", ")}), expected 1`);
  }
}

for (const entry of ENTRIES) {
  const types = join(dist, `${entry}.d.ts`);
  if (!existsSync(types)) {
    problems.push(`${entry}.d.ts: missing`);
    continue;
  }
  if (CORE.includes(entry)) {
    // Types, not prose: the docs may name the DOM events a host copies from.
    const code = readFileSync(types, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const match = code.match(DOM_TYPES);
    if (match) problems.push(`${entry}.d.ts: uses the DOM type ${match[0]}`);
  }
}
if (existsSync(join(dist, "index.d.ts"))) {
  const dts = readFileSync(join(dist, "index.d.ts"), "utf8");
  for (const name of ["createFrameLoop", "createFakeClock", "signal", "springValue", "createRecognizer", "createFrameCoalescer"]) {
    if (!dts.includes(name)) problems.push(`index.d.ts: no ${name}`);
  }
}

if (problems.length === 0) {
  try {
    const modules = {};
    for (const entry of ENTRIES) modules[entry] = await import(pathToFileURL(join(dist, `${entry}.js`)).href);
    if (typeof modules.browser.createBrowserClock !== "function") problems.push("browser.js: no createBrowserClock");
    if (modules.signals.signal !== modules.index.signal) problems.push("signals.js and index.js export different signal()s");
    if (typeof modules.gestures.createRecognizer !== "function") problems.push("gestures.js: no createRecognizer");
    if (typeof modules.testing.checkNoOvershoot !== "function") problems.push("testing.js: no checkNoOvershoot");
    if (typeof modules.drag.createDragIntent !== "function") problems.push("drag.js: no createDragIntent");
    // A drag held still over a slot shows it, and a release there lands on it.
    const slot = { id: "slot", priority: 2, hit: { x: 0, y: 0, width: 200, height: 100 } };
    const intent = modules.drag.createDragIntent({ home: { x: 300, y: 300, width: 100, height: 50 } });
    for (let t = 0; t <= 300; t += 16) intent.update({ x: 100, y: 50 }, t, [slot]);
    if (intent.state.shown?.id !== "slot" || intent.release({ x: 100, y: 50 }, [slot])?.id !== "slot") problems.push("drag.js: a drag held over a slot didn't show and land on it");
    const clock = modules.clock.createFakeClock();
    const loop = modules.clock.createFrameLoop({ clock });
    const value = modules.values.springValue(loop, 0);
    value.set(100);
    clock.runUntilIdle();
    if (value.value !== 100 || loop.active) problems.push(`values.js: a spring didn't settle (value ${value.value})`);
    const rect = modules.values.settleValue(loop, { x: 0, y: 0, width: 100, height: 100 });
    rect.set({ x: 300, y: 0, width: 50, height: 100 });
    clock.runUntilIdle();
    if (rect.value.x !== 300 || rect.value.width !== 50 || loop.active) problems.push(`values.js: a settle didn't settle (x ${rect.value.x})`);
  } catch (error) {
    problems.push(`import: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (problems.length > 0) {
  console.error(`dist check failed:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log("dist check: ok");
