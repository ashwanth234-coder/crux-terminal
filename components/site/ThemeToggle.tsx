"use client";

import { useEffect, useState } from "react";
import { THEME_KEY } from "@/lib/theme";

type Theme = "dark" | "light";

/** Light / dark switch beside the language switcher. Tells the chart to recolour (the "crux-theme" event). */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after hydration, from what the pre-paint script applied
    setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);

  const flip = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    if (next === "light") document.documentElement.dataset.theme = "light";
    else delete document.documentElement.dataset.theme;
    try {
      window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // Not persisted; the choice still applies to this visit.
    }
    setTheme(next);
    window.dispatchEvent(new Event("crux-theme"));
  };

  const light = theme === "light";
  return (
    <button
      type="button"
      onClick={flip}
      aria-label={light ? "Switch to dark mode" : "Switch to light mode"}
      title={light ? "Dark mode" : "Light mode"}
      className={`grid h-8 w-8 place-items-center rounded-md border border-line-2 text-muted transition-colors hover:border-signal hover:text-signal ${className}`}
    >
      {light ? (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
          <path d="M13.5 9.6A5.6 5.6 0 0 1 6.4 2.5a5.6 5.6 0 1 0 7.1 7.1Z" fill="currentColor" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
          <circle cx="8" cy="8" r="3" fill="currentColor" />
          <path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3 3l1.1 1.1M11.9 11.9 13 13M3 13l1.1-1.1M11.9 4.1 13 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      )}
    </button>
  );
}
