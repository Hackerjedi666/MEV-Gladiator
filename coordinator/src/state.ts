import { BOT_COLORS, BLOCK_VIEW_DEPTH, MAX_LEADERBOARD_SIZE } from "@pit/shared";
import type {
  Address,
  BotHandle,
  ExtractionEvent,
  RoundConfig,
  Score,
  VictimTx,
  BlockView,
  BotColor,
} from "@pit/shared";

/** Mutable in-process state. Single-threaded thanks to Bun's event loop; no locks needed. */
export class State {
  bots = new Map<Address, BotHandle>();
  pendingVictims = new Map<number, VictimTx>(); // victimId -> VictimTx
  claimedVictims = new Set<number>(); // victimIds an extraction has been recorded for
  recentExtractions: ExtractionEvent[] = [];
  recentBlocks: BlockView[] = [];
  currentRound: RoundConfig | null = null;
  victimIdCounter = 0;
  /** monotonic counter; bots get a color by registration order. */
  private nextColorIndex = 0;

  registerBot(handle: Omit<BotHandle, "color"> & { color?: BotColor }): BotHandle {
    const existing = this.bots.get(handle.id);
    if (existing) return existing;
    const color: BotColor = handle.color ?? BOT_COLORS[this.nextColorIndex++ % BOT_COLORS.length];
    const full: BotHandle = { ...handle, color };
    this.bots.set(handle.id, full);
    return full;
  }

  recordExtraction(ev: ExtractionEvent) {
    this.recentExtractions.unshift(ev);
    if (this.recentExtractions.length > 200) this.recentExtractions.length = 200;
    this.claimedVictims.add(ev.victimId);
  }

  pushBlock(b: BlockView) {
    this.recentBlocks.unshift(b);
    if (this.recentBlocks.length > BLOCK_VIEW_DEPTH) this.recentBlocks.length = BLOCK_VIEW_DEPTH;
  }

  nextVictimId(): number {
    return ++this.victimIdCounter;
  }

  /** Build a sorted leaderboard from current extractions. */
  computeScores(): Score[] {
    const agg = new Map<Address, { extracted: bigint; gas: bigint; kills: number }>();
    for (const e of this.recentExtractions) {
      const cur = agg.get(e.searcherId) ?? { extracted: 0n, gas: 0n, kills: 0 };
      cur.extracted += e.amountExtracted;
      cur.gas += e.gasSpent;
      cur.kills += 1;
      agg.set(e.searcherId, cur);
    }
    // Include zero-score bots for full leaderboard presence.
    for (const id of this.bots.keys()) {
      if (!agg.has(id)) agg.set(id, { extracted: 0n, gas: 0n, kills: 0 });
    }
    const arr: Score[] = [];
    for (const [id, v] of agg.entries()) {
      const bot = this.bots.get(id);
      if (!bot) continue;
      arr.push({
        searcherId: id,
        displayName: bot.displayName,
        color: bot.color,
        totalExtracted: v.extracted,
        kills: v.kills,
        gasSpent: v.gas,
        netProfit: v.extracted - v.gas,
        rank: 0,
      });
    }
    arr.sort((a, b) => {
      if (b.totalExtracted !== a.totalExtracted) return b.totalExtracted > a.totalExtracted ? 1 : -1;
      return b.kills - a.kills;
    });
    arr.forEach((s, i) => (s.rank = i + 1));
    return arr.slice(0, MAX_LEADERBOARD_SIZE);
  }
}
