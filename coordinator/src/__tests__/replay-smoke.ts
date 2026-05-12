/**
 * Smoke for the replay tool: pick any recording from /coordinator/recordings and run replay --speed inf.
 * Must complete with exit 0 and at least one printed line.
 */
import { spawnSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const dir = resolve(process.cwd(), "recordings");
const files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
if (files.length === 0) {
  console.error("no recordings to replay; run the coordinator smoke first");
  process.exit(1);
}

// Pick the largest file (most content).
const target = files
  .map((f) => ({ f, size: statSync(resolve(dir, f)).size }))
  .sort((a, b) => b.size - a.size)[0].f;

const path = resolve(dir, target);
console.log(`replaying ${target} at infinite speed`);
const result = spawnSync("bun", ["run", "src/replay.ts", path, "--speed", "inf"], {
  stdio: ["ignore", "pipe", "inherit"],
});

if (result.status !== 0) {
  console.error("replay exited non-zero");
  process.exit(1);
}
const out = result.stdout.toString();
const lines = out.split("\n").filter((l) => l.trim());
if (lines.length < 1) {
  console.error("replay printed no lines");
  process.exit(1);
}
console.log(`✅ replay-smoke ok (${lines.length} lines printed)`);
