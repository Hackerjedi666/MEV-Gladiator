"use client";

import { create } from "zustand";
import type {
  WsMessage,
  RoundConfig,
  Score,
  VictimTx,
  ExtractionEvent,
  BotHandle,
} from "@pit/shared";

export type ConnStatus = "idle" | "connecting" | "open" | "closed" | "error";

export type FeedItem = {
  /** Local ms — when the dashboard received it. Independent from msg.timestamp. */
  receivedAt: number;
  msg: WsMessage;
};

interface StoreState {
  status: ConnStatus;
  serverTime: number | null;
  round: RoundConfig | null;
  scores: Score[];
  bots: Map<string, BotHandle>;
  pendingVictims: VictimTx[]; // most recent first, capped
  extractions: ExtractionEvent[]; // most recent first, capped
  feed: FeedItem[]; // most recent first, capped at 200
  counters: Record<string, number>;
  // actions
  setStatus: (s: ConnStatus) => void;
  ingest: (msg: WsMessage) => void;
  clear: () => void;
}

const FEED_CAP = 200;
const VICTIM_CAP = 50;
const EXTRACTION_CAP = 100;

export const useStore = create<StoreState>((set) => ({
  status: "idle",
  serverTime: null,
  round: null,
  scores: [],
  bots: new Map(),
  pendingVictims: [],
  extractions: [],
  feed: [],
  counters: {},

  setStatus: (s) => set({ status: s }),

  ingest: (msg) =>
    set((state) => {
      const counters = { ...state.counters, [msg.type]: (state.counters[msg.type] ?? 0) + 1 };
      const feed = [{ receivedAt: Date.now(), msg }, ...state.feed].slice(0, FEED_CAP);
      const patch: Partial<StoreState> = { counters, feed };

      switch (msg.type) {
        case "hello":
          patch.serverTime = msg.serverTime;
          break;
        case "round_start":
          patch.round = msg.config;
          patch.extractions = [];
          patch.pendingVictims = [];
          patch.counters = { [msg.type]: 1 };
          break;
        case "round_end":
          patch.round = null;
          patch.scores = msg.result.finalScores as Score[];
          break;
        case "pending_tx":
          patch.pendingVictims = [msg.tx as VictimTx, ...state.pendingVictims].slice(0, VICTIM_CAP);
          break;
        case "extraction":
          patch.extractions = [msg.event as ExtractionEvent, ...state.extractions].slice(
            0,
            EXTRACTION_CAP,
          );
          break;
        case "score_update":
          patch.scores = msg.scores as Score[];
          break;
        case "bot_registered": {
          const bots = new Map(state.bots);
          bots.set(msg.bot.id, msg.bot as BotHandle);
          patch.bots = bots;
          break;
        }
      }

      return patch;
    }),

  clear: () =>
    set({
      round: null,
      scores: [],
      pendingVictims: [],
      extractions: [],
      feed: [],
      counters: {},
    }),
}));
