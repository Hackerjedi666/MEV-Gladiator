import { loadBotConfig } from "./lib/config.js";
import { Searcher } from "./lib/searcher.js";
import type { VictimTx } from "@pit/shared";

/**
 * TH3-L1QU1D8R — liquidation specialist. Triggers on:
 *   1. Any victim flagged kind="liquidation" (direct lending-protocol opportunity)
 *   2. Very large swaps (EV ≥ 3 MON) treated as "collateral under pressure"
 *
 * In Prompt 7 / future contracts this will call MockLending.liquidate() with calldata
 * computed from the victim's exposed position. For now we log intent.
 */
class LiquidatorBot extends Searcher {
  private static MIN_PRESSURE_WEI = 3n * 10n ** 18n; // 3 MON
  private liquidated = 0;

  protected onPendingTx(tx: VictimTx) {
    const isLiquidation = tx.kind === "liquidation";
    const isUnderwater = tx.extractableValue >= LiquidatorBot.MIN_PRESSURE_WEI;
    if (!isLiquidation && !isUnderwater) return;
    this.liquidated += 1;
    this.log.info(
      {
        victimId: tx.id,
        kind: tx.kind,
        ev: tx.extractableValue.toString(),
        pool: tx.poolAddress,
        totalLiquidated: this.liquidated,
      },
      isLiquidation
        ? "ACTING — would liquidate underwater position"
        : "ACTING — pressure swap (would liquidate adjacent collateral)",
    );
    // In Prompt 7: build liquidation calldata, submit through TxQueue.
  }
}

const cfg = loadBotConfig({
  privateKeyEnv: "BOT_LIQ_PRIVATE_KEY",
  displayName: process.env.BOT_DISPLAY_NAME ?? "TH3-L1QU1D8R",
});
new LiquidatorBot(cfg).start();
