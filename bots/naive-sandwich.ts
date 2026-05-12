import { loadBotConfig } from "./lib/config.js";
import { Searcher } from "./lib/searcher.js";
import { MIN_SANDWICH_VALUE_WEI, type VictimTx } from "@pit/shared";

/**
 * 0xR1PP3R — naive sandwich bot. Sees a juicy victim, plans front-run + back-run.
 *
 * In Prompt 7 this will actually compute the optimal front-run amount via closed-form
 * (constant-product, ignoring fees: x_opt = sqrt(k * V / r0) - r0, where V is victim's amountIn).
 * For now we just log intent on sufficiently large victims.
 */
class SandwichBot extends Searcher {
  protected onPendingTx(tx: VictimTx) {
    if (tx.kind !== "swap" && tx.kind !== "arb") return;
    if (tx.extractableValue < MIN_SANDWICH_VALUE_WEI) return;
    this.log.info(
      {
        victimId: tx.id,
        ev: tx.extractableValue.toString(),
        pool: tx.poolAddress,
      },
      "ACTING — would sandwich (front-run + back-run)",
    );
    // In Prompt 7: submit front-run, then on tx_broadcast confirmation, submit back-run.
  }
}

const cfg = loadBotConfig({
  privateKeyEnv: "BOT_SANDWICH_PRIVATE_KEY",
  displayName: process.env.BOT_DISPLAY_NAME ?? "0xR1PP3R",
});
new SandwichBot(cfg).start();
