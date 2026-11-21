/**
 * The recorders' shared pieces (see docs/old-vs-new.md): canonical JSON, a collector for one package's outputs, and the
 * guards that keep a recorder from crashing on a commit that lacks an API.
 *
 * A recorder runs at HEAD and is copied into the base checkout, so it meets old code. Every call into the library goes
 * through `attempt`: an export or a test helper that isn't there records `{ absent }`, a call that throws records
 * `{ threw }`, and neither stops the run.
 *
 * Canonical JSON: keys sorted, numbers rounded to 1e-6 (and -0 written 0), a Map written as an object by its keys
 * (sorted), a Set as a sorted array, a function or undefined left out, NaN and the infinities written as words.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const ROUND = 1e6;

/** Thrown by `need` when a feature isn't in the code being recorded. */
export class Absent extends Error {}

/** `value` when it is there; else the recording of this output is `{ absent: what }`. */
export function need<T>(value: T | undefined | null, what: string): T {
  if (value === undefined || value === null) throw new Absent(what);
  return value;
}

/** The module at `path` (a file under the checkout being recorded), or `undefined` when it isn't there. */
export async function load<T = Record<string, unknown>>(path: string): Promise<T | undefined> {
  try {
    return (await import(/* @vite-ignore */ path)) as T;
  } catch (error) {
    // A file that isn't there is absent; one that is there and fails to load (an old API it names) is absent too, and
    // says why on stderr. Every case that needed it is then recorded `absent`, and the run counts them.
    tick(`absent: ${path} (${error instanceof Error ? error.message.split("\n")[0] : String(error)})`);
    return undefined;
  }
}

/** The canonical form of `value`: what `JSON.stringify` of it writes. */
export function canon(value: unknown, seen: Set<object> = new Set()): unknown {
  if (value === null) return null;
  switch (typeof value) {
    case "number":
      if (Number.isNaN(value)) return "NaN";
      if (!Number.isFinite(value)) return value > 0 ? "Infinity" : "-Infinity";
      return Math.round(value * ROUND) / ROUND || 0;
    case "string":
    case "boolean":
      return value;
    case "bigint":
      return String(value);
    case "undefined":
    case "function":
    case "symbol":
      return undefined;
  }
  const o = value as object;
  if (seen.has(o)) return "[cycle]";
  seen.add(o);
  try {
    if (Array.isArray(o)) return o.map((x) => canon(x, seen) ?? null);
    if (o instanceof Set) return [...o].map((x) => canon(x, seen) ?? null).sort((a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : 1));
    const entries: [string, unknown][] = o instanceof Map ? [...o].map(([k, v]) => [String(k), v]) : Object.entries(o);
    const out: Record<string, unknown> = {};
    for (const [k, v] of entries.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))) {
      const c = canon(v, seen);
      if (c !== undefined) out[k] = c;
    }
    return out;
  } finally {
    seen.delete(o);
  }
}

/** One recorded output: a case id and what the library gave for it. */
export interface Recorded {
  readonly id: string;
  readonly value: unknown;
}

/** What a recorder writes: the outputs of one package, by kind, each a list of cases. */
export interface Recording {
  readonly package: string;
  readonly kinds: Record<string, Recorded[]>;
}

export interface Recorder {
  /** Record `value` as the output `kind` gave for case `id` (an id used twice in a kind gets " #2"). */
  add(kind: string, id: string, value: unknown): void;
  /** Record what `run` returns, or `{ absent }` / `{ threw }`; never throws. */
  attempt(kind: string, id: string, run: () => unknown): void;
  /** Write the recording to `file` (canonical, one line per kind's cases). */
  write(file: string): number;
}

export function recorder(pkg: string): Recorder {
  const kinds: Record<string, Recorded[]> = {};
  const used = new Map<string, number>();
  const add = (kind: string, id: string, value: unknown): void => {
    const key = `${kind}\u0000${id}`;
    const n = (used.get(key) ?? 0) + 1;
    used.set(key, n);
    (kinds[kind] ??= []).push({ id: n === 1 ? id : `${id} #${n}`, value: canon(value) ?? null });
  };
  return {
    add,
    attempt(kind, id, run) {
      try {
        add(kind, id, run());
      } catch (error) {
        if (error instanceof Absent) add(kind, id, { absent: error.message });
        else add(kind, id, { threw: error instanceof Error ? error.message.split("\n")[0] : String(error) });
      }
    },
    write(file) {
      mkdirSync(dirname(file), { recursive: true });
      const names = Object.keys(kinds).sort();
      const lines = names.map((k) => `${JSON.stringify(k)}:[\n${kinds[k]!.map((r) => JSON.stringify(r)).join(",\n")}\n]`);
      writeFileSync(file, `{"package":${JSON.stringify(pkg)},"kinds":{\n${lines.join(",\n")}\n}}\n`);
      return names.reduce((n, k) => n + kinds[k]!.length, 0);
    },
  };
}

/** Where a recorder writes: `OVN_OUT` (set by `scripts/old-vs-new.mjs`), else under `.old-vs-new/`. */
export const outFile = (pkg: string): string => process.env.OVN_OUT ?? `${process.cwd()}/../../.old-vs-new/${pkg}.json`;

/**
 * What an item's asked lengths are called in the code under record: `lengths` (now) or `length` (before the rename).
 * `probe(name)` builds a small case with the asks under key `name` and returns what the library gives for it; the name
 * the library reads is the one whose case differs from one with no asks. A recorder writes its inputs and reads the
 * library's answers under that name only, so an old and a new commit are recorded with the same inputs, and it records
 * the name as the `contract` output `asked-lengths name`, so a rename shows in the diff. A probe that runs and finds
 * neither name throws (the run fails); one that can't run for a missing helper throws `Absent`.
 */
export function askedName(probe: (name: string) => unknown): "lengths" | "length" {
  const none = JSON.stringify(canon(probe("none")));
  for (const name of ["lengths", "length"] as const) if (JSON.stringify(canon(probe(name))) !== none) return name;
  throw new Error("the asked-lengths probe found no name the code reads (neither `lengths` nor `length` changes the layout)");
}

/** A progress line on stderr with the seconds since the recorder started (set `OVN_QUIET=1` to silence it). */
const started = Date.now();
export const tick = (message: string): void => {
  if (!process.env.OVN_QUIET) process.stderr.write(`[${Math.round((Date.now() - started) / 1000)}s] ${message}\n`);
};

/** A seeded random source (mulberry32), the same on every engine. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
