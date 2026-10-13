import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { storageDir } from "@/lib/services/punch";

export async function GET(_: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  if (!/^[\w-]+\.(pdf|jpe?g|png)$/.test(name)) return new NextResponse("Not found", { status: 404 });
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  const req = await db.request.findFirst({ where: { payload: { path: ["attachmentUrl"], equals: `/api/files/attachments/${name}` } } });
  if (!req) return new NextResponse("Not found", { status: 404 });
  const allowed =
    req.requesterId === user.employeeId ||
    user.departments === "ALL" ||
    user.teamEmployeeIds.includes(req.requesterId) ||
    user.departments.includes(req.departmentId);
  if (!allowed) return new NextResponse("Forbidden", { status: 403 });
  const buf = await readFile(path.join(storageDir(), "attachments", name)).catch(() => null);
  if (!buf) return new NextResponse("Not found", { status: 404 });
  const type = name.endsWith(".pdf") ? "application/pdf" : name.endsWith(".png") ? "image/png" : "image/jpeg";
  return new NextResponse(new Uint8Array(buf), { headers: { "content-type": type, "cache-control": "private, max-age=300" } });
}
