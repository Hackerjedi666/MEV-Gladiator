import { mkdirSync, createWriteStream, type WriteStream } from "node:fs";
import { resolve } from "node:path";
import { encodeMessage, type WsMessage } from "@pit/shared";
import { logger } from "./logger.js";

export class Recorder {
  private stream: WriteStream | null = null;
  private filePath: string | null = null;

  start(roundId: number) {
    const dir = resolve(process.cwd(), "recordings");
    mkdirSync(dir, { recursive: true });
    const file = `${dir}/round-${roundId}-${Date.now()}.jsonl`;
    this.stream = createWriteStream(file, { flags: "a" });
    this.filePath = file;
    logger.info({ file }, "recorder started");
  }

  record(msg: WsMessage) {
    if (!this.stream) return;
    this.stream.write(encodeMessage(msg) + "\n");
  }

  stop() {
    if (!this.stream) return;
    this.stream.end();
    logger.info({ file: this.filePath }, "recorder stopped");
    this.stream = null;
    this.filePath = null;
  }

  currentFile(): string | null {
    return this.filePath;
  }
}
