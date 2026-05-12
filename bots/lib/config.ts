import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { DisplayNameSchema } from "@pit/shared";

const candidates = [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../.env"),
  resolve(process.cwd(), "../../.env"),
];
for (const p of candidates) {
  if (existsSync(p)) {
    loadDotenv({ path: p });
    break;
  }
}

export type BotMode = "live" | "mock";

export interface BotConfig {
  mode: BotMode;
  privateKey: `0x${string}`;
  displayName: string;
  coordinatorWs: string;
  rpcUrl: string;
  deploymentPath: string;
}

function readHex(name: string, fallbackName?: string): `0x${string}` {
  const v = process.env[name] ?? (fallbackName ? process.env[fallbackName] : undefined);
  if (!v) throw new Error(`${name}${fallbackName ? ` or ${fallbackName}` : ""} required`);
  if (!/^0x[0-9a-fA-F]+$/.test(v)) throw new Error(`${name} must be 0x-hex`);
  return v as `0x${string}`;
}

export function loadBotConfig(opts: { privateKeyEnv: string; displayName: string }): BotConfig {
  const mode = (process.env.BOT_MODE ?? "mock").toLowerCase() as BotMode;
  if (mode !== "live" && mode !== "mock") throw new Error(`BOT_MODE invalid: ${mode}`);
  const privateKey = readHex(opts.privateKeyEnv, "BOT_PRIVATE_KEY");
  DisplayNameSchema.parse(opts.displayName);
  return {
    mode,
    privateKey,
    displayName: opts.displayName,
    coordinatorWs: process.env.COORDINATOR_WS ?? "ws://localhost:3001/searcher",
    rpcUrl: process.env.MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz",
    deploymentPath: resolve(
      process.env.DEPLOYMENT_PATH ?? "../contracts/deployments/monad-testnet.json",
    ),
  };
}
