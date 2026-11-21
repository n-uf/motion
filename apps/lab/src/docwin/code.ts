/**
 * The window as code: what a host app writes with `@n-uf/docking` to get exactly the window on the page. Two
 * pure generators over the same state the window draws and the last drop it recorded (./drop); the Code view only shows
 * their strings.
 *
 * - `stateCode(state, options)`: the state's stored form as a literal (`storeDockState`, one JSON-compatible literal, every
 *   key quoted, the items by id), read back over the window's declared items (`readDockState`), solved (`solve`), the
 *   rules a drag adds to it and the options a drag's `dockDrag()` runs with;
 * - `moveCode(drop, options)`: the calls the last drag made: `dockDrag(...)`, the release's state (the lane, spot and
 *   pointer), its commit (`drag.after(release)`), or what else the release did (home, refused, cancelled); under the
 *   published rules `targets(...)` and the target's `after(pointer, grab)`.
 */
import { storeDockState, type DockState, type StoredDockState } from "@n-uf/docking";
import type { Point } from "@n-uf/placement";
import type { DragSettings, LastDrop } from "./drop";
import { titleOf } from "./model";

/** What the window says when no drag has been made yet (also what `moveCode(null)` returns). */
export const NO_MOVE = "No move yet: drag an item in the window.";

/** What the generators read: the settings of a drag, and the state as a drag reads it (default: the state itself). */
interface CodeOptions extends DragSettings {
  readonly dragState?: DockState;
}

// --- literals ------------------------------------------------------------------------------------------------------

const WIDTH = 112;
const IDENT = /^[A-Za-z_$][\w$]*$/;

/** `v` on one line. Keys are quoted (JSON) unless `plain`, which writes identifiers bare and `undefined` as is. */
function inline(v: unknown, plain: boolean): string {
  if (v === undefined) return "undefined";
  if (v === null || typeof v !== "object") return JSON.stringify(v) ?? "null";
  if (Array.isArray(v)) return v.length ? `[${v.map((x) => inline(x, plain)).join(", ")}]` : "[]";
  const entries = Object.entries(v).filter(([, x]) => plain || x !== undefined);
  return entries.length ? `{ ${entries.map(([k, x]) => `${key(k, plain)}: ${inline(x, plain)}`).join(", ")} }` : "{}";
}
const key = (k: string, plain: boolean): string => (plain && IDENT.test(k) ? k : JSON.stringify(k));

/**
 * `v` as a TypeScript literal, pretty-printed: an array or object that fits on a line stays on one (`indent` counts the
 * levels above it), the rest breaks one entry per line, no trailing commas. With `quote` (the default) every key is
 * quoted and nothing is `undefined`, so the text parses as JSON. `root` breaks the outermost level whatever its length.
 */
function literal(v: unknown, o: { quote?: boolean; indent?: number; root?: boolean } = {}): string {
  const plain = o.quote === false;
  const indent = o.indent ?? 0;
  const one = inline(v, plain);
  if (typeof v !== "object" || v === null || (!o.root && one.length + indent * 2 + 16 <= WIDTH)) return one;
  const pad = "  ".repeat(indent + 1);
  const end = "  ".repeat(indent);
  if (Array.isArray(v)) return v.length ? `[\n${v.map((x) => pad + literal(x, { quote: !plain, indent: indent + 1 })).join(",\n")}\n${end}]` : "[]";
  const entries = Object.entries(v).filter(([, x]) => plain || x !== undefined);
  return entries.length ? `{\n${entries.map(([k, x]) => `${pad}${key(k, plain)}: ${literal(x, { quote: !plain, indent: indent + 1 })}`).join(",\n")}\n${end}}` : "{}";
}

/** The stored state with its items by id (the record's own order depends on how the state was built). */
function stable(s: StoredDockState): StoredDockState {
  const items = Object.fromEntries(Object.keys(s.items).sort().map((id) => [id, s.items[id]!]));
  return { ...s, items };
}

const num = (n: number): string => String(Math.round(n * 100) / 100);
/** A point at full precision: the numbers `after(pointer, grab)` really took (a rounded one would land elsewhere). */
const point = (p: Point): string => `{ x: ${p.x}, y: ${p.y} }`;

// --- the state -----------------------------------------------------------------------------------------------------

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** The keys of `to` that differ from `from` (`undefined`: the key `from` has and `to` lacks). */
function changed(from: object, to: object, skip: readonly string[] = []): Record<string, unknown> {
  const a = from as Record<string, unknown>;
  const b = to as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(b)) if (!skip.includes(k) && !same(a[k], b[k])) out[k] = b[k];
  for (const k of Object.keys(a)) if (!skip.includes(k) && !(k in b)) out[k] = undefined;
  return out;
}

