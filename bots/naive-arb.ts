import { loadBotConfig } from "./lib/config.js";
import { Searcher } from "./lib/searcher.js";
import type { VictimTx } from "@pit/shared";

/**
 * ARB1TRON — watches for arb-mode victims. In live mode (Prompt 7) it'll check both DEX prices
 * and submit a rebalancing swap. Here it just declares intent on any "arb"-kind victim, or any
 * swap that creates >0.5% price impact (we approximate via extractableValue threshold).
 */
class ArbBot extends Searcher {
  private static MIN_IMPACT_WEI = 5n * 10n ** 17n; // 0.5 MON

  protected onPendingTx(tx: VictimTx) {
    const trigger = tx.kind === "arb" || tx.extractableValue >= ArbBot.MIN_IMPACT_WEI;
    if (!trigger) return;
    this.log.info(
      {
        victimId: tx.id,
        kind: tx.kind,
        ev: tx.extractableValue.toString(),
        pool: tx.poolAddress,
      },
      "ACTING on arb opportunity (would submit rebalance swap)",
    );
    // In Prompt 7: read both DEX reserves, compute the rebalance direction + size, submit.
  }
}

const cfg = loadBotConfig({
  privateKeyEnv: "BOT_ARB_PRIVATE_KEY",
  displayName: process.env.BOT_DISPLAY_NAME ?? "ARB1TRON",
});
new ArbBot(cfg).start();
