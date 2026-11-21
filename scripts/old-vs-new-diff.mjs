/**
 * The comparison behind `scripts/old-vs-new.mjs`: two recordings of one package (`record/canon.ts`'s shape, `{ package,
 * kinds: { kind: [{ id, value }] } }`) diffed field by field. Cases match by id; inside a case, arrays whose elements all
 * carry an `id` match by id too (a reorder shows once, as "order changed"), other arrays by position, objects by key.
 * Adapted from the headless lab diff (`lab-diff`): the same id-matching, with a number tolerance of 1e-6 (the recorder
 * rounds to 1e-6, so two roundings of one value can differ by that much).
 */

const TOLERANCE = 1.5e-6;

/** The short form of a value for one line of output. */
export function show(value, max = 90) {
  const text = value === undefined ? "(none)" : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/** Every difference between `x` (old) and `y` (new) as `{ path, old, new }`; `old` or `new` is undefined where a side lacks it. */
export function diffValues(x, y, path = "", out = []) {
  if (typeof x === "number" && typeof y === "number") {
    if (Math.abs(x - y) > TOLERANCE) out.push({ path, old: x, new: y });
    return out;
  }
  const plain = (v) => v !== null && typeof v === "object";
  if (!plain(x) || !plain(y) || Array.isArray(x) !== Array.isArray(y)) {
    if (JSON.stringify(x) !== JSON.stringify(y)) out.push({ path, old: x, new: y });
    return out;
  }
  if (Array.isArray(x)) {
    const byId = (list) => list.length > 0 && list.every((e) => e && typeof e === "object" && !Array.isArray(e) && e.id !== undefined) && new Set(list.map((e) => String(e.id))).size === list.length;
    if (byId(x) && byId(y)) {
      const mx = new Map(x.map((e) => [String(e.id), e]));
      const my = new Map(y.map((e) => [String(e.id), e]));
      for (const [id, e] of mx) if (!my.has(id)) out.push({ path: `${path}[${id}]`, old: e, new: undefined });
      for (const [id, e] of my) if (!mx.has(id)) out.push({ path: `${path}[${id}]`, old: undefined, new: e });
      for (const [id, e] of mx) if (my.has(id)) diffValues(e, my.get(id), `${path}[${id}]`, out);
      const ox = [...mx.keys()].filter((id) => my.has(id));
      const oy = [...my.keys()].filter((id) => mx.has(id));
      if (ox.join("\u0000") !== oy.join("\u0000")) out.push({ path: `${path}`, old: "order", new: "order changed" });
      return out;
    }
    if (x.length !== y.length) out.push({ path: `${path}.length`, old: x.length, new: y.length });
    for (let i = 0; i < Math.min(x.length, y.length); i++) diffValues(x[i], y[i], `${path}[${i}]`, out);
    return out;
  }
  for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
    if (!(k in y)) out.push({ path: `${path}.${k}`, old: x[k], new: undefined });
    else if (!(k in x)) out.push({ path: `${path}.${k}`, old: undefined, new: y[k] });
    else diffValues(x[k], y[k], `${path}.${k}`, out);
  }
  return out;
}

/**
 * Two recordings of one package compared: per kind, the cases `same` and `changed` (a case on one side only is changed),
 * and for each changed case its differences.
 * @returns {{ kinds: Record<string, { same: number, changed: { id: string, diffs: { path: string, old: unknown, new: unknown }[] }[] }> }}
 */
export function diffRecordings(base, head) {
  const kinds = {};
  for (const kind of [...new Set([...Object.keys(base.kinds), ...Object.keys(head.kinds)])].sort()) {
    const mine = new Map((base.kinds[kind] ?? []).map((r) => [r.id, r.value]));
    const theirs = new Map((head.kinds[kind] ?? []).map((r) => [r.id, r.value]));
    const entry = { same: 0, changed: [] };
    for (const id of new Set([...mine.keys(), ...theirs.keys()])) {
      if (!theirs.has(id)) entry.changed.push({ id, diffs: [{ path: "", old: mine.get(id), new: undefined }] });
      else if (!mine.has(id)) entry.changed.push({ id, diffs: [{ path: "", old: undefined, new: theirs.get(id) }] });
      else {
        const diffs = diffValues(mine.get(id), theirs.get(id));
        if (diffs.length === 0) entry.same++;
        else entry.changed.push({ id, diffs });
      }
    }
    kinds[kind] = entry;
  }
  return { kinds };
}

/** A glob (`*` any run, `?` one character) as a regular expression over a whole string. */
export function globToRegExp(glob) {
  return new RegExp(`^${glob.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`);
}

/** `a|b` as alternatives of globs, for a package or a kind (their names hold no `|`; a case id may, so a case is one glob). */
const alternatives = (glob) => {
  const each = glob.split("|").map(globToRegExp);
  return { test: (s) => each.some((r) => r.test(s)) };
};

/**
 * The expectations (`{ package, kind, case, reason }`, each of package, kind and case a glob, default `*`; package and
 * kind may list alternatives as `a|b`) against the changes (`{ package, kind, id }`): which expectation covers each
 * change (the first that matches), which changes are covered by none, and which expectations matched nothing.
 */
export function matchExpectations(expectations, changes) {
  const rules = expectations.map((e) => ({
    e,
    package: alternatives(e.package ?? "*"),
    kind: alternatives(e.kind ?? "*"),
    case: globToRegExp(e.case ?? e["case-id"] ?? e.caseId ?? "*"),
    count: 0,
  }));
  const uncovered = [];
  for (const c of changes) {
    const rule = rules.find((r) => r.package.test(c.package) && r.kind.test(c.kind) && r.case.test(c.id));
    if (rule) rule.count++;
    else uncovered.push(c);
  }
  return { uncovered, unmatched: rules.filter((r) => r.count === 0).map((r) => r.e), covered: rules.filter((r) => r.count > 0).map((r) => ({ ...r.e, count: r.count })) };
}
