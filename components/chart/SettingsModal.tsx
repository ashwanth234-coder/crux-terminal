"use client";

import { useState, type ReactNode } from "react";
import { Modal } from "@/components/ui/Modal";
import { DEFAULT_SETTINGS, palette, type ChartSettings } from "./settings";

type Tab = "symbol" | "status" | "scales" | "canvas" | "trading";
const TABS: { id: Tab; label: string }[] = [
  { id: "symbol", label: "Symbol" },
  { id: "status", label: "Status line" },
  { id: "scales", label: "Scales & time" },
  { id: "canvas", label: "Canvas" },
  { id: "trading", label: "Trading" },
];

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-4 py-2.5">
      <span>
        <span className="block text-[13px] text-chrome">{label}</span>
        {hint && <span className="block text-[11.5px] text-dim">{hint}</span>}
      </span>
      {children}
    </li>
  );
}

function Switch({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={onClick} className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? "bg-signal" : "bg-line-2"}`}>
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-void transition-[left] ${on ? "left-[18px]" : "left-0.5"}`} />
    </button>
  );
}

function Choice<T extends string>({ value, options, onChange, label }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1">
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className={`rounded-[4px] border px-2 py-1 text-[11.5px] ${value === o.id ? "border-chrome/60 text-chrome" : "border-line-2 text-muted hover:text-chrome"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Chart settings, in TradingView's sections: the candles' look, what the status line shows, the price and time
 * axes, the canvas, and what's drawn from trading (your orders, marks, the auction floor). Saved in this browser and
 * applied as you change them; the quick toggles at the top are the ones traders flip most.
 */
export function SettingsModal({ open, onClose, settings, onChange }: { open: boolean; onClose: () => void; settings: ChartSettings; onChange: (s: ChartSettings) => void }) {
  const [tab, setTab] = useState<Tab>("symbol");
  const set = <K extends keyof ChartSettings>(k: K, v: ChartSettings[K]) => onChange({ ...settings, [k]: v });
  const flip = (k: keyof ChartSettings) => onChange({ ...settings, [k]: !settings[k] });
  const { up, down } = palette(settings);

  return (
    <Modal open={open} onClose={onClose} title="Chart settings" subtitle="Saved in this browser.">
      {/* The quickest switches, always in reach. */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {(
          [
            ["grid", "Grid"],
            ["volume", "Volume"],
            ["magnet", "Magnet"],
            ["countdown", "Countdown"],
            ["lastPriceLine", "Price line"],
            ["showOrders", "My orders"],
            ["watermark", "Watermark"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            aria-pressed={settings[k] as boolean}
            onClick={() => flip(k)}
            className={`rounded-full border px-2.5 py-1 text-[11.5px] ${settings[k] ? "border-signal/60 bg-signal/10 text-chrome" : "border-line-2 text-muted hover:text-chrome"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div role="tablist" aria-label="Settings sections" className="mt-3 flex flex-wrap gap-1 border-b border-line pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-[4px] px-2.5 py-1 text-[12px] ${tab === t.id ? "bg-panel-2 text-chrome ring-1 ring-inset ring-signal/60" : "text-muted hover:text-chrome"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <ul className="divide-y divide-line">
        {tab === "symbol" && (
          <>
            <Row label="Colour scheme" hint="Up and down">
              <Choice
                label="Colour scheme"
                value={settings.palette}
                options={[
                  { id: "crux", label: "Crux" },
                  { id: "classic", label: "Classic" },
                ]}
                onChange={(v) => onChange({ ...settings, palette: v, upColor: "", downColor: "" })}
              />
            </Row>
            <Row label="Up colour" hint="Candles, volume and buys">
              <input type="color" aria-label="Up colour" value={up} onChange={(e) => set("upColor", e.target.value)} className="h-7 w-10 cursor-pointer rounded border border-line-2 bg-transparent" />
            </Row>
            <Row label="Down colour" hint="Candles, volume and sells">
              <input type="color" aria-label="Down colour" value={down} onChange={(e) => set("downColor", e.target.value)} className="h-7 w-10 cursor-pointer rounded border border-line-2 bg-transparent" />
            </Row>
            <Row label="Wicks">
              <Switch label="Wicks" on={settings.wicks} onClick={() => flip("wicks")} />
            </Row>
            <Row label="Borders" hint="Candle outlines in the candle's colour">
              <Switch label="Borders" on={settings.borders} onClick={() => flip("borders")} />
            </Row>
          </>
        )}

        {tab === "status" && (
          <>
            {(
              [
                ["ohlc", "Open, high, low, close"],
                ["change", "Change"],
                ["volume", "Volume and trades"],
                ["studies", "Indicator values"],
              ] as const
            ).map(([k, label]) => (
              <Row key={k} label={label}>
                <Switch label={label} on={settings.status[k]} onClick={() => set("status", { ...settings.status, [k]: !settings.status[k] })} />
              </Row>
            ))}
          </>
        )}

        {tab === "scales" && (
          <>
            <Row label="Price axis">
              <Choice
                label="Price axis side"
                value={settings.scaleSide}
                options={[
                  { id: "left", label: "Left" },
                  { id: "right", label: "Right" },
                ]}
                onChange={(v) => set("scaleSide", v)}
              />
            </Row>
            <Row label="Last price line" hint="Dashed line at the latest price">
              <Switch label="Last price line" on={settings.lastPriceLine} onClick={() => flip("lastPriceLine")} />
            </Row>
            <Row label="Countdown to candle close" hint="Under the last price">
              <Switch label="Countdown" on={settings.countdown} onClick={() => flip("countdown")} />
            </Row>
            <Row label="Time zone">
              <Choice
                label="Time zone"
                value={settings.timezone}
                options={[
                  { id: "utc", label: "UTC" },
                  { id: "local", label: "My time" },
                ]}
                onChange={(v) => set("timezone", v)}
              />
            </Row>
            <Row label="Seconds on the time axis" hint="For second timeframes">
              <Switch label="Seconds" on={settings.seconds} onClick={() => flip("seconds")} />
            </Row>
          </>
        )}

        {tab === "canvas" && (
          <>
            <Row label="Background">
              <Choice
                label="Background"
                value={settings.background}
                options={[
                  { id: "default", label: "Crux" },
                  { id: "black", label: "Black" },
                  { id: "slate", label: "Slate" },
                ]}
                onChange={(v) => set("background", v)}
              />
            </Row>
            <Row label="Grid lines">
              <span className="flex items-center gap-2">
                <Choice
                  label="Grid lines"
                  value={settings.gridStyle}
                  options={[
                    { id: "both", label: "Both" },
                    { id: "vert", label: "Vertical" },
                    { id: "horz", label: "Horizontal" },
                  ]}
                  onChange={(v) => onChange({ ...settings, gridStyle: v, grid: true })}
                />
                <Switch label="Grid" on={settings.grid} onClick={() => flip("grid")} />
              </span>
            </Row>
            <Row label="Magnet crosshair" hint="Snaps to each candle's open, high, low or close">
              <Switch label="Magnet" on={settings.magnet} onClick={() => flip("magnet")} />
            </Row>
            <Row label="Watermark" hint="The token's symbol behind the candles">
              <Switch label="Watermark" on={settings.watermark} onClick={() => flip("watermark")} />
            </Row>
            <Row label="Volume bars">
              <Switch label="Volume" on={settings.volume} onClick={() => flip("volume")} />
            </Row>
          </>
        )}

        {tab === "trading" && (
          <>
            <Row label="My standing orders" hint="Take profit, stop loss and dip buys as lines (Crux account)">
              <Switch label="My standing orders" on={settings.showOrders} onClick={() => flip("showOrders")} />
            </Row>
            <Row label="My trades and average entry">
              <Switch label="My trades" on={settings.marks.mine} onClick={() => set("marks", { ...settings.marks, mine: !settings.marks.mine })} />
            </Row>
            <Row label="Dev and whale trades">
              <Switch label="Dev and whale trades" on={settings.marks.dev} onClick={() => set("marks", { ...settings.marks, dev: !settings.marks.dev })} />
            </Row>
            <Row label="Top 10 holders' trades">
              <Switch label="Top 10 holders' trades" on={settings.marks.top} onClick={() => set("marks", { ...settings.marks, top: !settings.marks.top })} />
            </Row>
            <Row label="Auction clearing price" hint="The dashed line where the pool opened">
              <Switch label="Auction clearing price" on={settings.clearingLine} onClick={() => flip("clearingLine")} />
            </Row>
          </>
        )}
      </ul>
      <div className="mt-3 flex justify-end">
        <button type="button" onClick={() => onChange({ ...DEFAULT_SETTINGS, snap: settings.snap, cursor: settings.cursor })} className="text-[12px] text-dim hover:text-chrome">
          Reset all to defaults
        </button>
      </div>
    </Modal>
  );
}
