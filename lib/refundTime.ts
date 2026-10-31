/** "5h 41m" or "04:09": time left until a refund opens. */
export function countdown(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}h ${pad(m)}m` : `${pad(m)}:${pad(s % 60)}`;
}

/** The local time a refund opens: "14:32", or "Nov 1, 14:32" when it isn't today. */
export function refundClock(unixSeconds: number, now = Date.now() / 1000) {
  const at = new Date(unixSeconds * 1000);
  const time = at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return new Date(now * 1000).toDateString() === at.toDateString() ? time : `${at.toLocaleDateString([], { month: "short", day: "numeric" })}, ${time}`;
}
