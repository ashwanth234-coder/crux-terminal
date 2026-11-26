/** A small in-process cache: entries expire after `ttlMs`, the oldest go first once there are more than `max`. */
export function ttlCache<V>(max: number, ttlMs: number, now: () => number = Date.now) {
  const m = new Map<string, { v: V; at: number }>();
  return {
    get(k: string): V | undefined {
      const e = m.get(k);
      if (!e) return undefined;
      if (now() - e.at > ttlMs) {
        m.delete(k);
        return undefined;
      }
      return e.v;
    },
    set(k: string, v: V, ttlOverride?: number) {
      m.delete(k);
      m.set(k, { v, at: ttlOverride === undefined ? now() : now() - ttlMs + ttlOverride });
      while (m.size > max) m.delete(m.keys().next().value as string);
    },
    get size() {
      return m.size;
    },
  };
}
