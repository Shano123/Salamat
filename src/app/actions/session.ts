"use server";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { isLocale } from "@/lib/i18n/dictionaries";
import { SESSION_COOKIE, sessionCookieOptions, signSession } from "@/lib/session";

export async function login(_: unknown, fd: FormData): Promise<{ error?: string }> {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  const next = String(fd.get("next") ?? "/dashboard");
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return { error: "login.error" };
  const jar = await cookies();
  jar.set(SESSION_COOKIE, await signSession(user.id), sessionCookieOptions);
  jar.set("locale", user.locale, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  await audit(db, { id: user.id, role: user.role }, "User", user.id, "LOGIN");
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard");
}

export async function logout() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  redirect("/login");
}

/** Switches the interface language (en / ar / ur) and remembers it for the signed-in user. */
export async function setLocale(fd: FormData) {
  const next = fd.get("locale");
  if (!isLocale(next)) return;
  const jar = await cookies();
  jar.set("locale", next, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  const user = await getCurrentUser();
  if (user) await db.user.update({ where: { id: user.id }, data: { locale: next } });
}
