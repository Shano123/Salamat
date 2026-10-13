import "server-only";
import { revalidatePath } from "next/cache";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { ZodError } from "zod";

export type ActionState = { ok?: string; error?: string; data?: unknown } | null;

/** Wraps a server action body so failures surface as a message on the form, not an error page. */
export async function run(fn: () => Promise<string | ActionState | void>, revalidate?: string | string[]): Promise<ActionState> {
  try {
    const r = await fn();
    for (const p of [revalidate ?? []].flat()) revalidatePath(p);
    if (typeof r === "string") return { ok: r };
    if (r && typeof r === "object") return r;
    return { ok: "Saved." };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    if (e instanceof ZodError) return { error: e.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ") };
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export function str(fd: FormData, key: string): string {
  return String(fd.get(key) ?? "").trim();
}

export function optStr(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return v ? v : null;
}

export function num(fd: FormData, key: string, fallback = 0): number {
  const v = str(fd, key);
  if (v === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`${key} must be a number.`);
  return n;
}

export function bool(fd: FormData, key: string): boolean {
  const v = fd.get(key);
  return v === "on" || v === "true" || v === "1";
}
