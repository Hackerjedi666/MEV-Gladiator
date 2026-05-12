"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { useCoordinatorSocket } from "@/lib/useCoordinatorSocket";
import { COORDINATOR_HTTP } from "@/lib/env";
import { formatMon, shortAddr, fmtTime } from "@/lib/format";
import type { RoundMode, WsMessage } from "@pit/shared";

export default function DevPage() {
  useCoordinatorSocket();
  const status = useStore((s) => s.status);
  const round = useStore((s) => s.round);
  const scores = useStore((s) => s.scores);
  const feed = useStore((s) => s.feed);
  const pending = useStore((s) => s.pendingVictims);
  const extractions = useStore((s) => s.extractions);
  const counters = useStore((s) => s.counters);
  const serverTime = useStore((s) => s.serverTime);

  const [mode, setMode] = useState<RoundMode>("sandwich");
  const [busy, setBusy] = useState(false);

  async function startRound() {
    setBusy(true);
    try {
      await fetch(`${COORDINATOR_HTTP}/round/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, durationMs: 120_000, victimRateMs: 250 }),
      });
    } finally {
      setBusy(false);
    }
  }

  async function stopRound() {
    setBusy(true);
    try {
      await fetch(`${COORDINATOR_HTTP}/round/stop`, { method: "POST" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen p-5 max-w-[1400px] mx-auto">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-[var(--phosphor-deep)] pb-3 mb-4">
        <h1 className="text-base font-bold tracking-wide">
          <span className="hot">MEV GLADIATOR PIT</span>
          <span className="dim ml-3 text-[12px]">// dev console</span>
        </h1>
        <div className="flex items-center gap-5 text-[12px]">
          <span className={`pill ${status}`}>
            ws {status}
            {status === "connecting" && <span className="blink">_</span>}
          </span>
          <span className="dim">server: {serverTime ? fmtTime(serverTime) : "—"}</span>
        </div>
      </header>

      {/* Controls */}
      <section className="panel mb-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="panel-label !mb-0">CONTROLS</span>
          <select
            className="term"
            value={mode}
            onChange={(e) => setMode(e.target.value as RoundMode)}
            disabled={!!round || busy}
          >
            <option value="sandwich">sandwich</option>
            <option value="arb">arb</option>
            <option value="liquidation">liquidation</option>
            <option value="boss">boss</option>
          </select>
          <button className="term" onClick={startRound} disabled={!!round || busy || status !== "open"}>
            start round
          </button>
          <button className="term" onClick={stopRound} disabled={!round || busy}>
            stop round
          </button>
          <span className="dim ml-auto text-[12px]">
            {round ? (
              <>
                round <span className="text-[var(--phosphor)]">#{round.roundId}</span> · mode{" "}
                <span className="text-[var(--phosphor)]">{round.mode}</span> · ends {fmtTime(round.endsAt)}
              </>
            ) : (
              "no active round"
            )}
          </span>
        </div>
      </section>

      {/* Counters */}
      <section className="panel mb-3">
        <div className="panel-label">COUNTERS</div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-[13px]">
          {Object.keys(counters).length === 0 && <span className="dim">— no traffic —</span>}
          {Object.entries(counters)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => (
              <span key={k}>
                <span className="dim">{k}</span> <span>{v}</span>
              </span>
            ))}
        </div>
      </section>

      {/* 3 columns */}
      <section className="grid grid-cols-3 gap-3 mb-3">
        <div className="panel">
          <div className="panel-label">
            LEADERBOARD<span className="count">{scores.length}</span>
          </div>
          <div className="feed max-h-[260px]">
            {scores.length === 0 && <div className="dim">— no scores yet —</div>}
            {scores.map((s) => (
              <div key={s.searcherId} className="row tight">
                <span>
                  <span className="dim mr-2">#{s.rank}</span>
                  <span style={{ color: s.color }}>{s.displayName}</span>
                </span>
                <span>
                  {formatMon(s.totalExtracted)} <span className="dim">MON · {s.kills}k</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-label">
            PENDING VICTIMS<span className="count">{pending.length}</span>
          </div>
          <div className="feed max-h-[260px]">
            {pending.length === 0 && <div className="dim">— mempool empty —</div>}
            {pending.slice(0, 30).map((v) => (
              <div key={v.id} className="row tight">
                <span className="truncate">
                  <span className="dim">#{v.id}</span> {v.kind}{" "}
                  <span className="dim">{shortAddr(v.poolAddress ?? "0x")}</span>
                </span>
                <span>{formatMon(v.extractableValue)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-label">
            EXTRACTIONS<span className="count">{extractions.length}</span>
          </div>
          <div className="feed max-h-[260px]">
            {extractions.length === 0 && <div className="dim">— no kills yet —</div>}
            {extractions.slice(0, 30).map((e, i) => (
              <div key={`${e.txHash}-${i}`} className="truncate">
                <span className="dim mr-2">{fmtTime(e.timestamp)}</span>
                <span>{shortAddr(e.searcherId)}</span>{" "}
                <span>+{formatMon(e.amountExtracted)}</span>
                {e.trashTalk && <span className="hot"> &quot;{e.trashTalk}&quot;</span>}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Raw feed */}
      <section className="panel">
        <div className="panel-label">
          RAW FEED<span className="count">{feed.length}</span>
        </div>
        <div className="feed max-h-[480px] min-h-[300px]">
          {feed.length === 0 && <div className="dim">— quiet —</div>}
          {feed.map((f, i) => (
            <div key={i} className="truncate">
              <span className="dim mr-2">{fmtTime(f.receivedAt)}</span>
              <span className="hot mr-2">{f.msg.type}</span>
              <span className="dim">{summarize(f.msg)}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function summarize(msg: WsMessage): string {
  switch (msg.type) {
    case "pending_tx":
      return `id=${msg.tx.id} kind=${msg.tx.kind} ev=${formatMon(msg.tx.extractableValue)}`;
    case "extraction":
      return `victim=${msg.event.victimId} amt=${formatMon(msg.event.amountExtracted)} by=${shortAddr(msg.event.searcherId)}`;
    case "score_update":
      return `n=${msg.scores.length}`;
    case "round_start":
      return `#${msg.config.roundId} mode=${msg.config.mode}`;
    case "round_end":
      return `#${msg.result.roundId} winner=${msg.result.winner ? shortAddr(msg.result.winner.walletAddress) : "—"}`;
    case "bot_registered":
      return `${msg.bot.displayName} ${shortAddr(msg.bot.walletAddress)}`;
    case "tx_broadcast":
      return `victim=${msg.victimId}`;
    case "hello":
      return `role=${msg.role}`;
    case "error":
      return `${msg.code}: ${msg.message}`;
  }
}
