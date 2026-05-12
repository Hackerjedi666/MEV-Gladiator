"use client";

import { useEffect, useRef } from "react";
import { useStore } from "./store";
import { useShow, SHOW_TIMINGS, JACKPOT_THRESHOLD } from "./showState";
import type { VictimTx, ExtractionEvent } from "@pit/shared";

const ARENA_W = 1600;
const ARENA_H = 900;
const GROUND_Y = 760;
const SLOT_XS = [ARENA_W * 0.22, ARENA_W * 0.5, ARENA_W * 0.78];

export function useShowBridge() {
  const seen = useRef<Set<string>>(new Set());
  const raf = useRef<number | null>(null);

  useEffect(() => {
    const keyFor = (item: { receivedAt: number; msg: any }): string => {
      const m = item.msg;
      const t = m.type;
      if (t === "pending_tx") return `ptx:${m.tx.id}`;
      if (t === "extraction") return `ext:${m.event.victimId}:${m.event.txHash}`;
      if (t === "round_start") return `rs:${m.config.roundId}`;
      if (t === "round_end") return `re:${m.result.roundId}`;
      if (t === "bot_registered") return `br:${m.bot.id}`;
      return `${t}:${item.receivedAt}`;
    };

    for (const item of useStore.getState().feed) {
      seen.current.add(keyFor(item));
    }

    const unsub = useStore.subscribe((s) => {
      // Sync bot colors so Victim can render coins in the locking bot's color.
      if (s.scores.length > 0) {
        const colorMap = new Map<string, string>();
        for (const sc of s.scores) colorMap.set(sc.searcherId, sc.color);
        useShow.getState().setBotColors(colorMap);
      }

      const fresh: typeof s.feed = [];
      for (const item of s.feed) {
        const k = keyFor(item);
        if (seen.current.has(k)) continue;
        seen.current.add(k);
        fresh.push(item);
      }
      if (seen.current.size > 1500) {
        const arr = [...seen.current];
        seen.current = new Set(arr.slice(arr.length - 800));
      }

      for (const item of fresh.reverse()) {
        const m = item.msg;
        if (m.type === "pending_tx") {
          useShow.getState().addFalling(m.tx as VictimTx);
        } else if (m.type === "extraction") {
          // Coin position at moment of strike.
          const f = useShow.getState().falling.get(m.event.victimId);
          let x = ARENA_W / 2;
          let y = ARENA_H * 0.7;
          if (f) {
            const age = Date.now() - f.spawnedAt;
            const fallY = Math.min(1, age / SHOW_TIMINGS.VICTIM_FALL_DURATION_MS);
            const easedY = 1 - Math.pow(1 - fallY, 1.6);
            x = f.xPct * ARENA_W;
            y = easedY * (ARENA_H * 0.78);
          }
          // Winner's slot index from rank order in scores array.
          const scores = useStore.getState().scores;
          const winnerIdx = scores.findIndex((sc) => sc.searcherId === m.event.searcherId);
          const winnerSlot = winnerIdx >= 0 && winnerIdx < 3 ? winnerIdx : 1;
          const color = scores[winnerIdx]?.color ?? "#00ff66";
          const isJackpot = m.event.amountExtracted >= JACKPOT_THRESHOLD;
          const baseX = SLOT_XS[winnerSlot];
          const baseY = GROUND_Y;
          useShow
            .getState()
            .claim(
              m.event.victimId,
              m.event.searcherId,
              x,
              y,
              color,
              winnerSlot,
              isJackpot,
              baseX,
              baseY,
            );
          // Popup well above the catcher's name plate.
          useShow.getState().addPopup(m.event as ExtractionEvent, baseX, baseY - 200);
        } else if (m.type === "round_start") {
          useShow.getState().clear();
          seen.current = new Set(s.feed.map(keyFor));
        }
      }
    });

    const tick = () => {
      useShow.getState().prune();
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);

    return () => {
      unsub();
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, []);

  // Taunt scheduler: every ~5s, leader flexes and non-leaders glare at leader.
  useEffect(() => {
    const id = setInterval(
      () => {
        const scores = useStore.getState().scores;
        if (scores.length === 0) return;
        const leader = scores[0];
        if (Math.random() < 0.5) {
          useShow.getState().triggerTaunt(leader.searcherId, "flex");
        }
        const leaderX = SLOT_XS[0];
        for (const s of scores.slice(1)) {
          if (Math.random() < 0.4) {
            useShow.getState().triggerTaunt(s.searcherId, "glare", leaderX);
          }
        }
      },
      4000 + Math.random() * 2000,
    );
    return () => clearInterval(id);
  }, []);
}

export const ARENA_DIMS = { W: ARENA_W, H: ARENA_H };
export const SHOW_SLOT_XS = SLOT_XS;
