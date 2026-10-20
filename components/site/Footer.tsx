import { CruxMark, Logo } from "./Logo";
import { XIcon } from "@/components/ui/icons";

const LINKS = [
  { label: "X", href: "https://x.com", icon: true },
  { label: "Farcaster", href: "https://farcaster.xyz" },
  { label: "GitHub", href: "https://github.com" },
  { label: "Docs", href: "#docs" },
  { label: "Terms", href: "#terms" },
  { label: "Privacy", href: "#privacy" },
];

export function Footer() {
  return (
    <footer id="developers" className="relative overflow-hidden border-t border-line">
      <div id="docs" className="mx-auto flex max-w-[1440px] flex-col gap-8 px-4 pt-12 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-12">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-10">
          <Logo />
          <p className="text-[13px] text-muted">Launch on your home chain. Trade from anywhere.</p>
        </div>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap items-center gap-x-8 gap-y-3">
            {LINKS.map((l) => (
              <li key={l.label}>
                <a
                  href={l.href}
                  {...(l.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className="flex items-center text-[13px] text-chrome/70 transition-colors duration-300 hover:text-chrome"
                  aria-label={l.icon ? "Crux on X" : undefined}
                >
                  {l.icon ? <XIcon className="h-3.5 w-3.5" /> : l.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      {/* The close: the wordmark at the full width of the page, lit from above like the chrome */}
      <div aria-hidden="true" className="relative mx-auto max-w-[1440px] select-none px-4 sm:px-8 lg:px-12">
        <p className="font-display mt-10 text-center text-[27vw] leading-[0.78] tracking-[-0.05em] text-void [font-stretch:125%] [-webkit-text-stroke:1px_#2a2d33] min-[1440px]:text-[390px]">
          CRUX
        </p>
      </div>

      <div className="mx-auto flex max-w-[1440px] items-center justify-between border-t border-line px-4 py-6 sm:px-8 lg:px-12">
        <p className="text-[12px] text-dim">© 2026 Crux. All rights reserved.</p>
        <p className="flex items-center gap-2 text-[12px] text-dim">
          Build without borders.
          <CruxMark className="h-4 w-4 text-acid" />
        </p>
      </div>
    </footer>
  );
}
