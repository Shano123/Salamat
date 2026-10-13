"use client";
import { createContext, useContext } from "react";
import { Locale, translator } from "./dictionaries";

const Ctx = createContext<Locale>("en");

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  return <Ctx.Provider value={locale}>{children}</Ctx.Provider>;
}

export function useT() {
  const locale = useContext(Ctx);
  return { t: translator(locale), locale };
}
