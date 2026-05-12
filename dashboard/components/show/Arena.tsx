"use client";

import { useStore } from "@/lib/store";
import { useShow } from "@/lib/showState";
import { useShowBridge, ARENA_DIMS, SHOW_SLOT_XS } from "@/lib/useShowBridge";
import { Stickman } from "./Stickman";
import { Victim } from "./Victim";
import { Flash } from "./Flash";
import { useEffect, useMemo, useState } from "react";

const ARENA_W = ARENA_DIMS.W;
const ARENA_H = ARENA_DIMS.H;
const GROUND_Y = 760;

type Strategy = "random" | "arb" | "sandwich";

function pickStrategy(name: string): Strategy {
  const n = name.toUpperCase();
  if (n.includes("KAOS")) return "random";
  if (n.includes("ARB")) return "arb";
  if (n.includes("R1PP3R") || n.includes("SANDW")) return "sandwich";
  return "random";
}

export function Arena() {
  useShowBridge();
  const scores = useStore((s) => s.scores);
  const falling = useShow((s) => s.falling);
  const shake = useShow((s) => s.shake);

  const particles = useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => ({
        id: i,
        x: Math.random() * ARENA_W,
        y: Math.random() * ARENA_H,
        r: 0.5 + Math.random() * 1.5,
        speed: 0.2 + Math.random() * 0.5,
        phase: Math.random() * Math.PI * 2,
      })),
    [],
  );

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 16);
    return () => clearInterval(id);
  }, []);

  // Screen shake — translate the viewBox origin with jitter that decays over SHAKE_DECAY_MS.
  const shakeAge = now - shake.at;
  const shakeT = Math.min(1, shakeAge / 350);
  const shakeAmp = shake.intensity * (1 - shakeT) * 10; // px in arena coords
  const shakeX = shakeAmp > 0 ? (Math.random() - 0.5) * 2 * shakeAmp : 0;
  const shakeY = shakeAmp > 0 ? (Math.random() - 0.5) * 2 * shakeAmp : 0;

  const displayBots = scores.slice(0, 3);
  const slotXs = SHOW_SLOT_XS;

  return (
    <svg
      viewBox={`${shakeX} ${shakeY} ${ARENA_W} ${ARENA_H}`}
      className="w-full h-full"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <filter id="glow-sm" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="glow-md" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="glow-lg" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="10" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id="vignette" cx="50%" cy="50%" r="75%">
          <stop offset="0%" stopColor="#02060a" stopOpacity="0" />
          <stop offset="70%" stopColor="#02060a" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#02060a" stopOpacity="0.95" />
        </radialGradient>
        <linearGradient id="ground-glow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#00ff66" stopOpacity="0" />
          <stop offset="100%" stopColor="#00ff66" stopOpacity="0.3" />
        </linearGradient>
        <pattern id="grid-fine" width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M 48 0 L 0 0 0 48" fill="none" stroke="#003311" strokeWidth="0.5" opacity="0.4" />
        </pattern>
      </defs>

      {/* === Layer 1: Background === */}
      <rect width={ARENA_W} height={ARENA_H} fill="#02060a" />
      <rect width={ARENA_W} height={ARENA_H} fill="url(#grid-fine)" />

      <g opacity={0.55}>
        {particles.map((p) => {
          const drift = (now * p.speed * 0.02) % ARENA_H;
          const y = (p.y - drift + ARENA_H) % ARENA_H;
          const tw = 0.4 + Math.sin(now / 800 + p.phase) * 0.3;
          return (
            <circle key={p.id} cx={p.x} cy={y} r={p.r} fill="#00ff66" opacity={tw} filter="url(#glow-sm)" />
          );
        })}
      </g>

      <rect x={0} y={GROUND_Y - 80} width={ARENA_W} height={120} fill="url(#ground-glow)" opacity={0.4} />
      <line x1={0} y1={GROUND_Y + 8} x2={ARENA_W} y2={GROUND_Y + 8} stroke="#00ff66" strokeWidth={1.5} opacity={0.6} filter="url(#glow-sm)" />
      <line x1={0} y1={GROUND_Y + 8} x2={ARENA_W} y2={GROUND_Y + 8} stroke="#00ff66" strokeWidth={4} opacity={0.15} filter="url(#glow-lg)" />

      {/* === Layer 2: Falling coins === */}
      {[...falling.values()].map((v) => (
        <Victim key={v.id} v={v} arenaW={ARENA_W} arenaH={ARENA_H} />
      ))}

      {/* === Layer 3: Stickmen === */}
      {displayBots.map((s, i) => (
        <Stickman
          key={s.searcherId}
          searcherId={s.searcherId}
          displayName={s.displayName}
          color={s.color}
          totalExtracted={s.totalExtracted}
          kills={s.kills}
          rank={s.rank}
          strategy={pickStrategy(s.displayName)}
          baseX={slotXs[i]}
          baseY={GROUND_Y}
        />
      ))}

      {displayBots.length === 0 && (
        <text x={ARENA_W / 2} y={ARENA_H / 2} textAnchor="middle" fill="#003311" fontSize={28} filter="url(#glow-md)">
          AWAITING COMBATANTS
        </text>
      )}

      {/* Flash overlay (cracks, popups, bursts, jackpot text) */}
      <Flash />

      {/* Vignette overlay */}
      <rect width={ARENA_W} height={ARENA_H} fill="url(#vignette)" pointerEvents="none" />
    </svg>
  );
}
