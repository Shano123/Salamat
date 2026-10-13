import { ActionForm } from "@/components/ActionForm";
import { PageHeader, StatusBadge } from "@/components/ui";
import { cancelOpenShift, claimOpenShift, decideClaim, postOpenShift } from "@/app/actions/openShifts";
import { canManageDepartment, requireUser, visibleDepartments } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/domain/permissions";
import { localDateISO, minutesToHHMM, parseDateISO, toDateISO } from "@/lib/domain/time";
import { getT } from "@/lib/i18n/server";
import { departmentTemplates } from "@/lib/services/roster";
import { getRules } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function OpenShifts({ searchParams }: { searchParams: Promise<{ dept?: string }> }) {
  const user = await requireUser();
  const { t, locale } = await getT();
  const sp = await searchParams;
  const rules = await getRules();
  const today = localDateISO(new Date(), rules.timezone);
  const managed = can(user.role, "roster.publish") ? (await visibleDepartments(user)).filter((d) => canManageDepartment(user, d.id)) : [];
  const dept = managed.find((d) => d.id === sp.dept) ?? managed[0];
  const templates = dept ? await departmentTemplates(dept.id, true) : [];

  const emp = user.employeeId ? await db.employee.findUnique({ where: { id: user.employeeId }, include: { homeDepartment: true } }) : null;
  const available = emp
    ? await db.openShift.findMany({
        where: { status: "OPEN", date: { gte: parseDateISO(today) }, ...(emp.homeDepartment.isFloatPool ? {} : { departmentId: emp.homeDepartmentId }) },
        include: { claims: { where: { employeeId: emp.id } } },
        orderBy: { date: "asc" },
      })
    : [];
  const managedShifts = dept
    ? await db.openShift.findMany({ where: { departmentId: dept.id, date: { gte: parseDateISO(today) }, status: { not: "CANCELLED" } }, include: { claims: true }, orderBy: { date: "asc" } })
    : [];
  const tplIds = [...new Set([...available, ...managedShifts].map((o) => o.templateId))];
  const tpls = new Map((await db.shiftTemplate.findMany({ where: { id: { in: tplIds } } })).map((x) => [x.id, x]));
  const deptNames = new Map((await db.department.findMany()).map((d) => [d.id, locale === "ar" ? d.nameAr : d.nameEn]));
  const claimants = new Map((await db.employee.findMany({ where: { id: { in: managedShifts.flatMap((o) => o.claims.map((c) => c.employeeId)) } } })).map((e) => [e.id, e]));
  const label = (o: { templateId: string; date: Date }) => {
    const x = tpls.get(o.templateId);
    return x ? `${toDateISO(o.date)} · ${x.code} ${minutesToHHMM(x.startMin)}–${minutesToHHMM(x.endMin)}` : toDateISO(o.date);
  };

  return (
    <>
      <PageHeader title={t("nav.openShifts")} subtitle="Unfilled shifts that eligible staff can claim; the manager confirms." />
      {emp && (
        <div className="card">
          <h2>Available to me</h2>
          <table>
            <tbody>
              {available.map((o) => (
                <tr key={o.id}>
                  <td>{label(o)}</td>
                  <td>{deptNames.get(o.departmentId)}</td>
                  <td>{o.requiredSkill && <span className="badge">{o.requiredSkill}</span>} {o.note}</td>
                  <td>
                    {o.claims.length ? <StatusBadge status={o.claims[0].status} /> : (
                      <ActionForm action={claimOpenShift}><input type="hidden" name="id" value={o.id} /><button className="small primary">Claim</button></ActionForm>
                    )}
                  </td>
                </tr>
              ))}
              {!available.length && <tr><td className="muted">No open shifts right now.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {dept && (
        <div className="card">
          <div className="row between">
            <h2>Post an open shift · {deptNames.get(dept.id)}</h2>
            <form className="row"><select name="dept" defaultValue={dept.id}>{managed.map((d) => <option key={d.id} value={d.id}>{deptNames.get(d.id)}</option>)}</select><button type="submit">{t("common.filter")}</button></form>
          </div>
          <ActionForm action={postOpenShift} resetOnSuccess>
            <input type="hidden" name="departmentId" value={dept.id} />
            <div className="form-grid">
              <label>{t("common.date")}<input type="date" name="date" min={today} required /></label>
              <label>Shift<select name="templateId">{templates.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}</select></label>
              <label>How many<input type="number" name="count" min={1} max={10} defaultValue={1} /></label>
              <label>Required skill<input name="requiredSkill" placeholder="e.g. ACLS" /></label>
              <label>{t("common.notes")}<input name="note" /></label>
            </div>
            <div className="form-actions"><button className="primary" type="submit">Post</button></div>
          </ActionForm>
          <h3 style={{ marginTop: 16 }}>Posted</h3>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Shift</th><th>{t("common.status")}</th><th>Claims</th><th /></tr></thead>
              <tbody>
                {managedShifts.map((o) => (
                  <tr key={o.id}>
                    <td>{label(o)}{o.requiredSkill && <> <span className="badge">{o.requiredSkill}</span></>}</td>
                    <td><StatusBadge status={o.status === "FILLED" ? "APPROVED" : "PENDING"} label={o.status.toLowerCase()} /></td>
                    <td>
                      {o.claims.map((c) => (
                        <div key={c.id} className="row">
                          {claimants.get(c.employeeId)?.nameEn} <StatusBadge status={c.status} />
                          {c.status === "PENDING" && o.status === "OPEN" && (
                            <>
                              <ActionForm action={decideClaim}><input type="hidden" name="claimId" value={c.id} /><input type="hidden" name="decision" value="APPROVE" /><button className="small primary">{t("common.approve")}</button></ActionForm>
                              <ActionForm action={decideClaim}><input type="hidden" name="claimId" value={c.id} /><input type="hidden" name="decision" value="REJECT" /><button className="small">{t("common.reject")}</button></ActionForm>
                            </>
                          )}
                        </div>
                      ))}
                      {!o.claims.length && <span className="muted">No claims yet</span>}
                    </td>
                    <td>{o.status === "OPEN" && <ActionForm action={cancelOpenShift}><input type="hidden" name="id" value={o.id} /><button className="small danger">{t("common.cancel")}</button></ActionForm>}</td>
                  </tr>
                ))}
                {!managedShifts.length && <tr><td colSpan={4} className="muted">{t("common.none")}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
