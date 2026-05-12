/**
 * Deployment artifact loader.
 *
 * Mirrors the JSON written by /contracts/script/Deploy.s.sol.
 * Bump schemaVersion in lockstep on both sides if you change the shape.
 */

import { readFileSync } from "node:fs";
import { z } from "zod";
import { AddressSchema } from "./validation.js";

export const DEPLOYMENT_SCHEMA_VERSION = 1;

export const DeploymentArtifactSchema = z.object({
  schemaVersion: z.coerce.number().int().positive(),
  chainId: z.coerce.number().int().positive(),
  deployedAt: z.coerce.number().int().nonnegative(),
  deployer: AddressSchema,
  coordinator: AddressSchema,
  coliseum: AddressSchema,
  tokens: z.object({
    WMON: AddressSchema,
    PIT: AddressSchema,
  }),
  dexes: z.object({
    DEX_A: AddressSchema,
    DEX_B: AddressSchema,
  }),
  pair: z.object({
    token0: AddressSchema,
    token1: AddressSchema,
  }),
});

export type DeploymentArtifact = z.infer<typeof DeploymentArtifactSchema>;

/** Load and validate a deployment artifact from a path. */
export function loadDeployment(path: string): DeploymentArtifact {
  const raw = readFileSync(path, "utf8");
  const parsed: unknown = JSON.parse(raw);
  const result = DeploymentArtifactSchema.parse(parsed);
  if (result.schemaVersion !== DEPLOYMENT_SCHEMA_VERSION) {
    throw new Error(
      `Deployment schema mismatch: got v${result.schemaVersion}, expected v${DEPLOYMENT_SCHEMA_VERSION}. Re-run \`make deploy\`.`,
    );
  }
  return result;
}
