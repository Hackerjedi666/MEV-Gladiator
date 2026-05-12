/**
 * Serialization helpers for crossing the JSON boundary.
 *
 * Convention: in TS land we always use bigint. On the wire, every bigint is a decimal string.
 * These helpers walk objects recursively and convert.
 *
 * NEVER call these in hot paths inside a service's own state. Only at:
 *   - the WS send/recv boundary
 *   - JSON file read/write (recordings, deployments)
 */

/** JSON value type (recursive). */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [k: string]: JsonValue }
  | JsonValue[];

/**
 * Recursively convert a value containing bigints into JSON-safe form.
 * bigint -> decimal string. Other primitives pass through.
 * Symbols, functions, and undefined are stripped (replaced with null inside objects/arrays).
 */
export function toWire<T>(value: T): JsonValue {
  if (typeof value === "bigint") return value.toString(10);
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => toWire(v));
  if (typeof value === "object") {
    const out: { [k: string]: JsonValue } = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (typeof v === "function" || typeof v === "symbol" || v === undefined) continue;
      out[k] = toWire(v);
    }
    return out;
  }
  return null;
}

/**
 * Convert a wire-form decimal string into a runtime bigint.
 * Throws on non-integer input.
 */
export function toBig(s: string): bigint {
  if (!/^-?\d+$/.test(s)) {
    throw new Error(`toBig: not a decimal integer string: ${s}`);
  }
  return BigInt(s);
}

/** Stringify with bigint support — useful for ad-hoc logging. */
export function stringifyWithBigInt(value: unknown, space?: number): string {
  return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString(10) : v), space);
}
