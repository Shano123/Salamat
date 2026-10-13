import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { Forbidden, PageHeader, StatusBadge } from "@/components/ui";
import { reviewTemplate } from "@/app/actions/templates";
import { canManageDepartment, pageGuard, visibleDepartments } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/domain/permissions";
import { scheduledMinutes } from "@/lib/domain/shift";
import { minutesToHHMM } from "@/lib/domain/time";
import { getT } from "@/lib/i18n/server";
import { toTemplateLike } from "@/lib/services/attendance";
import { getRules } from "@/lib/settings";
import { TemplateForm } from "./TemplateForm";

export const dynamic = "force-dynamic";

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ status?: string; edit?: string; dept?: string }> }) {
  const user = await pageGuard("roster.view");
  const { t, locale } = await getT();
  if (!user) return <Forbidden message={t("common.forbidden")} />;
  const sp = await searchParams;
  const rules = await getRules();
  const depts = await visibleDepartments(user);
  const isHr = can(user.role, "templates.approve");
  const editableDepts = depts.filter((d) => can(user.role, "templates.edit") && canManageDepartment(user, d.id));
  const templates = await db.shiftTemplate.findMany({
    where: {
      ...(sp.status ? { status: sp.status as never } : {}),
      ...(sp.dept ? { ownerDepartmentId: sp.dept } : user.departments === "ALL" ? {} : { OR: [{ ownerDepartmentId: null }, { ownerDepartmentId: { in: depts.map((d) => d.id) } }] }),
    },
    include: { ownerDepartment: true, _count: { select: { assignments: true } } },
    orderBy: [{ status: "asc" }, { ownerDepartmentId: "asc" }, { startMin: "asc" }],
  });
  const editing = sp.edit ? templates.find((x) => x.id === sp.edit) : null;
  const canEditTpl = (x: (typeof templates)[number]) => (x.ownerDepartmentId ? editableDepts.some((d) => d.id === x.ownerDepartmentId) : isHr);
  const pending = templates.filter((x) => x.status === "PENDING").length;

  return (
    <>
      <PageHeader title={t("nav.templates")} subtitle={`Company rules: max ${rules.maxDailyHours}h/day, ${rules.minBreakMinutes} min break after ${rules.breakRequiredAfterHours}h. Templates that break them are blocked.`}>
        <Link className={`btn ${!sp.status ? "primary" : ""}`} href="/templates">{t("common.all")}</Link>
        <Link className={`btn ${sp.status === "PENDING" ? "primary" : ""}`} href="/templates?status=PENDING">Pending ({pending})</Link>
        <Link className={`btn ${sp.status === "DISABLED" ? "primary" : ""}`} href="/templates?status=DISABLED">Disabled</Link>
      </PageHeader>

      {(editableDepts.length > 0 || isHr) && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2>{editing ? `Edit ${editing.code}` : "New shift template"}</h2>
          {!isHr && <p className="muted">New or edited templates go to HR for approval before they can be used on a roster.</p>}
          <TemplateForm
            key={editing?.id ?? "new"}
            defaultGrace={rules.graceMinutes}
            allowCompanyWide={isHr}
            departments={(isHr ? depts : editableDepts).map((d) => ({ id: d.id, name: locale === "ar" ? d.nameAr : d.nameEn }))}
            values={
              editing
                ? {
                    ...editing,
                    start: minutesToHHMM(editing.startMin),
                    end: minutesToHHMM(editing.endMin),
                    split2Start: editing.split2StartMin != null ? minutesToHHMM(editing.split2StartMin) : undefined,
                    split2End: editing.split2EndMin != null ? minutesToHHMM(editing.split2EndMin) : undefined,
                    coreStart: editing.coreStartMin != null ? minutesToHHMM(editing.coreStartMin) : undefined,
                    coreEnd: editing.coreEndMin != null ? minutesToHHMM(editing.coreEndMin) : undefined,
                    requiredSkills: editing.requiredSkills.join(", "),
                  }
                : { ownerDepartmentId: isHr ? null : editableDepts[0]?.id }
            }
          />
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>{t("common.code")}</th><th>{t("common.name")}</th><th>{t("common.type")}</th><th>Time</th><th className="num">Paid h</th><th>Grace in/out</th><th>{t("common.department")}</th><th>Flags</th><th>{t("common.status")}</th><th>{t("common.actions")}</th></tr>
          </thead>
          <tbody>
            {templates.map((x) => (
              <tr key={x.id}>
                <td><span className="chip" style={{ background: x.color }}>{x.code}</span></td>
                <td>{x.name}</td>
                <td>{x.type.toLowerCase().replace("_", "-")}</td>
                <td>
                  {x.type === "OFF" ? "—" : `${minutesToHHMM(x.startMin)}–${minutesToHHMM(x.endMin)}`}
                  {x.split2StartMin != null && ` + ${minutesToHHMM(x.split2StartMin)}–${minutesToHHMM(x.split2EndMin!)}`}
                  {x.coreStartMin != null && <div className="muted">core {minutesToHHMM(x.coreStartMin)}–{minutesToHHMM(x.coreEndMin!)}</div>}
                </td>
                <td className="num">{(scheduledMinutes(toTemplateLike(x)) / 60).toFixed(2)}</td>
                <td>{x.graceInMin} / {x.graceOutMin}</td>
                <td>{x.ownerDepartment ? (locale === "ar" ? x.ownerDepartment.nameAr : x.ownerDepartment.nameEn) : <span className="badge">company-wide</span>}</td>
                <td className="muted" style={{ fontSize: 12 }}>
                  {[x.overnight && "overnight", x.isClinical && "clinical", x.isRamadan && "ramadan", x.payCode && `pay ${x.payCode}`, ...x.requiredSkills].filter(Boolean).join(" · ")}
                </td>
                <td><StatusBadge status={x.status} />{x.reviewNote && <div className="muted" style={{ fontSize: 12 }}>{x.reviewNote}</div>}</td>
                <td>
                  <div className="row">
                    {canEditTpl(x) && <Link className="btn small" href={`/templates?edit=${x.id}`}>{t("common.edit")}</Link>}
                    {isHr && x.status !== "APPROVED" && (
                      <ActionForm action={reviewTemplate}><input type="hidden" name="id" value={x.id} /><input type="hidden" name="decision" value="APPROVED" /><button className="small primary">{t("common.approve")}</button></ActionForm>
                    )}
                    {isHr && (x.status === "PENDING" || x.status === "APPROVED") && (
                      <ActionForm action={reviewTemplate}>
                        <input type="hidden" name="id" value={x.id} />
                        <input name="note" placeholder="Note" required style={{ width: 110 }} />
                        <select name="decision" defaultValue={x.status === "PENDING" ? "REJECTED" : "DISABLED"}>
                          {x.status === "PENDING" && <option value="REJECTED">Reject</option>}
                          <option value="DISABLED">Disable</option>
                        </select>
                        <button className="small danger">OK</button>
                      </ActionForm>
                    )}
                  </div>
                  <small className="muted">{x._count.assignments} use(s)</small>
                </td>
              </tr>
            ))}
            {!templates.length && <tr><td colSpan={10} className="muted">{t("common.none")}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
