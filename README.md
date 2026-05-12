# MEV Gladiator Pit

A live coliseum where MEV searcher bots battle in a synthetic mempool on Monad testnet, with real-time spectacle for the crowd.

## Why Monad

Monad is an EVM-compatible Layer 1 with **parallel execution**: independent transactions can be scheduled and validated in ways that increase throughput versus strictly serial execution. For this hackathon, that means **dozens of searchers can race on the same block window** while the coordinator simulates a mempool and the chain settles real outcomes on Monad testnet—fast feedback loops for builders and a clearer story for the audience than a single-threaded toy chain.

## Architecture

```
                    +------------------+
                    |    Dashboard     |
                    |  (Next.js + WS)  |
                    +--------+---------+
                             |
                             | WebSocket / HTTP
                             v
                    +------------------+
         +-------->|   Coordinator    |<---------+
         |          | (Bun: mempool + |         |
         |          |  WS fan-out)    |         |
         |          +--------+--------+         |
         |                   |                  |
  WebSocket                 |                  WebSocket
         |                   |                  |
         v                   v                  v
   +-----------+      +-------------+    +-----------+
   |  Bot: Arb |      | Monad       |    | Bot: Sand |
   +-----------+      | testnet     |    +-----------+
   +-----------+      | MockDEX +   |    +-----------+
   | Bot: Rand |      | Coliseum    |    |   ...     |
   +-----------+      +-------------+    +-----------+
```

- **Coordinator**: Owns the synthetic mempool, runs rounds, records traces, and streams events to bots and the dashboard.
- **Monad testnet**: Hosts on-chain state (e.g. MockDEX, Coliseum arena contract); RPC `https://testnet-rpc.monad.xyz`, chain ID `10143`.
- **Bots**: Reference searchers connect over WebSocket, submit bundles or txs according to the protocol in `@pit/shared`.
- **Dashboard**: Spectator UI: live scores, mempool drama, and explorer links.

## Run locally in 10 minutes

1. **Install dependencies**

   ```bash
   pnpm install
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env
   ```

   Fill in `DEPLOYER_PRIVATE_KEY`, `COORDINATOR_PRIVATE_KEY`, victim/bot keys, and confirm Monad RPC vars match the docs in `.env.example`.

3. **Deploy and seed contracts**

   ```bash
   make deploy
   make seed
   ```

4. **Run coordinator and dashboard** (two terminals)

   ```bash
   pnpm dev:coordinator
   pnpm dev:dashboard
   ```

5. **Run bots** — see `bots/README.md` for per-bot commands.

## Project structure

| Path | Purpose |
|------|---------|
| `contracts/` | Foundry project: arena, DEX mocks, deploy/seed scripts, deployment JSON. |
| `coordinator/` | Bun service: mempool simulation, extraction/round logic, WebSocket server, recordings. |
| `dashboard/` | Next.js 14 app router UI for live arena view. |
| `bots/` | Six reference searchers: random, naive arb, naive sandwich, liquidator, JIT-LP, whale-watch. |
| `packages/shared/` | Shared TypeScript types, wire messages, and constants for all TS packages. |
| `scripts/` | Repo automation (e.g. `start-all.sh` for full stack). |

## Mock mode (no chain needed)

The coordinator runs in two modes via `COORDINATOR_MODE`:

- **`live`** — talks to Monad testnet; requires deployed contracts + funded wallets.
- **`mock`** — synthesizes everything: pool addresses, tx hashes, AMM slippage, block numbers, gas. Indistinguishable from live at the WebSocket layer except `/stats.mode`. Use this for local demos and CI.

```bash
cd coordinator
COORDINATOR_MODE=mock COORDINATOR_HTTP_PORT=3001 bun run src/index.ts
# in another terminal
make bots
# in a third
cd dashboard && pnpm dev   # open http://localhost:3000/show
```

## Deploy

### Dashboard → Vercel

The repo is wired for one-click Vercel deploys via `vercel.json` at the root:

- Framework: Next.js (auto-detected)
- Install: `pnpm install --frozen-lockfile` (root, picks up pnpm workspaces)
- Build: `pnpm --filter dashboard build`
- Output: `dashboard/.next`

**Steps**

1. Push this repo to GitHub.
2. Import the repo in Vercel. No directory tweaks needed — the `vercel.json` handles it.
3. Set two environment variables in Vercel project settings:
   - `NEXT_PUBLIC_COORDINATOR_HTTP=https://your-coordinator.example.com`
   - `NEXT_PUBLIC_COORDINATOR_WS=wss://your-coordinator.example.com/dashboard`

**Important:** Vercel can host the dashboard. It **cannot** host the coordinator (it's a long-lived Bun WebSocket server). For a public demo you have three options:

1. Run the coordinator locally and tunnel via `ngrok http 3001` or `cloudflared tunnel`. Point the Vercel env vars at the tunnel URL.
2. Deploy the coordinator to a long-running host: Fly.io, Railway, Render, or a small VPS. Easiest is Fly.io with a 256 MB shared VM.
3. Skip the coordinator entirely — the dashboard's `/show` page shows a clean empty state ("AWAITING COMBATANTS") when no WebSocket is reachable.

### Coordinator → Fly.io (sketch)

```bash
cd coordinator
fly launch --no-deploy   # creates fly.toml
# In fly.toml set [build] image = "oven/bun:1.2", entrypoint = "bun run src/index.ts"
# Set internal_port = 3001, force_https = false
fly secrets set COORDINATOR_MODE=mock LOG_PRETTY=false
fly deploy
```

The coordinator needs no chain access in mock mode. For live mode, also set `MONAD_RPC_URL`, `COORDINATOR_PRIVATE_KEY`, `VICTIM_PRIVATE_KEY` as Fly secrets.

### Contracts → Monad testnet

```bash
cp .env.example .env
# fill in DEPLOYER_PRIVATE_KEY (needs MON for gas) and COORDINATOR_PUBLIC_ADDRESS
make deploy
make seed
```

The deploy writes `contracts/deployments/monad-testnet.json`, which the coordinator reads on boot in live mode. That file is git-ignored — commit a sample if you want one in the repo.

## Links

- **Monad testnet RPC**: https://testnet-rpc.monad.xyz
- **Chain ID**: 10143
- **Explorer**: https://testnet.monadexplorer.com

## License

MIT — see [LICENSE](./LICENSE).

