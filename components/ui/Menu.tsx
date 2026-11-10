"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export type MenuOption<T extends string> = { value: T; label: ReactNode; hint?: ReactNode };

/**
 * A dropdown in the terminal's own colours: the browser's native <select> draws its list in the operating system's
 * (a white sheet with a blue highlight on Windows), which broke the dark terminal. A button shows the chosen option;
 * its list opens below, closes on a pick, a click outside or Escape, and moves with the arrow keys.
 */
export function Menu<T extends string>({
  value,
  options,
  onChange,
  label,
  className = "",
}: {
  value: T;
  options: MenuOption<T>[];
  onChange: (v: T) => void;
  /** Read by screen readers (the button shows the chosen option). */
  label: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const pick = (v: T) => {
    onChange(v);
    setOpen(false);
  };
  const openAt = () => {
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  };

  return (
    <div ref={box} className={`relative ${className}`}>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => (open ? setOpen(false) : openAt())}
        onKeyDown={(e) => {
          if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            openAt();
          } else if (open && e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(options.length - 1, a + 1));
          } else if (open && e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (open && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            pick(options[active].value);
          } else if (e.key === "Escape") setOpen(false);
        }}
        className={`flex h-10 w-full items-center justify-between gap-2 rounded-lg border bg-void/60 px-3 text-left text-[13px] text-chrome outline-none transition-colors ${
          open ? "border-chrome/50" : "border-line-2 hover:border-chrome/40"
        }`}
      >
        <span className="min-w-0 truncate">
          {current?.label}
          {current?.hint && <span className="ml-1.5 text-dim">{current.hint}</span>}
        </span>
        <span className={`text-[10px] text-dim transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 max-h-72 overflow-auto rounded-lg border border-line-2 bg-panel p-1 shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
        >
          {options.map((o, i) => {
            const chosen = o.value === value;
            return (
              <li
                key={o.value}
                role="option"
                aria-selected={chosen}
                onPointerEnter={() => setActive(i)}
                onClick={() => pick(o.value)}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-[6px] px-2.5 py-2 text-[13px] ${
                  i === active ? "bg-tint/[0.07] text-chrome" : "text-muted"
                }`}
              >
                <span className="min-w-0 truncate">{o.label}</span>
                <span className="flex shrink-0 items-center gap-2">
                  {o.hint && <span className="font-mono text-[11.5px] text-dim">{o.hint}</span>}
                  {chosen && (
                    <span className="text-signal" aria-hidden="true">
                      ✓
                    </span>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
