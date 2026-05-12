/**
 * Real mempool generator for live mode. Falls back to the prior stub behavior in mock mode.
 *
 * Live mode flow per tick:
 *   1. Pick a victim swap shape based on RoundConfig.mode
 *   2. Compute extractableValue from current pool reserves
 *   3. Build the VictimTx record with a placeholder hash and broadcast `pending_tx` to WS
 *   4. Sleep DEFAULT_HEADSTART_MS to give searchers a chance
 *   5. Sign and submit the tx via viem
 *   6. Once the hash is known, broadcast `tx_broadcast` with the real hash
 *
 * Errors are logged and skipped — never crash the loop.
 */
import { encodeFunctionData, type Address, type Hex } from "viem";
import {
  MIN_SANDWICH_VALUE_WEI,
  DEFAULT_HEADSTART_MS,
  BOSS_MULTIPLIER,
  type VictimTx,
} from "@pit/shared";
import { logger } from "./logger.js";
import { TxQueue, dexAbi, type ChainContext } from "./chain.js";
import type { Hub } from "./hub.js";
import type { State } from "./state.js";

const HEADSTART_MS = DEFAULT_HEADSTART_MS;

export class Mempool {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private intervalMs = 250;
  private txq = new TxQueue();
  private bossCounter = 0;

  // Synthetic state used in mock mode to make broadcasts look chain-like.
  private syntheticReserves: Map<string, [bigint, bigint]> = new Map();
  private syntheticBaselines: Map<string, [bigint, bigint]> = new Map();
  private syntheticBlock: number = 1_000_000 + Math.floor(Math.random() * 100_000);
  private syntheticVictimWallets: `0x${string}`[] = [];
  private lastBlockAt: number = Date.now();

  constructor(
    private hub: Hub,
    private state: State,
    private chain: ChainContext,
  ) {}

  start(intervalMs: number) {
    if (this.timer) return;
    this.intervalMs = intervalMs;
    const scheduleNext = () => {
      // ±20 % jitter so emission isn't perfectly periodic.
      const jitter = this.intervalMs * (0.8 + Math.random() * 0.4);
      this.timer = setTimeout(loop, jitter);
    };
    const loop = () => {
      this.tick().catch((err) => logger.error({ err }, "mempool tick failed"));
      scheduleNext();
    };
    this.timer = setTimeout(loop, intervalMs);
    logger.info({ intervalMs, mode: this.chain.mode }, "mempool started");
  }

