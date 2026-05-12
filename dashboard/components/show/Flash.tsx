"use client";

import { useEffect, useMemo, useState } from "react";
import { useShow, SHOW_TIMINGS } from "@/lib/showState";

const ARENA_W = 1600;
const ARENA_H = 900;

export function Flash() {
  const popups = useShow((s) => s.popups);
  const bursts = useShow((s) => s.bursts);
  const cracks = useShow((s) => s.cracks);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30);
    return () => clearInterval(id);
  }, []);

  // Stable jagged-angle table per crack so the lines don't dance.
  const crackAngles = useMemo(
    () => Array.from({ length: 8 }, () => 0.7 + Math.random() * 0.6),
    [],
  );

  // JACKPOT text — visible while any unexpired jackpot crack is fresh (<1200ms).
  const jackpotTextAge = (() => {
    let youngest = Infinity;
    for (const c of cracks) {
      if (!c.isJackpot) continue;
      const age = now - c.bornAt;
      if (age < youngest) youngest = age;
    }
    return youngest;
  })();
  const showJackpot = jackpotTextAge < 1200;

  return (
    <g>
      {/* Ground cracks at impact points */}
      {cracks.map((c) => {
        const ttl = c.isJackpot ? SHOW_TIMINGS.CRACK_JACKPOT_TTL_MS : SHOW_TIMINGS.CRACK_TTL_MS;
        const t = (now - c.bornAt) / ttl;
        if (t >= 1) return null;
        const op = 1 - t;
        const len = (c.isJackpot ? 100 : 60) * Math.min(1, t * 4);
        return (
          <g key={c.id} opacity={op}>
            {Array.from({ length: 6 }).map((_, i) => {
              const a = (i / 6) * Math.PI * 2;
              const jit = crackAngles[i] ?? 1;
              const x2 = c.x + Math.cos(a) * len * jit;
              const y2 = c.y + Math.sin(a) * len * jit * 0.4; // flattened to ground plane
              return (
                <line
                  key={i}
                  x1={c.x}
                  y1={c.y}
                  x2={x2}
                  y2={y2}
                  stroke={c.isJackpot ? "#ff2b6d" : "#ffffff"}
                  strokeWidth={c.isJackpot ? 2 : 1.5}
                  opacity={0.75}
                  filter={c.isJackpot ? "url(#glow-md)" : "url(#glow-sm)"}
                />
              );
            })}
            {/* Bright impact dot */}
            <circle
              cx={c.x}
              cy={c.y}
              r={c.isJackpot ? 5 : 3}
              fill={c.isJackpot ? "#ff2b6d" : "#ffffff"}
              opacity={op * 0.9}
              filter="url(#glow-md)"
            />
          </g>
        );
      })}

      {/* Impact bursts at strike location */}
      {bursts.map((b) => {
        const t = Math.min(1, (now - b.bornAt) / SHOW_TIMINGS.BURST_TTL_MS);
        const r = 8 + t * 60;
        const op = 1 - t;
        return (
          <g key={b.id}>
            <circle cx={b.x} cy={b.y} r={r} fill="none" stroke={b.color} strokeWidth={2} opacity={op * 0.9} filter="url(#glow-lg)" />
            <circle cx={b.x} cy={b.y} r={r * 0.5} fill={b.color} opacity={op * 0.25} />
          </g>
        );
      })}

      {/* Score popups */}
      {popups.map((p) => {
        const age = now - p.bornAt;
        const t = Math.min(1, age / SHOW_TIMINGS.POPUP_TTL_MS);
        const birthPulse = age < 100 ? 1 + (1 - age / 100) * 0.4 : 1;
        const rise = -90 * t;
        const opacity = 1 - Math.pow(t, 2.5);
        const whole = p.amount / 10n ** 18n;
        const frac = (p.amount % 10n ** 18n) / 10n ** 16n;
        const label = `+${whole}.${frac.toString().padStart(2, "0")}`;
        return (
          <g
            key={p.id}
            transform={`translate(${p.x}, ${p.y + rise}) scale(${birthPulse})`}
            opacity={opacity}
          >
            <text
              x={0}
              y={0}
              textAnchor="middle"
              fontSize={26}
              fontWeight={700}
              fill="#ffd84d"
              filter="url(#glow-md)"
              letterSpacing={1}
            >
              {label}
            </text>
            <text x={0} y={18} textAnchor="middle" fontSize={10} fill="#ffd84d" opacity={0.6} letterSpacing={2}>
              MON
            </text>
          </g>
        );
      })}

      {/* JACKPOT banner */}
      {showJackpot && (
        <g
          transform={`translate(${ARENA_W / 2}, ${ARENA_H * 0.32}) scale(${
            jackpotTextAge < 150 ? 0.6 + (jackpotTextAge / 150) * 0.6 : 1.2
          })`}
          opacity={1 - Math.pow(jackpotTextAge / 1200, 2.2)}
        >
          <text
            x={0}
            y={0}
            textAnchor="middle"
            fontSize={84}
            fontWeight={700}
            fill="#ff2b6d"
            letterSpacing={8}
            filter="url(#glow-lg)"
          >
            JACKPOT
          </text>
          <text
            x={0}
            y={36}
            textAnchor="middle"
            fontSize={14}
            fill="#ff2b6d"
            opacity={0.7}
            letterSpacing={6}
          >
            BIG MOVE
          </text>
        </g>
      )}
    </g>
  );
}
