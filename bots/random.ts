import { loadBotConfig } from "./lib/config.js";
import { Searcher } from "./lib/searcher.js";
import type { VictimTx } from "@pit/shared";

/**
 * KAOSBOT — chaos control. Acts on a random subset of pending txs.
 * Useful as a baseline; if it lands extractions, the system attribution works.
 */
class RandomBot extends Searcher {
  private acted = 0;
  private skipped = 0;

  protected onPendingTx(tx: VictimTx) {
    if (Math.random() < 0.3) {
      this.acted += 1;
      this.log.info(
        { victimId: tx.id, kind: tx.kind, totalActed: this.acted },
        "ACTING on victim (would submit random tiny swap)",
      );
      // In Prompt 7: actually submit a small random swap on the same pool.
    } else {
      this.skipped += 1;
      if (this.skipped % 20 === 0) {
        this.log.debug({ acted: this.acted, skipped: this.skipped }, "stats");
      }
    }
  }
}

const cfg = loadBotConfig({
  privateKeyEnv: "BOT_RANDOM_PRIVATE_KEY",
  displayName: process.env.BOT_DISPLAY_NAME ?? "KAOSBOT",
});
new RandomBot(cfg).start();
