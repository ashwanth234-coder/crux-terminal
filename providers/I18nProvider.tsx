"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { DEFAULT_LANG, isLang, translate, type Key, type Lang } from "@/lib/i18n";

const STORAGE_KEY = "crux.lang";

type I18n = { lang: Lang; setLang: (lang: Lang) => void; t: (key: Key, vars?: Record<string, string | number>) => string };

const I18nCtx = createContext<I18n>({ lang: DEFAULT_LANG, setLang: () => {}, t: (key, vars) => translate(DEFAULT_LANG, key, vars) });

/**
 * The chosen language, kept only in this browser's localStorage: no cookie, no IP or locale detection, nothing sent.
 * Pages render in English on the server and switch after hydration, so server and client markup always match.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(DEFAULT_LANG);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read once after hydration, so the server's English markup matches
      if (isLang(saved)) setLangState(saved);
    } catch {
      // Storage blocked (private mode, site data off): stay in English.
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not persisted; the choice still applies to this visit.
    }
  }, []);

  const value = useMemo<I18n>(() => ({ lang, setLang, t: (key, vars) => translate(lang, key, vars) }), [lang, setLang]);
  return <I18nCtx.Provider value={value}>{children}</I18nCtx.Provider>;
}

export const useI18n = () => useContext(I18nCtx);
/** The translator for the chosen language. */
export const useT = () => useContext(I18nCtx).t;
