import {
  DEFAULT_ROUND_DURATION_MS,
  DEFAULT_VICTIM_INTERVAL_MS,
  type RoundConfig,
  type RoundMode,
  type RoundResult,
} from "@pit/shared";
import { logger } from "./logger.js";
import type { ChainContext } from "./chain.js";
import { coliseumAbi, TxQueue } from "./chain.js";
import type { State } from "./state.js";
import type { Hub } from "./hub.js";

export class RoundManager {
  private txq = new TxQueue();
  private endTimer: ReturnType<typeof setTimeout> | null = null;
  private lastRoundId = 0;

  constructor(
    private chain: ChainContext,
    private state: State,
    private hub: Hub,
    private onStart: (cfg: RoundConfig) => void,
    private onEnd: (result: RoundResult) => void,
  ) {}

  async start(opts: { mode?: RoundMode; durationMs?: number; victimRateMs?: number } = {}) {
    if (this.state.currentRound) throw new Error("round already active");

    const mode = opts.mode ?? "sandwich";
    const durationMs = opts.durationMs ?? DEFAULT_ROUND_DURATION_MS;
    const victimRateMs = opts.victimRateMs ?? DEFAULT_VICTIM_INTERVAL_MS;

    let roundId = 0;
    if (this.chain.mode === "live") {
      roundId = await this.txq.submit(async () => {
        await this.chain.coordinatorWallet!.writeContract({
          chain: this.chain.coordinatorWallet!.chain,
          account: this.chain.coordinatorWallet!.account!,
          address: this.chain.deployment!.coliseum as `0x${string}`,
          abi: coliseumAbi,
          functionName: "startRound",
          args: [],
        });
        const id = await this.chain.publicClient!.readContract({
          address: this.chain.deployment!.coliseum as `0x${string}`,
          abi: coliseumAbi,
          functionName: "currentRoundId",
        });
        return Number(id);
      });
    } else {
      roundId = ++this.lastRoundId;
    }
    this.lastRoundId = roundId;

    const now = Date.now();
    const cfg: RoundConfig = {
      roundId,
      mode,
      durationMs,
      victimRateMs,
      startedAt: now,
      endsAt: now + durationMs,
    };
    this.state.currentRound = cfg;
    logger.info({ cfg }, "round started");
    this.onStart(cfg);

    // Auto-end timer
    this.endTimer = setTimeout(() => {
      this.end().catch((err) => logger.error({ err }, "auto-end failed"));
    }, durationMs);
  }

  async end() {
    const cfg = this.state.currentRound;
    if (!cfg) throw new Error("no round active");
    if (this.endTimer) {
      clearTimeout(this.endTimer);
      this.endTimer = null;
    }

    const finalScores = this.state.computeScores();
    const winner = finalScores[0];
    const winnerHandle = winner ? this.state.bots.get(winner.searcherId) : undefined;

    if (this.chain.mode === "live") {
      await this.txq.submit(async () => {
        await this.chain.coordinatorWallet!.writeContract({
          chain: this.chain.coordinatorWallet!.chain,
          account: this.chain.coordinatorWallet!.account!,
          address: this.chain.deployment!.coliseum as `0x${string}`,
          abi: coliseumAbi,
          functionName: "endRound",
          args: [
            (winnerHandle?.walletAddress ??
              "0x0000000000000000000000000000000000000000") as `0x${string}`,
          ],
        });
      });
    }

    const totalExtracted = this.state.recentExtractions
      .filter((e) => e.roundId === cfg.roundId)
      .reduce((a, e) => a + e.amountExtracted, 0n);

    const result: RoundResult = {
      roundId: cfg.roundId,
      winner: winnerHandle,
      finalScores,
      totalExtracted,
      totalVictims: this.state.victimIdCounter,
    };

    this.state.currentRound = null;
    logger.info({ result }, "round ended");
    this.onEnd(result);
  }

  isActive(): boolean {
    return this.state.currentRound !== null;
  }
}
