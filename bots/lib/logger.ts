import pino from "pino";

export function makeLogger(botName: string) {
  const isPretty = (process.env.LOG_PRETTY ?? "true") === "true";
  const level = process.env.LOG_LEVEL ?? "info";
  return pino(
    isPretty
      ? {
          level,
          name: botName,
          transport: {
            target: "pino-pretty",
            options: {
              colorize: true,
              translateTime: "HH:MM:ss.l",
              ignore: "pid,hostname",
              messageFormat: `[${botName}] {msg}`,
            },
          },
        }
      : { level, name: botName },
  );
}
