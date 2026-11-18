"use client";

import { LANGS, isLang } from "@/lib/i18n";
import { useI18n } from "@/providers/I18nProvider";

/**
 * The language choice: EN, 中文, ES, 한국어, RU. The choice is kept in this browser only.
 * `compact` (the header bars) is one small menu, so the bar keeps room for Add money and the balance; the full row of
 * all five sits in the phone menu.
 */
export function LanguageSwitcher({ className = "", compact = false }: { className?: string; compact?: boolean }) {
  const { lang, setLang, t } = useI18n();
  if (compact) {
    return (
      <label className={`relative shrink-0 items-center ${className}`} title={t("lang.label")}>
        <span className="sr-only">{t("lang.label")}</span>
        <select
          value={lang}
          onChange={(e) => isLang(e.target.value) && setLang(e.target.value)}
          className="h-9 cursor-pointer appearance-none rounded-[4px] border border-line-2 bg-transparent pl-2.5 pr-6 font-mono text-[10.5px] text-chrome transition-colors hover:border-chrome/50"
        >
          {LANGS.map((l) => (
            <option key={l.code} value={l.code} lang={l.code} className="bg-void text-chrome">
              {l.label}
            </option>
          ))}
        </select>
        <svg aria-hidden="true" viewBox="0 0 12 12" className="pointer-events-none absolute right-2 top-1/2 h-2.5 w-2.5 -translate-y-1/2 text-dim">
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      </label>
    );
  }
  return (
    <div role="radiogroup" aria-label={t("lang.label")} className={`shrink-0 items-center gap-0.5 whitespace-nowrap font-mono text-[10.5px] ${className}`}>
      {LANGS.map((l, i) => (
        <span key={l.code} className="inline-flex items-center">
          {i > 0 && (
            <span className="px-0.5 text-dim" aria-hidden="true">
              |
            </span>
          )}
          <button
            type="button"
            role="radio"
            aria-checked={lang === l.code}
            lang={l.code}
            onClick={() => setLang(l.code)}
            className={`whitespace-nowrap rounded-[3px] px-1 py-0.5 transition-colors ${lang === l.code ? "text-signal" : "text-muted hover:text-chrome"}`}
          >
            {l.label}
          </button>
        </span>
      ))}
    </div>
  );
}
