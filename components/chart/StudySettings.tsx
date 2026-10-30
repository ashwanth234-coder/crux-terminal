"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { EMPTY_CONTEXT, computeInstance, paramsOf, studyById, type StudyInstance } from "@/lib/indicators";
import type { AlertOp, AlertRule } from "./settings";
import { PushSwitch } from "./PushSwitch";

const OPS: { id: AlertOp; label: string }[] = [
  { id: "up", label: "crosses above" },
  { id: "down", label: "crosses below" },
  { id: "cross", label: "crosses" },
];
const WIDTHS = [1, 2, 3, 4];

/**
 * An indicator's settings, as TradingView lays them out: its inputs (length, multiplier, levels), each line's colour
 * and width, and alerts on its lines: when a line crosses a value, the price, or another of its lines. Changes apply
 * as you type; every change is one undo step on the chart.
 */
export function StudySettings({
  inst,
  rules,
  onChange,
  onRules,
  onRemove,
  onClose,
  unitHint,
  k,
}: {
  inst: StudyInstance;
  rules: AlertRule[];
  onChange: (next: StudyInstance) => void;
  onRules: (next: AlertRule[]) => void;
  onRemove: () => void;
  onClose: () => void;
  /** How a value is entered for priced lines ("USD per token" or "market cap"). */
  unitHint: string;
  /** The chart's units multiplier: priced values are entered in its units and stored per token. */
  k: number;
}) {
  const study = studyById(inst.id);
  const p = paramsOf(inst);
  const lines = computeInstance(inst, [], EMPTY_CONTEXT);
  const [line, setLine] = useState(lines[0]?.key ?? "");
  const [op, setOp] = useState<AlertOp>("cross");
  const [target, setTarget] = useState<string>("value");
  const [value, setValue] = useState(study.levels?.(p)[1]?.toString() ?? "");
  const mine = rules.filter((r) => r.study === inst.id);

  const addRule = () => {
    const v = Number(value);
    if (target === "value" && !Number.isFinite(v)) return;
    const rule: AlertRule = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      study: inst.id,
      line,
      op,
      target: target === "value" ? { value: study.priced ? v / k : v } : target === "price" ? "price" : { line: target },
      repeat: false,
    };
    onRules([...rules, rule]);
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission();
    } catch {
      // The in-page message still shows.
    }
  };
  const labelOf = (key: string) => lines.find((l) => l.key === key)?.label ?? key;

  return (
    <Modal open onClose={onClose} title={study.title(p)} subtitle={study.hint ?? study.label}>
      <div className="mt-4 space-y-5 text-[13px]">
        {study.params.length > 0 && (
          <section>
            <h3 className="mb-2 text-[11px] uppercase tracking-[0.14em] text-dim">Inputs</h3>
            <div className="grid grid-cols-2 gap-2">
              {study.params.map((d) => (
                <label key={d.key} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2">
                  <span className="text-muted">{d.label}</span>
                  <input
                    type="number"
                    min={d.min}
                    max={d.max}
                    step={d.step ?? 1}
                    value={inst.params?.[d.key] ?? d.def}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (Number.isFinite(n)) onChange({ ...inst, params: { ...inst.params, [d.key]: n } });
                    }}
                    className="w-20 rounded-[3px] border border-line-2 bg-void px-1.5 py-0.5 text-right font-mono text-chrome outline-none focus:border-chrome/50"
                  />
                </label>
              ))}
            </div>
          </section>
        )}

        {lines.length > 0 && (
          <section>
            <h3 className="mb-2 text-[11px] uppercase tracking-[0.14em] text-dim">Style</h3>
            <ul className="divide-y divide-line rounded-lg border border-line">
              {lines.map((l) => (
                <li key={l.key} className="flex items-center gap-3 px-3 py-2">
                  <span className="flex-1 text-muted">{l.label}</span>
                  <input
                    type="color"
                    aria-label={`${l.label} colour`}
                    value={(inst.colors?.[l.key] ?? l.color).slice(0, 7)}
                    onChange={(e) => onChange({ ...inst, colors: { ...inst.colors, [l.key]: e.target.value } })}
                    className="h-6 w-8 cursor-pointer rounded border border-line-2 bg-transparent"
                  />
                  {l.kind === "line" && (
                    <span className="flex gap-0.5" role="radiogroup" aria-label={`${l.label} width`}>
                      {WIDTHS.map((w) => (
                        <button
                          key={w}
                          type="button"
                          role="radio"
                          aria-checked={(inst.widths?.[l.key] ?? 1) === w}
                          onClick={() => onChange({ ...inst, widths: { ...inst.widths, [l.key]: w } })}
                          className={`grid h-6 w-6 place-items-center rounded-[3px] ${(inst.widths?.[l.key] ?? 1) === w ? "bg-tint/[0.08]" : "hover:bg-tint/[0.05]"}`}
                          title={`${w}px`}
                        >
                          <span className="w-4 rounded-full bg-chrome" style={{ height: w }} />
                        </button>
                      ))}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {lines.length > 0 && (
          <section>
            <h3 className="mb-2 text-[11px] uppercase tracking-[0.14em] text-dim">Alerts</h3>
            <div className="flex flex-wrap items-center gap-1.5 rounded-lg border border-line p-2">
              <span className="text-dim">When</span>
              <select value={line} onChange={(e) => setLine(e.target.value)} className="rounded-[3px] border border-line-2 bg-void px-1.5 py-1 text-chrome outline-none">
                {lines.map((l) => (
                  <option key={l.key} value={l.key}>
                    {l.label}
                  </option>
                ))}
              </select>
              <select value={op} onChange={(e) => setOp(e.target.value as AlertOp)} className="rounded-[3px] border border-line-2 bg-void px-1.5 py-1 text-chrome outline-none">
                {OPS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              <select value={target} onChange={(e) => setTarget(e.target.value)} className="rounded-[3px] border border-line-2 bg-void px-1.5 py-1 text-chrome outline-none">
                <option value="value">a value</option>
                {study.pane === "price" && <option value="price">the price</option>}
                {lines
                  .filter((l) => l.key !== line)
                  .map((l) => (
                    <option key={l.key} value={l.key}>
                      {l.label}
                    </option>
                  ))}
              </select>
              {target === "value" && (
                <input
                  inputMode="decimal"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={study.priced ? unitHint : "value"}
                  className="w-28 rounded-[3px] border border-line-2 bg-void px-1.5 py-1 font-mono text-chrome outline-none"
                />
              )}
              <button type="button" onClick={addRule} className="ml-auto rounded-[4px] border border-signal/60 px-2.5 py-1 text-[12px] text-signal hover:bg-signal/10">
                Add alert
              </button>
            </div>
            {mine.length > 0 && (
              <ul className="mt-2 space-y-1">
                {mine.map((r) => (
                  <li key={r.id} className="flex items-center gap-2 text-[12px] text-muted">
                    <span className="flex-1">
                      {labelOf(r.line)} {OPS.find((o) => o.id === r.op)?.label}{" "}
                      {r.target === "price" ? "the price" : "line" in r.target ? labelOf(r.target.line) : study.priced ? (r.target.value * k).toPrecision(4) : r.target.value}
                    </span>
                    <button type="button" onClick={() => onRules(rules.filter((x) => x.id !== r.id))} className="text-dim hover:text-down" aria-label="Remove alert">
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1.5 text-[11px] text-dim">
              {study.priced ? `Values are in ${unitHint}. ` : ""}Each alert fires once, on the candle where the line crosses.
            </p>
            <div className="mt-1">
              <PushSwitch />
            </div>
          </section>
        )}

        <div className="flex justify-between">
          <button type="button" onClick={onRemove} className="text-[12px] text-down hover:underline">
            Remove indicator
          </button>
          <button type="button" onClick={() => onChange({ id: inst.id, hidden: inst.hidden })} className="text-[12px] text-dim hover:text-chrome">
            Reset to defaults
          </button>
        </div>
      </div>
    </Modal>
  );
}
