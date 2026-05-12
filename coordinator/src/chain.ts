import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  type PublicClient,
  type WalletClient,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { MONAD_TESTNET_CHAIN_ID } from "@pit/shared";
import { loadDeployment, type DeploymentArtifact } from "@pit/shared/deployments";
import { logger } from "./logger.js";
import type { Config } from "./config.js";

export const monadTestnet = defineChain({
  id: MONAD_TESTNET_CHAIN_ID,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
  blockExplorers: {
    default: { name: "Monad Explorer", url: "https://testnet.monadexplorer.com" },
  },
});

/** Minimal ABIs — only the functions we call. Stable across the project. */
export const coliseumAbi = [
  {
    type: "function",
    name: "startRound",
    inputs: [],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "endRound",
    inputs: [{ name: "winner", type: "address" }],
    outputs: [],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "recordExtraction",
    inputs: [
      { name: "searcher", type: "address" },
      { name: "victimId", type: "uint256" },
      { name: "amountExtracted", type: "uint256" },
      { name: "gasSpent", type: "uint256" },
      { name: "trashTalk", type: "string" },
    ],
    outputs: [],
    stateMutability: "nonpayable",
  },
  { type: "function", name: "owner", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" },
  { type: "function", name: "roundActive", inputs: [], outputs: [{ type: "bool" }], stateMutability: "view" },
  { type: "function", name: "currentRoundId", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  { type: "function", name: "getBotCount", inputs: [], outputs: [{ type: "uint256" }], stateMutability: "view" },
  {
    type: "function",
    name: "getBotAt",
    inputs: [{ name: "index", type: "uint256" }],
    outputs: [{ type: "address" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "getBotInfo",
    inputs: [{ name: "bot", type: "address" }],
    outputs: [
      { name: "displayName", type: "string" },
      { name: "totalExtracted", type: "uint256" },
      { name: "kills", type: "uint256" },
      { name: "gasSpent", type: "uint256" },
      { name: "registeredAt", type: "uint64" },
      { name: "exists", type: "bool" },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "BotRegistered",
    inputs: [
      { indexed: true, name: "bot", type: "address" },
      { indexed: false, name: "displayName", type: "string" },
      { indexed: false, name: "registeredAt", type: "uint64" },
    ],
  },
  {
    type: "event",
    name: "ExtractionRecorded",
    inputs: [
      { indexed: true, name: "searcher", type: "address" },
      { indexed: true, name: "roundId", type: "uint256" },
      { indexed: false, name: "victimId", type: "uint256" },
      { indexed: false, name: "amountExtracted", type: "uint256" },
      { indexed: false, name: "gasSpent", type: "uint256" },
      { indexed: false, name: "trashTalk", type: "string" },
    ],
  },
] as const;

export const dexAbi = [
  {
    type: "function",
    name: "swap",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "tokenIn", type: "address" },
      { name: "minAmountOut", type: "uint256" },
      { name: "recipient", type: "address" },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getReserves",
    inputs: [],
    outputs: [{ type: "uint112" }, { type: "uint112" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "quote",
    inputs: [
      { name: "amountIn", type: "uint256" },
      { name: "tokenIn", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "Swap",
    inputs: [
      { indexed: true, name: "sender", type: "address" },
      { indexed: true, name: "tokenIn", type: "address" },
      { indexed: false, name: "amountIn", type: "uint256" },
      { indexed: false, name: "amountOut", type: "uint256" },
      { indexed: true, name: "recipient", type: "address" },
    ],
  },
] as const;

export interface ChainContext {
  mode: "live" | "mock";
  deployment: DeploymentArtifact | null;
  publicClient: PublicClient | null;
  coordinatorWallet: WalletClient | null;
  victimWallet: WalletClient | null;
  coordinatorAddress: Address;
  victimAddress: Address;
}

/**
 * Deterministic-from-seed 40-char hex address. Stable across coordinator restarts so
 * mock-mode dashboards and clients see consistent pool/token addresses.
 */
function syntheticAddress(seed: string): `0x${string}` {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h + seed.charCodeAt(i)) & 0xffffffff;
  }
  const hex = Math.abs(h).toString(16).padStart(8, "0");
  const tail = (hex + hex + hex + hex + hex).slice(0, 32);
  return ("0x" + hex + tail) as `0x${string}`;
}

/**
 * Synthetic deployment used in mock mode. Real-looking addresses so the dashboard
 * is visually indistinguishable from a live-testnet run.
 */
export function buildMockDeployment(): DeploymentArtifact {
  return {
    schemaVersion: 1,
    chainId: MONAD_TESTNET_CHAIN_ID,
    deployedAt: Math.floor((Date.now() - 3600_000) / 1000),
    deployer: syntheticAddress("deployer"),
    coordinator: syntheticAddress("coordinator"),
    coliseum: syntheticAddress("coliseum-v1"),
    tokens: {
      WMON: syntheticAddress("wmon-token"),
      PIT: syntheticAddress("pit-token"),
    },
    dexes: {
      DEX_A: syntheticAddress("dex-alpha"),
      DEX_B: syntheticAddress("dex-beta"),
    },
    pair: {
      token0: syntheticAddress("wmon-token"),
      token1: syntheticAddress("pit-token"),
    },
  };
}

const MOCK_COORDINATOR = syntheticAddress("coordinator-eoa");
const MOCK_VICTIM = syntheticAddress("victim-eoa");

export function buildChainContext(config: Config): ChainContext {
  if (config.mode === "mock") {
    logger.warn("Chain context running in MOCK mode — no real RPC calls will be made");
    return {
      mode: "mock",
      deployment: buildMockDeployment(),
      publicClient: null,
      coordinatorWallet: null,
      victimWallet: null,
      coordinatorAddress: MOCK_COORDINATOR,
      victimAddress: MOCK_VICTIM,
    };
  }

  const deployment = loadDeployment(config.deploymentPath);
  const coordinatorAccount = privateKeyToAccount(config.coordinatorPrivateKey!);
  const victimAccount = privateKeyToAccount(config.victimPrivateKey!);

  if (coordinatorAccount.address.toLowerCase() !== deployment.coordinator.toLowerCase()) {
    throw new Error(
      `Coordinator key mismatch. Derived ${coordinatorAccount.address}, deployment expects ${deployment.coordinator}.`,
    );
  }

  const publicClient = createPublicClient({ chain: monadTestnet, transport: http(config.rpcUrl) });
  const coordinatorWallet = createWalletClient({
    account: coordinatorAccount,
    chain: monadTestnet,
    transport: http(config.rpcUrl),
  });
  const victimWallet = createWalletClient({
    account: victimAccount,
    chain: monadTestnet,
    transport: http(config.rpcUrl),
  });

  return {
    mode: "live",
    deployment,
    publicClient,
    coordinatorWallet,
    victimWallet,
    coordinatorAddress: coordinatorAccount.address,
    victimAddress: victimAccount.address,
  };
}

/** Per-wallet serial tx queue — every contract write goes through this. */
export class TxQueue {
  private chain = Promise.resolve<unknown>(undefined);
  async submit<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.chain.then(() => fn());
    this.chain = next.catch(() => undefined);
    return next;
  }
}
