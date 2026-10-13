import type { Metadata } from "next";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n/client";
import { isRtl } from "@/lib/i18n/dictionaries";
import { getLocale } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Salamat — Attendance & Shift Roster",
  description: "Department shift rosters and attendance for hospital teams.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} dir={isRtl(locale) ? "rtl" : "ltr"}>
      <body>
        <I18nProvider locale={locale}>{children}</I18nProvider>
      </body>
    </html>
  );
}
