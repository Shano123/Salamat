import { ActionForm } from "@/components/ActionForm";
import { Forbidden, PageHeader } from "@/components/ui";
import { addStaffing, removeStaffing } from "@/app/actions/staffing";
import { canManageDepartment, pageGuard, visibleDepartments } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/domain/permissions";
import { getT } from "@/lib/i18n/server";
import { departmentTemplates } from "@/lib/services/roster";

export const dynamic = "force-dynamic";

export default async function StaffingPage({ searchParams }: { searchParams: Promise<{ dept?: string }> }) {
  const user = await pageGuard("roster.view");
  const { t, locale } = await getT();
  if (!user) return <Forbidden message={t("common.forbidden")} />;
  const sp = await searchParams;
  const depts = await visibleDepartments(user);
  const dept = depts.find((d) => d.id === sp.dept) ?? depts[0];
  if (!dept) return <p className="muted">No departments in your scope.</p>;
  const [rules, templates] = await Promise.all([
    db.staffingRequirement.findMany({ where: { departmentId: dept.id }, include: { template: true } }),
    departmentTemplates(dept.id, true),
  ]);
  const editable = can(user.role, "templates.edit") && canManageDepartment(user, dept.id);
  const skills = [...new Set((await db.employee.findMany({ where: { homeDepartmentId: dept.id }, select: { skills: true } })).flatMap((e) => e.skills))];

  return (
    <>
      <PageHeader title={t("nav.staffing")} subtitle="Per unit, per shift, per role. A roster below the minimum cannot be published without an L2 override and reason.">
        <form className="row">
          <select name="dept" defaultValue={dept.id}>{depts.map((d) => <option key={d.id} value={d.id}>{locale === "ar" ? d.nameAr : d.nameEn}</option>)}</select>
          <button type="submit">{t("common.filter")}</button>
        </form>
      </PageHeader>
      <div className="grid grid-2">
        <div className="table-wrap">
          <table>
            <thead><tr><th>Shift</th><th>Role / skill</th><th className="num">Minimum</th><th /></tr></thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td><span className="chip" style={{ background: r.template.color }}>{r.template.code}</span> {r.template.name}</td>
                  <td>{r.skill ?? <span className="muted">any staff</span>}</td>
                  <td className="num">{r.minCount}</td>
                  <td>{editable && <ActionForm action={removeStaffing}><input type="hidden" name="id" value={r.id} /><button className="small danger">{t("common.delete")}</button></ActionForm>}</td>
                </tr>
              ))}
              {!rules.length && <tr><td colSpan={4} className="muted">No minimum staffing set.</td></tr>}
            </tbody>
          </table>
        </div>
        {editable && (
          <div className="card">
            <h2>Add a rule</h2>
            <ActionForm action={addStaffing} resetOnSuccess>
              <input type="hidden" name="departmentId" value={dept.id} />
              <div className="form-grid">
                <label>Shift<select name="templateId">{templates.map((x) => <option key={x.id} value={x.id}>{x.code} · {x.name}</option>)}</select></label>
                <label>Role / skill (blank = any)<input name="skill" list="skills" placeholder="CHARGE_NURSE" /></label>
                <label>Minimum<input type="number" name="minCount" min={1} defaultValue={1} required /></label>
              </div>
              <datalist id="skills">{skills.map((s) => <option key={s} value={s} />)}</datalist>
              <div className="form-actions"><button className="primary" type="submit">{t("common.create")}</button></div>
              <p className="muted">Example: ICU N12 needs 1 CHARGE_NURSE plus 4 staff in total → add two rules.</p>
            </ActionForm>
          </div>
        )}
      </div>
    </>
  );
}
