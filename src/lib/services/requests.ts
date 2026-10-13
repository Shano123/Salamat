import "server-only";
import { Prisma, Request, RequestType } from "@prisma/client";
import { audit } from "../audit";
import type { CurrentUser } from "../auth";
import { db } from "../db";
import { cannotActReason, ChainContext, initialStatus, levelOf, nextStatus, RequestStatusName } from "../domain/approval";
import { addDays, dateRange, diffDays, parseDateISO, toDateISO, zonedToUtc } from "../domain/time";
import { departmentManagerUserIds, notifyEmployees, notifyRole, notifyUsers } from "../notify";
import { getRules } from "../settings";
import { recalcAttendance } from "./attendance";
import { isDateLocked } from "./periods";

type Tx = Prisma.TransactionClient;

export interface LeavePayload {
  leaveTypeId: string;
  from: string;
  to: string;
  days: number;
  attachmentUrl?: string | null;
}
export interface SwapPayload {
  assignmentId: string;
  /** Missing = give-away: the colleague takes the shift. */
  targetAssignmentId?: string | null;
}
export interface ShiftChangePayload {
  assignmentId: string;
  templateId: string;
}
export interface CorrectionPayload {
  date: string;
  punches: Array<{ type: "IN" | "OUT" | "BREAK_START" | "BREAK_END"; time: string }>; // time = HH:mm local
  nextDay?: boolean[];
}
export interface OvertimePayload {
  date: string;
  assignmentId?: string | null;
  minutes: number;
  compensation: "PAID" | "TOIL";
}

type Meta = { needsHr?: boolean; balanceNote?: string };

async function lineManagerUserId(tx: Tx, employeeId: string): Promise<string | null> {
  const emp = await tx.employee.findUnique({ where: { id: employeeId }, select: { lineManager: { select: { user: { select: { id: true } } } } } });
  return emp?.lineManager?.user?.id ?? null;
}

async function requesterUserId(tx: Tx, employeeId: string): Promise<string | null> {
  const u = await tx.user.findUnique({ where: { employeeId }, select: { id: true } });
  return u?.id ?? null;
}

export async function leaveBalance(tx: Tx | typeof db, employeeId: string, leaveTypeId: string, year: number) {
  const b = await tx.leaveBalance.findUnique({ where: { employeeId_leaveTypeId_year: { employeeId, leaveTypeId, year } } });
  return b ? b.entitled - b.used : 0;
}

