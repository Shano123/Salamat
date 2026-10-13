import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/domain/permissions";
import { storageDir } from "@/lib/services/punch";

export async function GET(_: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!/^[\w-]+\.(jpg|png|webp)$/.test(name)) return new NextResponse("Not found", { status: 404 });
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const punch = await db.punch.findFirst({ where: { photoUrl: `/api/files/selfies/${name}` } });
  if (!punch) return new NextResponse("Not found", { status: 404 });
  const allowed =
    punch.employeeId === user.employeeId ||
    user.departments === "ALL" ||
    (can(user.role, "attendance.correct") &&
      (user.teamEmployeeIds.includes(punch.employeeId) ||
        !!(await db.employee.findFirst({ where: { id: punch.employeeId, homeDepartmentId: { in: user.departments } } }))));
  if (!allowed) return new NextResponse("Forbidden", { status: 403 });
  try {
    const buf = await readFile(path.join(storageDir(), "selfies", name));
    return new NextResponse(new Uint8Array(buf), { headers: { "content-type": name.endsWith(".png") ? "image/png" : name.endsWith(".webp") ? "image/webp" : "image/jpeg", "cache-control": "private, max-age=300" } });
  } catch {
    return new NextResponse("Not found (selfies are kept 90 days)", { status: 404 });
  }
}
