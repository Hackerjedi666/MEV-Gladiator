"use client";

import { create } from "zustand";
import type { VictimTx, ExtractionEvent } from "@pit/shared";

export interface FallingVictim {
  id: number;
  victim: VictimTx;
  spawnedAt: number;
  xPct: number;
  claimedBy?: string;
  claimedAt?: number;
  /** Position at moment of claim — coin freezes here until bot arrives. */
  claimX?: number;
  claimY?: number;
  /** Catcher slot index (0/1/2). */
  catcherSlot?: number;
  /** Catcher's base position — used by Victim to interpolate the coin into the bot's hand. */
  catcherBaseX?: number;
  catcherBaseY?: number;
}

export interface ScorePopup {
  id: string;
  searcherId: string;
  amount: bigint;
  x: number;
  y: number;
  bornAt: number;
}

export interface ImpactBurst {
  id: string;
  x: number;
  y: number;
  color: string;
  bornAt: number;
}

export interface MissEvent {
  searcherId: string;
  targetX: number;
  targetY: number;
  /** X position of the winner's slot — for head-glare direction. */
  winnerSlotX: number;
  at: number;
}

export interface TauntEvent {
  searcherId: string;
  type: "flex" | "glare";
  /** For glares, the X position the head should turn toward. */
  targetX?: number;
  at: number;
}

export interface Crack {
  id: string;
  x: number;
  y: number;
  bornAt: number;
  isJackpot: boolean;
}

interface ShowStateData {
  falling: Map<number, FallingVictim>;
  popups: ScorePopup[];
  bursts: ImpactBurst[];
  lastKillAt: Map<string, number>;
  lastTarget: Map<string, { victimId: number; x: number; y: number; at: number }>;

  // Brutality additions
  missEvents: Map<string, MissEvent>;
  taunts: Map<string, TauntEvent>;
  shake: { intensity: number; at: number };
  cracks: Crack[];
  /** victimId → searcherId → lastHuntAt. Updated by Stickman every frame; never re-renders. */
  recentHunters: Map<number, Map<string, number>>;

  // Targeting visualization
  /** victimId → [searcherIds currently locked on it]. */
  huntLocks: Map<number, string[]>;
  /** Per-bot color cache, kept in sync with scores. */
  botColors: Map<string, string>;

  // Actions
  addFalling: (v: VictimTx) => void;
  claim: (
    victimId: number,
    searcherId: string,
    x: number,
    y: number,
    color: string,
    winnerSlot: number,
    isJackpot: boolean,
    catcherBaseX: number,
    catcherBaseY: number,
  ) => void;
  addPopup: (e: ExtractionEvent, x: number, y: number) => void;
  recordHunt: (searcherId: string, victimId: number) => void;
  triggerTaunt: (searcherId: string, type: "flex" | "glare", targetX?: number) => void;
  setHuntLock: (searcherId: string, victimId: number | null) => void;
  setBotColors: (colors: Map<string, string>) => void;
  prune: () => void;
  clear: () => void;
}

const VICTIM_FALL_DURATION_MS = 5000;
const VICTIM_LINGER_MS = 600;
const POPUP_TTL_MS = 2200;
const BURST_TTL_MS = 700;
const POUNCE_DURATION_MS = 900;
const MISS_DURATION_MS = 600;
const TAUNT_DURATION_MS = 800;
const SHAKE_DECAY_MS = 350;
const CRACK_TTL_MS = 1500;
const CRACK_JACKPOT_TTL_MS = 2200;
const MISS_WINDOW_MS = 500;
const JACKPOT_THRESHOLD_WEI = 10n ** 18n; // 1 MON

