"use client";

import { useState } from "react";

/** A mono value (address, URL, chain id) with a one-tap copy button. */
export function CopyValue({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (insecure context or permissions): the value stays selectable.
    }
  };
  return (
    <span className="inline-flex max-w-full items-center gap-2">
      <code className="min-w-0 break-all rounded-md border border-line bg-void/60 px-2 py-1 font-mono text-[12.5px] text-chrome">{value}</code>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={`Copy ${label}`}
        className="shrink-0 rounded-full border border-line-2 px-2.5 py-1 text-[11px] text-muted transition-colors hover:border-chrome/60 hover:text-chrome"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </span>
  );
}
