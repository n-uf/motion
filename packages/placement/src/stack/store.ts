/**
 * The stack's stored form: `storeStack(state)` gives plain JSON-safe data (`{ v: 1, order, kept, forms }`);
 * `readStack(data, known?)` reads parsed data back and never throws. Anything but an object of version 1 is
 * `{ ok: false, error }`. Inside one it is lenient, as the panels' reader is: an id that isn't a string, is repeated
 * or (with `known`) isn't one the consumer has is dropped and listed in `dropped`; a `kept` or `forms` entry for an id
 * that isn't in `order` is dropped; a form that isn't a whole number from 0 up is dropped; a field this version
 * doesn't know is skipped and reported as `"<field>"`. An item the consumer has that the stored order lacks is no
 * error: the consumer places it.
 *
 * `forms` is the user's chosen form per item: the index of the largest form it may take (0, the first, is not
 * stored). The solver steps down from there when room runs out.
 */

export interface StackState {
  /** The items' order along the stack. */
  readonly order: readonly string[];
  /** Items kept open: they give way last. */
  readonly kept: readonly string[];
  /** The form index the user chose per item (only those that chose one; absent means the first). */
  readonly forms: Readonly<Record<string, number>>;
}

export interface StoredStack {
  readonly v: 1;
  readonly order: string[];
  readonly kept: string[];
  readonly forms: Record<string, number>;
}

export type StackRead = { readonly ok: true; readonly state: StackState; readonly dropped: readonly string[] } | { readonly ok: false; readonly error: string };

/** A state with these items in this order, none kept, every form the first. */
export const createStack = (order: readonly string[]): StackState => ({ order: [...order], kept: [], forms: {} });

export function storeStack(state: StackState): StoredStack {
  const forms: Record<string, number> = {};
  for (const id of state.order) {
    const f = state.forms[id];
    if (f !== undefined && f > 0) forms[id] = f;
  }
  return { v: 1, order: [...state.order], kept: state.kept.filter((id) => state.order.includes(id)), forms };
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

function read(data: unknown, known?: readonly string[]): StackRead {
  if (!isObject(data)) return { ok: false, error: "not an object" };
  if (data.v !== 1) return { ok: false, error: `unknown version ${typeof data.v === "number" || typeof data.v === "string" ? String(data.v) : typeof data.v} (this reads version 1)` };
  if (!Array.isArray(data.order)) return { ok: false, error: "order is missing" };
  const dropped: string[] = [];
  const drop = (what: string): void => {
    if (!dropped.includes(what)) dropped.push(what);
  };
  for (const k of Object.keys(data)) if (!["v", "order", "kept", "forms"].includes(k)) drop(k);
  const order: string[] = [];
  for (const x of data.order as unknown[]) {
    if (typeof x !== "string") drop(`a ${typeof x} where an id goes`);
    else if ((known && !known.includes(x)) || order.includes(x)) drop(x);
    else order.push(x);
  }
  const kept: string[] = [];
  if (data.kept !== undefined) {
    if (!Array.isArray(data.kept)) drop("kept");
    else {
      for (const x of data.kept as unknown[]) {
        if (typeof x === "string" && order.includes(x)) {
          if (!kept.includes(x)) kept.push(x);
        } else drop(typeof x === "string" ? `kept:${x}` : `a ${typeof x} in kept`);
      }
    }
  }
  const forms: Record<string, number> = {};
  if (data.forms !== undefined) {
    if (!isObject(data.forms)) drop("forms");
    else {
      for (const id of Object.keys(data.forms)) {
        const f = data.forms[id];
        if (!order.includes(id)) drop(`forms:${id}`);
        else if (typeof f !== "number" || !Number.isInteger(f) || f < 0) drop(`forms:${id}`);
        else if (f > 0) forms[id] = f;
      }
    }
  }
  return { ok: true, state: { order, kept, forms }, dropped };
}
