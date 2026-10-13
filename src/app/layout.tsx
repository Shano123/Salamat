import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n/client";

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });

export const metadata: Metadata = {
  title: { default: "Salamat — Workforce & Attendance", template: "%s · Salamat" },
  description: "Department shift rosters and attendance management for hospital teams.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" className={inter.variable}>
      <body>
        <I18nProvider locale="en">{children}</I18nProvider>
      </body>
    </html>
  );
}