export const useShow = create<ShowStateData>((set, get) => ({
  falling: new Map(),
  popups: [],
  bursts: [],
  lastKillAt: new Map(),
  lastTarget: new Map(),
  missEvents: new Map(),
  taunts: new Map(),
  shake: { intensity: 0, at: 0 },
  cracks: [],
  recentHunters: new Map(),
  huntLocks: new Map(),
  botColors: new Map(),

  setHuntLock: (searcherId, victimId) =>
    set((s) => {
      const next = new Map(s.huntLocks);
      // Remove this bot from any existing lock arrays.
      for (const [vid, arr] of next) {
        const filtered = arr.filter((id) => id !== searcherId);
        if (filtered.length === 0) {
          next.delete(vid);
        } else if (filtered.length !== arr.length) {
          next.set(vid, filtered);
        }
      }
      // Add to new target if any.
      if (victimId !== null) {
        const existing = next.get(victimId) ?? [];
        if (!existing.includes(searcherId)) {
          next.set(victimId, [...existing, searcherId]);
        }
      }
      return { huntLocks: next };
    }),

  setBotColors: (colors) => set({ botColors: colors }),

  addFalling: (v) =>
    set((s) => {
      if (s.falling.has(v.id)) return {};
      const next = new Map(s.falling);
      next.set(v.id, {
        id: v.id,
        victim: v,
        spawnedAt: Date.now(),
        xPct: 0.08 + Math.random() * 0.84,
      });
      if (next.size > 50) {
        const oldest = [...next.keys()][0];
        next.delete(oldest);
      }
      return { falling: next };
    }),

  claim: (victimId, searcherId, x, y, color, winnerSlot, isJackpot, catcherBaseX, catcherBaseY) =>
    set((s) => {
      const f = s.falling.get(victimId);
      if (!f) return {};
      const next = new Map(s.falling);
      next.set(victimId, {
        ...f,
        claimedBy: searcherId,
        claimedAt: Date.now(),
        claimX: x,
        claimY: y,
        catcherSlot: winnerSlot,
        catcherBaseX,
        catcherBaseY,
      });

      // Misses for everyone else who was actively hunting this coin within MISS_WINDOW_MS.
      // winnerSlotX (for glare direction) = the catcher's base X.
      const hunters = s.recentHunters.get(victimId);
      const missEvents = new Map(s.missEvents);
      const nowMs = Date.now();
      if (hunters) {
        for (const [hunterId, lastAt] of hunters) {
          if (hunterId === searcherId) continue;
          if (nowMs - lastAt > MISS_WINDOW_MS) continue;
          missEvents.set(hunterId, {
            searcherId: hunterId,
            targetX: x,
            targetY: y,
            winnerSlotX: catcherBaseX,
            at: nowMs,
          });
        }
      }

      const cracks = [
        ...s.cracks,
        { id: `${victimId}:${nowMs}`, x, y, bornAt: nowMs, isJackpot },
      ].slice(-10);

      // Clear any hunt locks on the claimed coin.
      const huntLocks = new Map(s.huntLocks);
      huntLocks.delete(victimId);

      return {
        falling: next,
        lastKillAt: new Map(s.lastKillAt).set(searcherId, nowMs),
        lastTarget: new Map(s.lastTarget).set(searcherId, { victimId, x, y, at: nowMs }),
        bursts: [
          ...s.bursts,
          { id: `${victimId}:${nowMs}`, x, y, color, bornAt: nowMs },
        ].slice(-16),
        missEvents,
        shake: { intensity: isJackpot ? 1 : 0.5, at: nowMs },
        cracks,
        huntLocks,
      };
    }),

  addPopup: (e, x, y) =>
    set((s) => ({
      popups: [
        ...s.popups,
        {
          id: e.txHash + ":" + e.victimId,
          searcherId: e.searcherId,
          amount: e.amountExtracted,
          x,
          y,
          bornAt: Date.now(),
        },
      ].slice(-12),
    })),

  /**
   * Write-only blackboard updated every animation frame by hunting Stickmen.
   * Does NOT call set() — no re-render notifications.
   */
  recordHunt: (searcherId, victimId) => {
    const map = get().recentHunters;
    let inner = map.get(victimId);
    if (!inner) {
      inner = new Map();
      map.set(victimId, inner);
    }
    inner.set(searcherId, Date.now());
  },

  triggerTaunt: (searcherId, type, targetX) =>
    set((s) => {
      const taunts = new Map(s.taunts);
      taunts.set(searcherId, { searcherId, type, targetX, at: Date.now() });
      return { taunts };
    }),

  prune: () => {
    const now = Date.now();
    const s = get();
    let changed = false;

    const falling = new Map(s.falling);
    for (const [k, f] of falling) {
      const age = now - f.spawnedAt;
      const expired =
        (f.claimedAt && now - f.claimedAt > VICTIM_LINGER_MS) ||
        (!f.claimedAt && age > VICTIM_FALL_DURATION_MS + 400);
      if (expired) {
        falling.delete(k);
        // Reap the hunter blackboard for this victim — no re-render needed.
        s.recentHunters.delete(k);
        changed = true;
      }
    }

    const popups = s.popups.filter((p) => now - p.bornAt < POPUP_TTL_MS);
    if (popups.length !== s.popups.length) changed = true;

    const bursts = s.bursts.filter((b) => now - b.bornAt < BURST_TTL_MS);
    if (bursts.length !== s.bursts.length) changed = true;

    const cracks = s.cracks.filter(
      (c) => now - c.bornAt < (c.isJackpot ? CRACK_JACKPOT_TTL_MS : CRACK_TTL_MS),
    );
    if (cracks.length !== s.cracks.length) changed = true;

    // Prune miss events past TTL.
    const missEvents = new Map(s.missEvents);
    let missChanged = false;
    for (const [k, m] of missEvents) {
      if (now - m.at > MISS_DURATION_MS) {
        missEvents.delete(k);
        missChanged = true;
      }
    }
    if (missChanged) changed = true;

    // Prune taunts past TTL.
    const taunts = new Map(s.taunts);
    let tauntsChanged = false;
    for (const [k, t] of taunts) {
      if (now - t.at > TAUNT_DURATION_MS) {
        taunts.delete(k);
        tauntsChanged = true;
      }
    }
    if (tauntsChanged) changed = true;

    // Prune hunt locks for any victims that no longer exist.
    const huntLocks = new Map(s.huntLocks);
    let locksChanged = false;
    for (const vid of huntLocks.keys()) {
      if (!falling.has(vid)) {
        huntLocks.delete(vid);
        locksChanged = true;
      }
    }
    if (locksChanged) changed = true;

    if (changed)
      set({
        falling,
        popups,
        bursts,
        cracks,
        missEvents: missChanged ? missEvents : s.missEvents,
        taunts: tauntsChanged ? taunts : s.taunts,
        huntLocks: locksChanged ? huntLocks : s.huntLocks,
      });
  },

  clear: () =>
    set((s) => {
      // Also drop the hunter blackboard.
      s.recentHunters.clear();
      return {
        falling: new Map(),
        popups: [],
        bursts: [],
        lastKillAt: new Map(),
        lastTarget: new Map(),
        missEvents: new Map(),
        taunts: new Map(),
        shake: { intensity: 0, at: 0 },
        cracks: [],
        huntLocks: new Map(),
      };
    }),
}));

export const SHOW_TIMINGS = {
  VICTIM_FALL_DURATION_MS,
  VICTIM_LINGER_MS,
  POPUP_TTL_MS,
  BURST_TTL_MS,
  POUNCE_DURATION_MS,
  MISS_DURATION_MS,
  TAUNT_DURATION_MS,
  SHAKE_DECAY_MS,
  CRACK_TTL_MS,
  CRACK_JACKPOT_TTL_MS,
  /** Legacy alias for existing imports. */
  LUNGE_DURATION_MS: POUNCE_DURATION_MS,
};

export const JACKPOT_THRESHOLD = JACKPOT_THRESHOLD_WEI;
