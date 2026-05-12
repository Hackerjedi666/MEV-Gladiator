/**
 * Runtime validators for primitive shapes (addresses, hex, display names).
 * Zod schemas for higher-level shapes live in messages.ts.
 */

import { z } from "zod";
import { DISPLAY_NAME_MAX_LEN, DISPLAY_NAME_MIN_LEN } from "./constants.js";

/** 0x-prefixed hex string. */
export const HexSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]*$/u, "expected 0x-prefixed hex");

/** 20-byte address. */
export const AddressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/u, "expected 20-byte 0x address");

/** Decimal-string bigint (wire form). Promotes to bigint after parsing. */
export const BigIntStringSchema = z
  .string()
  .regex(/^-?\d+$/u, "expected decimal integer string")
  .transform((s) => BigInt(s));

/** Display name: ASCII printable 0x20..0x7E, 1..24 chars, trimmed. */
export const DisplayNameSchema = z
  .string()
  .min(DISPLAY_NAME_MIN_LEN, `min ${DISPLAY_NAME_MIN_LEN} char`)
  .max(DISPLAY_NAME_MAX_LEN, `max ${DISPLAY_NAME_MAX_LEN} chars`)
  .regex(/^[\x20-\x7E]+$/u, "ASCII printable only")
  .refine((s) => s === s.trim(), "no leading/trailing whitespace");

/** Convenience: assert helper that throws on invalid input. */
export function assertDisplayName(name: string): string {
  return DisplayNameSchema.parse(name);
}

/** Convenience: assert helper for addresses. */
export function assertAddress(addr: string): `0x${string}` {
  return AddressSchema.parse(addr) as `0x${string}`;
}
