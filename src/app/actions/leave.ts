"use server";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { ActionState, bool, num, optStr, run, str } from "@/lib/actions";
import { db } from "@/lib/db";
import { parseDateISO } from "@/lib/domain/time";

export async function saveLeaveType(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission("rules.edit");
    const id = optStr(fd, "id");
    const data = {
      code: str(fd, "code").toUpperCase(),
      nameEn: str(fd, "nameEn"),
      nameAr: str(fd, "nameAr"),
      paid: bool(fd, "paid"),
      annualDays: num(fd, "annualDays"),
      accrualPerMonth: num(fd, "accrualPerMonth"),
      requiresAttachment: bool(fd, "requiresAttachment"),
      isToil: bool(fd, "isToil"),
    };
    if (!data.code || !data.nameEn || !data.nameAr) throw new Error("Code and both names are required.");
    const saved = id ? await db.leaveType.update({ where: { id }, data }) : await db.leaveType.create({ data });
    await audit(db, user, "LeaveType", saved.id, id ? "UPDATE" : "CREATE", null, saved);
    return "Leave type saved.";
  }, "/leave-setup");
}

export async function grantEntitlements(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission("rules.edit");
    const year = num(fd, "year");
    const types = await db.leaveType.findMany({ where: { isToil: false, annualDays: { gt: 0 } } });
    const emps = await db.employee.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
    let n = 0;
    for (const e of emps) {
      for (const lt of types) {
        await db.leaveBalance.upsert({
          where: { employeeId_leaveTypeId_year: { employeeId: e.id, leaveTypeId: lt.id, year } },
          create: { employeeId: e.id, leaveTypeId: lt.id, year, entitled: lt.accrualPerMonth > 0 ? 0 : lt.annualDays },
          update: {},
        });
        n++;
      }
    }
    await audit(db, user, "LeaveBalance", String(year), "GRANT", null, { employees: emps.length, types: types.length });
    return `Balances ready for ${emps.length} employee(s) × ${types.length} type(s) (${n} rows; existing balances unchanged).`;
  }, "/leave-setup");
}

export async function runAccrual(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission("rules.edit");
    const year = num(fd, "year");
    const month = str(fd, "month");
    const key = `${year}-${month}`;
    const done = await db.auditLog.findFirst({ where: { entity: "LeaveAccrual", entityId: key } });
    if (done) throw new Error(`Accrual for ${key} already ran.`);
    const types = await db.leaveType.findMany({ where: { accrualPerMonth: { gt: 0 } } });
    const emps = await db.employee.findMany({ where: { status: "ACTIVE" }, select: { id: true } });
    for (const lt of types) {
      for (const e of emps) {
        await db.leaveBalance.upsert({
          where: { employeeId_leaveTypeId_year: { employeeId: e.id, leaveTypeId: lt.id, year } },
          create: { employeeId: e.id, leaveTypeId: lt.id, year, entitled: lt.accrualPerMonth },
          update: { entitled: { increment: lt.accrualPerMonth } },
        });
      }
    }
    await audit(db, user, "LeaveAccrual", key, "RUN", null, { types: types.map((t) => t.code), employees: emps.length });
    return `Accrued ${types.length} leave type(s) for ${emps.length} employee(s) for ${key}.`;
  }, "/leave-setup");
}

export async function setBalance(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission("rules.edit");
    const employee = await db.employee.findUniqueOrThrow({ where: { employeeNo: str(fd, "employeeNo") } });
    const leaveTypeId = str(fd, "leaveTypeId");
    const year = num(fd, "year");
    const entitled = num(fd, "entitled");
    const key = { employeeId_leaveTypeId_year: { employeeId: employee.id, leaveTypeId, year } };
    const before = await db.leaveBalance.findUnique({ where: key });
    const after = await db.leaveBalance.upsert({ where: key, create: { employeeId: employee.id, leaveTypeId, year, entitled }, update: { entitled } });
    await audit(db, user, "LeaveBalance", after.id, "SET", before, after, optStr(fd, "reason"));
    return `Balance set for ${employee.nameEn}.`;
  }, "/leave-setup");
}

export async function saveHoliday(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission("rules.edit");
    const from = str(fd, "date");
    const to = str(fd, "to") || from;
    let n = 0;
    for (let d = from; d <= to; ) {
      const h = await db.holiday.create({ data: { date: parseDateISO(d), name: str(fd, "name"), locationId: optStr(fd, "locationId") } });
      await audit(db, user, "Holiday", h.id, "CREATE", null, h);
      const next = parseDateISO(d);
      next.setUTCDate(next.getUTCDate() + 1);
      d = next.toISOString().slice(0, 10);
      if (++n > 31) break;
    }
    return `${n} holiday day(s) added.`;
  }, "/leave-setup");
}

export async function deleteHoliday(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission("rules.edit");
    const h = await db.holiday.delete({ where: { id: str(fd, "id") } });
    await audit(db, user, "Holiday", h.id, "DELETE", h, null);
    return "Holiday removed.";
  }, "/leave-setup");
}
