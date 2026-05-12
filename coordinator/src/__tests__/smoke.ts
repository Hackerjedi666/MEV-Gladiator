/**
 * End-to-end smoke test for the coordinator.
 * Spawns the coordinator as a child process in mock mode, exercises the public surface, asserts.
 */
import { spawn, type Subprocess } from "bun";
import assert from "node:assert/strict";

const PORT = 4799;
const WS_BASE = `ws://localhost:${PORT}`;
const HTTP_BASE = `http://localhost:${PORT}`;

async function waitForHealth(timeoutMs: number) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(`${HTTP_BASE}/health`);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("coordinator did not become healthy in time");
}

async function run() {
  const proc: Subprocess = spawn({
    cmd: ["bun", "run", "src/index.ts"],
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

    // 1. Health check
    const health = (await (await fetch(`${HTTP_BASE}/health`)).json()) as any;
    assert.equal(health.ok, true);
    assert.equal(health.mode, "mock");

    // 2. Open a dashboard WS and collect messages
    const dashMsgs: any[] = [];
    const dash = new WebSocket(`${WS_BASE}/dashboard`);
    await new Promise<void>((res, rej) => {
      dash.onopen = () => res();
      dash.onerror = (e) => rej(e);
    });
    dash.onmessage = (m) => {
      try {
        dashMsgs.push(JSON.parse(typeof m.data === "string" ? m.data : ""));
      } catch {}
    };

    // 3. Open a searcher WS
    const searcher = new WebSocket(`${WS_BASE}/searcher`);
    await new Promise<void>((res, rej) => {
      searcher.onopen = () => res();
      searcher.onerror = (e) => rej(e);
    });

    // 4. Start a round
    const startRes = await fetch(`${HTTP_BASE}/round/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "sandwich", durationMs: 60_000, victimRateMs: 100 }),
    });
    assert.equal(startRes.status, 200);

    // 5. Wait ~600ms for at least a few pending_tx broadcasts.
    await new Promise((r) => setTimeout(r, 600));

    const pendings = dashMsgs.filter((m) => m.type === "pending_tx");
    assert.ok(pendings.length >= 2, `expected >=2 pending_tx, got ${pendings.length}`);

    // 6. Stop the round.
    const stopRes = await fetch(`${HTTP_BASE}/round/stop`, { method: "POST" });
    assert.equal(stopRes.status, 200);

    // 7. Status reflects no active round.
    const status = (await (await fetch(`${HTTP_BASE}/status`)).json()) as any;
    assert.equal(status.round, null);

    dash.close();
    searcher.close();

    console.log("✅ coordinator smoke test passed");
  } finally {
    proc.kill();
    await proc.exited;
  }
}

run().catch((err) => {
  console.error("❌ coordinator smoke failed:", err);
  process.exit(1);
});
