import { loadBotConfig } from "./lib/config.js";
import { Searcher } from "./lib/searcher.js";
import type { VictimTx } from "@pit/shared";

/**
 * WH4LE-W4TCH — boss hunter. Sits quietly, ignores small fish, only opens fire on
 * boss-tagged victims or jackpot-sized opportunities (EV ≥ 10 MON).
 *
 * Trades volume for impact: fewer kills but each one is a big number, designed to
 * leapfrog the leaderboard when a single mega-swap lands.
 */
class WhaleWatchBot extends Searcher {
  private static JACKPOT_WEI = 10n * 10n ** 18n; // 10 MON
  private hits = 0;
  private seen = 0;

  protected onPendingTx(tx: VictimTx) {
    this.seen += 1;
    const isBoss = tx.metadata?.boss === true;
    const isJackpot = tx.extractableValue >= WhaleWatchBot.JACKPOT_WEI;
    if (!isBoss && !isJackpot) {
      if (this.seen % 50 === 0) {
        this.log.debug({ seen: this.seen, hits: this.hits }, "lurking…");
      }
      return;
    }
    this.hits += 1;
    this.log.info(
      {
        victimId: tx.id,
        boss: isBoss,
        ev: tx.extractableValue.toString(),
        pool: tx.poolAddress,
        seenBeforeHit: this.seen,
        totalHits: this.hits,
      },
      isBoss ? "ACTING — BOSS sighted, all-in" : "ACTING — JACKPOT swap, maximum pressure",
    );
    this.seen = 0;
    // In Prompt 7: build oversized counter-swap on the same pool, then unwind.
  }
}

const cfg = loadBotConfig({
  privateKeyEnv: "BOT_WHALE_PRIVATE_KEY",
  displayName: process.env.BOT_DISPLAY_NAME ?? "WH4LE-W4TCH",
});
new WhaleWatchBot(cfg).start();
