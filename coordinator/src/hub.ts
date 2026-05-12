import { encodeMessage, type WsMessage } from "@pit/shared";
import type { ServerWebSocket } from "bun";
import { logger } from "./logger.js";
import type { Recorder } from "./recorder.js";

export type Role = "searcher" | "dashboard";

export interface ClientMeta {
  role: Role;
  /** Set for searchers after they identify themselves. */
  address?: `0x${string}`;
  /** Last pong received. Used by heartbeat. */
  lastPong: number;
  /** Open timestamp. */
  openedAt: number;
}

/** Broadcast hub. Owns WS client sets, counts messages by type, and writes to the recorder. */
export class Hub {
  private searchers = new Set<ServerWebSocket<ClientMeta>>();
  private dashboards = new Set<ServerWebSocket<ClientMeta>>();
  private counters: Record<string, number> = {};
  private lastResetAt: number = Date.now();

  constructor(private recorder: Recorder) {}

  add(ws: ServerWebSocket<ClientMeta>) {
    if (ws.data.role === "searcher") this.searchers.add(ws);
    else this.dashboards.add(ws);
  }

  remove(ws: ServerWebSocket<ClientMeta>) {
    this.searchers.delete(ws);
    this.dashboards.delete(ws);
  }

  send(ws: ServerWebSocket<ClientMeta>, msg: WsMessage) {
    try {
      ws.send(encodeMessage(msg));
    } catch (err) {
      logger.warn({ err }, "ws send failed");
    }
  }

  broadcast(msg: WsMessage, target: "all" | Role = "all") {
    this.counters[msg.type] = (this.counters[msg.type] ?? 0) + 1;
    this.recorder.record(msg);
    const wire = encodeMessage(msg);
    if (target === "all" || target === "searcher") {
      for (const ws of this.searchers) {
        try {
          ws.send(wire);
        } catch (err) {
          logger.warn({ err }, "ws send (searcher) failed");
        }
      }
    }
    if (target === "all" || target === "dashboard") {
      for (const ws of this.dashboards) {
        try {
          ws.send(wire);
        } catch (err) {
          logger.warn({ err }, "ws send (dashboard) failed");
        }
      }
    }
  }

  counts() {
    return { searchers: this.searchers.size, dashboards: this.dashboards.size };
  }

  getCounters() {
    return { messagesByType: { ...this.counters }, lastResetAt: this.lastResetAt };
  }

  resetCounters() {
    this.counters = {};
    this.lastResetAt = Date.now();
  }

  allSockets(): ServerWebSocket<ClientMeta>[] {
    return [...this.searchers, ...this.dashboards];
  }
}
