import "server-only";
import { cookies } from "next/headers";
import { getCurrentUser } from "../auth";
import { Locale, translator } from "./dictionaries";

export async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  const c = jar.get("locale")?.value;
  if (c === "ar" || c === "en") return c;
  const u = await getCurrentUser();
  return u?.locale ?? "en";
}

export async function getT() {
  const locale = await getLocale();
  return { t: translator(locale), locale };
}
