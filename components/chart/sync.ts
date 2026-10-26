/**
 * What the charts of a multi-chart layout share, as TradingView's layout sync: where the crosshair is (by time), the
 * visible time range (scroll and zoom), and the timeframe. Each chart publishes its own changes and applies the others'.
 */
export type SyncOptions = { crosshair: boolean; time: boolean; interval: boolean };

export type SyncEvent =
  | { kind: "crosshair"; from: number; time: number | null }
  | { kind: "range"; from: number; start: number; end: number }
  | { kind: "interval"; from: number; interval: number | "auto" };

export class SyncBus {
  private listeners = new Set<(e: SyncEvent) => void>();

  subscribe(fn: (e: SyncEvent) => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  publish(e: SyncEvent) {
    for (const fn of this.listeners) fn(e);
  }
}
