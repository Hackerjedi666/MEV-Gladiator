"use client";

import { useEffect, useState } from "react";
import { useShow, SHOW_TIMINGS } from "@/lib/showState";

type Strategy = "random" | "arb" | "sandwich";
type State = "pouncing" | "missing" | "taunting" | "hunting" | "idle";

export interface StickmanProps {
  searcherId: string;
  displayName: string;
  color: string;
  totalExtracted: bigint;
  kills: number;
  rank: number;
  strategy: Strategy;
  baseX: number;
  baseY: number;
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

const ARENA_W = 1600;
const ARENA_H = 900;

interface Pose {
  cx: number;
  cy: number;
  torsoLean: number;
  /** Body rotation around hip — used during strike phase to fly horizontally. */
  bodyAngle: number;
  /** 0..1 — leg length multiplier (crouch). */
  crouch: number;
  /** 1.0 baseline — arm length multiplier. */
  armReach: number;
  leftArmAng: number;
  rightArmAng: number;
  legSwayAmp: number;
  legSpread: number;
  /** Head rotation (rad) applied around head center. */
  headRot: number;
  /** Eye mode: open / angry. */
  eyesAngry: boolean;
  /** Whole-figure opacity. */
  opacity: number;
}

function defaultPose(baseX: number, baseY: number): Pose {
  return {
    cx: baseX,
    cy: baseY,
    torsoLean: 0,
    bodyAngle: 0,
    crouch: 1,
    armReach: 1,
    leftArmAng: Math.PI / 2 - 0.3,
    rightArmAng: Math.PI / 2 + 0.3,
    legSwayAmp: 0.2,
    legSpread: 0.2,
    headRot: 0,
    eyesAngry: false,
    opacity: 1,
  };
}

export function Stickman(props: StickmanProps) {
  const { searcherId, displayName, color: rawColor, totalExtracted, kills, rank, strategy, baseX, baseY } =
    props;
  const color = brighten(rawColor);

  const lastKillAt = useShow((s) => s.lastKillAt.get(searcherId) ?? 0);
  const lastTarget = useShow((s) => s.lastTarget.get(searcherId));
  const missEvent = useShow((s) => s.missEvents.get(searcherId));
  const taunt = useShow((s) => s.taunts.get(searcherId));
  const setHuntLock = useShow((s) => s.setHuntLock);

  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => {
      const n = Date.now();
      // Hunt-blackboard update: scan falling here so we can call recordHunt without React.
      const falling = useShow.getState().falling;
      let bestId = -1;
      let bestDist = Infinity;
      for (const f of falling.values()) {
        if (f.claimedBy) continue;
        const age = n - f.spawnedAt;
        if (age > SHOW_TIMINGS.VICTIM_FALL_DURATION_MS) continue;
        const fallY = Math.min(1, age / SHOW_TIMINGS.VICTIM_FALL_DURATION_MS);
        const tx = f.xPct * ARENA_W;
        const ty = (1 - Math.pow(1 - fallY, 1.6)) * (ARENA_H * 0.78);
        const dist = Math.hypot(tx - baseX, ty - baseY);
        if (dist < 700 && dist < bestDist) {
          bestDist = dist;
          bestId = f.id;
        }
      }
      if (bestId >= 0) useShow.getState().recordHunt(searcherId, bestId);
      setNow(n);
    }, 25);
    return () => clearInterval(id);
  }, [searcherId, baseX, baseY]);

  // Recompute hunt target for the render pass — same logic.
  const falling = useShow((s) => s.falling);
  let huntTarget: { x: number; y: number; victimId: number; dist: number } | null = null;
  for (const f of falling.values()) {
    if (f.claimedBy) continue;
    const age = now - f.spawnedAt;
    if (age > SHOW_TIMINGS.VICTIM_FALL_DURATION_MS) continue;
    const fallY = Math.min(1, age / SHOW_TIMINGS.VICTIM_FALL_DURATION_MS);
    const tx = f.xPct * ARENA_W;
    const ty = (1 - Math.pow(1 - fallY, 1.6)) * (ARENA_H * 0.78);
    const dist = Math.hypot(tx - baseX, ty - baseY);
    if (dist < 700 && (!huntTarget || dist < huntTarget.dist)) {
      huntTarget = { x: tx, y: ty, victimId: f.id, dist };
    }
  }

  // === STATE PRIORITY ===
  const sinceKill = now - lastKillAt;
  const sinceMiss = missEvent ? now - missEvent.at : Infinity;
  const sinceTaunt = taunt ? now - taunt.at : Infinity;

  let state: State = "idle";
  if (lastKillAt > 0 && sinceKill < SHOW_TIMINGS.POUNCE_DURATION_MS) state = "pouncing";
  else if (missEvent && sinceMiss < SHOW_TIMINGS.MISS_DURATION_MS) state = "missing";
  else if (taunt && sinceTaunt < SHOW_TIMINGS.TAUNT_DURATION_MS) state = "taunting";
  else if (huntTarget) state = "hunting";

  // Publish/clear this bot's hunt lock so coins know who's after them.
  // Skip while pouncing (the claim() call already wiped the lock).
  const lockTargetId = state === "hunting" && huntTarget ? huntTarget.victimId : null;
  useEffect(() => {
    if (state === "pouncing") return;
    setHuntLock(searcherId, lockTargetId);
  }, [lockTargetId, state, searcherId, setHuntLock]);

  // === POSE COMPUTATION ===
  const pose: Pose = defaultPose(baseX, baseY);

  if (state === "pouncing" && lastTarget) {
    const t = sinceKill / SHOW_TIMINGS.POUNCE_DURATION_MS;
    const dx = lastTarget.x - baseX;
    const dy = lastTarget.y - baseY;
    pose.eyesAngry = true;

    if (t < 0.22) {
      // ANTICIPATION — deep crouch, arms back, slight backward pull
      const a = t / 0.22;
      pose.crouch = 1 - a * 0.55;
      pose.torsoLean = -0.18 * a * Math.sign(dx || 1);
      pose.leftArmAng = Math.PI - 0.3;
      pose.rightArmAng = Math.PI + 0.3;
      pose.cx = baseX - Math.sign(dx || 1) * 10 * a;
      pose.cy = baseY + 6 * a;
    } else if (t < 0.5) {
      // STRIKE — explosive leap, body horizontal
      const a = (t - 0.22) / 0.28;
      const ease = 1 - Math.pow(1 - a, 3);
      pose.cx = baseX + dx * ease;
      pose.cy = baseY + dy * ease - Math.sin(a * Math.PI) * 30; // arc up over the path
      pose.bodyAngle = Math.atan2(dy, dx);
      pose.armReach = 1.35;
      pose.crouch = 0.5;
      pose.legSpread = 0.7;
      pose.leftArmAng = pose.bodyAngle - 0.12;
      pose.rightArmAng = pose.bodyAngle + 0.12;
    } else if (t < 0.7) {
      // IMPACT — slam at coin, brief crouch
      const a = (t - 0.5) / 0.2;
      pose.cx = lastTarget.x;
      pose.cy = lastTarget.y;
      pose.crouch = 0.4 + a * 0.3;
      pose.torsoLean = 0.12 * (1 - a);
      pose.leftArmAng = Math.PI / 2 - 0.55;
      pose.rightArmAng = Math.PI / 2 + 0.55;
      pose.legSpread = 0.5;
    } else {
      // RECOVERY — rise to base with arms-up roar
      const a = (t - 0.7) / 0.3;
      pose.cx = lastTarget.x + (baseX - lastTarget.x) * a;
      pose.cy = lastTarget.y + (baseY - lastTarget.y) * a;
      pose.crouch = 0.7 + a * 0.3;
      pose.leftArmAng = -Math.PI / 2 + 0.25;
      pose.rightArmAng = -Math.PI / 2 - 0.25;
      pose.armReach = 1.15;
    }
  } else if (state === "missing" && missEvent) {
    const t = sinceMiss / SHOW_TIMINGS.MISS_DURATION_MS;
    const dx = missEvent.targetX - baseX;
    const dy = missEvent.targetY - baseY;
    pose.eyesAngry = true;

    if (t < 0.3) {
      // OVERSHOOT — past the coin with arms extended
      const a = t / 0.3;
      pose.cx = baseX + dx * 1.1 * a;
      pose.cy = baseY + dy * 0.9 * a - 14 * Math.sin(a * Math.PI);
      pose.armReach = 1.45;
      pose.bodyAngle = Math.atan2(dy, dx) * 0.7;
      pose.leftArmAng = pose.bodyAngle - 0.1;
      pose.rightArmAng = pose.bodyAngle + 0.1;
      pose.crouch = 0.55;
    } else if (t < 0.55) {
      // STUMBLE — slowing past, body twisted
      const a = (t - 0.3) / 0.25;
      pose.cx = baseX + dx * (1.1 - 0.35 * a);
      pose.cy = baseY + dy * (0.9 - 0.4 * a);
      pose.torsoLean = 0.45;
      pose.crouch = 0.65;
      pose.legSpread = 0.7;
      pose.leftArmAng = Math.PI / 2 + 0.4;
      pose.rightArmAng = Math.PI / 2 - 0.9;
    } else {
      // GLARE-AND-RETURN — head snaps toward the winner, body slumps back
      const a = (t - 0.55) / 0.45;
      pose.cx = baseX + dx * 0.75 * (1 - a);
      pose.cy = baseY + dy * 0.5 * (1 - a);
      const turnDir = Math.sign(missEvent.winnerSlotX - baseX) || 1;
      pose.headRot = turnDir * 0.55;
      pose.torsoLean = -0.1;
      pose.crouch = 0.95;
      pose.leftArmAng = Math.PI / 2 + 0.6;
      pose.rightArmAng = Math.PI / 2 - 0.6;
    }
  } else if (state === "taunting" && taunt) {
    const t = sinceTaunt / SHOW_TIMINGS.TAUNT_DURATION_MS;
    if (taunt.type === "flex") {
      const pulse = Math.sin(t * Math.PI);
      pose.leftArmAng = -Math.PI / 2 + 0.35 + pulse * 0.25;
      pose.rightArmAng = -Math.PI / 2 - 0.35 - pulse * 0.25;
      pose.armReach = 1.1 + pulse * 0.1;
      pose.crouch = 1 + pulse * 0.08;
      pose.torsoLean = -0.06 * pulse;
      pose.eyesAngry = true;
    } else {
      // GLARE — head turns toward target, body angles
      const turnDir = taunt.targetX !== undefined ? Math.sign(taunt.targetX - baseX) || 1 : 1;
      pose.headRot = turnDir * 0.55;
      pose.torsoLean = turnDir * 0.12;
      pose.leftArmAng = Math.PI / 2 - 0.4;
      pose.rightArmAng = Math.PI / 2 + 0.4;
      pose.eyesAngry = true;
    }
  } else if (state === "hunting" && huntTarget) {
    const dx = huntTarget.x - baseX;
    const dy = huntTarget.y - baseY;
    const ang = Math.atan2(dy, dx);
    pose.eyesAngry = true;
    pose.leftArmAng = ang - 0.15;
    pose.rightArmAng = ang + 0.15;
    pose.armReach = 1.15;
    pose.torsoLean = 0.15 * Math.sign(dx || 1);
    pose.crouch = 0.82;
    pose.legSpread = 0.45;
    pose.legSwayAmp = 0.5;
    // Strategy-flavored hunt speed
    let speedMod = 0.35;
    if (strategy === "random") speedMod = 0.3 + Math.sin(now / 80) * 0.12;
    else if (strategy === "arb") speedMod = Math.floor(now / 200) % 2 === 0 ? 0.5 : 0.18;
    else if (strategy === "sandwich") speedMod = 0.25;
    pose.cx = baseX + dx * speedMod;
    pose.cy = baseY + Math.min(0, dy * 0.08);
  } else {
    // IDLE — stronger strategy flavor so each bot reads at a glance.
    if (strategy === "random") {
      pose.cx = baseX + Math.sin(now / 90) * 22;
      pose.cy = baseY + Math.cos(now / 70) * 10;
      pose.leftArmAng = Math.PI / 2 + Math.sin(now / 60) * 1.1;
      pose.rightArmAng = Math.PI / 2 + Math.cos(now / 50) * 1.1;
      pose.crouch = 0.95 + Math.sin(now / 200) * 0.1;
    } else if (strategy === "arb") {
      // Wider pacing with occasional snap-teleport.
      const phase = (now / 800) % (Math.PI * 2);
      pose.cx = baseX + Math.sin(phase) * 55;
      pose.cy = baseY;
      pose.leftArmAng = Math.PI / 2 - 0.3;
      pose.rightArmAng = Math.PI / 2 + 0.3;
      if (Math.floor(now / 1500) % 4 === 0 && now % 1500 < 150) {
        pose.cx = baseX + (Math.random() - 0.5) * 80;
      }
    } else if (strategy === "sandwich") {
      // Low predatory crouch, arms cocked back like a cobra.
      pose.cy = baseY + Math.sin(now / 280) * 5 + 14;
      pose.crouch = 0.65 + Math.sin(now / 280) * 0.05;
      pose.leftArmAng = Math.PI / 2 - 0.9;
      pose.rightArmAng = Math.PI / 2 - 0.9;
      pose.legSpread = 0.6;
    }
  }

  // Arb teleport flicker (idle/hunt only)
  if (strategy === "arb" && (state === "idle" || state === "hunting")) {
    if (Math.floor(now / 200) % 7 === 0) pose.opacity = 0.35;
  }

  // === ANATOMY ===
  const headR = 16;
  const torsoH = 56;
  const armLen = 40 * pose.armReach;
  const legLen = 48 * pose.crouch;
  const torsoLen = torsoH * Math.max(0.65, pose.crouch);

  const isLunging = state === "pouncing";
  const isLeader = rank === 1;

  // Body orientation: bodyAngle rotates the upper body around the hip.
  // bodyAngle = 0 → upright; bodyAngle = ±π/2 → horizontal.
  const orient = pose.bodyAngle;
  const torsoTopX = Math.sin(orient + pose.torsoLean) * torsoLen;
  const torsoTopY = -Math.cos(orient + pose.torsoLean) * torsoLen;

  // Hip pivot is at (0, 0) in the bot-local frame.
  // Arms attach 10px below the head (i.e., 10px in from torso top along the torso).
  const armHipFrac = 0.85;
  const armOriginX = torsoTopX * armHipFrac;
  const armOriginY = torsoTopY * armHipFrac;

  const legSway = Math.sin(now / 80) * pose.legSwayAmp;
  const legL = {
    x: Math.sin(legSway + pose.legSpread) * legLen * 0.6,
    y: Math.cos(legSway + pose.legSpread) * legLen,
  };
  const legR = {
    x: -Math.sin(legSway + pose.legSpread) * legLen * 0.6,
    y: Math.cos(legSway - pose.legSpread) * legLen,
  };

  // Head position above torso top.
  const headCx = torsoTopX + Math.sin(orient) * headR;
  const headCy = torsoTopY - Math.cos(orient) * headR;

  return (
    <g transform={`translate(${pose.cx}, ${pose.cy})`} opacity={pose.opacity}>
      {/* Ground glow under bot */}
      <ellipse cx={0} cy={8} rx={36} ry={6} fill={color} opacity={0.18} filter="url(#glow-md)" />

      {/* Name/score HUD plate */}
      <g transform={`translate(0, ${-torsoH - headR - 80})`}>
        <rect
          x={-80}
          y={-22}
          width={160}
          height={48}
          rx={2}
          fill="#000"
          opacity={0.55}
          stroke={color}
          strokeOpacity={0.4}
          strokeWidth={1}
        />
        <text
          x={0}
          y={-4}
          textAnchor="middle"
          fill={color}
          fontSize={15}
          fontWeight={700}
          letterSpacing={1.2}
          filter="url(#glow-sm)"
        >
          {displayName}
        </text>
        <text
          x={0}
          y={18}
          textAnchor="middle"
          fill={color}
          fontSize={11}
          fontWeight={500}
          opacity={0.85}
        >
          {formatMon(totalExtracted)} MON  ·  {kills}K
        </text>
        {isLeader && (
          <text x={0} y={-38} textAnchor="middle" fontSize={20} fill="#ffd84d" filter="url(#glow-md)">
            ♔
          </text>
        )}
      </g>

      {/* Strike-phase motion-blur trail */}
      {isLunging && lastTarget && (
        <line
          x1={baseX - pose.cx}
          y1={baseY - pose.cy - torsoLen / 2}
          x2={0}
          y2={-torsoLen / 2}
          stroke={color}
          strokeWidth={3}
          strokeOpacity={0.4}
          filter="url(#glow-md)"
        />
      )}

      {/* HEAD */}
      <g transform={`translate(${headCx}, ${headCy}) rotate(${(pose.headRot * 180) / Math.PI})`}>
        <circle cx={0} cy={0} r={headR} stroke={color} strokeWidth={2.5} fill="#02060a" filter="url(#glow-sm)" />
        {pose.eyesAngry ? (
          <>
            <line x1={-6} y1={-3} x2={-1} y2={1} stroke={color} strokeWidth={2.5} />
            <line x1={6} y1={-3} x2={1} y2={1} stroke={color} strokeWidth={2.5} />
          </>
        ) : (
          <>
            <circle cx={-5} cy={-1} r={1.8} fill={color} />
            <circle cx={5} cy={-1} r={1.8} fill={color} />
          </>
        )}
      </g>

      {/* TORSO */}
      <line
        x1={0}
        y1={0}
        x2={torsoTopX}
        y2={torsoTopY}
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        filter="url(#glow-sm)"
      />

      {/* ARMS */}
      <g transform={`translate(${armOriginX}, ${armOriginY})`}>
        <line
          x1={0}
          y1={0}
          x2={Math.cos(pose.leftArmAng) * armLen}
          y2={Math.sin(pose.leftArmAng) * armLen}
          stroke={color}
          strokeWidth={3}
          strokeLinecap="round"
          filter="url(#glow-sm)"
        />
        <line
          x1={0}
          y1={0}
          x2={-Math.cos(pose.rightArmAng) * armLen}
          y2={Math.sin(pose.rightArmAng) * armLen}
          stroke={color}
          strokeWidth={3}
          strokeLinecap="round"
          filter="url(#glow-sm)"
        />
      </g>

      {/* LEGS */}
      <line
        x1={0}
        y1={0}
        x2={legL.x}
        y2={legL.y}
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        filter="url(#glow-sm)"
      />
      <line
        x1={0}
        y1={0}
        x2={legR.x}
        y2={legR.y}
        stroke={color}
        strokeWidth={3}
        strokeLinecap="round"
        filter="url(#glow-sm)"
      />

      {/* Strike shockwave during recovery phase */}
      {isLunging && sinceKill > 400 && sinceKill < 700 && (
        <circle
          cx={0}
          cy={-torsoH / 2}
          r={(sinceKill - 400) * 0.55}
          stroke={color}
          strokeWidth={2}
          fill="none"
          opacity={1 - (sinceKill - 400) / 300}
          filter="url(#glow-md)"
        />
      )}
    </g>
  );
}
