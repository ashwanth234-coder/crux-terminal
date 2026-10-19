"use client";

import { ArrowUpRight, buttonClass } from "@/components/ui/Button";
import { useLaunchModal } from "@/providers/LaunchProvider";

export function LaunchTokenButton({
  className = "",
  onOpen,
  label = "Launch Token",
  icon = true,
}: {
  className?: string;
  onOpen?: () => void;
  label?: string;
  icon?: boolean;
}) {
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
      {label} {icon && <ArrowUpRight />}
    </button>
  );
}
