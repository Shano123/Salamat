"use server";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
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

export async function toggleLocale() {
  const jar = await cookies();
  const user = await getCurrentUser();
  const current = jar.get("locale")?.value ?? user?.locale ?? "en";
  const next = current === "ar" ? "en" : "ar";
  jar.set("locale", next, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  if (user) await db.user.update({ where: { id: user.id }, data: { locale: next } });
}
