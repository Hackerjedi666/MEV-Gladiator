/**
 * Pure-unit test of Mempool.tickLive's profit math, with viem client calls stubbed.
 * Run via: bun run src/__tests__/live-mempool.test.ts
 */
import assert from "node:assert/strict";
import { Mempool } from "../mempool.js";
import { State } from "../state.js";
import { Recorder } from "../recorder.js";
import { Hub } from "../hub.js";
import type { ChainContext } from "../chain.js";

function fakeChain(): ChainContext {
  const reserves: [bigint, bigint] = [100_000n * 10n ** 18n, 100_000n * 10n ** 18n];
  return {
    mode: "live",
    deployment: {
      schemaVersion: 1,
      chainId: 10143,
      deployedAt: 0,
      deployer: ("0x" + "1".repeat(40)) as `0x${string}`,
      coordinator: ("0x" + "2".repeat(40)) as `0x${string}`,
      coliseum: ("0x" + "3".repeat(40)) as `0x${string}`,
      tokens: {
        WMON: ("0x" + "4".repeat(40)) as `0x${string}`,
        PIT: ("0x" + "5".repeat(40)) as `0x${string}`,
      },
      dexes: {
        DEX_A: ("0x" + "6".repeat(40)) as `0x${string}`,
        DEX_B: ("0x" + "7".repeat(40)) as `0x${string}`,
      },
      pair: {
        token0: ("0x" + "4".repeat(40)) as `0x${string}`,
        token1: ("0x" + "5".repeat(40)) as `0x${string}`,
      },
    },
    publicClient: {
      readContract: async () => reserves,
    } as never,
    coordinatorWallet: null,
    victimWallet: {
      account: { address: ("0x" + "b".repeat(40)) as `0x${string}` },
      chain: { id: 10143 },
      writeContract: async () => ("0x" + "a".repeat(64)) as `0x${string}`,
    } as never,
    coordinatorAddress: ("0x" + "2".repeat(40)) as `0x${string}`,
    victimAddress: ("0x" + "b".repeat(40)) as `0x${string}`,
  };
}

const state = new State();
state.currentRound = {
  roundId: 1,
  mode: "sandwich",
  durationMs: 60_000,
  victimRateMs: 250,
  startedAt: Date.now(),
  endsAt: Date.now() + 60_000,
};
const recorder = new Recorder();
const hub = new Hub(recorder);
const chain = fakeChain();
const mp = new Mempool(hub, state, chain);

// Invoke private method via cast — this is a smoke check, not a public API contract.
await (mp as unknown as { tickLive: (m: string) => Promise<void> }).tickLive("sandwich");
await new Promise((r) => setTimeout(r, 100)); // let the headstart + writeContract resolve

assert.equal(state.pendingVictims.size, 1, "expected one pending victim");
const v = [...state.pendingVictims.values()][0];
assert.ok(v.extractableValue > 0n, `extractableValue should be > 0, got ${v.extractableValue}`);
assert.equal(v.kind, "swap");

console.log("✅ live-mempool unit ok  ev=" + v.extractableValue.toString());
