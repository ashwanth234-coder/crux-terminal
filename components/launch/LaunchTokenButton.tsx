"use client";

import { ArrowUpRight, buttonClass } from "@/components/ui/Button";
import { useLaunchModal } from "@/providers/LaunchProvider";

export function LaunchTokenButton({ className = "", onOpen }: { className?: string; onOpen?: () => void }) {
  const { openLaunch } = useLaunchModal();
  return (
    <button
      type="button"
      onClick={() => {
        onOpen?.();
        openLaunch();
      }}
      className={className || buttonClass("outline", "md")}
    >
      Launch Token <ArrowUpRight />
    </button>
  );
}