export async function createRequest(
  actor: CurrentUser,
  input: { type: RequestType; requesterId: string; payload: unknown; reason?: string | null; targetEmployeeId?: string | null },
) {
  const rules = await getRules();
  return db.$transaction(async (tx) => {
    const requester = await tx.employee.findUniqueOrThrow({ where: { id: input.requesterId } });
    let departmentId = requester.homeDepartmentId;
    const meta: Meta = {};
    const payload = input.payload as Record<string, unknown>;

    if (input.type === "SWAP" || input.type === "SHIFT_CHANGE") {
      const a = await tx.shiftAssignment.findUniqueOrThrow({ where: { id: String(payload.assignmentId) } });
      if (a.employeeId !== requester.id) throw new Error("You can only change your own shift.");
      if (a.status !== "PUBLISHED") throw new Error("Only published shifts can be swapped or changed.");
      departmentId = a.departmentId;
      if (input.type === "SWAP") {
        if (!input.targetEmployeeId) throw new Error("Choose a colleague.");
        if (input.targetEmployeeId === requester.id) throw new Error("Choose a different colleague.");
        if (payload.targetAssignmentId) {
          const b = await tx.shiftAssignment.findUniqueOrThrow({ where: { id: String(payload.targetAssignmentId) } });
          if (b.employeeId !== input.targetEmployeeId) throw new Error("That shift does not belong to the colleague.");
        }
      }
    }
    if (input.type === "LEAVE") {
      const p = payload as unknown as LeavePayload;
      if (p.to < p.from) throw new Error("Leave end is before start.");
      const lt = await tx.leaveType.findUniqueOrThrow({ where: { id: p.leaveTypeId } });
      if (lt.requiresAttachment && !p.attachmentUrl) throw new Error(`${lt.nameEn} requires an attachment (e.g. a medical report).`);
      const year = Number(p.from.slice(0, 4));
      const available = lt.isToil ? await toilBalanceHours(tx, requester.id) / 8 : await leaveBalance(tx, requester.id, lt.id, year);
      if (lt.paid && available < p.days) {
        meta.needsHr = true;
        meta.balanceNote = `Requested ${p.days} day(s), balance ${available.toFixed(1)}.`;
      }
    }
    if (input.type === "CORRECTION") {
      const p = payload as unknown as CorrectionPayload;
      const age = diffDays(p.date, toDateISO(new Date()));
      if (age < 0) throw new Error("You cannot correct a future date.");
      if ((await isDateLocked(p.date, tx)) || age > rules.correctionWindowDays) meta.needsHr = true;
    }

    const reqUserId = await requesterUserId(tx, requester.id);
    const ctx: ChainContext = {
      type: input.type,
      lineManagerUserId: await lineManagerUserId(tx, requester.id),
      requesterUserId: reqUserId,
      needsHr: !!meta.needsHr,
    };
    const status = initialStatus(ctx);
    const req = await tx.request.create({
      data: {
        type: input.type,
        requesterId: requester.id,
        createdByUserId: actor.id,
        departmentId,
        targetEmployeeId: input.targetEmployeeId ?? null,
        payload: { ...payload, _meta: meta } as Prisma.InputJsonValue,
        reason: input.reason ?? null,
        status,
      },
    });
    await audit(tx, actor, "Request", req.id, "CREATE", null, req, input.reason);
    await notifyNext(tx, req, status, ctx);
    if (input.type === "LEAVE") {
      await notifyRole(tx, ["HR_ADMIN"], {
        type: "LEAVE_REQUESTED",
        title: `Leave request: ${requester.nameEn}`,
        body: meta.balanceNote ?? "Within balance.",
        link: `/inbox?id=${req.id}`,
      });
    }
    return req;
  });
}

async function notifyNext(tx: Tx, req: Request, status: RequestStatusName, ctx: ChainContext) {
  const link = `/inbox?id=${req.id}`;
  const n = { type: "APPROVAL_NEEDED", title: `${req.type.replace("_", " ").toLowerCase()} request`, body: "A request is waiting for your approval.", link };
  if (status === "PENDING_PEER" && req.targetEmployeeId) {
    await notifyEmployees(tx, [req.targetEmployeeId], { ...n, type: "SWAP_REQUEST", title: "Shift swap request", body: "A colleague wants to swap shifts with you.", link: "/requests" });
  } else if (status === "PENDING_L1") await notifyUsers(tx, [ctx.lineManagerUserId], n);
  else if (status === "PENDING_L2") await notifyUsers(tx, await departmentManagerUserIds(tx, req.departmentId), n);
  else if (status === "PENDING_HR") await notifyRole(tx, ["HR_ADMIN"], n);
}

type Recalc = { employeeId: string; from: string; to: string; ignoreLock?: boolean };

