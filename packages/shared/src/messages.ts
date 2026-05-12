/**
 * WebSocket protocol between coordinator and clients (searcher bots, dashboard).
 *
 * Every message is a JSON object with a `type` discriminator. BigInt fields are encoded as
 * decimal strings on the wire (see serde.ts).
 *
 * Producers: build the runtime form (with bigint), then call encodeMessage to get a wire string.
 * Consumers: call parseMessage to validate and deserialize.
 */

import { z } from "zod";
import {
  AddressSchema,
  BigIntStringSchema,
  DisplayNameSchema,
  HexSchema,
} from "./validation.js";
import { ROUND_MODES, BOT_COLORS, TRASH_TALK_MAX_LEN } from "./constants.js";
import { toWire } from "./serde.js";

const RoundModeSchema = z.enum(ROUND_MODES);
const BotColorSchema = z.enum(BOT_COLORS);
const VictimKindSchema = z.enum(["swap", "liquidation", "arb", "mint"]);

const ChainTxSchema = z.object({
  hash: HexSchema,
  from: AddressSchema,
  to: AddressSchema,
  data: HexSchema,
  value: BigIntStringSchema,
  gasLimit: BigIntStringSchema,
  nonce: z.number().int().nonnegative(),
  chainId: z.number().int().positive(),
});

const VictimTxSchema = ChainTxSchema.extend({
  id: z.number().int().nonnegative(),
  kind: VictimKindSchema,
  extractableValue: BigIntStringSchema,
  emittedAt: z.number().int().nonnegative(),
  broadcastAt: z.number().int().nonnegative().optional(),
  poolAddress: AddressSchema.optional(),
  metadata: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
});

const BotHandleSchema = z.object({
  id: AddressSchema,
  displayName: DisplayNameSchema,
  walletAddress: AddressSchema,
  registeredAt: z.number().int().nonnegative(),
  color: BotColorSchema,
});

const ScoreSchema = z.object({
  searcherId: AddressSchema,
  displayName: DisplayNameSchema,
  color: BotColorSchema,
  totalExtracted: BigIntStringSchema,
  kills: z.number().int().nonnegative(),
  gasSpent: BigIntStringSchema,
  netProfit: BigIntStringSchema,
  rank: z.number().int().positive(),
});

const ExtractionEventSchema = z.object({
  searcherId: AddressSchema,
  victimId: z.number().int().nonnegative(),
  amountExtracted: BigIntStringSchema,
  gasSpent: BigIntStringSchema,
  blockNumber: z.number().int().nonnegative(),
  txHash: HexSchema,
  timestamp: z.number().int().nonnegative(),
  trashTalk: z.string().max(TRASH_TALK_MAX_LEN).optional(),
  roundId: z.number().int().nonnegative(),
});

const RoundConfigSchema = z.object({
  roundId: z.number().int().nonnegative(),
  mode: RoundModeSchema,
  durationMs: z.number().int().positive(),
  victimRateMs: z.number().int().positive(),
  startedAt: z.number().int().nonnegative(),
  endsAt: z.number().int().nonnegative(),
});

const RoundResultSchema = z.object({
  roundId: z.number().int().nonnegative(),
  winner: BotHandleSchema.optional(),
  finalScores: z.array(ScoreSchema),
  totalExtracted: BigIntStringSchema,
  totalVictims: z.number().int().nonnegative(),
});

export const WsMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("pending_tx"), tx: VictimTxSchema }),
  z.object({
    type: z.literal("tx_broadcast"),
    victimId: z.number().int().nonnegative(),
    txHash: HexSchema,
    broadcastAt: z.number().int().nonnegative(),
  }),
  z.object({ type: z.literal("extraction"), event: ExtractionEventSchema }),
  z.object({ type: z.literal("score_update"), scores: z.array(ScoreSchema) }),
  z.object({ type: z.literal("round_start"), config: RoundConfigSchema }),
  z.object({ type: z.literal("round_end"), result: RoundResultSchema }),
  z.object({ type: z.literal("bot_registered"), bot: BotHandleSchema }),
  z.object({
    type: z.literal("hello"),
    role: z.enum(["searcher", "dashboard"]),
    serverTime: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal("error"),
    code: z.string(),
    message: z.string(),
  }),
]);

/** Wire-form (post-Zod parse) type. Deserialized: bigints are native. */
export type WsMessage = z.infer<typeof WsMessageSchema>;

/**
 * Parse a raw wire JSON string into a typed WsMessage with bigints deserialized.
 * Throws ZodError on invalid input.
 */
export function parseMessage(raw: string): WsMessage {
  const json: unknown = JSON.parse(raw);
  return WsMessageSchema.parse(json);
}

/**
 * Encode a runtime-form WsMessage (with bigints) to a wire-safe JSON string.
 */
export function encodeMessage(msg: WsMessage): string {
  return JSON.stringify(toWire(msg));
}

export {
  ChainTxSchema,
  VictimTxSchema,
  BotHandleSchema,
  ScoreSchema,
  ExtractionEventSchema,
  RoundConfigSchema,
  RoundResultSchema,
  RoundModeSchema,
  BotColorSchema,
  VictimKindSchema,
};
