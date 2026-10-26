import { TERMINAL_HREF } from "@/lib/site";
import { ArrowUpRight, buttonClass } from "@/components/ui/Button";

/** The one action: opens the live pro terminal. A plain anchor because /terminal is an on-chain redirect. */
export function EnterCrux({ href = TERMINAL_HREF, className = "" }: { href?: string; className?: string }) {
  return (
    <a href={href} className={buttonClass("primary", "md", `font-semibold ${className}`)}>
      Enter Crux <ArrowUpRight />
    </a>
  );
}
