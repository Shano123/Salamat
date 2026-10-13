import "server-only";
import { Request } from "@prisma/client";
import { db } from "../db";
import { toDateISO } from "../domain/time";

/** Human-readable one-line description of each request's payload. */
export async function describeRequests(reqs: Request[]): Promise<Map<string, string>> {
  const assignmentIds = new Set<string>();
  const templateIds = new Set<string>();
  const leaveTypeIds = new Set<string>();
  for (const r of reqs) {
    const p = r.payload as Record<string, string | null>;
    if (p.assignmentId) assignmentIds.add(p.assignmentId);
    if (p.targetAssignmentId) assignmentIds.add(p.targetAssignmentId);
    if (p.templateId) templateIds.add(p.templateId);
    if (p.leaveTypeId) leaveTypeIds.add(p.leaveTypeId);
  }
  const [assignments, templates, leaveTypes] = await Promise.all([
    db.shiftAssignment.findMany({ where: { id: { in: [...assignmentIds] } }, include: { template: true, employee: true } }),
    db.shiftTemplate.findMany({ where: { id: { in: [...templateIds] } } }),
    db.leaveType.findMany({ where: { id: { in: [...leaveTypeIds] } } }),
  ]);
  const a = new Map(assignments.map((x) => [x.id, `${x.template.code} on ${toDateISO(x.date)} (${x.employee.nameEn})`]));
  const out = new Map<string, string>();
  for (const r of reqs) {
    const p = r.payload as Record<string, unknown> & { _meta?: { balanceNote?: string } };
    let s = "";
    switch (r.type) {
      case "LEAVE":
        s = `${leaveTypes.find((l) => l.id === p.leaveTypeId)?.nameEn ?? "Leave"}: ${p.from} → ${p.to} (${p.days} day(s))`;
        break;
      case "SWAP":
        s = p.targetAssignmentId ? `Swap ${a.get(String(p.assignmentId))} ⇄ ${a.get(String(p.targetAssignmentId))}` : `Give away ${a.get(String(p.assignmentId))}`;
        break;
      case "SHIFT_CHANGE":
        s = `Change ${a.get(String(p.assignmentId))} to ${templates.find((t) => t.id === p.templateId)?.code ?? "?"}`;
        break;
      case "CORRECTION": {
        const punches = (p.punches as Array<{ type: string; time: string }>) ?? [];
        s = `${p.date}: ${punches.map((x) => `${x.type} ${x.time}`).join(", ")}`;
        break;
      }
      case "OVERTIME":
        s = `${p.date}: ${p.minutes} min, ${p.compensation === "TOIL" ? "time off in lieu" : "paid"}`;
        break;
    }
    if (p._meta?.balanceNote) s += ` — ${p._meta.balanceNote}`;
    out.set(r.id, s);
  }
  return out;
}