/** The state as a drag reads it, written as what it adds to the stored state: top-level rules and per-edge rules. */
function rulesCode(state: DockState, dragState: DockState): { lines: string[]; edges: boolean } {
  const top = changed(state, dragState, ["edges"]);
  const perEdge: Record<string, Record<string, unknown>> = {};
  for (const e of dragState.edges) {
    const was = state.edges.find((x) => x.id === e.id);
    const diff = was ? changed(was, e) : {};
    if (Object.keys(diff).length) perEdge[e.id] = diff;
  }
  const lines: string[] = [];
  const edges = Object.keys(perEdge).length > 0;
  if (edges) lines.push("// Per edge: what the window's drag rules change (`undefined`: the edge's own setting is left out).", `const edgeRules: Record<string, Partial<DockEdge>> = ${literal(perEdge, { quote: false, root: true })};`, "");
  const rules = Object.entries(top);
  if (!rules.length && !edges) return { lines: ["const dragState = state;"], edges };
  lines.push(
    "// What a drag reads: the stored state plus the window's own drag rules.",
    "const dragState: DockState = {",
    "  ...state,",
    ...rules.map(([k, v]) => `  ${key(k, true)}: ${literal(v, { quote: false, indent: 1 })},`),
    ...(edges ? ["  edges: state.edges.map((e) => ({ ...e, ...edgeRules[e.id] })),"] : []),
    "};",
  );
  return { lines, edges };
}

/** The options of a drag's `dockDrag()` call as the page uses them, one per line, from `indent` spaces. */
const optionLines = (o: DragSettings, indent: string): string[] => [
  `${indent}previous: layout,`,
  `${indent}endReach: ${num(o.endReach)},`,
  `${indent}floatFromHeld: ${o.floatFromHeld},`,
  `${indent}emptyLanes: ${JSON.stringify(o.emptyLanes)},`,
  `${indent}stretchPositions: ${JSON.stringify(o.stretchPositions)},`,
  ...(o.snapDistance === undefined ? [] : [`${indent}snapDistance: ${num(o.snapDistance)},${o.stretchPositions === "free" ? "" : " // counts under \"free\" only"}`]),
  `${indent}pitch: ${num(o.pitch)},${o.stretchPositions === "pitched" ? "" : " // counts under \"pitched\" only"}`,
];

/**
 * The window as a host writes it: the stored state as a literal (`const stored: StoredDockState = { … };`, parseable as
 * JSON), `readDockState` over the window's declared items, `solve`, the rules a drag adds and the options of a drag.
 */
function stateCode(state: DockState, options: CodeOptions): string {
  const dragState = options.dragState ?? state;
  const rules = rulesCode(state, dragState);
  const stored = literal(stable(storeDockState(state)), { root: true });
  const { width, height } = state.stage;
  return [
    `import { readDockState, solve, type ${rules.edges ? "DockEdge, " : ""}DockState, type StoredDockState } from "@n-uf/docking";`,
    "",
    "// The window's declared items: its edges (what each one accepts), its items (their kinds, forms and limits) and",
    `// the stage, ${width} x ${height} px. A host declares these itself; the stored state below only says where things were put.`,
    "declare const base: DockState;",
    "",
    "// storeDockState(state): the order of every edge's items, the floats, and each item's state.",
    `const stored: StoredDockState = ${stored};`,
    "",
    "const { state } = readDockState(stored, base);",
    "// The stored state's own layout. The window keeps solving with `previous` (the layout before), so a press or a",
    "// badge change reshapes nothing.",
    "const layout = solve(state);",
    "",
    ...rules.lines,
    "",
    "// The options of every drag's dockDrag() call, as the page uses them now:",
    "//   const drag = dockDrag(dragState, itemId, { ...laneOptions, grab });",
    "const laneOptions = {",
    ...optionLines(options, "  "),
    "} as const;",
    "",
  ].join("\n");
}

/**
 * Both texts for a window: its state (`dragState`, the state as a drag reads it, and `dragSettings` are the window's own
 * answers for the drag rules and options) and the last drop it recorded.
 */
export function codeOf(c: { readonly state: DockState; readonly dragState: DockState; readonly dragSettings: DragSettings; readonly lastDrop: LastDrop | null }): { state: string; move: string } {
  return { state: stateCode(c.state, { ...c.dragSettings, dragState: c.dragState }), move: moveCode(c.lastDrop, c.dragSettings) };
}

// --- the last move -------------------------------------------------------------------------------------------------

