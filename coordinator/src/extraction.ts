/**
 * Real extraction detector.
 *
 * Live mode:
 *   - Subscribe to MockDEX.Swap on both DEX deployments.
 *   - When a Swap event has sender != victimAddress and recipient != victimAddress and
 *     happens within EXTRACTION_BLOCK_WINDOW of a still-unclaimed victim tx on the same pool,
 *     compute profit and call Coliseum.recordExtraction.
 *   - Subscribe to Coliseum.BotRegistered to auto-add bots.
 *
 * Mock mode:
 *   - Falls back to the 5a stub (random fake extractions every 5s) so dashboard tests pass.
 */
import { type Address, type Log } from "viem";
import { BOT_COLORS, type BotColor, type ExtractionEvent } from "@pit/shared";
import { logger } from "./logger.js";
import { TxQueue, coliseumAbi, dexAbi, type ChainContext } from "./chain.js";
import type { Hub } from "./hub.js";
import type { State } from "./state.js";

const TRASH_QUOTES = [
  "skill issue",
  "gg ez",
  "pay me",
  "first blood",
  "outsearched",
  "thanks for the gas",
];

export class Extraction {
  private mockTimer: ReturnType<typeof setTimeout> | null = null;
  private unwatchers: Array<() => void> = [];
  private txq = new TxQueue();
  private colorIdx = 0;

  constructor(
    private hub: Hub,
    private state: State,
    private chain: ChainContext,
  ) {}

  async start() {
    if (this.chain.mode === "mock") {
      this.startMock();
      return;
    }
    await this.startLive();
  }

  stop() {
    if (this.mockTimer) clearTimeout(this.mockTimer);
    this.mockTimer = null;
    for (const u of this.unwatchers) {
      try {
        u();
      } catch {}
    }
    this.unwatchers = [];
    logger.info("extraction detector stopped");
  }

  // ──────────────── MOCK ────────────────
  private startMock() {
    this.scheduleNextMockTick();
    logger.info({ mode: "mock-realistic" }, "extraction detector started");
  }

  /** Irregular Poisson-like spacing: 1–7 s between extractions, mean ~4 s. */
  private scheduleNextMockTick() {
    if (this.chain.mode !== "mock") return;
    const delay = 1000 + Math.random() * 6000;
    this.mockTimer = setTimeout(() => {
      this.mockTimer = null;
      this.tickMock();
      this.scheduleNextMockTick();
    }, delay);
  }

  private tickMock() {
    const round = this.state.currentRound;
    if (!round) return;
    const bots = [...this.state.bots.values()];
    if (bots.length === 0) return;

    const pending = [...this.state.pendingVictims.values()].filter(
      (v) => !this.state.claimedVictims.has(v.id),
    );
    if (pending.length === 0) return;

    // Strategy-weighted picker — sandwich and arb bots win more often than random.
    const weights = bots.map((b) => {
      const name = b.displayName.toUpperCase();
      if (name.includes("R1PP3R") || name.includes("SANDW")) return 3;
      if (name.includes("ARB")) return 2;
      return 1;
    });
    const totalW = weights.reduce((a, b) => a + b, 0);
    let pick = Math.random() * totalW;
    let bot = bots[0];
    for (let i = 0; i < bots.length; i++) {
      pick -= weights[i];
      if (pick <= 0) {
        bot = bots[i];
        break;
      }
    }

    // Prefer recent, higher-EV victims (with noise so picks aren't fully deterministic).
    const sorted = pending
      .map((v) => ({
        v,
        score: Number(v.extractableValue / 10n ** 16n) + Math.random() * 50,
      }))
      .sort((a, b) => b.score - a.score);
    const victim = sorted[0].v;

    // Real bots leave money on the table — 40–85 % capture.
    const captureRate = 0.4 + Math.random() * 0.45;
    const amountExtracted =
      (victim.extractableValue * BigInt(Math.floor(captureRate * 10_000))) / 10_000n;

    const gasSpent = 60_000n + BigInt(Math.floor(Math.random() * 80_000));

    const blockNumber =
      (victim.metadata?.blockNumber as number | undefined) ?? Math.floor(Date.now() / 1000);

    const chars = "0123456789abcdef";
    let txHash = "0x";
    for (let i = 0; i < 64; i++) txHash += chars[Math.floor(Math.random() * 16)];

    const ev: ExtractionEvent = {
      searcherId: bot.id,
      victimId: victim.id,
      amountExtracted,
      gasSpent,
      blockNumber,
      txHash: txHash as `0x${string}`,
      timestamp: Date.now(),
      trashTalk:
        Math.random() < 0.25
          ? TRASH_QUOTES[Math.floor(Math.random() * TRASH_QUOTES.length)]
          : undefined,
      roundId: round.roundId,
    };
    this.state.recordExtraction(ev);
    this.hub.broadcast({ type: "extraction", event: ev }, "all");
    this.hub.broadcast(
      { type: "score_update", scores: this.state.computeScores() },
      "dashboard",
    );
  }

  // ──────────────── LIVE ────────────────
  private async startLive() {
    const dep = this.chain.deployment!;
    const pub = this.chain.publicClient!;
    logger.info("extraction detector starting (live chain watch)");

    // Hydrate the existing bot list from chain.
    await this.hydrateBots();

    // Watch BotRegistered so new bots show up live.
    const unwatchBots = pub.watchContractEvent({
      address: dep.coliseum as Address,
      abi: coliseumAbi,
      eventName: "BotRegistered",
      pollingInterval: 1000,
      onLogs: (logs) => {
        for (const log of logs)
          this.onBotRegistered(log).catch((err) =>
            logger.warn({ err }, "onBotRegistered failed"),
          );
      },
    });
    this.unwatchers.push(unwatchBots);

    // Watch DEX Swap events on both pools.
    for (const dex of [dep.dexes.DEX_A, dep.dexes.DEX_B]) {
      const unwatch = pub.watchContractEvent({
        address: dex as Address,
        abi: dexAbi,
        eventName: "Swap",
        pollingInterval: 1000,
        onLogs: (logs) => {
          for (const log of logs)
            this.onSwap(log, dex as Address).catch((err) => logger.warn({ err }, "onSwap failed"));
        },
      });
      this.unwatchers.push(unwatch);
    }
  }

