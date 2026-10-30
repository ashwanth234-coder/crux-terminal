"use client";

import { LANGS } from "@/lib/i18n";
import { useI18n } from "@/providers/I18nProvider";

/** EN | 中文 | ES | 한국어 | RU, beside the wallet controls. The choice is kept in this browser only. */
export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div role="radiogroup" aria-label={t("lang.label")} className={`items-center gap-0.5 font-mono text-[10.5px] ${className}`}>
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
            className={`rounded-[3px] px-1 py-0.5 transition-colors ${lang === l.code ? "text-chrome" : "text-muted hover:text-chrome"}`}
          >
            {l.label}
          </button>
        </span>
      ))}
    </div>
  );
}