/** The lines of a drop's `dockDrag()` / `targets()` call, and what the release did after it. */
function moveCode(drop: LastDrop | null, options: DragSettings): string {
  if (!drop) return NO_MOVE;
  const { call } = drop;
  const id = JSON.stringify(drop.id);
  const out: string[] = [];
  const held = titleOf(drop.id);
  const where = call.spot ?? call.target ?? call.refusal;
  out.push(
    `import { ${call.via === "lanes" ? "dockDrag" : "targets"} } from "@n-uf/docking";`,
    "",
    `// Last move: ${held} lifted ${point(call.grab)} from its top-left corner and released at ${point(call.pointer)} (window px).`,
    "// dragState and layout are the State tab's, as the window stood when the item was lifted.",
  );
  const drifted = (["stretchPositions", "pitch", "snapDistance"] as const).filter((k) => options[k] !== call.settings[k]);
  if (drifted.length) out.push(`// The settings have changed since: ${drifted.map((k) => `${k} is now ${JSON.stringify(options[k])}`).join(", ")}.`);
  out.push("");

  if (call.via === "lanes") {
    out.push(
      `const drag = dockDrag(dragState, ${id}, {`,
      ...optionLines(call.settings, "  "),
      `  grab: ${point(call.grab)}, // where the pointer held the item, from its top-left corner`,
      "});",
      "// The landing model reads the drag as it is: createLandingModel({ ...drag, home, placeGuides }). Each frame the",
      "// window draws drag.shown(frame), the landing drag.landingOf(frame.held) and the guides drag.guides(frame).",
    );
  } else {
    const s = call.settings;
    out.push(`const found = targets(dragState, ${id}, { previous: layout, endReach: ${num(s.endReach)}, floatFromHeld: ${s.floatFromHeld} });`);
  }

  const commit = (from: string): string[] => [`const { state: next, layout: nextLayout } = ${from}.after(${point(call.pointer)}, ${point(call.grab)});`];
  /** The release as the landing model gave it, and its commit: the held place's one layout (`after`). */
  const commitState = (released: string): string[] => [`const release = ${released}; // model.release(...)`, "const { state: next, layout: nextLayout, landing } = drag.after(release);"];
  // A sliding spot says where it went by its committed landing's start along the lane; its `place` is only the dock at
  // the spot's listed landing. Any other target says its place.
  const place = call.slides && call.at !== null ? `, its start at ${call.at} along the lane (landing)` : call.placeOf && call.placeOf.kind !== "float" ? ` at the place ${literal(call.placeOf, { quote: false })}` : "";
  const landed = (how: string): string => `// next: ${held}${how}${place}. nextLayout is the window drawn from it.`;
  out.push("");
  if (drop.cancelled) {
    out.push("// Cancelled (Escape): nothing is committed and the item goes back to where it was.");
  } else if (call.refusal) {
    out.push(
      call.via === "lanes" ? `const refusal = drag.regions.refusals.find((r) => r.id === ${JSON.stringify(call.refusal)})!;` : `// Released over the refused place ${JSON.stringify(call.refusal)}.`,
      "// A release over a refusal commits nothing: the item goes back to where it was.",
    );
  } else if (call.via === "lanes" && call.lane && call.spot) {
    const state = `{ kind: "spot", lane: ${JSON.stringify(call.lane)}, spot: ${JSON.stringify(call.spot)}, point: ${point(call.pointer)}, home: ${call.home} }`;
    if (call.home) out.push(`// The release: ${state}.`, "// The spot is the item's own place: a release there commits nothing, `state` stays as it is.");
    else {
      out.push(call.slides ? `// A sliding spot: it lands where the hand holds the item (pointer less grab), snapped within ${call.settings.snapDistance === undefined ? "docking's default snap distance" : `${num(call.settings.snapDistance)} px`}.` : "// A fixed spot: the pointer and the grab don't move it, the place is what commits.", ...commitState(state));
      out.push(landed(" is docked"));
    }
  } else if (call.via === "lanes" && call.placeOf?.kind === "float") {
    out.push("// No lane under the pointer, open room: the item floats where the hand holds it.", ...commitState(`{ kind: "float", point: ${point(call.pointer)} }`));
    out.push(landed(" floats"));
  } else if (call.via === "targets" && call.target) {
    out.push(`const target = found.find((t) => t.id === ${JSON.stringify(call.target)})!;`);
    if (call.home) out.push("// The target is the item's own place: a release there commits nothing.");
    else out.push(...commit("target"), landed(call.placeOf?.kind === "float" ? " floats" : " is docked"));
  } else if (call.home) {
    out.push("// Released back on its own place: nothing is committed, `state` stays as it is.");
  } else {
    out.push(`// Released where nothing lands (the window says "Can't go here"${where ? `: ${where}` : ""}): nothing is committed, the item goes back.`);
  }
  out.push("");
  return out.join("\n");
}
