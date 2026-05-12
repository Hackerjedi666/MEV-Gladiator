/**
 * Replay a JSONL recording to your terminal with color-coded output.
 *
 * Usage:
 *   bun run src/replay.ts <file.jsonl>              # 1x speed
 *   bun run src/replay.ts <file.jsonl> --speed 4    # 4x speed
 *   bun run src/replay.ts <file.jsonl> --speed inf  # as fast as possible
 *
 * Useful for re-watching past rounds without booting the coordinator.
 */
import { readFileSync } from "node:fs";
import { parseMessage, type WsMessage } from "@pit/shared";

const args = process.argv.slice(2);
const file = args[0];
if (!file) {
  console.error("Usage: bun run src/replay.ts <file.jsonl> [--speed N|inf]");
  process.exit(1);
}

const speedFlag = args.indexOf("--speed");
const speedArg = speedFlag >= 0 ? args[speedFlag + 1] : "1";
const speed = speedArg === "inf" ? Infinity : Number(speedArg);
if (!Number.isFinite(speed) && speed !== Infinity) {
  console.error("invalid --speed");
  process.exit(1);
}

const C = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  magenta: "\x1b[35m",
  red: "\x1b[31m",
  bold: "\x1b[1m",
};

function colorFor(type: WsMessage["type"]): string {
  switch (type) {
    case "round_start":
    case "round_end":
      return C.magenta + C.bold;
    case "pending_tx":
      return C.cyan;
    case "extraction":
      return C.green + C.bold;
    case "score_update":
      return C.yellow;
    case "bot_registered":
      return C.green;
    case "error":
      return C.red;
    default:
      return C.dim;
  }
}

function fmtMon(weiStr: bigint): string {
  const w = weiStr / 10n ** 18n;
  const f = (weiStr % 10n ** 18n) / 10n ** 16n;
  return `${w}.${f.toString().padStart(2, "0")}`;
}

function oneLine(msg: WsMessage): string {
  switch (msg.type) {
    case "round_start":
      return `ROUND ${msg.config.roundId} START  mode=${msg.config.mode}  rate=${msg.config.victimRateMs}ms`;
    case "round_end":
      return `ROUND ${msg.result.roundId} END    total=${fmtMon(msg.result.totalExtracted)}MON  victims=${msg.result.totalVictims}`;
    case "pending_tx":
      return `victim #${msg.tx.id.toString().padStart(4, "0")}  ${msg.tx.kind}  ev=${fmtMon(msg.tx.extractableValue)}MON`;
    case "extraction":
      return `EXTRACTION  victim=${msg.event.victimId}  amt=${fmtMon(msg.event.amountExtracted)}MON  by=${msg.event.searcherId.slice(0, 8)}…${msg.event.trashTalk ? `  "${msg.event.trashTalk}"` : ""}`;
    case "score_update":
      return `scores  n=${msg.scores.length}  leader=${msg.scores[0]?.displayName ?? "—"}`;
    case "bot_registered":
      return `bot registered: ${msg.bot.displayName} (${msg.bot.walletAddress.slice(0, 8)}…)`;
    case "tx_broadcast":
      return `tx_broadcast  victim=${msg.victimId}`;
    case "hello":
      return `hello role=${msg.role}`;
    case "error":
      return `ERROR ${msg.code}: ${msg.message}`;
  }
}

function tsOf(msg: WsMessage): number | null {
  switch (msg.type) {
    case "pending_tx":
      return msg.tx.emittedAt;
    case "extraction":
      return msg.event.timestamp;
    case "round_start":
      return msg.config.startedAt;
    case "round_end":
      return Date.now();
    default:
      return null;
  }
}

async function main() {
  const raw = readFileSync(file, "utf8");
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  let lastTs: number | null = null;
  let lineNum = 0;
  console.log(`${C.dim}# replay ${file}  (${lines.length} messages, speed=${speed}x)${C.reset}\n`);

  for (const line of lines) {
    lineNum += 1;
    let msg: WsMessage;
    try {
      msg = parseMessage(line);
    } catch (err: any) {
      console.error(`${C.red}line ${lineNum}: parse error: ${err?.message ?? err}${C.reset}`);
      continue;
    }
    const ts = tsOf(msg);
    if (ts !== null && lastTs !== null && Number.isFinite(speed)) {
      const wait = Math.max(0, (ts - lastTs) / speed);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    }
    if (ts !== null) lastTs = ts;

    const c = colorFor(msg.type);
    const time = ts ? new Date(ts).toISOString().slice(11, 23) : "          ";
    console.log(`${C.dim}${time}${C.reset}  ${c}${msg.type.padEnd(15)}${C.reset}  ${oneLine(msg)}`);
  }
}

main().catch((err) => {
  console.error("replay failed:", err);
  process.exit(1);
});
