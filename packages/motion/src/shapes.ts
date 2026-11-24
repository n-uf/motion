/** A point or a 2D vector. */
export interface Point {
  x: number;
  y: number;
}

/** An axis-aligned rectangle. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Any number of components. */
export type Vector = readonly number[];

/** The value shapes springs and tweens move: plain numbers, nothing else. */
export type Animatable = number | Point | Rect | Vector;

/** The shape type of an {@link Animatable}: literal numbers widen to `number`. */
export type Widen<T> = T extends number
  ? number
  : T extends Vector
    ? Vector
    : T extends Rect
      ? Rect
      : T extends Point
        ? Point
        : never;

const SCALAR = 0;
const VECTOR = 1;
const POINT = 2;
const RECT = 3;

/** How a shape maps onto a flat list of numbers. Internal to values/. */
export interface Layout {
  readonly kind: typeof SCALAR | typeof VECTOR | typeof POINT | typeof RECT;
  readonly size: number;
}

const SCALAR_LAYOUT: Layout = { kind: SCALAR, size: 1 };
const POINT_LAYOUT: Layout = { kind: POINT, size: 2 };
const RECT_LAYOUT: Layout = { kind: RECT, size: 4 };

export function layoutOf(value: Animatable): Layout {
  if (typeof value === "number") return SCALAR_LAYOUT;
  if (Array.isArray(value)) return { kind: VECTOR, size: value.length };
  if ("width" in value) return RECT_LAYOUT;
  return POINT_LAYOUT;
}

export function sameLayout(a: Layout, b: Layout): boolean {
  return a.kind === b.kind && a.size === b.size;
}

/** Copy `value`'s components into `out`. */
export function writeComponents(value: Animatable, out: Float64Array): void {
  if (typeof value === "number") {
    out[0] = value;
  } else if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) out[i] = value[i]!;
  } else if ("width" in value) {
    out[0] = value.x;
    out[1] = value.y;
    out[2] = value.width;
    out[3] = value.height;
  } else {
    const point = value as Point;
    out[0] = point.x;
    out[1] = point.y;
  }
}

/** A fresh value of `layout`'s shape from `components`. */
export function makeValue(layout: Layout, components: Float64Array): Animatable {
  switch (layout.kind) {
    case SCALAR:
      return components[0]!;
    case POINT:
      return { x: components[0]!, y: components[1]! };
    case RECT:
      return { x: components[0]!, y: components[1]!, width: components[2]!, height: components[3]! };
    default:
      return Array.from(components);
  }
}

/** Component-wise equality of two values of the same shape. */
export function shapeEquals(a: Animatable, b: Animatable): boolean {
  if (typeof a === "number" || typeof b === "number") return a === b;
  if (Array.isArray(a) || Array.isArray(b)) {
    const u = a as Vector;
    const v = b as Vector;
    if (u.length !== v.length) return false;
    for (let i = 0; i < u.length; i++) if (u[i] !== v[i]) return false;
    return true;
  }
  const p = a as Partial<Rect>;
  const q = b as Partial<Rect>;
  return p.x === q.x && p.y === q.y && p.width === q.width && p.height === q.height;
}
