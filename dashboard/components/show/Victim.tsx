"use client";

import { useEffect, useState } from "react";
import type { FallingVictim } from "@/lib/showState";
import { SHOW_TIMINGS, useShow } from "@/lib/showState";

interface VictimProps {
  v: FallingVictim;
  arenaW: number;
  arenaH: number;
}

function formatMon(wei: bigint): string {
  const whole = wei / 10n ** 18n;
  const frac = (wei % 10n ** 18n) / 10n ** 16n;
  return `${whole}.${frac.toString().padStart(2, "0")}`;
}

const COLOR_BRIGHT_MAP: Record<string, string> = {
  "#1f4d1f": "#4dffb8",
  "#3a7a3a": "#9eff66",
};
function brighten(c: string): string {
  return COLOR_BRIGHT_MAP[c] ?? c;
}

const GOLD = "#ffd84d";

export function Victim({ v, arenaW, arenaH }: VictimProps) {
  const huntLocks = useShow((s) => s.huntLocks);
  const botColors = useShow((s) => s.botColors);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30);
    return () => clearInterval(id);
  }, []);

  const age = now - v.spawnedAt;
  const fallY = Math.min(1, age / SHOW_TIMINGS.VICTIM_FALL_DURATION_MS);
  const easedY = 1 - Math.pow(1 - fallY, 1.6);

  const claimed = !!v.claimedAt;
  const claimAge = claimed ? now - (v.claimedAt ?? 0) : 0;

  const cx = v.xPct * arenaW;
  const maxY = arenaH * 0.78;
  const cy = easedY * maxY;

  const evMon = Number(v.victim.extractableValue / 10n ** 16n) / 100;
  const baseR = 12 + Math.min(10, evMon * 4);
  const pulse = 1 + Math.sin(now / 100) * 0.06;
  const r = baseR * pulse;

  // Catcher hand position — chest level above the hip slot.
  const handX = v.catcherBaseX ?? cx;
  const handY = (v.catcherBaseY ?? cy) - 40;

  // === LOCK COLOR (only matters for unclaimed coins) ===
  const lockedBy = huntLocks.get(v.id) ?? [];
  let coinColor = GOLD;
  if (lockedBy.length === 1) {
    coinColor = botColors.get(lockedBy[0]) ?? GOLD;
  } else if (lockedBy.length >= 2) {
    // Contested — alternate locker colors at ~6 Hz.
    const idx = Math.floor(now / 160) % lockedBy.length;
    coinColor = botColors.get(lockedBy[idx]) ?? GOLD;
  }
  coinColor = brighten(coinColor);
  const strokeColor = coinColor;
  const isLocked = lockedBy.length > 0;
  const isContested = lockedBy.length >= 2;

  if (claimed) {
    // Phase 1 (0–180 ms): coin flies from claim coords toward bot's hand in catcher's color.
    // Phase 2 (180 ms+): dissolve at the hand with shockwave + debris.
    const FLY_DURATION = 180;
    const flyT = Math.min(1, claimAge / FLY_DURATION);
    const dissolveT = Math.max(
      0,
      (claimAge - FLY_DURATION) / (SHOW_TIMINGS.VICTIM_LINGER_MS - FLY_DURATION),
    );

    const flyEase = 1 - Math.pow(1 - flyT, 2.5);
    const startX = v.claimX ?? cx;
    const startY = v.claimY ?? cy;
    const curX = startX + (handX - startX) * flyEase;
    const curY = startY + (handY - startY) * flyEase;

    const dissolve = 1 - dissolveT;
    if (dissolve <= 0) return null;

    const catcherColor = brighten(botColors.get(v.claimedBy ?? "") ?? GOLD);

    if (flyT < 1) {
      return (
        <g>
          <line
            x1={startX}
            y1={startY}
            x2={curX}
            y2={curY}
            stroke={catcherColor}
            strokeWidth={3}
            strokeOpacity={0.6 * (1 - flyT)}
            filter="url(#glow-md)"
          />
          <circle
            cx={curX}
            cy={curY}
            r={r * (1 - flyT * 0.3)}
            fill={catcherColor}
            opacity={0.8}
            filter="url(#glow-md)"
          />
          <circle
            cx={curX}
            cy={curY}
            r={r * 1.6}
            fill={catcherColor}
            opacity={0.25}
            filter="url(#glow-lg)"
          />
        </g>
      );
    }

    return (
      <g>
        <circle
          cx={handX}
          cy={handY}
          r={r + dissolveT * 90}
          fill="none"
          stroke="#ff2b6d"
          strokeWidth={3}
          opacity={dissolve * 0.85}
          filter="url(#glow-lg)"
        />
        <circle
          cx={handX}
          cy={handY}
          r={r * (1 - dissolveT * 0.7)}
          fill={catcherColor}
          opacity={dissolve * 0.75}
          filter="url(#glow-md)"
        />
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
          const a = (i / 8) * Math.PI * 2 + dissolveT * 0.5;
          const dist = dissolveT * 80;
          return (
            <circle
              key={i}
              cx={handX + Math.cos(a) * dist}
              cy={handY + Math.sin(a) * dist}
              r={3 * (1 - dissolveT)}
              fill={catcherColor}
              opacity={dissolve}
              filter="url(#glow-sm)"
            />
          );
        })}
      </g>
    );
  }

  // ====== UNCLAIMED, FALLING ======
  const trailLen = 6 + fallY * 24;
  // Glow filters only kick in when a bot has locked the coin — otherwise stay flat.
  const lockedGlow = isLocked ? "url(#glow-sm)" : undefined;

  return (
    <g>
      {/* Motion trail — colored if locked */}
      <line
        x1={cx}
        y1={cy - r}
        x2={cx}
        y2={cy - r - trailLen}
        stroke={coinColor}
        strokeWidth={2}
        strokeOpacity={isLocked ? 0.5 : 0.3}
        filter={lockedGlow}
      />
      {/* Soft halo only when locked */}
      {isLocked && (
        <>
          <circle
            cx={cx}
            cy={cy}
            r={r * 2.2}
            fill={coinColor}
            opacity={0.16}
            filter="url(#glow-lg)"
          />
          <circle
            cx={cx}
            cy={cy}
            r={r * 1.4}
            fill={coinColor}
            opacity={0.26}
            filter="url(#glow-md)"
          />
        </>
      )}
      {/* Coin body */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        stroke={strokeColor}
        strokeWidth={isLocked ? 3.5 : 2.5}
        fill="#1a1305"
        filter={lockedGlow}
      />
      {/* $ symbol */}
      <text
        x={cx}
        y={cy + 4}
        textAnchor="middle"
        fontSize={r * 0.9}
        fontWeight={700}
        fill={coinColor}
        filter={lockedGlow}
      >
        $
      </text>
      {/* Targeting reticle when a bot is locked on */}
      {isLocked && (
        <>
          <circle
            cx={cx}
            cy={cy}
            r={r * 1.8}
            stroke={strokeColor}
            strokeWidth={1}
            strokeOpacity={0.6}
            fill="none"
            strokeDasharray="3 3"
          />
          {isContested && (
            <text
              x={cx}
              y={cy - r * 2.5}
              textAnchor="middle"
              fontSize={10}
              fill="#ff2b6d"
              letterSpacing={2}
              fontWeight={700}
            >
              CONTESTED
            </text>
          )}
        </>
      )}
      {/* EV label, only on bigger coins to reduce clutter */}
      {evMon > 1.4 && (
        <text x={cx + r + 8} y={cy + 3} fontSize={11} fill={coinColor} opacity={0.85} fontWeight={500}>
          {formatMon(v.victim.extractableValue)}
        </text>
      )}
    </g>
  );
}
