"use server";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { RequestType } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { ActionState, optStr, run, str } from "@/lib/actions";
import { db } from "@/lib/db";
import { cancelRequest, createRequest, decideRequest, leaveDays } from "@/lib/services/requests";
import { storageDir } from "@/lib/services/punch";

async function saveAttachment(file: File | null): Promise<string | null> {
  if (!file || !file.size) return null;
  if (file.size > 10_000_000) throw new Error("Attachment is too large (max 10 MB).");
  if (!/\.(pdf|jpe?g|png)$/i.test(file.name)) throw new Error("Attachment must be a PDF or image.");
  const dir = path.join(storageDir(), "attachments");
  await mkdir(dir, { recursive: true });
  const name = `${randomUUID()}${path.extname(file.name).toLowerCase()}`;
  await writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));
  return `/api/files/attachments/${name}`;
}

export async function submitRequest(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requireUser();
    if (!user.employeeId) throw new Error("Your account is not linked to an employee.");
    const type = str(fd, "type") as RequestType;
    const reason = optStr(fd, "reason");
    let payload: Record<string, unknown> = {};
    let targetEmployeeId: string | null = null;
    switch (type) {
      case "LEAVE": {
        const from = str(fd, "from");
        const to = str(fd, "to") || from;
        if (!from) throw new Error("Choose the leave dates.");
        const emp = await db.employee.findUniqueOrThrow({ where: { id: user.employeeId } });
        const days = leaveDays(from, to, emp.weekendDays);
        if (!days) throw new Error("The selected dates are all weekend days.");
        payload = { leaveTypeId: str(fd, "leaveTypeId"), from, to, days, attachmentUrl: await saveAttachment(fd.get("attachment") as File | null) };
        break;
      }
      case "SWAP": {
        const target = str(fd, "target");
        if (!target) throw new Error("Choose a colleague's shift or a colleague to give the shift to.");
        if (target.startsWith("a:")) {
          const b = await db.shiftAssignment.findUniqueOrThrow({ where: { id: target.slice(2) } });
          targetEmployeeId = b.employeeId;
          payload = { assignmentId: str(fd, "assignmentId"), targetAssignmentId: b.id };
        } else {
          targetEmployeeId = target.slice(2);
          payload = { assignmentId: str(fd, "assignmentId"), targetAssignmentId: null };
        }
        break;
      }
      case "SHIFT_CHANGE":
        payload = { assignmentId: str(fd, "assignmentId"), templateId: str(fd, "templateId") };
        break;
      case "CORRECTION": {
        const punches: Array<{ type: string; time: string }> = [];
        const nextDay: boolean[] = [];
        for (let i = 0; i < 4; i++) {
          const time = str(fd, `time${i}`);
          if (!time) continue;
          punches.push({ type: str(fd, `ptype${i}`), time });
          nextDay.push(fd.get(`next${i}`) === "on");
        }
        if (!punches.length) throw new Error("Add at least one punch time.");
        if (!reason) throw new Error("A reason is required for corrections.");
        payload = { date: str(fd, "date"), punches, nextDay };
        break;
      }
      case "OVERTIME": {
        const minutes = Number(str(fd, "minutes"));
        if (!Number.isFinite(minutes) || minutes <= 0) throw new Error("Overtime minutes must be positive.");
        payload = { date: str(fd, "date"), assignmentId: optStr(fd, "assignmentId"), minutes, compensation: str(fd, "compensation") === "TOIL" ? "TOIL" : "PAID" };
        break;
      }
      default:
        throw new Error("Unknown request type.");
    }
    await createRequest(user, { type, requesterId: user.employeeId, payload, reason, targetEmployeeId });
    return "Request submitted.";
  }, ["/requests", "/inbox"]);
}

export async function decide(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requireUser();
    const ids = fd.getAll("id").map(String).filter(Boolean);
    const decision = str(fd, "decision") === "REJECTED" ? "REJECTED" : "APPROVED";
    const comment = optStr(fd, "comment");
    if (!ids.length) throw new Error("Select at least one request.");
    if (decision === "REJECTED" && !comment) throw new Error("Please give a reason when rejecting.");
    const errors: string[] = [];
    for (const id of ids) {
      try {
        await decideRequest(user, id, decision, comment);
      } catch (e) {
        errors.push(e instanceof Error ? e.message : String(e));
      }
    }
    if (errors.length) throw new Error(`${ids.length - errors.length} done, ${errors.length} failed: ${[...new Set(errors)].join("; ")}`);
    return `${ids.length} request(s) ${decision.toLowerCase()}.`;
  }, ["/inbox", "/requests", "/roster"]);
}

export async function cancel(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requireUser();
    await cancelRequest(user, str(fd, "id"));
    return "Request cancelled.";
  }, "/requests");
}
