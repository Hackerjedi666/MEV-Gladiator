"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { useCoordinatorSocket } from "@/lib/useCoordinatorSocket";
import { Arena } from "@/components/show/Arena";
import { BlockStrip } from "@/components/show/BlockStrip";
import { COORDINATOR_HTTP } from "@/lib/env";
import type { RoundMode } from "@pit/shared";

function fmtCountdown(ms: number): string {
  if (ms <= 0) return "0:00";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export default function ShowPage() {
  useCoordinatorSocket();
  const status = useStore((s) => s.status);
  const round = useStore((s) => s.round);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  const remaining = round ? Math.max(0, round.endsAt - now) : 0;
  const [mode, setMode] = useState<RoundMode>("sandwich");
  const [busy, setBusy] = useState(false);

  async function startRound() {
    setBusy(true);
    try {
      await fetch(`${COORDINATOR_HTTP}/round/start`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, durationMs: 180_000, victimRateMs: 250 }),
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
    <main
      className="min-h-screen flex flex-col"
      style={{
        background:
          "radial-gradient(ellipse at top, #061a0c 0%, #02060a 60%, #000 100%)",
      }}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-4 border-b border-[#003311] bg-[#02060a]/80 backdrop-blur">
        <div className="flex items-baseline gap-3">
          <h1
            className="text-xl font-bold tracking-wider"
            style={{ color: "#ff2b6d", textShadow: "0 0 12px #ff2b6d" }}
          >
            MEV GLADIATOR PIT
          </h1>
          <span className="text-[10px] tracking-[0.3em] text-[#3a7a3a] uppercase">
            monad.testnet
          </span>
        </div>

        <div className="flex items-center gap-6 text-sm">
          {round ? (
            <div className="flex items-center gap-3 px-4 py-1.5 border border-[#003311] rounded-sm bg-black/40">
              <span className="text-[10px] tracking-[0.2em] text-[#3a7a3a] uppercase">round</span>
              <span className="text-[#00ff66] font-bold" style={{ textShadow: "0 0 6px #00ff66" }}>
                #{round.roundId}
              </span>
              <span className="text-[#003311]">│</span>
              <span className="text-[#00ff66]">{round.mode}</span>
              <span className="text-[#003311]">│</span>
              <span
                className="text-[#00ff66] font-mono font-bold"
                style={{ textShadow: "0 0 6px #00ff66" }}
              >
                {fmtCountdown(remaining)}
              </span>
            </div>
          ) : (
            <span className="text-[#3a7a3a] text-[11px] tracking-[0.2em] uppercase">idle</span>
          )}
          <span className={`pill ${status} text-[11px] tracking-[0.15em] uppercase`}>{status}</span>
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
            start
          </button>
          <button className="term" onClick={stopRound} disabled={!round || busy}>
            stop
          </button>
          <Link href="/dev" className="term inline-flex items-center no-underline">
            /dev
          </Link>
        </div>
      </header>

      {/* Arena */}
      <section className="flex-1 px-6 py-4 min-h-0 relative">
        <div className="w-full h-full relative overflow-hidden border border-[#003311] bg-black">
          <Arena />
        </div>
      </section>

      {/* Block strip footer */}
      <footer className="px-8 py-4 border-t border-[#003311] bg-[#02060a]/80 backdrop-blur">
        <div className="flex items-center gap-6">
          <span className="text-[10px] tracking-[0.3em] text-[#3a7a3a] uppercase">
            ║ parallel blocks
          </span>
          <div className="flex-1 h-14">
            <BlockStrip />
          </div>
          <span className="text-[10px] tracking-[0.3em] text-[#3a7a3a] uppercase">
            monad.parallel-evm ║
          </span>
        </div>
      </footer>
    </main>
  );
}
