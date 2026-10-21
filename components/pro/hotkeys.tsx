"use client";

import { useEffect, useEffectEvent, useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

function isMac() {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return /mac|iphone|ipad/i.test(nav.userAgentData?.platform ?? nav.platform ?? "");
}

function isEditable(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
}

/**
 * Keyboard execution for the pro panel: 1 / 2 / 3 pick the three sizing presets, ⌘/Ctrl + Enter runs the
 * panel's main action. Number keys are left alone while typing in a field (they are digits there), and
 * nothing fires while a dialog is open: the review window owns the keyboard then. The main action is
 * the same one the button runs, so it can only submit a bid or open the intent review, never sign blind.
 */
export function useExecutionHotkeys({ presets, onSubmit }: { presets: (() => void)[]; onSubmit: () => void }) {
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.defaultPrevented || e.repeat || document.querySelector("dialog[open]")) return;
    if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key === "Enter") {
      e.preventDefault();
      onSubmit();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey || isEditable(e.target)) return;
    const index = ["1", "2", "3"].indexOf(e.key);
    if (index >= 0 && presets[index]) {
      e.preventDefault();
      presets[index]();
    }
  });

  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
}

/** The submit shortcut, drawn inside the main button: ⌘ ↵ on Apple keyboards, Ctrl ↵ elsewhere. Hidden on touch screens. */
export function SubmitKey() {
  // Only known after hydration; render nothing on the server.
  const mac = useSyncExternalStore(noopSubscribe, isMac, () => null);
  if (mac === null) return null;
  return (
    <kbd className="ml-1 rounded-[3px] border border-current/30 px-1 py-px font-mono text-[10px] font-normal leading-none opacity-70 pointer-coarse:hidden">
      {mac ? "⌘ ↵" : "Ctrl ↵"}
    </kbd>
  );
}

/** A preset's key, set quietly inside its chip. */
export function PresetKey({ n }: { n: number }) {
  return <kbd className="font-mono text-[9.5px] text-dim pointer-coarse:hidden">{n}</kbd>;
}