export async function decideRequest(actor: CurrentUser, requestId: string, decision: "APPROVED" | "REJECTED", comment?: string | null) {
  const recalcs: Recalc[] = [];
  const rules = await getRules();
  const result = await db.$transaction(async (tx) => {
    const req = await tx.request.findUniqueOrThrow({ where: { id: requestId } });
    const reqUserId = await requesterUserId(tx, req.requesterId);
    const why = cannotActReason(
      { userId: actor.id, role: actor.role, departments: actor.departments, teamEmployeeIds: actor.teamEmployeeIds, employeeId: actor.employeeId },
      { status: req.status as RequestStatusName, requesterId: req.requesterId, requesterUserId: reqUserId, targetEmployeeId: req.targetEmployeeId, departmentId: req.departmentId },
    );
    if (why) throw new Error(why);
    const meta = ((req.payload as Record<string, unknown>)._meta ?? {}) as Meta;
    const ctx: ChainContext = {
      type: req.type,
      lineManagerUserId: await lineManagerUserId(tx, req.requesterId),
      requesterUserId: reqUserId,
      needsHr: !!meta.needsHr,
    };
    const level = levelOf(req.status as RequestStatusName)!;
    const isHr = actor.role === "HR_ADMIN" || actor.role === "SUPER_ADMIN";
    const hrOverride = isHr && level !== "PEER";
    const status = nextStatus(req.status as RequestStatusName, decision, ctx, { hrOverride });
    await tx.approval.create({ data: { requestId, level: hrOverride && level !== "HR" ? `HR_OVERRIDE_${level}` : level, approverId: actor.id, decision, comment: comment ?? null } });
    const updated = await tx.request.update({ where: { id: requestId }, data: { status } });
    await audit(tx, actor, "Request", requestId, decision === "APPROVED" ? "APPROVE" : "REJECT", { status: req.status }, { status }, comment);
    if (status === "APPROVED") recalcs.push(...(await applyApproved(tx, actor, updated, rules)));
    if (status === "APPROVED" || status === "REJECTED") {
      await notifyUsers(tx, [reqUserId], {
        type: "APPROVAL_RESULT",
        title: `Your ${req.type.replace("_", " ").toLowerCase()} request was ${status.toLowerCase()}`,
        body: comment || "",
        link: "/requests",
      });
    } else await notifyNext(tx, updated, status, ctx);
    return updated;
  }, { timeout: 20_000 });
  // Attendance is recalculated after commit so the approval transaction stays short.
  for (const r of recalcs) await recalcAttendance(r.employeeId, r.from, r.to, db, { ignoreLock: r.ignoreLock });
  return result;
}

export async function cancelRequest(actor: CurrentUser, requestId: string) {
  await db.$transaction(async (tx) => {
    const req = await tx.request.findUniqueOrThrow({ where: { id: requestId } });
    if (req.requesterId !== actor.employeeId) throw new Error("You can only cancel your own requests.");
    if (!levelOf(req.status as RequestStatusName)) throw new Error("This request is already closed.");
    await tx.request.update({ where: { id: requestId }, data: { status: "CANCELLED" } });
    await audit(tx, actor, "Request", requestId, "CANCEL", { status: req.status }, { status: "CANCELLED" });
  });
}

async function toilBalanceHours(tx: Tx | typeof db, employeeId: string): Promise<number> {
  const entries = await tx.toilEntry.findMany({ where: { employeeId, expiresAt: { gt: new Date() } } });
  return entries.reduce((s, e) => s + e.minutes, 0) / 60;
}

async function bumpAssignment(tx: Tx, actor: CurrentUser, id: string, data: Prisma.ShiftAssignmentUncheckedUpdateInput, reason: string) {
  const before = await tx.shiftAssignment.findUniqueOrThrow({ where: { id } });
  const after = await tx.shiftAssignment.update({ where: { id }, data: { ...data, version: { increment: 1 } } });
  await audit(tx, actor, "ShiftAssignment", id, "UPDATE", before, after, reason);
  return { before, after };
}

