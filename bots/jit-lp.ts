import { loadBotConfig } from "./lib/config.js";
import { Searcher } from "./lib/searcher.js";
import type { VictimTx } from "@pit/shared";

/**
 * JITKING — just-in-time liquidity provider. Sandwiches large victim swaps NOT by
 * trading against them, but by adding LP one block before and removing one block after,
 * collecting the fee that would otherwise go to passive LPs.
 *
 * Triggers on swap-kind victims with `metadata.amountIn` above a threshold (only big
 * swaps generate enough fee to justify the gas of two LP ops).
 *
 * In Prompt 7 this will call MockDEX.addLiquidity right before the victim block, then
 * removeLiquidity after, with the share size scaled to the victim's amountIn.
 */
class JitLpBot extends Searcher {
  private static MIN_VICTIM_IN_WEI = 500n * 10n ** 18n; // 500 token-base-units in
  private deployed = 0;

  protected onPendingTx(tx: VictimTx) {
    if (tx.kind !== "swap") return;
    const amountInStr = tx.metadata?.amountIn;
    if (typeof amountInStr !== "string") return;
    let amountIn: bigint;
    try {
      amountIn = BigInt(amountInStr);
    } catch {
      return;
    }
    if (amountIn < JitLpBot.MIN_VICTIM_IN_WEI) return;
    this.deployed += 1;
    this.log.info(
      {
        victimId: tx.id,
        amountIn: amountIn.toString(),
        ev: tx.extractableValue.toString(),
        pool: tx.poolAddress,
        totalDeployed: this.deployed,
      },
      "ACTING — would add JIT liquidity (then withdraw post-swap)",
    );
    // In Prompt 7: addLiquidity pre-victim, removeLiquidity on tx_broadcast.
  }
}

const cfg = loadBotConfig({
  privateKeyEnv: "BOT_JIT_PRIVATE_KEY",
  displayName: process.env.BOT_DISPLAY_NAME ?? "JITKING",
});
new JitLpBot(cfg).start();
