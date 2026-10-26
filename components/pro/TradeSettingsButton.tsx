"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_SLIPPAGE_BPS, MIN_SLIPPAGE_BPS, saveTradeSettings, useTradeSettings } from "@/hooks/useTradeSettings";

const CHOICES = [50, 100, 200, 500];
const pctOf = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : bps % 10 === 0 ? 1 : 2)}%`;

/**
 * The ticket's gear: how far under the quote an order may fill (signed into its minimum, enforced on-chain) and the
 * quick-buy dollar sizes. Saved in this browser; every ticket on the page follows it.
 */
export function TradeSettingsButton() {
  const settings = useTradeSettings();
  const [open, setOpen] = useState(false);
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

  const bps = settings.slippageBps;
  const setBps = (v: number) => saveTradeSettings({ ...settings, slippageBps: Math.min(MAX_SLIPPAGE_BPS, Math.max(MIN_SLIPPAGE_BPS, Math.round(v))) });
  const customBps = custom ? Math.round(Number(custom) * 100) : null;
  const customValid = customBps !== null && Number.isFinite(customBps) && customBps >= MIN_SLIPPAGE_BPS && customBps <= MAX_SLIPPAGE_BPS;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          setOpen((o) => !o);
          setPresets(settings.buyPresets.map(String));
          setCustom("");
        }}
        title="Slippage and quick-buy sizes"
        className={`inline-flex h-6 items-center gap-1.5 rounded-[4px] border px-2 text-[11px] transition-colors ${
          bps > 500 ? "border-down/50 text-down" : "border-line-2 text-muted hover:border-chrome/50 hover:text-chrome"
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
        Slippage <span className="font-mono">{pctOf(bps)}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Trade settings"
          className="absolute right-0 top-full z-40 mt-1.5 w-[268px] rounded-[6px] border border-line-2 bg-panel-2 p-3 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)]"
        >
          <p className="text-[11px] uppercase tracking-[0.14em] text-dim">Max slippage</p>
          <div className="mt-1.5 grid grid-cols-4 gap-1">
            {CHOICES.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={bps === c}
                onClick={() => setBps(c)}
                className={`h-7 rounded-[4px] border font-mono text-[11.5px] transition-colors ${bps === c ? "border-signal/60 bg-signal/10 text-chrome" : "border-line-2 text-muted hover:text-chrome"}`}
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
              <span className="sr-only">Custom slippage, percent</span>
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
          <p className={`mt-1.5 text-[11px] leading-snug ${bps > 500 ? "text-down" : bps < 30 ? "text-[#ffd166]" : "text-dim"}`}>
            {bps > 500
              ? "Loose: your order can fill well under the quote."
              : bps < 30
                ? "Tight: if the price moves before your batch, the order refunds instead of filling."
                : "Signed into your order's minimum and enforced on-chain: it can't fill below that."}{" "}
            {custom && !customValid && `Between ${MIN_SLIPPAGE_BPS / 100}% and ${MAX_SLIPPAGE_BPS / 100}%.`}
          </p>

          <p className="mt-3 text-[11px] uppercase tracking-[0.14em] text-dim">Quick buy sizes (USDC)</p>
          <div className="mt-1.5 grid grid-cols-4 gap-1">
            {presets.map((v, i) => (
              <label key={i} className="flex items-center rounded-[4px] border border-line-2 bg-void/60 px-1.5 focus-within:border-chrome/50">
                <span className="font-mono text-[11px] text-dim">$</span>
                <span className="sr-only">Quick buy size {i + 1}</span>
                <input
                  inputMode="decimal"
                  value={v}
                  onChange={(e) => {
                    const next = presets.map((p, j) => (j === i ? e.target.value.replace(/[^0-9.]/g, "") : p));
                    setPresets(next);
                    const nums = next.map(Number);
                    if (nums.every((n) => Number.isFinite(n) && n > 0)) saveTradeSettings({ ...settings, buyPresets: nums });
                  }}
                  className="h-7 w-full min-w-0 bg-transparent font-mono text-[12px] text-chrome outline-none"
                />
              </label>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-dim">Keys 1–4 pick them while the ticket is on buy.</p>
        </div>
      )}
    </div>
  );
}
