/**
 * The stack's stored form: `storeStack(state)` gives plain JSON-safe data (`{ v: 1, order, kept, closed, used, forms
 * }`); `readStack(data, known?)` reads parsed data back and never throws. Anything but an object of version 1 is
 * `{ ok: false, error }`. Inside one it is lenient, as the panels' reader is: an id that isn't a string, is repeated
 * or (with `known`) isn't one the consumer has is dropped and listed in `dropped`; a `kept`, `closed`, `used` or
 * `forms` entry for an id that isn't in `order` is dropped; a form that isn't a whole number from 1 up is dropped;
 * the keys `__proto__` and `constructor` in `forms` are dropped; a field this version doesn't know is skipped and
 * reported as `"<field>"`. An item the consumer has that the stored order lacks is no error: the consumer places it.
 *
 * - `kept`: items kept open (they give way last).
 * - `closed`: items the user closed; their place in `order` is kept for when they open.
 * - `used`: the use order, oldest to newest, so a reload restores who gives way first (an item's `used` is its index in
 *   it; one the list lacks is older than all).
 * - `forms`: the user's chosen form per item, the index of the largest form it may take (`StackItem.from`). 0, the
 *   first, is not stored.
 */

export interface StackState {
  /** The items' order along the stack. */
  readonly order: readonly string[];
  /** Items kept open: they give way last. */
  readonly kept: readonly string[];
  /** Items the user closed. */
  readonly closed: readonly string[];
  /** The use order, oldest first. */
  readonly used: readonly string[];
  /** The form index the user chose per item (only those that chose one; absent means the first). */
  readonly forms: Readonly<Record<string, number>>;
}

export interface StoredStack {
  readonly v: 1;
  readonly order: string[];
  readonly kept: string[];
  readonly closed: string[];
  readonly used: string[];
  readonly forms: Record<string, number>;
}

export type StackRead = { readonly ok: true; readonly state: StackState; readonly dropped: readonly string[] } | { readonly ok: false; readonly error: string };

/** A state with these items in this order, none kept or closed, used in that order, every form the first. */
export const createStack = (order: readonly string[]): StackState => ({ order: [...order], kept: [], closed: [], used: [...order], forms: {} });

const UNSAFE = ["__proto__", "constructor", "prototype"];
const isForm = (f: unknown): f is number => typeof f === "number" && Number.isInteger(f) && f >= 1;
const uniq = (ids: readonly string[], order: readonly string[]): string[] => [...new Set(ids)].filter((id) => order.includes(id));

export function storeStack(state: StackState): StoredStack {
  const forms: Record<string, number> = {};
  for (const id of state.order) {
    const f = state.forms[id];
    if (Object.hasOwn(state.forms, id) && isForm(f) && !UNSAFE.includes(id)) forms[id] = f;
  }
  return { v: 1, order: [...state.order], kept: uniq(state.kept, state.order), closed: uniq(state.closed, state.order), used: uniq(state.used, state.order), forms };
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

export function readStack(data: unknown, known?: readonly string[]): StackRead {
  try {
    return read(data, known);
  } catch (e) {
    // A getter that throws, a proxy: still no throw.
    return { ok: false, error: `unreadable: ${e instanceof Error ? e.message : typeof e}` };
  }
}

const versionWords = (v: unknown): string => (typeof v === "number" ? String(v) : typeof v === "string" ? JSON.stringify(v.length > 24 ? `${v.slice(0, 24)}…` : v) : typeof v);

function read(data: unknown, known?: readonly string[]): StackRead {
  if (!isObject(data)) return { ok: false, error: "not an object" };
  if (data.v !== 1) return { ok: false, error: `unknown version ${versionWords(data.v)} (this reads version 1)` };
  if (!Array.isArray(data.order)) return { ok: false, error: "order is missing" };
  const dropped: string[] = [];
  const drop = (what: string): void => {
    if (!dropped.includes(what)) dropped.push(what);
  };
  for (const k of Object.keys(data)) if (!["v", "order", "kept", "closed", "used", "forms"].includes(k)) drop(k);
  const order: string[] = [];
  for (const x of data.order as unknown[]) {
    if (typeof x !== "string") drop(`a ${typeof x} where an id goes`);
    else if ((known && !known.includes(x)) || order.includes(x)) drop(x);
    else order.push(x);
  }
  // A list of ids that are in `order`, each once.
  const list = (key: "kept" | "closed" | "used"): string[] => {
    const out: string[] = [];
    const x = data[key];
    if (x === undefined) return out;
    if (!Array.isArray(x)) {
      drop(key);
      return out;
    }
    for (const id of x as unknown[]) {
      if (typeof id === "string" && order.includes(id)) {
        if (!out.includes(id)) out.push(id);
      } else drop(typeof id === "string" ? `${key}:${id}` : `a ${typeof id} in ${key}`);
    }
    return out;
  };
  const kept = list("kept");
  const closed = list("closed");
  const used = list("used");
  const forms: Record<string, number> = Object.create(null) as Record<string, number>;
  if (data.forms !== undefined) {
    if (!isObject(data.forms)) drop("forms");
    else {
      for (const id of Object.keys(data.forms)) {
        const f = data.forms[id];
        if (UNSAFE.includes(id) || !Object.hasOwn(data.forms, id) || !order.includes(id) || !isForm(f)) drop(`forms:${id}`);
        else forms[id] = f;
      }
    }
  }
  return { ok: true, state: { order, kept, closed, used, forms }, dropped };
}
