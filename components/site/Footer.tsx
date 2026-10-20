import Link from "next/link";
import { Logo } from "./Logo";
import { XIcon } from "@/components/ui/icons";
import { StatusTag } from "@/components/ui/StatusTag";

const LINKS = [
  { label: "X", href: "https://x.com", icon: true },
  { label: "Farcaster", href: "https://farcaster.xyz" },
  { label: "GitHub", href: "https://github.com" },
  { label: "Docs", href: "/alpha-guide" },
  { label: "Terms", href: "#terms" },
  { label: "Privacy", href: "#privacy" },
];

export function Footer() {
  return (
    <footer id="developers" className="border-t border-line">
      <div id="docs" className="mx-auto flex max-w-[1440px] flex-col gap-8 px-4 py-12 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-8">
          <Link href="/" aria-label="Crux home">
            <Logo />
          </Link>
          <p className="flex items-center gap-3 text-[12.5px] text-muted">
            <StatusTag status="testnet" />
            Base Sepolia only. Nothing here is on mainnet.
          </p>
        </div>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap items-center gap-x-7 gap-y-3">
            {LINKS.map((l) => (
              <li key={l.label}>
                <a
                  href={l.href}
                  {...(l.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className="flex items-center text-[11.5px] font-medium uppercase tracking-[0.16em] text-chrome/70 transition-colors duration-200 hover:text-chrome"
                  aria-label={l.icon ? "Crux on X" : undefined}
                >
                  {l.icon ? <XIcon className="h-3.5 w-3.5" /> : l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="mx-auto flex max-w-[1440px] items-center justify-between border-t border-line px-4 py-6 sm:px-8 lg:px-12">
        <p className="text-[12px] text-dim">© 2026 Crux. All rights reserved.</p>
        <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-dim">Execute everywhere</p>
      </div>
    </footer>
  );
}
