"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_SLIPPAGE_BPS, MIN_SLIPPAGE_BPS, saveTradeSettings, slippageFor, useTradeSettings, type TradeSettings } from "@/hooks/useTradeSettings";

/** Memecoin-terminal slippage presets: 1% to 50%. */
const CHOICES = [100, 500, 1_000, 2_000, 3_000, 5_000];
const pctOf = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : bps % 10 === 0 ? 1 : 2)}%`;

/**
 * The ticket's gear, set for buys and sells apart: how far under the quote an order may fill (signed into its
 * minimum, enforced on-chain), the four quick sizes (dollars to buy, shares of the bag to sell), and whether a quick
 * size trades in one click (or key 1–4). Saved in this browser; every ticket on the page follows it.
 */
export function TradeSettingsButton({ side: ticketSide = "buy" }: { side?: "buy" | "sell" }) {
  const settings = useTradeSettings();
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<"buy" | "sell">(ticketSide);
  const [custom, setCustom] = useState("");
  const [presets, setPresets] = useState<string[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const shown = slippageFor(settings, ticketSide);
  const bps = slippageFor(settings, side);
  const save = (patch: Partial<TradeSettings>) => saveTradeSettings({ ...settings, ...patch });
  const setBps = (v: number) => {
    const clamped = Math.min(MAX_SLIPPAGE_BPS, Math.max(MIN_SLIPPAGE_BPS, Math.round(v)));
    save(side === "buy" ? { slippageBps: clamped } : { sellSlippageBps: clamped });
  };
  const customBps = custom ? Math.round(Number(custom) * 100) : null;
  const customValid = customBps !== null && Number.isFinite(customBps) && customBps >= MIN_SLIPPAGE_BPS && customBps <= MAX_SLIPPAGE_BPS;
  const pickSide = (s: "buy" | "sell") => {
    setSide(s);
    setCustom("");
    setPresets((s === "buy" ? settings.buyPresets : settings.sellPresets).map(String));
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          setOpen((o) => !o);
          pickSide(ticketSide);
        }}
        title="Slippage, quick sizes and one-click trading"
        className={`inline-flex h-6 items-center gap-1.5 rounded-[4px] border px-2 text-[11px] transition-colors ${
          shown > 2_000 ? "border-down/50 text-down" : "border-line-2 text-muted hover:border-chrome/50 hover:text-chrome"
        }`}
      >
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
          <path
            d="M8 5.6a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8Zm5.2 3.3.1-.9-.1-.9 1.4-1.1-1.4-2.4-1.7.6a5 5 0 0 0-1.5-.9L9.7 1.5H6.3L6 3.3a5 5 0 0 0-1.5.9l-1.7-.6-1.4 2.4 1.4 1.1-.1.9.1.9-1.4 1.1 1.4 2.4 1.7-.6c.5.4 1 .7 1.5.9l.3 1.8h3.4l.3-1.8c.6-.2 1-.5 1.5-.9l1.7.6 1.4-2.4-1.4-1.1Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
        </svg>
        Slippage <span className="font-mono">{pctOf(shown)}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Trade settings"
          className="absolute right-0 top-full z-40 mt-1.5 w-[284px] rounded-[6px] border border-line-2 bg-panel-2 p-3 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)]"
        >
          <div role="tablist" aria-label="Settings for" className="grid grid-cols-2 gap-1 rounded-[5px] bg-void/60 p-0.5">
            {(["buy", "sell"] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="tab"
                aria-selected={side === s}
                onClick={() => pickSide(s)}
                className={`h-6 rounded-[4px] text-[11.5px] capitalize transition-colors ${
                  side === s ? (s === "buy" ? "bg-up/15 text-up" : "bg-down/15 text-down") : "text-muted hover:text-chrome"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <p className="mt-3 text-[11px] uppercase tracking-[0.14em] text-dim">{side === "buy" ? "Buy" : "Sell"} slippage</p>
          <div className="mt-1.5 grid grid-cols-6 gap-1">
            {CHOICES.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={bps === c}
                onClick={() => setBps(c)}
                className={`h-7 rounded-[4px] border font-mono text-[11px] transition-colors ${bps === c ? "border-signal/60 bg-signal/10 text-chrome" : "border-line-2 text-muted hover:text-chrome"}`}
              >
                {pctOf(c)}
              </button>
            ))}
          </div>
          <form
            className="mt-1.5 flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (customValid) setBps(customBps!);
            }}
          >
            <label className="flex flex-1 items-center gap-1 rounded-[4px] border border-line-2 bg-void/60 px-2 focus-within:border-chrome/50">
              <span className="sr-only">Custom {side} slippage, percent</span>
              <input
                inputMode="decimal"
                placeholder={(bps / 100).toString()}
                value={custom}
                onChange={(e) => setCustom(e.target.value.replace(/[^0-9.]/g, ""))}
                className="h-7 w-full min-w-0 bg-transparent font-mono text-[12px] text-chrome outline-none placeholder:text-dim"
              />
              <span className="text-[11px] text-dim">%</span>
            </label>
            <button type="submit" disabled={!customValid} className="h-7 rounded-[4px] border border-line-2 px-2 text-[11.5px] text-muted hover:text-chrome disabled:opacity-40">
              Set
            </button>
          </form>
          <p className={`mt-1.5 text-[11px] leading-snug ${bps > 2_000 ? "text-down" : bps < 100 ? "text-[#ffd166]" : "text-dim"}`}>
            {bps > 2_000
              ? "Loose: a fast-moving token can fill far under the quote."
              : bps < 100
                ? "Tight: if the price moves before your batch, the order refunds instead of filling."
                : "Signed into your order's minimum and enforced on-chain: it can't fill below that."}{" "}
            {custom && !customValid && `Between ${MIN_SLIPPAGE_BPS / 100}% and ${MAX_SLIPPAGE_BPS / 100}%.`}
          </p>

          <p className="mt-3 text-[11px] uppercase tracking-[0.14em] text-dim">{side === "buy" ? "Quick buy sizes (USDC)" : "Quick sell sizes (% of bag)"}</p>
          <div className="mt-1.5 grid grid-cols-4 gap-1">
            {presets.map((v, i) => (
              <label key={i} className="flex items-center rounded-[4px] border border-line-2 bg-void/60 px-1.5 focus-within:border-chrome/50">
                {side === "buy" && <span className="font-mono text-[11px] text-dim">$</span>}
                <span className="sr-only">
                  Quick {side} size {i + 1}
                </span>
                <input
                  inputMode="decimal"
                  value={v}
                  onChange={(e) => {
                    const next = presets.map((p, j) => (j === i ? e.target.value.replace(/[^0-9.]/g, "") : p));
                    setPresets(next);
                    const nums = next.map(Number);
                    const ok = nums.every((n) => Number.isFinite(n) && n > 0 && (side === "buy" || n <= 100));
                    if (ok) save(side === "buy" ? { buyPresets: nums } : { sellPresets: nums });
                  }}
                  className="h-7 w-full min-w-0 bg-transparent font-mono text-[12px] text-chrome outline-none"
                />
                {side === "sell" && <span className="font-mono text-[11px] text-dim">%</span>}
              </label>
            ))}
          </div>

          <label className="mt-3 flex cursor-pointer items-start gap-2 border-t border-line pt-3">
            <input type="checkbox" checked={settings.instant} onChange={(e) => save({ instant: e.target.checked })} className="mt-0.5 accent-[var(--color-signal)]" />
            <span className="text-[11.5px] leading-snug text-muted">
              <span className="text-chrome">One-click trading.</span> A quick size (click, or key 1–4) places the order at once from your Crux account or
              one-click session. Off: it only fills in the amount. A wallet always asks to confirm.
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
