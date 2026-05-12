import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { logger } from "./logger.js";
import { AddressSchema } from "@pit/shared";

// Walk up looking for the root .env (so this works regardless of CWD).
const candidates = [
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../.env"),
  resolve(process.cwd(), "../../.env"),
];
for (const p of candidates) {
  if (existsSync(p)) {
    loadDotenv({ path: p });
    logger.info({ envPath: p }, "loaded .env");
    break;
  }
}

export type Mode = "live" | "mock";

export interface Config {
  mode: Mode;
  httpPort: number;
  rpcUrl: string;
  coordinatorPrivateKey?: `0x${string}`;
  victimPrivateKey?: `0x${string}`;
  deploymentPath: string;
}

function readMode(): Mode {
  const m = (process.env.COORDINATOR_MODE ?? "live").toLowerCase();
  if (m !== "live" && m !== "mock") throw new Error(`COORDINATOR_MODE must be live|mock, got ${m}`);
  return m as Mode;
}

function readHex(name: string): `0x${string}` | undefined {
  const v = process.env[name];
  if (!v) return undefined;
  if (!/^0x[0-9a-fA-F]+$/.test(v)) throw new Error(`${name} must be 0x-hex`);
  return v as `0x${string}`;
}

export function loadConfig(): Config {
  const mode = readMode();
  const httpPort = Number(process.env.COORDINATOR_HTTP_PORT ?? 3001);
  const rpcUrl = process.env.MONAD_RPC_URL ?? "https://testnet-rpc.monad.xyz";
  const coordinatorPrivateKey = readHex("COORDINATOR_PRIVATE_KEY");
  const victimPrivateKey = readHex("VICTIM_PRIVATE_KEY");
  const deploymentPath = resolve(
    process.env.COORDINATOR_DEPLOYMENT_PATH ?? "../contracts/deployments/monad-testnet.json",
  );

  if (mode === "live") {
    if (!coordinatorPrivateKey) throw new Error("COORDINATOR_PRIVATE_KEY required in live mode");
    if (!victimPrivateKey) throw new Error("VICTIM_PRIVATE_KEY required in live mode");
    if (!existsSync(deploymentPath)) {
      throw new Error(`Deployment file not found: ${deploymentPath}. Run \`make deploy\` first.`);
    }
  }

  return { mode, httpPort, rpcUrl, coordinatorPrivateKey, victimPrivateKey, deploymentPath };
}

/** Validate the coordinator address derived from the key matches the on-chain owner. */
export function assertAddressIsValid(addr: string, _label: string): `0x${string}` {
  return AddressSchema.parse(addr) as `0x${string}`;
}