  stop() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    logger.info("mempool stopped");
  }

  private async tick() {
    const round = this.state.currentRound;
    if (!round) return;

    if (this.chain.mode === "mock") {
      return this.tickMock(round.mode);
    }
    return this.tickLive(round.mode);
  }

  // ──────────────── MOCK MODE (chain-like synthetic) ────────────────
  private initSynthetic() {
    if (this.syntheticReserves.size === 0) {
      // Initialize reserves for both DEXes — slight imbalance to create arb opportunities.
      const dexA = this.chain.deployment!.dexes.DEX_A;
      const dexB = this.chain.deployment!.dexes.DEX_B;
      const baseA: [bigint, bigint] = [100_000n * 10n ** 18n, 100_000n * 10n ** 18n];
      const baseB: [bigint, bigint] = [99_500n * 10n ** 18n, 100_500n * 10n ** 18n];
      this.syntheticReserves.set(dexA, [baseA[0], baseA[1]]);
      this.syntheticReserves.set(dexB, [baseB[0], baseB[1]]);
      this.syntheticBaselines.set(dexA, baseA);
      this.syntheticBaselines.set(dexB, baseB);
    }
    if (this.syntheticVictimWallets.length === 0) {
      // Pool of 50 fake user wallets, deterministic hex.
      for (let i = 0; i < 50; i++) {
        const h = (i * 0x9e3779b1) >>> 0;
        const hex = h.toString(16).padStart(8, "0");
        this.syntheticVictimWallets.push(
          ("0x" + hex + hex + hex + hex + hex).slice(0, 42) as `0x${string}`,
        );
      }
    }
  }

  private bumpSyntheticBlock() {
    const now = Date.now();
    if (now - this.lastBlockAt > 900 + Math.random() * 300) {
      this.syntheticBlock += 1;
      this.lastBlockAt = now;
    }
  }

  private randomHash(): `0x${string}` {
    const chars = "0123456789abcdef";
    let s = "0x";
    for (let i = 0; i < 64; i++) {
      s += chars[Math.floor(Math.random() * 16)];
    }
    return s as `0x${string}`;
  }

  private tickMock(mode: string) {
    this.initSynthetic();
    this.bumpSyntheticBlock();

    const dep = this.chain.deployment!;
    const id = this.state.nextVictimId();
    const now = Date.now();

    const dexAddr = mode === "arb" ? (dep.dexes.DEX_B as Address) : (dep.dexes.DEX_A as Address);
    const tokenIn = dep.tokens.WMON as Address;

    // Mean-revert ~50 % toward baseline each tick — simulates arbitrageurs constantly
    // rebalancing real pools. Without this the pool drifts permanently and EVs explode.
    const baseline = this.syntheticBaselines.get(dexAddr)!;
    const stored = this.syntheticReserves.get(dexAddr)!;
    const r0 = stored[0] + (baseline[0] - stored[0]) / 2n;
    const r1 = stored[1] + (baseline[1] - stored[1]) / 2n;

    // Swap sizes calibrated so EV distribution matches: ~0.5 MON typical, ~5+ MON occasional.
    // 0.2–0.7 % of reserve0 normally; boss = 5×–10× (i.e. 1–7 %) for the big hits.
    const isBoss = mode === "boss" || Math.random() < 0.04;
    const basePct = 0.2 + Math.random() * 0.5;
    const pct = isBoss ? basePct * (5 + Math.random() * 5) : basePct;
    // amountIn = r0 * pct / 100, using basis-points precision for the bigint math.
    const amountIn = (r0 * BigInt(Math.floor(pct * 100))) / 10_000n;
    if (amountIn === 0n) return;

    // Real constant-product slippage math.
    const k = r0 * r1;
    const newR0 = r0 + amountIn;
    const newR1 = k / newR0;
    const actualOut = r1 - newR1;
    const idealOut = (amountIn * r1) / r0;
    const slippagePIT = idealOut - actualOut;
    let extractableValue = (slippagePIT * r0) / r1;

    // ±5 % noise so values aren't deterministic per pool state.
    const noise = BigInt(Math.floor((Math.random() - 0.5) * 1000));
    extractableValue = extractableValue + (extractableValue * noise) / 10_000n;
    if (extractableValue <= 0n) extractableValue = MIN_SANDWICH_VALUE_WEI;

    // The victim swap "executes" against synthetic reserves so future txs see drift.
    this.syntheticReserves.set(dexAddr, [newR0, newR1]);

    const victimWallet =
      this.syntheticVictimWallets[
        Math.floor(Math.random() * this.syntheticVictimWallets.length)
      ];

    const realisticHash = this.randomHash();
    const gasLimit = BigInt(180_000 + Math.floor(Math.random() * 120_000));
    const data = ("0x" + "00".repeat(132)) as Hex;

    const victim: VictimTx = {
      hash: realisticHash,
      from: victimWallet,
      to: dexAddr,
      data,
      value: 0n,
      gasLimit,
      nonce: id,
      chainId: dep.chainId,
      id,
      kind: mode === "arb" ? "arb" : mode === "liquidation" ? "liquidation" : "swap",
      extractableValue,
      emittedAt: now,
      poolAddress: dexAddr,
      metadata: {
        tokenIn,
        amountIn: amountIn.toString(),
        boss: isBoss,
        mode,
        blockNumber: this.syntheticBlock,
      },
    };
    this.state.pendingVictims.set(id, victim);
    this.hub.broadcast({ type: "pending_tx", tx: victim }, "all");

    // Simulated tx_broadcast after a realistic propagation delay.
    setTimeout(
      () => {
        victim.broadcastAt = Date.now();
        this.hub.broadcast(
          {
            type: "tx_broadcast",
            victimId: id,
            txHash: realisticHash,
            broadcastAt: victim.broadcastAt,
          },
          "all",
        );
      },
      80 + Math.random() * 60,
    );
  }

  // ──────────────── LIVE MODE ────────────────
  private async tickLive(mode: string) {
    const dep = this.chain.deployment!;
    const pub = this.chain.publicClient!;
    const wallet = this.chain.victimWallet!;

    // Liquidation in 5c is still mocked — no lending contract yet.
    if (mode === "liquidation") return this.tickMock(mode);

    const dex: Address = mode === "arb" ? (dep.dexes.DEX_B as Address) : (dep.dexes.DEX_A as Address);
    const isBoss = mode === "boss" || (mode === "sandwich" && ++this.bossCounter % 60 === 0);

    // Read reserves to size the swap.
    let r0: bigint, r1: bigint;
    try {
      const r = await pub.readContract({
        address: dex,
        abi: dexAbi,
        functionName: "getReserves",
      });
      [r0, r1] = r as [bigint, bigint];
    } catch (err) {
      logger.warn({ err }, "getReserves failed; skipping tick");
      return;
    }

    // Swap WMON -> PIT (token0 -> token1). 1–5% of reserve0, or 10x in boss.
    const basePct = 1 + Math.floor(Math.random() * 5);
    const pct = isBoss ? BigInt(basePct) * BOSS_MULTIPLIER : BigInt(basePct);
    const amountIn = (r0 * pct) / 100n;
    if (amountIn === 0n) return;

    const tokenIn = dep.tokens.WMON as Address;
    const victimAddr = this.chain.victimAddress;

    // Compute extractable value (approximation): the gap between idealOut and actualOut
    // = expected slippage, in PIT terms. Convert back to WMON via current price.
    const k = r0 * r1;
    const newR0 = r0 + amountIn;
    const newR1 = k / newR0;
    const actualOut = r1 - newR1;
    const idealOut = (amountIn * r1) / r0; // no-slippage rate
    const slippagePIT = idealOut - actualOut;
    // Price PIT in WMON ≈ r0 / r1, so slippagePIT * r0 / r1
    const extractableValue = (slippagePIT * r0) / r1;

    const id = this.state.nextVictimId();
    const now = Date.now();

    // Encode calldata for the on-chain swap.
    const data = encodeFunctionData({
      abi: dexAbi,
      functionName: "swap",
      args: [amountIn, tokenIn, 0n, victimAddr],
    });

    // Phase 1: emit pending_tx with a synthetic hash (we don't have the real one yet).
    const synthHash = ("0x" + id.toString(16).padStart(64, "f")) as Hex;
    const victim: VictimTx = {
      hash: synthHash,
      from: victimAddr,
      to: dex,
      data,
      value: 0n,
      gasLimit: 300_000n,
      nonce: 0, // viem fills it
      chainId: dep.chainId,
      id,
      kind: mode === "arb" ? "arb" : "swap",
      extractableValue,
      emittedAt: now,
      poolAddress: dex,
      metadata: { tokenIn, amountIn: amountIn.toString(), boss: isBoss, mode },
    };
    this.state.pendingVictims.set(id, victim);
    this.hub.broadcast({ type: "pending_tx", tx: victim }, "all");

    // Phase 2: head start
    await new Promise((r) => setTimeout(r, HEADSTART_MS));

    // Phase 3: submit on chain via TxQueue (serializes victim nonce usage)
    this.txq
      .submit(async () => {
        try {
          const hash = await wallet.writeContract({
            chain: wallet.chain,
            account: wallet.account!,
            address: dex,
            abi: dexAbi,
            functionName: "swap",
            args: [amountIn, tokenIn, 0n, victimAddr],
          });
          victim.hash = hash;
          victim.broadcastAt = Date.now();
          this.hub.broadcast(
            { type: "tx_broadcast", victimId: id, txHash: hash, broadcastAt: victim.broadcastAt },
            "all",
          );
        } catch (err) {
          logger.warn({ err, victimId: id }, "victim broadcast failed");
        }
      })
      .catch((err) => logger.warn({ err }, "txq submit failed"));
  }
}
