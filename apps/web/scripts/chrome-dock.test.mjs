// The window chrome's dock state (src/demos/chrome-dock.ts) against the real @n-uf/docking: the arrangement a page
// declares maps to a dock state and back, groups give way down their forms (row, icons, grip and », the » menu) by
// priority and then by use, the menu's and the keys' moves come from the library, the stored form round-trips, and an
// arrangement stored before the chrome ran on docking is migrated or dropped (run: npm test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

// The packages and the site are TypeScript with extensionless relative imports (as the bundler takes them): node strips
// the types, and this resolves `./x` to `./x.ts` or `./x/index.ts`.
registerHooks({
  resolve(spec, ctx, next) {
    if (spec.startsWith(".") && !/\.[cm]?[jt]s$/.test(spec) && ctx.parentURL?.endsWith(".ts")) {
      for (const ext of [".ts", "/index.ts"]) {
        const u = new URL(spec + ext, ctx.parentURL);
        if (existsSync(fileURLToPath(u))) return next(u.href, ctx);
      }
    }
    return next(spec, ctx);
  },
});
const { dockStateOf, arrangementOf, readStored, withSizes, LIGHTS, CONTROLS } = await import("../src/demos/chrome-dock.ts");
const { arrangement } = await import("../src/demos/toolbar.ts");
const { solve, foldItem, markUsed, moveTo, stops, storeDockState, readDockState, targets } = await import("@n-uf/docking");

const size = (row, { icons = 100, iconsRow = null } = {}) => ({ row: { width: row, height: 28 }, iconsRow, fold: 30, icons, foldDown: 46 });
const SIZES = { title: size(180, { icons: null }), preview: size(240, { iconsRow: 110 }), speed: size(150), status: size(260, { icons: null }), hint: size(200, { icons: null }) };
const GROUPS = [{ id: "title", priority: 1 }, { id: "preview" }, { id: "speed" }, { id: "status" }, { id: "hint" }];
const win = (width, height = 700) => ({ width, height, bar: 42, rail: 46, lead: 50, tail: 120 });
const MODEL = arrangement({ title: { start: ["title"], end: ["preview", "speed"] }, bottom: { start: ["status"], end: ["hint"] } });
const formsAt = (width) => {
  const l = solve(dockStateOf(MODEL, GROUPS, SIZES, win(width)));
  return Object.fromEntries(GROUPS.map((g) => [g.id, l.items[g.id].formKind]));
};

test("the arrangement maps to a dock state and back", () => {
  const s = dockStateOf(MODEL, GROUPS, SIZES, win(1200));
  assert.deepEqual(arrangementOf(s), MODEL);
  const title = s.edges.find((e) => e.id === "title");
  assert.deepEqual(title.items, [LIGHTS, "title", "preview", "speed", CONTROLS]);
  assert.equal(s.items.speed.align, "end");
  assert.equal(s.edges.find((e) => e.id === "left").compact, true);
});

test("a wide window draws every group in its row, the zones packed from either end", () => {
  const l = solve(dockStateOf(MODEL, GROUPS, SIZES, win(1200)));
  for (const g of GROUPS) assert.equal(l.items[g.id].formKind, "row", g.id);
  assert.equal(l.items.title.rect.x, 8 + 50 + 12, "after the bar's padding, the lights and the gap");
  assert.equal(l.items.speed.rect.x + l.items.speed.rect.width, 1200 - 8 - 120 - 12, "before the window's own controls");
  assert.equal(l.items.title.rect.height, 42);
});

test("as the title bar runs out of room, groups step down row → icons → grip and » → the » menu, the title last", () => {
  const seen = [];
  for (let w = 1200; w >= 300; w -= 10) seen.push(formsAt(w));
  const ladder = (id) => [...new Set(seen.map((f) => f[id]))];
  assert.deepEqual(ladder("preview"), ["row", "icons", "fold", "menu"]);
  assert.deepEqual(ladder("speed"), ["row", "fold", "menu"]);
  // Equal priorities: the one used longest ago (the trailing group, speed) steps down first.
  const first = (id) => seen.findIndex((f) => f[id] !== "row");
  assert.ok(first("speed") < first("preview"), "speed (older) gives way before preview");
  // The title has the higher priority: it keeps its row while another group can still step down.
  const t = first("title");
  assert.ok(t === -1 || seen[t].preview === "menu", "the title steps down only after preview went to the menu");
});

