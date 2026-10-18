"use client";

import { useEffect, useId, useRef, useState } from "react";
import { PAY_SOURCES, usd, type PaySource, type PaySourceId } from "@/lib/tokens";

type Props = {
  value: PaySourceId;
  onChange: (id: PaySourceId) => void;
  availableFor: (id: PaySourceId) => number;
  /** Solana needs an SVM wallet; show it as not linked when live. */
  unavailable?: Partial<Record<PaySourceId, string>>;
  label?: string;
};

function WalletGlyph() {
  return (
    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border border-line-2">
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-chrome" aria-hidden="true">
        <rect x="2" y="4" width="12" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <path d="M4 4V3.2A1.2 1.2 0 0 1 5.2 2h6.6" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="11" cy="8.5" r="1" fill="currentColor" />
      </svg>
    </span>
  );
}

/** Listbox for the funding source; keyboard: arrows, Enter/Space, Escape. */
export function PayWithSelect({ value, onChange, availableFor, unavailable = {}, label = "Pay with" }: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = PAY_SOURCES.find((s) => s.id === value) ?? PAY_SOURCES[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  const choose = (s: PaySource) => {
    onChange(s.id);
    setOpen(false);
  };

  const openList = () => {
    setActive(Math.max(0, PAY_SOURCES.findIndex((s) => s.id === value)));
    setOpen(true);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      openList();
      return;
    }
    if (!open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % PAY_SOURCES.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + PAY_SOURCES.length) % PAY_SOURCES.length);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      choose(PAY_SOURCES[active]);
    }
  };

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
        className={`flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-left transition-colors ${
          open ? "border-acid/50" : "border-line hover:border-line-2"
        }`}
      >
        <span className="flex items-center gap-2.5">
          <WalletGlyph />
          <span className="leading-tight">
            <span className="block text-[10px] text-muted">{label}</span>
            <span className="block text-[12px] text-chrome">{selected.label}</span>
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className="font-mono text-[10.5px] text-muted">{usd.format(availableFor(selected.id))}</span>
          <svg viewBox="0 0 12 12" className={`h-3 w-3 text-muted transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true">
            <path d="m3 4.5 3 3 3-3" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" />
          </svg>
        </span>
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute inset-x-0 bottom-[calc(100%+6px)] z-30 overflow-hidden rounded-xl border border-line-2 bg-panel-2 p-1 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)]"
        >
          {PAY_SOURCES.map((s, i) => {
            const note = unavailable[s.id];
            return (
              <li
                key={s.id}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={s.id === value}
                onPointerEnter={() => setActive(i)}
                onClick={() => choose(s)}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-2.5 py-2 ${
                  i === active ? "bg-white/[0.05]" : ""
                }`}
              >
                <span className="min-w-0 leading-tight">
                  <span className={`block text-[12.5px] ${s.id === value ? "text-acid" : "text-chrome"}`}>{s.label}</span>
                  <span className="block truncate text-[10.5px] text-muted">{note ?? s.detail}</span>
                </span>
                <span className="shrink-0 font-mono text-[11px] text-chrome/80">{usd.format(availableFor(s.id))}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
