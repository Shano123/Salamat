import "server-only";
import { Locale, translator } from "./dictionaries";

/** The app runs in English only. The Arabic and Urdu dictionaries are kept for a future switch. */
export async function getLocale(): Promise<Locale> {
  return "en";
}

export async function getT() {
  const locale = await getLocale();
  return { t: translator(locale), locale };
}
