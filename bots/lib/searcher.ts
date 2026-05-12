/**
 * Base class for searcher bots.
 *
 * Lifecycle:
 *   1. Derive wallet from privateKey
 *   2. Open WS to coordinator's /searcher path
 *   3. Send `bot_registered` with our handle (coordinator validates)
 *   4. Receive `pending_tx` messages; subclass's onPendingTx is invoked
 *   5. Reconnect with exponential backoff on close
 *
 * In live mode this base also has a viem wallet client ready for the subclass to use.
 * In mock mode the wallet is informational only.
 */
import { privateKeyToAccount } from "viem/accounts";
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  type Address,
  type PublicClient,
  type WalletClient,
} from "viem";
import {
  encodeMessage,
  parseMessage,
  MONAD_TESTNET_CHAIN_ID,
  BOT_COLORS,
  type BotHandle,
  type VictimTx,
  type WsMessage,
} from "@pit/shared";
import type { BotConfig } from "./config.js";
import { makeLogger } from "./logger.js";

const monadTestnet = defineChain({
  id: MONAD_TESTNET_CHAIN_ID,
  name: "Monad Testnet",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
});

const BACKOFF = [1000, 2000, 4000, 8000, 10000];

export abstract class Searcher {
  protected log: ReturnType<typeof makeLogger>;
  protected address: Address;
  protected publicClient: PublicClient;
  protected walletClient: WalletClient | null;
  private ws: WebSocket | null = null;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private registered = false;

  constructor(protected cfg: BotConfig) {
    this.log = makeLogger(cfg.displayName);
    const account = privateKeyToAccount(cfg.privateKey);
    this.address = account.address;
    this.publicClient = createPublicClient({ chain: monadTestnet, transport: http(cfg.rpcUrl) });
    this.walletClient =
      cfg.mode === "live"
        ? createWalletClient({ account, chain: monadTestnet, transport: http(cfg.rpcUrl) })
        : null;
  }

  /** Subclass strategy hook — called for every pending_tx. */
  protected abstract onPendingTx(tx: VictimTx): void | Promise<void>;

  /** Optional hook — called on round start. */
  protected onRoundStart(_msg: Extract<WsMessage, { type: "round_start" }>): void {
    /* default: nothing */
  }

  start() {
    this.banner();
    this.connect();
    process.on("SIGINT", () => this.shutdown("SIGINT"));
    process.on("SIGTERM", () => this.shutdown("SIGTERM"));
  }

  private banner() {
    const line = "═".repeat(40);
    console.log(`\n╔${line}╗`);
    console.log(`║  ${this.cfg.displayName.padEnd(36)}  ║`);
    console.log(`║  ${this.address.slice(0, 10)}...${this.address.slice(-8)}            ║`);
    console.log(`║  mode: ${this.cfg.mode.padEnd(32)}║`);
    console.log(`║  strategy: ${this.strategyName().padEnd(28)}║`);
    console.log(`╚${line}╝\n`);
  }

  protected strategyName(): string {
    return this.constructor.name.replace(/Bot$/, "").toLowerCase();
  }

  private connect() {
    if (this.stopped) return;
    this.log.info({ url: this.cfg.coordinatorWs }, "connecting");
    const ws = new WebSocket(this.cfg.coordinatorWs);
    this.ws = ws;

    ws.onopen = () => {
      this.attempt = 0;
      this.log.info("ws open");
      this.sendRegistration();
    };

    ws.onmessage = (e) => {
      let msg: WsMessage;
      try {
        msg = parseMessage(typeof e.data === "string" ? e.data : String(e.data));
      } catch (err) {
        this.log.warn({ err }, "bad message");
        return;
      }
      this.handle(msg);
    };

    ws.onerror = (e) => {
      this.log.warn({ e: (e as ErrorEvent).message ?? "error" }, "ws error");
    };

    ws.onclose = () => {
      this.log.info("ws closed");
      this.registered = false;
      if (this.stopped) return;
      const delay = BACKOFF[Math.min(this.attempt, BACKOFF.length - 1)];
      this.attempt += 1;
      this.reconnectTimer = setTimeout(() => this.connect(), delay);
    };
  }

  private sendRegistration() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    if (this.registered) return;
    const color = BOT_COLORS[Math.floor(Math.random() * BOT_COLORS.length)];
    const handle: BotHandle = {
      id: this.address,
      displayName: this.cfg.displayName,
      walletAddress: this.address,
      registeredAt: Date.now(),
      color,
    };
    const msg: WsMessage = { type: "bot_registered", bot: handle };
    this.ws.send(encodeMessage(msg));
    this.log.info({ addr: this.address, color }, "sent bot_registered");
    this.registered = true;
  }

  private async handle(msg: WsMessage) {
    switch (msg.type) {
      case "hello":
        this.log.debug({ serverTime: msg.serverTime }, "hello from coordinator");
        break;
      case "round_start":
        this.log.info({ roundId: msg.config.roundId, mode: msg.config.mode }, "round started");
        this.onRoundStart(msg);
        break;
      case "round_end":
        this.log.info(
          { roundId: msg.result.roundId, winner: msg.result.winner?.displayName },
          "round ended",
        );
        break;
      case "pending_tx":
        try {
          await this.onPendingTx(msg.tx as VictimTx);
        } catch (err) {
          this.log.warn({ err, victimId: msg.tx.id }, "onPendingTx threw");
        }
        break;
      case "extraction":
        if (msg.event.searcherId.toLowerCase() === this.address.toLowerCase()) {
          this.log.info(
            { victimId: msg.event.victimId, amount: msg.event.amountExtracted.toString() },
            "EXTRACTION recorded for us",
          );
        }
        break;
      case "error":
        this.log.warn({ code: msg.code, message: msg.message }, "coordinator error");
        break;
    }
  }

  private shutdown(sig: string) {
    this.log.info({ sig }, "shutdown");
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    process.exit(0);
  }
}
