"use client";

import { useEffect, useRef } from "react";
import { parseMessage } from "@pit/shared";
import { COORDINATOR_WS } from "./env";
import { useStore } from "./store";

const BACKOFF = [1000, 2000, 4000, 8000, 10000];

export function useCoordinatorSocket() {
  const setStatus = useStore((s) => s.setStatus);
  const ingest = useStore((s) => s.ingest);
  const attempt = useRef(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;

    function connect() {
      if (cancelled) return;
      setStatus("connecting");
      const ws = new WebSocket(COORDINATOR_WS);
      wsRef.current = ws;

      ws.onopen = () => {
        attempt.current = 0;
        setStatus("open");
      };
      ws.onmessage = (e) => {
        try {
          const msg = parseMessage(typeof e.data === "string" ? e.data : "");
          ingest(msg);
        } catch (err) {
          console.warn("bad ws message", err);
        }
      };
      ws.onerror = () => {
        setStatus("error");
      };
      ws.onclose = () => {
        setStatus("closed");
        if (cancelled) return;
        const delay = BACKOFF[Math.min(attempt.current, BACKOFF.length - 1)];
        attempt.current += 1;
        reconnectTimer.current = setTimeout(connect, delay);
      };
    }

    connect();
    return () => {
      cancelled = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [ingest, setStatus]);
}
