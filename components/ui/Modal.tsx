"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

type ModalProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  /** One line under the title that says what this step is for. */
  subtitle?: string;
  children: ReactNode;
  /** Blocks backdrop/Escape dismissal, e.g. while a wallet prompt is open. */
  locked?: boolean;
  /** "lg" for forms that need room (e.g. the token launch form). */
  size?: "md" | "lg";
};

/** Native <dialog> modal: focus trapping, Escape and top-layer stacking come free. */
export function Modal({ open, onClose, title, subtitle, children, locked = false, size = "md" }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        if (!locked) onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current && !locked) onClose();
      }}
      className={`m-auto outline-none focus:outline-none focus-visible:outline-none ${size === "lg" ? "w-[min(600px,calc(100vw-32px))]" : "w-[min(460px,calc(100vw-32px))]"} max-h-[calc(100svh-32px)] overflow-visible rounded-2xl border border-line-2 bg-transparent p-0 text-chrome backdrop:bg-black/75 backdrop:backdrop-blur-sm open:animate-rise`}
    >
      <div className="panel-sheen relative max-h-[calc(100svh-32px)] overflow-y-auto overflow-x-hidden rounded-2xl p-5 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.95),inset_0_1px_0_rgba(255,255,255,0.05)] sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id={titleId} className="font-display-md text-[22px] text-chrome">
              {title}
            </h2>
            {subtitle && <p className="mt-1.5 text-[12.5px] text-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={locked}
            aria-label="Close"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-line-2 text-muted transition-colors hover:border-chrome/40 hover:text-chrome disabled:opacity-40"
          >
            <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden="true">
              <path d="m2.5 2.5 7 7m0-7-7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </dialog>
  );
}

/** Four bars pumping out of phase: the "working" state for signing and routing. */
export function KineticLoader({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex h-3.5 items-end gap-[3px] ${className}`} aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className="w-[3px] rounded-full bg-current animate-kinetic" style={{ animationDelay: `${i * 0.12}s` }} />
      ))}
    </span>
  );
}
