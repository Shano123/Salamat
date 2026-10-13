import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { Forbidden, PageHeader } from "@/components/ui";
import { saveDepartment, setManagers } from "@/app/actions/departments";
import { pageGuard } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/domain/permissions";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

type Dept = Awaited<ReturnType<typeof load>>[number];
async function load() {
  return db.department.findMany({ include: { location: true, scopes: { include: { user: { include: { employee: true } } } }, _count: { select: { employees: true } } }, orderBy: { nameEn: "asc" } });
}

export default async function DepartmentsPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const user = await pageGuard("employees.view");
  const { t, locale } = await getT();
  if (!user) return <Forbidden message={t("common.forbidden")} />;
  const sp = await searchParams;
  const editable = can(user.role, "departments.edit");
  const [depts, locations, managers] = await Promise.all([
    load(),
    db.location.findMany({ orderBy: { name: "asc" } }),
    db.user.findMany({ where: { role: { in: ["DEPT_MANAGER", "LINE_MANAGER"] } }, include: { employee: true }, orderBy: { email: "asc" } }),
  ]);
  const editing = depts.find((d) => d.id === sp.edit);
  const nm = (d: { nameEn: string; nameAr: string }) => (locale === "ar" ? d.nameAr : d.nameEn);
  const children = (pid: string | null) => depts.filter((d) => d.parentId === pid);

  const Tree = ({ parent }: { parent: string | null }) => {
    const list = children(parent);
    if (!list.length) return null;
    return (
      <ul className="tree">
        {list.map((d: Dept) => (
          <li key={d.id}>
            <div className="row">
              <strong>{nm(d)}</strong>
              <small className="muted">{d.code}</small>
              <span className="badge">{d.kind.replace("_", " ").toLowerCase()}</span>
              {d.level !== "DEPARTMENT" && <span className="badge">{d.level.replace("_", "-").toLowerCase()}</span>}
              {d.isFloatPool && <span className="badge info">float pool</span>}
              <small className="muted">{d._count.employees} staff{d.location ? ` · ${d.location.name}` : ""}{d.costCenter ? ` · CC ${d.costCenter}` : ""}</small>
              <small className="muted">· {d.scopes.map((s) => s.user.employee?.nameEn ?? s.user.email).join(", ") || "no manager"}</small>
              {editable && <Link className="btn small" href={`/departments?edit=${d.id}`}>{t("common.edit")}</Link>}
              <Link className="btn small" href={`/roster?dept=${d.id}`}>{t("nav.roster")}</Link>
            </div>
            <Tree parent={d.id} />
          </li>
        ))}
      </ul>
    );
  };

  return (
    <>
      <PageHeader title={t("nav.departments")} subtitle={`${depts.length} departments, sub-departments and teams`} />
      <div className="grid" style={{ gridTemplateColumns: editable ? "minmax(0, 3fr) minmax(300px, 2fr)" : "1fr" }}>
        <div className="card"><Tree parent={null} /></div>
        {editable && (
          <div className="stack">
            <div className="card">
              <h2>{editing ? `${t("common.edit")}: ${editing.nameEn}` : `${t("common.create")} department`}</h2>
              <ActionForm action={saveDepartment} key={editing?.id ?? "new"} resetOnSuccess={!editing}>
                {editing && <input type="hidden" name="id" value={editing.id} />}
                <div className="form-grid">
                  <label>{t("common.code")}<input name="code" defaultValue={editing?.code} required /></label>
                  <label>Name (English)<input name="nameEn" defaultValue={editing?.nameEn} required /></label>
                  <label>الاسم (عربي)<input name="nameAr" defaultValue={editing?.nameAr} dir="rtl" required /></label>
                  <label>Kind<select name="kind" defaultValue={editing?.kind ?? "CLINICAL"}><option value="CLINICAL">Clinical unit</option><option value="CLINICAL_SUPPORT">Clinical support</option><option value="NON_CLINICAL">Non-clinical</option></select></label>
                  <label>Level<select name="level" defaultValue={editing?.level ?? "DEPARTMENT"}><option value="DEPARTMENT">Department</option><option value="SUB_DEPARTMENT">Sub-department</option><option value="TEAM">Team</option></select></label>
                  <label>Parent<select name="parentId" defaultValue={editing?.parentId ?? ""}><option value="">— top level —</option>{depts.filter((d) => d.id !== editing?.id).map((d) => <option key={d.id} value={d.id}>{d.nameEn}</option>)}</select></label>
                  <label>Cost center<input name="costCenter" defaultValue={editing?.costCenter ?? ""} /></label>
                  <label>Branch<select name="locationId" defaultValue={editing?.locationId ?? ""}><option value="">—</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
                </div>
                <label className="inline" style={{ marginTop: 8 }}><input type="checkbox" name="isFloatPool" defaultChecked={editing?.isFloatPool} /> Float pool (staff can be placed in any short unit)</label>
                <div className="form-actions"><button className="primary" type="submit">{t("common.save")}</button>{editing && <Link className="btn" href="/departments">{t("common.cancel")}</Link>}</div>
              </ActionForm>
            </div>
            {editing && (
              <div className="card">
                <h2>Managers &amp; supervisors</h2>
                <ActionForm action={setManagers}>
                  <input type="hidden" name="departmentId" value={editing.id} />
                  <div className="stack" style={{ maxHeight: 260, overflowY: "auto" }}>
                    {managers.map((m) => (
                      <label key={m.id} className="inline">
                        <input type="checkbox" name="userIds" value={m.id} defaultChecked={editing.scopes.some((s) => s.userId === m.id)} />
                        {m.employee?.nameEn ?? m.email} <span className="badge">{m.role.replace("_", " ").toLowerCase()}</span>
                      </label>
                    ))}
                    {!managers.length && <p className="muted">Give users a manager role in Users &amp; roles first.</p>}
                  </div>
                  <div className="form-actions"><button className="primary" type="submit">{t("common.save")}</button></div>
                </ActionForm>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