test("by use: a group used more recently gives way after an older one", () => {
  let s = dockStateOf(MODEL, GROUPS, SIZES, win(1200));
  s = markUsed(s, "speed");
  // Narrow enough that one of the two end groups must step down (no previous: a fresh fit).
  const narrow = withSizes(s, SIZES, win(700));
  const l = solve(narrow);
  assert.equal(l.items.speed.formKind, "row");
  assert.notEqual(l.items.preview.formKind, "row");
});

test("a hand fold takes the grip-and-» form, in a bar and on a side rail", () => {
  let s = dockStateOf(MODEL, GROUPS, SIZES, win(1200));
  s = foldItem(s, "preview", true);
  assert.equal(solve(s).items.preview.formKind, "fold");
  assert.deepEqual(arrangementOf(s).collapsed, ["preview"]);
  s = moveTo(s, "speed", { kind: "gap", edge: "left", zone: "start", at: 0 });
  const l = solve(s);
  assert.equal(l.items.speed.formKind, "icons");
  assert.equal(l.items.speed.axis, "column");
  s = moveTo(s, "hint", { kind: "gap", edge: "left", zone: "end", at: 0 });
  assert.equal(solve(s).items.hint.formKind, "fold", "a group with no icon form shows its grip and » on a rail");
});

test("the keys' and the menu's moves are docking's stops: every bar and rail, no home", () => {
  const s = dockStateOf(MODEL, GROUPS, SIZES, win(1200));
  const l = solve(s);
  const list = stops(s, "speed", { previous: l });
  const edges = new Set(list.filter((t) => t.place.kind === "gap").map((t) => t.place.edge));
  for (const e of ["title", "top", "bottom", "left", "right"]) assert.ok(edges.has(e), e);
  assert.ok(!list.some((t) => t.place.kind === "home"));
  // Each stop's drop is the move it names.
  const t = list.find((x) => x.place.kind === "gap" && x.place.edge === "top");
  const after = t.after({ x: 0, y: 0 });
  assert.deepEqual(arrangementOf(after.state).top.start, ["speed"]);
  // The title bar's reserved room is never a target.
  for (const x of targets(s, "speed", { previous: l })) if (x.slot && x.place.kind === "gap" && x.place.edge === "title") assert.ok(x.slot.x >= 8 + 50 && x.slot.x + x.slot.width <= 1200 - 8 - 120, `${x.id} clears the lights and the window's controls`);
});

test("the stored form round-trips; an old stored arrangement is migrated once, a foreign one dropped", () => {
  const base = dockStateOf(MODEL, GROUPS, SIZES, win(1200));
  const rebuild = (m) => dockStateOf(m, GROUPS, SIZES, win(1200));
  const moved = foldItem(moveTo(base, "speed", { kind: "gap", edge: "bottom", zone: "center", at: 0 }), "hint", true);
  const stored = JSON.parse(JSON.stringify(storeDockState(moved)));
  const back = readStored(stored, base, rebuild);
  assert.equal(back.migrated, false);
  assert.deepEqual(arrangementOf(back.state), arrangementOf(moved));
  assert.deepEqual(readDockState(stored, base).dropped, []);

  const old = arrangement({ title: { start: ["title"] }, left: { start: ["preview", "speed"] }, bottom: { start: ["status"], end: ["hint"] } });
  old.collapsed = ["status"];
  const migrated = readStored(JSON.parse(JSON.stringify(old)), base, rebuild);
  assert.equal(migrated.migrated, true);
  assert.deepEqual(arrangementOf(migrated.state), old);

  const other = arrangement({ title: { start: ["title", "zoom"] } });
  assert.equal(readStored(other, base, rebuild), null, "an arrangement of other groups is dropped");
  assert.equal(readStored("nonsense", base, rebuild), null);
  assert.equal(readStored({ v: 99 }, base, rebuild), null);
});

test("a float from the menu follows the content's bottom edge", () => {
  const s = moveTo(dockStateOf(MODEL, GROUPS, SIZES, win(1200)), "speed", { kind: "float", anchor: { at: "content-bottom", dy: -12 } });
  const l = solve(s);
  assert.equal(l.items.speed.floating, true);
  assert.ok(Math.abs(l.items.speed.rect.y + l.items.speed.rect.height - (l.content.y + l.content.height - 12)) < 1);
  assert.equal(arrangementOf(s).float[0].anchor, "bottom");
});
