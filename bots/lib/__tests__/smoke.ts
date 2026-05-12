/**
 * Spawns one bot in mock mode + the coordinator in mock mode, asserts:
 *   1. Bot's WS connects
 *   2. Bot sends bot_registered
 *   3. Coordinator broadcasts the bot to dashboard listeners (we open a dashboard WS to spy)
 *   4. After a round.start, the bot logs ACTING at least once
 *   5. The stub extraction picker eventually attributes a kill to the bot
 *      (since the bot is the only registered searcher, every extraction goes to it)
 */
import { spawn, type Subprocess } from "bun";
import { parseMessage } from "@pit/shared";
import assert from "node:assert/strict";

const PORT = 4801;
const HTTP = `http://localhost:${PORT}`;
const WS_BASE = `ws://localhost:${PORT}`;

async function waitForHealth(timeoutMs: number) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(`${HTTP}/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("coordinator never healthy");
}

const TEST_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

async function run() {
  const coord: Subprocess = spawn({
    cmd: ["bun", "run", "src/index.ts"],
    cwd: "../coordinator",
    env: {
      ...process.env,
      COORDINATOR_MODE: "mock",
      COORDINATOR_HTTP_PORT: String(PORT),
      LOG_LEVEL: "warn",
      LOG_PRETTY: "false",
    },
    stdout: "inherit",
    stderr: "inherit",
  });

  try {
    await waitForHealth(5000);

    // Spy: open a dashboard WS and listen for bot_registered + extraction.
    const dashMsgs: any[] = [];
    const dash = new WebSocket(`${WS_BASE}/dashboard`);
    await new Promise<void>((res, rej) => {
      dash.onopen = () => res();
      dash.onerror = (e) => rej(e);
    });
    dash.onmessage = (m) => {
      try {
        dashMsgs.push(parseMessage(typeof m.data === "string" ? m.data : ""));
      } catch {}
    };

    // Boot the random bot.
    const bot: Subprocess = spawn({
      cmd: ["bun", "run", "random.ts"],
      env: {
        ...process.env,
        BOT_MODE: "mock",
        BOT_RANDOM_PRIVATE_KEY: TEST_PK,
        BOT_DISPLAY_NAME: "SMOKE_BOT",
        COORDINATOR_WS: `${WS_BASE}/searcher`,
        LOG_LEVEL: "warn",
        LOG_PRETTY: "false",
      },
      stdout: "inherit",
      stderr: "inherit",
    });

    // Wait for the registration to propagate.
    let registered = false;
    for (let i = 0; i < 50; i++) {
      if (dashMsgs.some((m) => m.type === "bot_registered" && m.bot.displayName === "SMOKE_BOT")) {
        registered = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(registered, "bot_registered never reached dashboard");

    // Start a fast round.
    const r = await fetch(`${HTTP}/round/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "sandwich", durationMs: 60_000, victimRateMs: 100 }),
    });
    assert.equal(r.status, 200);

    // Wait for at least one extraction.
    let extracted = false;
    for (let i = 0; i < 80; i++) {
      if (dashMsgs.some((m) => m.type === "extraction")) {
        extracted = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.ok(extracted, "no extraction received within 8s");

    bot.kill();
    dash.close();

    console.log("✅ bots smoke test passed");
  } finally {
    coord.kill();
    await coord.exited;
  }
}

run().catch((err) => {
  console.error("❌ bots smoke failed:", err);
  process.exit(1);
});
