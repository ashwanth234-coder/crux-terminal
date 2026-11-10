"use client";

import { ArrowUpRight, buttonClass } from "@/components/ui/Button";
import Link from "next/link";
import { useLaunchModal } from "@/providers/LaunchProvider";
import { V9_ON } from "@/lib/v9";

export function LaunchTokenButton({
  className = "",
  onOpen,
  label = "Launch Token",
  icon = true,
  current = false,
}: {
  className?: string;
  onOpen?: () => void;
  label?: string;
  icon?: boolean;
  /** Marked as the page you're on (the nav's Launch on the launch form). */
  current?: boolean;
}) {
  const { openLaunch } = useLaunchModal();
  // Launches are curve launches now: the button opens their form.
  if (V9_ON) {
    return (
      <Link href="/launch/v9/new" onClick={onOpen} aria-current={current ? "page" : undefined} className={className || buttonClass("outline", "md")}>
        {label} {icon && <ArrowUpRight />}
      </Link>
    );
  }
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
