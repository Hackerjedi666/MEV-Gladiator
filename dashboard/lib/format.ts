/** Format a wei bigint as MON with 2 decimals. */
export function formatMon(wei: bigint): string {
  const whole = wei / 10n ** 18n;
  const frac = (wei % 10n ** 18n) / 10n ** 16n; // 2 decimals
  return `${whole}.${frac.toString().padStart(2, "0")}`;
}

/** "0x1234...abcd" */
export function shortAddr(addr: string): string {
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/** Format a unix ms as HH:MM:SS.mmm */
export function fmtTime(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number, w = 2) => n.toString().padStart(w, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}
