/**
 * Smoke tests for @pit/shared. Run with: bun run src/__tests__/smoke.ts
 * Uses plain node:assert/strict — zero extra deps.
 */

import assert from "node:assert/strict";
import {
  encodeMessage,
  parseMessage,
  WsMessageSchema,
  assertDisplayName,
  DisplayNameSchema,
  toBig,
  toWire,
  stringifyWithBigInt,
  BOT_COLORS,
  MONAD_TESTNET_CHAIN_ID,
} from "../index.js";

// 1. Constants exist and are correct.
assert.equal(MONAD_TESTNET_CHAIN_ID, 10143);
assert.equal(BOT_COLORS.length, 12);

// 2. Display name validation.
assert.equal(assertDisplayName("0xR1PP3R"), "0xR1PP3R");
assert.throws(() => DisplayNameSchema.parse(""), /min/);
assert.throws(() => DisplayNameSchema.parse("a".repeat(25)), /max/);
assert.throws(() => DisplayNameSchema.parse(" leading"), /whitespace/);
assert.throws(() => DisplayNameSchema.parse("emoji🤖"), /ASCII/);

// 3. BigInt roundtrip via wire.
const original = {
  type: "extraction" as const,
  event: {
    searcherId: ("0x" + "ab".repeat(20)) as `0x${string}`,
    victimId: 7,
    amountExtracted: 12_345_678_901_234_567_890n,
    gasSpent: 21_000n,
    blockNumber: 99,
    txHash: "0xdeadbeef" as `0x${string}`,
    timestamp: Date.now(),
    roundId: 1,
  },
};
const encoded = encodeMessage(original as never);
assert.equal(typeof encoded, "string");
const decoded = parseMessage(encoded);
assert.equal(decoded.type, "extraction");
if (decoded.type === "extraction") {
  assert.equal(decoded.event.amountExtracted, 12_345_678_901_234_567_890n);
  assert.equal(typeof decoded.event.amountExtracted, "bigint");
  assert.equal(decoded.event.gasSpent, 21_000n);
}

// 4. Invalid message rejected.
assert.throws(() => parseMessage('{"type":"nope"}'), /invalid_union_discriminator|Invalid/i);

// 5. toBig and stringifyWithBigInt.
assert.equal(toBig("42"), 42n);
assert.throws(() => toBig("12.3"));
assert.match(stringifyWithBigInt({ x: 1n }), /"x":"1"/);

// 6. toWire strips functions.
const stripped = toWire({ a: 1, b: () => 0, c: { d: 2n } });
assert.deepEqual(stripped, { a: 1, c: { d: "2" } });

// 7. Discriminated union accepts all message types.
for (const t of [
  "pending_tx",
  "tx_broadcast",
  "extraction",
  "score_update",
  "round_start",
  "round_end",
  "bot_registered",
  "hello",
  "error",
]) {
  const ok = WsMessageSchema.options.some((s) => s.shape.type.value === t);
  assert.equal(ok, true, `missing message type: ${t}`);
}

// 8. Deployment artifact validation.
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeploymentArtifactSchema, loadDeployment, DEPLOYMENT_SCHEMA_VERSION } from "../deployments.js";

const validArtifact = {
  schemaVersion: DEPLOYMENT_SCHEMA_VERSION,
  chainId: 10143,
  deployedAt: 1_700_000_000,
  deployer: "0x" + "a".repeat(40),
  coordinator: "0x" + "b".repeat(40),
  coliseum: "0x" + "c".repeat(40),
  tokens: {
    WMON: "0x" + "1".repeat(40),
    PIT: "0x" + "2".repeat(40),
  },
  dexes: {
    DEX_A: "0x" + "3".repeat(40),
    DEX_B: "0x" + "4".repeat(40),
  },
  pair: {
    token0: "0x" + "1".repeat(40),
    token1: "0x" + "2".repeat(40),
  },
};

// Validates a well-formed artifact.
const parsed = DeploymentArtifactSchema.parse(validArtifact);
assert.equal(parsed.chainId, 10143);
assert.equal(parsed.tokens.WMON, validArtifact.tokens.WMON);

// Rejects schema mismatch via loadDeployment.
const tmp = mkdtempSync(join(tmpdir(), "pit-"));
const path = join(tmp, "monad-testnet.json");
writeFileSync(path, JSON.stringify({ ...validArtifact, schemaVersion: 999 }));
assert.throws(() => loadDeployment(path), /schema mismatch/i);

// Round-trip a real load.
writeFileSync(path, JSON.stringify(validArtifact));
const loaded = loadDeployment(path);
assert.equal(loaded.coordinator, validArtifact.coordinator);
rmSync(tmp, { recursive: true, force: true });

// Forge JSON quirk: vm.serializeUint emits hex strings for some integer fields.
// Confirm z.coerce.number() handles "0x..." correctly.
const hexyArtifact = { ...validArtifact, schemaVersion: "0x1", chainId: "0x279f", deployedAt: "0x65b9b400" };
const coerced = DeploymentArtifactSchema.parse(hexyArtifact);
assert.equal(coerced.schemaVersion, 1);
assert.equal(coerced.chainId, 10143);

console.log("✅ @pit/shared smoke tests passed");
