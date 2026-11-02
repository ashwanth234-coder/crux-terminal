import { TERMINAL_HREF } from "@/lib/site";
import { ArrowUpRight, buttonClass } from "@/components/ui/Button";

/** The primary action: the live pro terminal by default. A plain anchor because /terminal is an on-chain redirect. */
export function EnterCrux({ href = TERMINAL_HREF, label = "Enter Crux", className = "" }: { href?: string; label?: string; className?: string }) {
  return (
    <a href={href} className={buttonClass("primary", "md", `font-semibold ${className}`)}>
      {label} <ArrowUpRight />
    </a>
  );
}
