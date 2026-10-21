"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight } from "@/components/ui/Button";
import { LaunchTokenButton } from "@/components/launch/LaunchTokenButton";
import { NAV_LINKS } from "@/lib/site";

const INLINE =
  "relative inline-flex items-center py-2 text-[11.5px] font-medium uppercase leading-none tracking-[0.18em] text-chrome/75 transition-colors duration-200 hover:text-chrome aria-[current=page]:text-signal";

const ROW =
  "group flex w-full items-center justify-between border-b border-line py-4 text-[13px] font-medium uppercase tracking-[0.18em] text-chrome aria-[current=page]:text-signal";

/**
 * Discover | Launch | Terminal | Protocol | Docs, as one source for the landing header,
 * its mobile menu, the launch pages and the pro terminal. Launch opens the token launch
 * modal. The link for the page you are on is marked current and set in Signal Orange.
 */
export function SiteNav({ variant, onNavigate, hide = [] }: { variant: "inline" | "rows"; onNavigate?: () => void; hide?: string[] }) {
  const pathname = usePathname();
  const items = NAV_LINKS.filter((l) => !hide.includes(l.label));
  return (
    <ul className={variant === "inline" ? "flex items-center gap-6 lg:gap-9" : "flex flex-col"}>
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
            <Link
              href={link.href}
              onClick={onNavigate}
              aria-current={link.href === pathname ? "page" : undefined}
              className={variant === "inline" ? INLINE : ROW}
            >
              {link.label}
              {variant === "rows" && <ArrowUpRight className="h-4 w-4 text-dim" />}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
