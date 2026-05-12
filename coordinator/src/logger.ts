import pino from "pino";

const isPretty = (process.env.LOG_PRETTY ?? "true") === "true";
const level = process.env.LOG_LEVEL ?? "info";

export const logger = pino(
  isPretty
    ? {
        level,
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss.l", ignore: "pid,hostname" },
        },
      }
    : { level },
);

export type Logger = typeof logger;
