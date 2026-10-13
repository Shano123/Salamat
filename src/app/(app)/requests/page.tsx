import { ActionForm } from "@/components/ActionForm";
import { PageHeader, StatusBadge } from "@/components/ui";
import { cancel, decide } from "@/app/actions/requests";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { localDateISO, minutesToHHMM, parseDateISO, toDateISO } from "@/lib/domain/time";
import { getT } from "@/lib/i18n/server";
import { departmentTemplates } from "@/lib/services/roster";
import { describeRequests } from "@/lib/services/requestView";
import { getRules } from "@/lib/settings";
import { RequestForms } from "./RequestForms";

export const dynamic = "force-dynamic";

const OPEN = ["PENDING_PEER", "PENDING_L1", "PENDING_L2", "PENDING_HR"];

export default async function RequestsPage({ searchParams }: { searchParams: Promise<{ new?: string; date?: string }> }) {
  const user = await requireUser();
  const { t, locale } = await getT();
  if (!user.employeeId) return <p className="muted">Your account is not linked to an employee.</p>;
  const sp = await searchParams;
  const rules = await getRules();
  const today = localDateISO(new Date(), rules.timezone);
  const emp = await db.employee.findUniqueOrThrow({ where: { id: user.employeeId } });

  const [mine, incoming, myShifts, colleagueShifts, colleagues, templates, leaveTypes] = await Promise.all([
    db.request.findMany({ where: { requesterId: emp.id }, orderBy: { createdAt: "desc" }, take: 50, include: { approvals: { include: { approver: true } } } }),
    db.request.findMany({ where: { targetEmployeeId: emp.id, status: "PENDING_PEER" }, include: { requester: true } }),
    db.shiftAssignment.findMany({ where: { employeeId: emp.id, status: "PUBLISHED", date: { gte: parseDateISO(today) } }, include: { template: true }, orderBy: { date: "asc" }, take: 60 }),
    db.shiftAssignment.findMany({
      where: { departmentId: emp.homeDepartmentId, status: "PUBLISHED", employeeId: { not: emp.id }, date: { gte: parseDateISO(today) }, isOpenShift: false },
      include: { template: true, employee: true },
      orderBy: { date: "asc" },
      take: 300,
    }),
    db.employee.findMany({ where: { homeDepartmentId: emp.homeDepartmentId, id: { not: emp.id }, status: "ACTIVE" }, orderBy: { nameEn: "asc" } }),
    departmentTemplates(emp.homeDepartmentId, true),
    db.leaveType.findMany({ orderBy: { nameEn: "asc" } }),
  ]);
  const desc = await describeRequests([...mine, ...incoming]);
  const nm = (e: { nameEn: string; nameAr: string }) => (locale === "ar" ? e.nameAr : e.nameEn);
  const initial = (["LEAVE", "SWAP", "SHIFT_CHANGE", "CORRECTION", "OVERTIME"] as const).find((x) => x === sp.new) ?? "LEAVE";

  return (
    <>
      <PageHeader title={t("nav.requests")} />
      {incoming.length > 0 && (
        <div className="card">
          <h2>Swap requests from colleagues</h2>
          {incoming.map((r) => (
            <div key={r.id} className="row between" style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
              <div><strong>{nm(r.requester)}</strong>: {desc.get(r.id)}{r.reason && <div className="muted">{r.reason}</div>}</div>
              <div className="row">
                <ActionForm action={decide}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="decision" value="APPROVED" /><button className="primary small">Accept</button></ActionForm>
                <ActionForm action={decide}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="decision" value="REJECTED" /><input type="hidden" name="comment" value="Declined by colleague" /><button className="small danger">Decline</button></ActionForm>
              </div>
            </div>
          ))}
        </div>
      )}
      <RequestForms
        initial={initial}
        initialDate={sp.date}
        myShifts={myShifts.map((a) => ({ value: a.id, label: `${toDateISO(a.date)} · ${a.template.code} ${minutesToHHMM(a.template.startMin)}–${minutesToHHMM(a.template.endMin)}` }))}
        colleagueShifts={colleagueShifts.map((a) => ({ value: a.id, label: `${nm(a.employee)} · ${toDateISO(a.date)} · ${a.template.code}` }))}
        colleagues={colleagues.map((c) => ({ value: c.id, label: nm(c) }))}
        templates={templates.map((x) => ({ value: x.id, label: `${x.code} · ${x.name}` }))}
        leaveTypes={leaveTypes.map((l) => ({ value: l.id, label: locale === "ar" ? l.nameAr : l.nameEn, attachment: l.requiresAttachment }))}
      />
      <div className="card">
        <h2>My requests</h2>
        <div className="table-wrap">
          <table>
            <thead><tr><th>{t("common.type")}</th><th>Details</th><th>{t("common.status")}</th><th>History</th><th /></tr></thead>
            <tbody>
              {mine.map((r) => (
                <tr key={r.id}>
                  <td>{r.type.replace("_", " ").toLowerCase()}</td>
                  <td>{desc.get(r.id)}{r.reason && <div className="muted">{r.reason}</div>}</td>
                  <td><StatusBadge status={r.status} label={t(`req.status.${r.status}`)} /></td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {r.approvals.map((a) => <div key={a.id}>{a.level}: {a.decision.toLowerCase()} by {a.approver.email}{a.comment ? ` — ${a.comment}` : ""}</div>)}
                  </td>
                  <td>
                    {OPEN.includes(r.status) && (
                      <ActionForm action={cancel} confirm="Cancel this request?"><input type="hidden" name="id" value={r.id} /><button className="small">{t("common.cancel")}</button></ActionForm>
                    )}
                  </td>
                </tr>
              ))}
              {!mine.length && <tr><td colSpan={5} className="muted">{t("common.none")}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