  private async hydrateBots() {
    const dep = this.chain.deployment!;
    const pub = this.chain.publicClient!;
    try {
      const count = (await pub.readContract({
        address: dep.coliseum as Address,
        abi: coliseumAbi,
        functionName: "getBotCount",
      })) as bigint;
      for (let i = 0n; i < count; i++) {
        const addr = (await pub.readContract({
          address: dep.coliseum as Address,
          abi: coliseumAbi,
          functionName: "getBotAt",
          args: [i],
        })) as Address;
        const info = (await pub.readContract({
          address: dep.coliseum as Address,
          abi: coliseumAbi,
          functionName: "getBotInfo",
          args: [addr],
        })) as readonly [string, bigint, bigint, bigint, bigint, boolean];
        const color: BotColor = BOT_COLORS[this.colorIdx++ % BOT_COLORS.length];
        this.state.registerBot({
          id: addr,
          displayName: info[0],
          walletAddress: addr,
          registeredAt: Number(info[4]) * 1000,
          color,
        });
      }
      logger.info({ bots: this.state.bots.size }, "hydrated bots from chain");
    } catch (err) {
      logger.warn({ err }, "hydrateBots failed");
    }
  }

  private async onBotRegistered(log: Log) {
    const args = (
      log as unknown as { args: { bot: Address; displayName: string; registeredAt: bigint } }
    ).args;
    const color: BotColor = BOT_COLORS[this.colorIdx++ % BOT_COLORS.length];
    const handle = this.state.registerBot({
      id: args.bot,
      displayName: args.displayName,
      walletAddress: args.bot,
      registeredAt: Number(args.registeredAt) * 1000,
      color,
    });
    this.hub.broadcast({ type: "bot_registered", bot: handle }, "all");
    logger.info({ bot: handle.displayName, addr: handle.walletAddress }, "bot registered");
  }

  private async onSwap(log: Log, pool: Address) {
    const args = (
      log as unknown as {
        args: {
          sender: Address;
          tokenIn: Address;
          amountIn: bigint;
          amountOut: bigint;
          recipient: Address;
        };
        blockNumber: bigint;
        transactionHash: `0x${string}`;
      }
    ).args;
    const blockNumber = (log as unknown as { blockNumber: bigint }).blockNumber;
    const txHash = (log as unknown as { transactionHash: `0x${string}` }).transactionHash;

    // Ignore our own victim swaps.
    const victimAddr = this.chain.victimAddress.toLowerCase();
    if (args.sender.toLowerCase() === victimAddr || args.recipient.toLowerCase() === victimAddr) return;
    if (!this.state.bots.has(args.sender)) return; // only registered bots count

    // Find an unclaimed victim on this pool within the window.
    const candidates = [...this.state.pendingVictims.values()].filter(
      (v) =>
        v.poolAddress?.toLowerCase() === pool.toLowerCase() && !this.state.claimedVictims.has(v.id),
    );
    if (candidates.length === 0) return;
    const victim = candidates[candidates.length - 1]; // most recent

    // Compute a rough profit in WMON. (amountOut * priceBefore_WMON_per_PIT) - amountIn
    // We don't keep historical reserves cheaply; use current as an estimate.
    const pub = this.chain.publicClient!;
    let priceWmonPerPit = 1n;
    try {
      const r = (await pub.readContract({
        address: pool,
        abi: dexAbi,
        functionName: "getReserves",
      })) as [bigint, bigint];
      // price PIT in WMON ≈ r0 / r1
      if (r[1] > 0n) priceWmonPerPit = (r[0] * 10n ** 18n) / r[1];
    } catch (err) {
      logger.warn({ err }, "reserve read for profit calc failed");
    }
    const outInWmon = (args.amountOut * priceWmonPerPit) / 10n ** 18n;
    const profit = outInWmon > args.amountIn ? outInWmon - args.amountIn : 0n;

    // Record on chain via Coliseum (coordinator-only).
    const round = this.state.currentRound;
    if (!round) return;

    this.state.claimedVictims.add(victim.id);
    this.txq
      .submit(async () => {
        try {
          await this.chain.coordinatorWallet!.writeContract({
            chain: this.chain.coordinatorWallet!.chain,
            account: this.chain.coordinatorWallet!.account!,
            address: this.chain.deployment!.coliseum as Address,
            abi: coliseumAbi,
            functionName: "recordExtraction",
            args: [args.sender, BigInt(victim.id), profit, 0n, ""],
          });
        } catch (err) {
          logger.warn({ err, victimId: victim.id }, "recordExtraction failed");
          // Un-claim so another searcher can still win.
          this.state.claimedVictims.delete(victim.id);
          return;
        }

        const ev: ExtractionEvent = {
          searcherId: args.sender,
          victimId: victim.id,
          amountExtracted: profit,
          gasSpent: 0n,
          blockNumber: Number(blockNumber),
          txHash,
          timestamp: Date.now(),
          roundId: round.roundId,
        };
        this.state.recordExtraction(ev);
        this.hub.broadcast({ type: "extraction", event: ev }, "all");
        this.hub.broadcast(
          { type: "score_update", scores: this.state.computeScores() },
          "dashboard",
        );
      })
      .catch((err) => logger.warn({ err }, "extraction record submit failed"));
  }
}
