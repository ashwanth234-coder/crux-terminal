"use client";

import Link from "next/link";
import { ArrowUpRight } from "@/components/ui/Button";
import { LaunchTokenButton } from "@/components/launch/LaunchTokenButton";
import { NAV_LINKS } from "@/lib/site";

const INLINE =
  "relative text-[13.5px] text-chrome/70 transition-colors duration-200 hover:text-chrome after:absolute after:-bottom-1.5 after:left-0 after:h-px after:w-full after:origin-left after:scale-x-0 after:bg-chrome/60 after:transition-transform after:duration-300 hover:after:scale-x-100";

const ROW = "group flex w-full items-center justify-between border-b border-line py-4 font-display-md text-2xl text-chrome";

/**
 * Discover | Launch | Terminal | Docs, as one source for the landing header,
 * its mobile menu and the launch pages. Launch opens the token launch modal.
 */
export function SiteNav({ variant, onNavigate, hide = [] }: { variant: "inline" | "rows"; onNavigate?: () => void; hide?: string[] }) {
  const items = NAV_LINKS.filter((l) => !hide.includes(l.label));
  return (
    <ul className={variant === "inline" ? "flex items-center gap-5 sm:gap-7" : "flex flex-col gap-1"}>
      {items.map((link) => (
        <li key={link.label}>
          {link.href === null ? (
            <LaunchTokenButton
              onOpen={onNavigate}
              label={link.label}
              icon={variant === "rows"}
              className={variant === "inline" ? INLINE : ROW}
            />
          ) : (
            <Link href={link.href} onClick={onNavigate} className={variant === "inline" ? INLINE : ROW}>
              {link.label}
              {variant === "rows" && <ArrowUpRight className="h-4 w-4 text-dim" />}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
