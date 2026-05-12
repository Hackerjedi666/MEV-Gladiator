"use client";

import { useStore } from "@/lib/store";
import { useMemo } from "react";

const DEPTH = 14;

export function BlockStrip() {
  const feed = useStore((s) => s.feed);

  const blocks = useMemo(() => {
    const bucket = new Map<number, Array<"victim" | "extraction">>();
    for (const item of feed) {
      if (item.msg.type !== "pending_tx" && item.msg.type !== "extraction") continue;
      const sec = Math.floor(item.receivedAt / 1500);
      if (!bucket.has(sec)) bucket.set(sec, []);
      bucket.get(sec)!.push(item.msg.type === "pending_tx" ? "victim" : "extraction");
    }
    return [...bucket.entries()]
      .sort(([a], [b]) => b - a)
      .slice(0, DEPTH)
      .reverse();
  }, [feed]);

  return (
    <div className="flex items-end gap-[3px] h-full">
      {Array.from({ length: DEPTH }).map((_, i) => {
        const b = blocks[i];
        const cells = b?.[1] ?? [];
        const isLatest = i === DEPTH - 1 && cells.length > 0;
        return (
          <div
            key={i}
            className={`flex flex-col-reverse gap-[2px] flex-1 h-full border border-[#003311] ${
              isLatest ? "border-[#00ff66] shadow-[0_0_8px_#00ff66]" : ""
            }`}
          >
            {Array.from({ length: 14 }).map((_, j) => {
              const c = cells[j];
              const cls =
                c === "extraction"
                  ? "bg-[#00ff66] shadow-[0_0_4px_#00ff66]"
                  : c === "victim"
                    ? "bg-[#1f5f1f]"
                    : "bg-transparent";
              return <div key={j} className={`flex-1 ${cls}`} />;
            })}
          </div>
        );
      })}
    </div>
  );
}
