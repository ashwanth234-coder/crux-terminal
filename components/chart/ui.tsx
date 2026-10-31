"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** A small toolbar button; `active` rings it in the accent. */
export function Tool({
  label,
  active,
  disabled,
  onClick,
  children,
  className = "",
}: {
  label: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={`grid h-7 min-w-7 place-items-center rounded-[3px] px-1.5 font-mono text-[11px] transition-colors disabled:opacity-30 ${
        active ? "bg-panel-2 text-chrome ring-1 ring-inset ring-signal/60" : "text-dim hover:text-chrome"
      } ${className}`}
    >
      {children}
    </button>
  );
}

export const Sep = () => <span className="mx-1 h-4 w-px bg-line" aria-hidden="true" />;

/** A button with a popover that closes on outside click or Escape. */
export function Popover({
  button,
  children,
  align = "left",
  width = "w-52",
}: {
  button: (open: boolean, toggle: () => void) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right";
  width?: string;
}) {
  // Where the panel opens, measured from the button: fixed to the viewport, so a toolbar that scrolls sideways (and
  // clips its overflow) never clips the menu.
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const toggle = () => setOpen((o) => !o);
  /** Places the panel under the button as it mounts (a ref callback, so no render reads the DOM). */
  const place = (el: HTMLDivElement | null) => {
    const r = ref.current?.getBoundingClientRect();
    if (!el || !r) return;
    el.style.top = `${r.bottom + 4}px`;
    el.style.maxHeight = `calc(100svh - ${r.bottom + 12}px)`;
    if (align === "left") el.style.left = `${Math.max(8, r.left)}px`;
    else el.style.right = `${Math.max(8, window.innerWidth - r.right)}px`;
  };
  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative shrink-0">
      {button(open, toggle)}
      {open && (
        <div
          ref={place}
          className={`fixed z-50 ${width} max-w-[calc(100vw-16px)] overflow-y-auto rounded-[5px] border border-line-2 bg-panel-2 p-1 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.9)]`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

/** A row in a popover or context menu. */
export function MenuItem({ onClick, children, hint, checked, danger }: { onClick: () => void; children: ReactNode; hint?: string; checked?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      role={checked === undefined ? "menuitem" : "menuitemcheckbox"}
      aria-checked={checked}
      onClick={onClick}
      className={`flex w-full items-center justify-between gap-3 rounded-[3px] px-2 py-1.5 text-left text-[12px] transition-colors hover:bg-tint/[0.05] ${danger ? "text-down" : "text-chrome/85"}`}
    >
      <span className="flex min-w-0 items-center gap-2">{children}</span>
      {hint && <span className="shrink-0 font-mono text-[10.5px] text-dim">{hint}</span>}
      {checked !== undefined && <span className={`shrink-0 font-mono text-[10.5px] ${checked ? "text-signal" : "text-dim"}`}>{checked ? "on" : "off"}</span>}
    </button>
  );
}

const svg = (d: ReactNode) => (
  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
    {d}
  </svg>
);

export const Icon = {
  candles: svg(
    <>
      <path d="M5 2v12M11 3v10" stroke="currentColor" strokeWidth="1.1" />
      <rect x="3.5" y="5" width="3" height="5" fill="currentColor" />
      <rect x="9.5" y="6" width="3" height="4" fill="currentColor" />
    </>,
  ),
  hollow: svg(
    <>
      <path d="M5 2v12M11 3v10" stroke="currentColor" strokeWidth="1.1" />
      <rect x="3.5" y="5" width="3" height="5" fill="none" stroke="currentColor" strokeWidth="1.1" />
      <rect x="9.5" y="6" width="3" height="4" fill="currentColor" />
    </>,
  ),
  bars: svg(<path d="M5 2v12M3 5h2M5 10h2M11 3v10M9 6h2M11 11h2" stroke="currentColor" strokeWidth="1.2" fill="none" />),
  line: svg(<path d="m2 12 4-4 3 2 5-6" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinejoin="round" />),
  area: svg(
    <>
      <path d="m2 11 4-4 3 2 5-6v11H2Z" fill="currentColor" fillOpacity="0.25" />
      <path d="m2 11 4-4 3 2 5-6" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinejoin="round" />
    </>,
  ),
  baseline: svg(
    <>
      <path d="M1.5 8.5h13" stroke="currentColor" strokeWidth="0.8" strokeDasharray="1.5 1.5" />
      <path d="m2 11 3-4 3 3 3-6 3 3" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinejoin="round" />
    </>,
  ),
  hlc: svg(<path d="M5 2v12M5 10h2M11 3v10M11 11h2" stroke="currentColor" strokeWidth="1.2" fill="none" />),
  linemarkers: svg(
    <>
      <path d="m2 12 4-4 3 2 5-6" stroke="currentColor" strokeWidth="1.1" fill="none" strokeLinejoin="round" />
      <circle cx="6" cy="8" r="1.4" fill="currentColor" />
      <circle cx="9" cy="10" r="1.4" fill="currentColor" />
      <circle cx="14" cy="4" r="1.4" fill="currentColor" />
    </>,
  ),
  step: svg(<path d="M2 12h3V7h4v3h3V4h2" stroke="currentColor" strokeWidth="1.3" fill="none" />),
  hlcarea: svg(
    <>
      <path d="m2 9 4-4 3 2 5-5M2 13l4-3 3 2 5-4" stroke="currentColor" strokeWidth="1" fill="none" />
      <path d="m2 11 4-4 3 2 5-5" stroke="currentColor" strokeWidth="1.4" fill="none" />
    </>,
  ),
  columns: svg(<path d="M3 13V9M6.5 13V6M10 13V8M13.5 13V4" stroke="currentColor" strokeWidth="2" fill="none" />),
  highlow: svg(
    <>
      <rect x="3.5" y="4" width="3" height="7" fill="none" stroke="currentColor" strokeWidth="1.1" />
      <rect x="9.5" y="3" width="3" height="10" fill="none" stroke="currentColor" strokeWidth="1.1" />
    </>,
  ),
  heikin: svg(
    <>
      <path d="M5 2v12M11 4v9" stroke="currentColor" strokeWidth="1.1" />
      <rect x="3.5" y="4" width="3" height="6" fill="none" stroke="currentColor" strokeWidth="1.1" />
      <rect x="9.5" y="6" width="3" height="5" fill="currentColor" />
    </>,
  ),
  undo: svg(<path d="M5.5 4 2.5 7l3 3M3 7h6.5a4 4 0 0 1 0 8H7" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />),
  redo: svg(<path d="M10.5 4l3 3-3 3M13 7H6.5a4 4 0 0 0 0 8H9" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />),
  alert: svg(
    <>
      <path d="M8 2.5a3.5 3.5 0 0 1 3.5 3.5v2.8l1.3 2H3.2l1.3-2V6A3.5 3.5 0 0 1 8 2.5Z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M6.6 12.6a1.5 1.5 0 0 0 2.8 0" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </>,
  ),
  gear: svg(
    <>
      <circle cx="8" cy="8" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <path d="M8 1.8v1.6M8 12.6v1.6M1.8 8h1.6M12.6 8h1.6M3.6 3.6l1.1 1.1M11.3 11.3l1.1 1.1M3.6 12.4l1.1-1.1M11.3 4.7l1.1-1.1" stroke="currentColor" strokeWidth="1.2" />
    </>,
  ),
  camera: svg(
    <>
      <path d="M2.5 5.2h2.2l1.2-1.7h4.2l1.2 1.7h2.2v7.3h-11Z" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <circle cx="8" cy="8.7" r="2.2" fill="none" stroke="currentColor" strokeWidth="1.2" />
    </>,
  ),
  expand: svg(<path d="M2.5 6V2.5H6M13.5 6V2.5H10M2.5 10v3.5H6M13.5 10v3.5H10" fill="none" stroke="currentColor" strokeWidth="1.2" />),
  shrink: svg(<path d="M6 2.5v3.5H2.5M10 2.5v3.5h3.5M6 13.5V10H2.5M10 13.5V10h3.5" fill="none" stroke="currentColor" strokeWidth="1.2" />),
  table: svg(<path d="M2.5 3.5h11v9h-11Zm0 3h11m-11 3h11M6 3.5v9" fill="none" stroke="currentColor" strokeWidth="1.1" />),
  chevron: svg(<path d="m4.5 6 3.5 3.5L11.5 6" fill="none" stroke="currentColor" strokeWidth="1.3" />),
};
