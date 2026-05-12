import { loadConfig } from "./config.js";
import { buildChainContext } from "./chain.js";
import { logger } from "./logger.js";
import { State } from "./state.js";
import { Recorder } from "./recorder.js";
import { Hub } from "./hub.js";
import { RoundManager } from "./round.js";
import { Mempool } from "./mempool.js";
import { Extraction } from "./extraction.js";
import { startServer } from "./server.js";

async function main() {
  const cfg = loadConfig();
  logger.info({ mode: cfg.mode, port: cfg.httpPort }, "starting coordinator");

  const chain = buildChainContext(cfg);
  const state = new State();
  const recorder = new Recorder();
  const hub = new Hub(recorder);
  const mempool = new Mempool(hub, state, chain);
  const extraction = new Extraction(hub, state, chain);

  const round = new RoundManager(
    chain,
    state,
    hub,
    (cfgRound) => {
      recorder.start(cfgRound.roundId);
      hub.broadcast({ type: "round_start", config: cfgRound }, "all");
      mempool.start(cfgRound.victimRateMs);
      void extraction.start();
    },
    (result) => {
      mempool.stop();
      extraction.stop();
      hub.broadcast({ type: "round_end", result }, "all");
      recorder.stop();
    },
  );

  const server = startServer({ port: cfg.httpPort, chain, hub, state, round });

  const shutdown = async (sig: string) => {
    logger.info({ sig }, "shutdown");
    try {
      if (round.isActive()) await round.end();
    } catch (err) {
      logger.error({ err }, "error ending round on shutdown");
    }
    server.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error({ err }, "fatal");
  process.exit(1);
});
