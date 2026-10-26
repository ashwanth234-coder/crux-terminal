"use client";

import { Modal } from "@/components/ui/Modal";
import type { ChartSettings } from "./settings";

const ROWS: { key: Exclude<keyof ChartSettings, "palette">; label: string; hint: string }[] = [
  { key: "grid", label: "Grid lines", hint: "Horizontal and vertical guides" },
  { key: "volume", label: "Volume", hint: "Volume bars under the candles" },
  { key: "magnet", label: "Magnet crosshair", hint: "Snaps to each candle's open, high, low or close" },
  { key: "seconds", label: "Seconds on the time axis", hint: "For the 1s and 15s timeframes" },
  { key: "clearingLine", label: "Auction clearing price", hint: "The dashed line where the pool opened" },
];

/** Chart appearance, kept in this browser. */
export function SettingsModal({ open, onClose, settings, onChange }: { open: boolean; onClose: () => void; settings: ChartSettings; onChange: (s: ChartSettings) => void }) {
  return (
    <Modal open={open} onClose={onClose} title="Chart settings" subtitle="Saved in this browser.">
      <ul className="mt-4 divide-y divide-line">
        {ROWS.map((r) => (
          <li key={r.key} className="flex items-center justify-between gap-4 py-2.5">
            <span>
              <span className="block text-[13px] text-chrome">{r.label}</span>
              <span className="block text-[11.5px] text-dim">{r.hint}</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={settings[r.key]}
              aria-label={r.label}
              onClick={() => onChange({ ...settings, [r.key]: !settings[r.key] })}
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${settings[r.key] ? "bg-signal" : "bg-line-2"}`}
            >
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-void transition-[left] ${settings[r.key] ? "left-[18px]" : "left-0.5"}`} />
            </button>
          </li>
        ))}
        <li className="flex items-center justify-between gap-4 py-2.5">
          <span>
            <span className="block text-[13px] text-chrome">Candle colours</span>
            <span className="block text-[11.5px] text-dim">Up and down</span>
          </span>
          <div role="radiogroup" aria-label="Candle colours" className="flex gap-1.5">
            {(["crux", "classic"] as const).map((p) => (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={settings.palette === p}
                onClick={() => onChange({ ...settings, palette: p })}
                className={`flex items-center gap-1.5 rounded-[4px] border px-2 py-1 text-[11.5px] ${settings.palette === p ? "border-chrome/60 text-chrome" : "border-line-2 text-muted"}`}
              >
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p === "crux" ? "#5cc08c" : "#26a69a" }} />
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p === "crux" ? "#e5484d" : "#ef5350" }} />
                {p === "crux" ? "Crux" : "Classic"}
              </button>
            ))}
          </div>
        </li>
      </ul>
    </Modal>
  );
}
