"use server";
import { requireUser, employeeScope } from "@/lib/auth";
import { ActionState, run, str } from "@/lib/actions";
import { db } from "@/lib/db";
import { can } from "@/lib/domain/permissions";
import { diffDays } from "@/lib/domain/time";
import { recalcAttendance } from "@/lib/services/attendance";
import { createRequest } from "@/lib/services/requests";

export async function recalc(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requireUser();
    if (!can(user.role, "attendance.correct")) throw new Error("Not allowed.");
    const from = str(fd, "from");
    const to = str(fd, "to");
    if (diffDays(from, to) > 62) throw new Error("Recalculate at most two months at a time.");
    const emps = await db.employee.findMany({ where: { ...employeeScope(user), ...(str(fd, "dept") ? { homeDepartmentId: str(fd, "dept") } : {}) }, select: { id: true } });
    for (const e of emps) await recalcAttendance(e.id, from, to);
    return `Recalculated ${emps.length} employee(s) for ${from} → ${to}.`;
  }, "/attendance");
}

/** A manager raises a correction for a team member; it still goes through L1 → L2. */
export async function correctionForEmployee(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requireUser();
    if (!can(user.role, "attendance.correct")) throw new Error("Not allowed.");
    const employeeId = str(fd, "employeeId");
    const allowed = await db.employee.findFirst({ where: { id: employeeId, ...employeeScope(user) } });
    if (!allowed) throw new Error("This employee is outside your scope.");
    if (employeeId === user.employeeId) throw new Error("Use My requests for your own corrections.");
    const punches = [0, 1].map((i) => ({ type: str(fd, `ptype${i}`), time: str(fd, `time${i}`) })).filter((p) => p.time);
    if (!punches.length) throw new Error("Add at least one time.");
    const reason = str(fd, "reason");
    if (!reason) throw new Error("A reason is required.");
    await createRequest(user, { type: "CORRECTION", requesterId: employeeId, payload: { date: str(fd, "date"), punches, nextDay: [fd.get("next0") === "on", fd.get("next1") === "on"] }, reason });
    return "Correction submitted for approval.";
  }, ["/attendance", "/inbox"]);
}
