import { WS_PATHS, parseMessage, type WsMessage, AddressSchema } from "@pit/shared";
import { logger } from "./logger.js";
import type { ChainContext } from "./chain.js";
import type { Hub, ClientMeta, Role } from "./hub.js";
import type { State } from "./state.js";
import type { RoundManager } from "./round.js";
import { coliseumAbi } from "./chain.js";

const HEARTBEAT_INTERVAL_MS = 30_000;
const HEARTBEAT_TIMEOUT_MS = 10_000;

const corsHeaders: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

function withCors(res: Response): Response {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders)) h.set(k, v);
  return new Response(res.body, { status: res.status, headers: h });
}

export function startServer(opts: {
  port: number;
  chain: ChainContext;
  hub: Hub;
  state: State;
  round: RoundManager;
}) {
  const { port, chain, hub, state, round } = opts;
  const bootAt = Date.now();

  const server = Bun.serve<ClientMeta>({
    port,
    async fetch(req, server) {
      const url = new URL(req.url);

      // CORS preflight
      if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
      }

      // WebSocket upgrades
      if (url.pathname === WS_PATHS.searcher || url.pathname === WS_PATHS.dashboard) {
        const role: Role = url.pathname === WS_PATHS.searcher ? "searcher" : "dashboard";
        const ok = server.upgrade(req, {
          data: { role, lastPong: Date.now(), openedAt: Date.now() } satisfies ClientMeta,
        });
        if (ok) return undefined;
        return withCors(new Response("ws upgrade failed", { status: 400 }));
      }

      // HTTP routes
      if (req.method === "GET" && url.pathname === "/health") {
        return withCors(Response.json({ ok: true, mode: chain.mode, ...hub.counts() }));
      }

      if (req.method === "GET" && url.pathname === "/stats") {
        const c = hub.getCounters();
        return withCors(
          Response.json({
            uptimeMs: Date.now() - bootAt,
            mode: chain.mode,
            currentRound: state.currentRound,
            ...c,
            ...hub.counts(),
          }),
        );
      }

      if (req.method === "GET" && url.pathname === "/status") {
        return withCors(
          Response.json({
            mode: chain.mode,
            round: state.currentRound,
            bots: [...state.bots.values()],
            scores: state.computeScores().map((s) => ({
              ...s,
              totalExtracted: s.totalExtracted.toString(),
              gasSpent: s.gasSpent.toString(),
              netProfit: s.netProfit.toString(),
            })),
            extractions: state.recentExtractions.slice(0, 20).map((e) => ({
              ...e,
              amountExtracted: e.amountExtracted.toString(),
              gasSpent: e.gasSpent.toString(),
            })),
            ...hub.counts(),
          }),
        );
      }

      if (req.method === "POST" && url.pathname === "/round/start") {
        const body: any = await req.json().catch(() => ({}));
        try {
          await round.start({
            mode: body?.mode,
            durationMs: body?.durationMs,
            victimRateMs: body?.victimRateMs,
          });
          return withCors(Response.json({ ok: true, round: state.currentRound }));
        } catch (err: any) {
          return withCors(
            Response.json({ ok: false, error: String(err?.message ?? err) }, { status: 400 }),
          );
        }
      }

      if (req.method === "POST" && url.pathname === "/round/stop") {
        try {
          await round.end();
          return withCors(Response.json({ ok: true }));
        } catch (err: any) {
          return withCors(
            Response.json({ ok: false, error: String(err?.message ?? err) }, { status: 400 }),
          );
        }
      }

      return withCors(new Response("not found", { status: 404 }));
    },
    websocket: {
      open(ws) {
        hub.add(ws);
        hub.send(ws, { type: "hello", role: ws.data.role, serverTime: Date.now() });
        if (ws.data.role === "dashboard") {
          // Send a state snapshot to new dashboards.
          if (state.currentRound) {
            hub.send(ws, { type: "round_start", config: state.currentRound });
          }
          hub.send(ws, { type: "score_update", scores: state.computeScores() });
        }
        logger.info({ role: ws.data.role, ...hub.counts() }, "ws open");
      },
      async message(ws, raw) {
        let msg: WsMessage;
        try {
          msg = parseMessage(typeof raw === "string" ? raw : Buffer.from(raw).toString("utf8"));
        } catch (err: any) {
          hub.send(ws, { type: "error", code: "BAD_MESSAGE", message: String(err?.message ?? err) });
          return;
        }
        if (msg.type === "hello" && ws.data.role === "searcher") {
          logger.info({ ws: "searcher hello", serverTime: msg.serverTime }, "searcher handshake");
        } else if (msg.type === "bot_registered") {
          const addr = AddressSchema.parse(msg.bot.walletAddress) as `0x${string}`;
          if (chain.mode === "live") {
            const info = await chain.publicClient!.readContract({
              address: chain.deployment!.coliseum as `0x${string}`,
              abi: coliseumAbi,
              functionName: "getBotInfo",
              args: [addr],
            });
            if (!info[5]) {
              hub.send(ws, {
                type: "error",
                code: "NOT_REGISTERED",
                message: "bot not registered on chain",
              });
              return;
            }
          }
          ws.data.address = addr;
          state.registerBot({
            ...msg.bot,
            id: msg.bot.id as `0x${string}`,
            walletAddress: msg.bot.walletAddress as `0x${string}`,
          });
          hub.broadcast(msg, "dashboard");
        }
      },
      close(ws) {
        hub.remove(ws);
        logger.info({ role: ws.data.role, ...hub.counts() }, "ws close");
      },
      pong(ws) {
        ws.data.lastPong = Date.now();
      },
    },
  });

  // Heartbeat
  const hb = setInterval(() => {
    const now = Date.now();
    for (const ws of hub.allSockets()) {
      if (now - ws.data.lastPong > HEARTBEAT_INTERVAL_MS + HEARTBEAT_TIMEOUT_MS) {
        logger.warn({ role: ws.data.role }, "dropping stale ws");
        try {
          ws.close();
        } catch {}
        hub.remove(ws);
        continue;
      }
      try {
        ws.ping();
      } catch {}
    }
  }, HEARTBEAT_INTERVAL_MS);
  hb.unref?.();

  logger.info({ port }, "coordinator listening");
  return server;
}