async function applyApproved(tx: Tx, actor: CurrentUser, req: Request, rules: Awaited<ReturnType<typeof getRules>>): Promise<Recalc[]> {
  const p = req.payload as Record<string, unknown>;
  const reason = `Approved ${req.type.toLowerCase()} request ${req.id}`;
  switch (req.type) {
    case "SWAP": {
      const sp = p as unknown as SwapPayload;
      const a = await tx.shiftAssignment.findUniqueOrThrow({ where: { id: sp.assignmentId } });
      if (sp.targetAssignmentId) {
        const b = await tx.shiftAssignment.findUniqueOrThrow({ where: { id: sp.targetAssignmentId } });
        await bumpAssignment(tx, actor, a.id, { employeeId: b.employeeId }, reason);
        await bumpAssignment(tx, actor, b.id, { employeeId: a.employeeId }, reason);
      } else {
        await bumpAssignment(tx, actor, a.id, { employeeId: req.targetEmployeeId! }, reason);
      }
      await notifyEmployees(tx, [req.requesterId, req.targetEmployeeId!], { type: "SHIFT_CHANGED", title: "Your shift changed", body: "An approved swap updated your roster.", link: "/me/schedule" });
      return [req.requesterId, req.targetEmployeeId!].map((e) => ({ employeeId: e, from: addDays(toDateISO(a.date), -7), to: addDays(toDateISO(a.date), 7) }));
    }
    case "SHIFT_CHANGE": {
      const sp = p as unknown as ShiftChangePayload;
      await bumpAssignment(tx, actor, sp.assignmentId, { templateId: sp.templateId }, reason);
      await notifyEmployees(tx, [req.requesterId], { type: "SHIFT_CHANGED", title: "Your shift changed", body: "Your shift change was approved.", link: "/me/schedule" });
      const a = await tx.shiftAssignment.findUniqueOrThrow({ where: { id: sp.assignmentId } });
      return [{ employeeId: req.requesterId, from: toDateISO(a.date), to: toDateISO(a.date) }];
    }
    case "LEAVE": {
      const lp = p as unknown as LeavePayload;
      const lt = await tx.leaveType.findUniqueOrThrow({ where: { id: lp.leaveTypeId } });
      if (lt.isToil) {
        await consumeToil(tx, req.requesterId, Math.round(lp.days * 8 * 60));
      } else {
        const year = Number(lp.from.slice(0, 4));
        await tx.leaveBalance.upsert({
          where: { employeeId_leaveTypeId_year: { employeeId: req.requesterId, leaveTypeId: lp.leaveTypeId, year } },
          create: { employeeId: req.requesterId, leaveTypeId: lp.leaveTypeId, year, entitled: 0, used: lp.days },
          update: { used: { increment: lp.days } },
        });
      }
      return [{ employeeId: req.requesterId, from: lp.from, to: lp.to }];
    }
    case "OVERTIME": {
      const op = p as unknown as OvertimePayload;
      if (op.compensation === "TOIL") {
        await tx.toilEntry.create({
          data: { employeeId: req.requesterId, minutes: op.minutes, requestId: req.id, expiresAt: new Date(Date.now() + rules.toilExpiryDays * 86400_000) },
        });
      }
      return [{ employeeId: req.requesterId, from: op.date, to: op.date }];
    }
    case "CORRECTION": {
      const cp = p as unknown as CorrectionPayload;
      for (let i = 0; i < cp.punches.length; i++) {
        const pp = cp.punches[i];
        const [hh, mm] = pp.time.split(":").map(Number);
        const date = cp.nextDay?.[i] ? addDays(cp.date, 1) : cp.date;
        const ts = zonedToUtc(date, hh * 60 + mm, rules.timezone);
        const created = await tx.punch.upsert({
          where: { employeeId_timestamp_type: { employeeId: req.requesterId, timestamp: ts, type: pp.type } },
          create: { employeeId: req.requesterId, timestamp: ts, type: pp.type, source: "CORRECTION" },
          update: {},
        });
        await audit(tx, actor, "Punch", created.id, "CREATE", null, created, reason);
      }
      // Corrections to a locked period reach here only after HR's approval, so they may update locked records.
      return [{ employeeId: req.requesterId, from: addDays(cp.date, -1), to: addDays(cp.date, 1), ignoreLock: true }];
    }
  }
  return [];
}

async function consumeToil(tx: Tx, employeeId: string, minutes: number) {
  let left = minutes;
  const entries = await tx.toilEntry.findMany({ where: { employeeId, expiresAt: { gt: new Date() }, minutes: { gt: 0 } }, orderBy: { expiresAt: "asc" } });
  for (const e of entries) {
    if (left <= 0) break;
    const take = Math.min(e.minutes, left);
    await tx.toilEntry.update({ where: { id: e.id }, data: { minutes: e.minutes - take } });
    left -= take;
  }
}

export function leaveDays(from: string, to: string, weekendDays: number[]): number {
  return dateRange(from, to).filter((d) => !weekendDays.includes(parseDateISO(d).getUTCDay())).length;
}

export { toilBalanceHours };
