/**
 * Constants shared across coordinator, dashboard, and bots.
 * All values are locked at the protocol level; changing them requires updating every consumer.
 */

/** Monad testnet chain id. */
export const MONAD_TESTNET_CHAIN_ID = 10143 as const;

/** Public HTTPS RPC for Monad testnet. */
export const MONAD_TESTNET_RPC = "https://testnet-rpc.monad.xyz" as const;

/** WebSocket RPC for Monad testnet (used for event subscriptions). */
export const MONAD_TESTNET_WS = "wss://testnet-rpc.monad.xyz" as const;

/** Block explorer base URL. */
export const MONAD_TESTNET_EXPLORER = "https://testnet.monadexplorer.com" as const;

/** Native token symbol on Monad testnet. */
export const NATIVE_SYMBOL = "MON" as const;

/** Default ms between victim tx emissions when no round overrides it. */
export const DEFAULT_VICTIM_INTERVAL_MS = 500;

/** Default head-start ms: how long after we broadcast `pending_tx` to WS before we broadcast on-chain. */
export const DEFAULT_HEADSTART_MS = 50;

/** Default round length: 10 minutes. */
export const DEFAULT_ROUND_DURATION_MS = 600_000;

/** Minimum extractable value (wei) for a sandwich-mode victim to be considered juicy enough to emit. */
export const MIN_SANDWICH_VALUE_WEI = 1_000_000_000_000_000_000n; // 1 MON

/** Multiplier applied to victim value in boss-fight mode. */
export const BOSS_MULTIPLIER = 10n;

/** Hard cap on leaderboard size shown on dashboard. */
export const MAX_LEADERBOARD_SIZE = 10;

/** Display-name constraints, mirrored on-chain in Coliseum.sol. */
export const DISPLAY_NAME_MIN_LEN = 1;
export const DISPLAY_NAME_MAX_LEN = 24;

/** Max length for an optional trash-talk string in an extraction. */
export const TRASH_TALK_MAX_LEN = 80;

/** WS path map. Coordinator exposes two endpoints with different broadcast scopes. */
export const WS_PATHS = {
  searcher: "/searcher",
  dashboard: "/dashboard",
} as const;

/** Palette assigned to bots by registration order. Cycle with modulo. */
export const BOT_COLORS = [
  "#00ff41",
  "#ff006e",
  "#00d4ff",
  "#ffb800",
  "#ff00ff",
  "#00ffe1",
  "#9eff00",
  "#ff7a00",
  "#b388ff",
  "#4dffb8",
  "#ff5e5e",
  "#ffd700",
] as const;

export type BotColor = (typeof BOT_COLORS)[number];

/** All round modes. Keep in sync with RoundMode. */
export const ROUND_MODES = ["arb", "sandwich", "liquidation", "boss"] as const;

/** Window (in blocks) within which a tx is considered an extraction of a recent victim. */
export const EXTRACTION_BLOCK_WINDOW = 2;

/** How many recent blocks the dashboard's BlockView panel keeps in memory. */
export const BLOCK_VIEW_DEPTH = 20;
