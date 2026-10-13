import Link from "next/link";
import { roleLabel } from "@/lib/roles";
import { ActionForm } from "@/components/ActionForm";
import { Forbidden, PageHeader, StatusBadge } from "@/components/ui";
import { saveEmployee } from "@/app/actions/employees";
import { employeeScope, pageGuard } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/domain/permissions";
import { addDays, localDateISO, toDateISO } from "@/lib/domain/time";
import { getT } from "@/lib/i18n/server";
import { getRules } from "@/lib/settings";
import { EmployeeImport } from "./EmployeeImport";

export const dynamic = "force-dynamic";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default async function EmployeesPage({ searchParams }: { searchParams: Promise<{ q?: string; dept?: string; edit?: string; license?: string; status?: string }> }) {
  const user = await pageGuard("employees.view");
  const { t, locale } = await getT();
  if (!user) return <Forbidden message={t("common.forbidden")} />;
  const sp = await searchParams;
  const rules = await getRules();
  const today = localDateISO(new Date(), rules.timezone);
  const editable = can(user.role, "employees.edit");
  const in60 = addDays(today, 60);
  const [employees, depts, locations, managers] = await Promise.all([
    db.employee.findMany({
      where: {
        ...employeeScope(user),
        ...(sp.dept ? { homeDepartmentId: sp.dept } : {}),
        ...(sp.status ? { status: sp.status as never } : { status: "ACTIVE" }),
        ...(sp.q ? { OR: [{ nameEn: { contains: sp.q, mode: "insensitive" } }, { nameAr: { contains: sp.q } }, { employeeNo: { contains: sp.q } }, { jobTitle: { contains: sp.q, mode: "insensitive" } }] } : {}),
        ...(sp.license ? { isClinical: true, licenseExpiry: { lte: new Date(in60) } } : {}),
      },
      include: { homeDepartment: true, lineManager: true, user: true },
      orderBy: { nameEn: "asc" },
      take: 500,
    }),
    db.department.findMany({ orderBy: { nameEn: "asc" } }),
    db.location.findMany({ orderBy: { name: "asc" } }),
    db.employee.findMany({ where: { user: { role: { in: ["LINE_MANAGER", "DEPT_MANAGER", "HR_ADMIN"] } } }, orderBy: { nameEn: "asc" } }),
  ]);
  const editing = sp.edit ? await db.employee.findUnique({ where: { id: sp.edit } }) : null;
  const nm = (e: { nameEn: string; nameAr: string }) => (locale === "ar" ? e.nameAr : e.nameEn);
  const licenseBadge = (exp: Date | null) => {
    if (!exp) return null;
    const d = toDateISO(exp);
    if (d < today) return <span className="badge danger">expired {d}</span>;
    if (d <= addDays(today, 30)) return <span className="badge danger">expires {d}</span>;
    if (d <= in60) return <span className="badge warn">expires {d}</span>;
    return <small className="muted">{d}</small>;
  };

  return (
    <>
      <PageHeader title={t("nav.employees")} subtitle={`${employees.length} shown`}>
        {editable && <Link className="btn primary" href="/employees?edit=new#form">{t("common.create")}</Link>}
      </PageHeader>
      <form className="row" style={{ marginBottom: 12 }}>
        <input name="q" placeholder={t("common.search")} defaultValue={sp.q} />
        <select name="dept" defaultValue={sp.dept ?? ""}><option value="">{t("common.department")}: {t("common.all")}</option>{depts.map((d) => <option key={d.id} value={d.id}>{nm(d)}</option>)}</select>
        <select name="status" defaultValue={sp.status ?? ""}><option value="">Active</option><option value="INACTIVE">Inactive</option></select>
        <label className="inline"><input type="checkbox" name="license" value="1" defaultChecked={!!sp.license} /> License expiring ≤ 60 days</label>
        <button type="submit">{t("common.filter")}</button>
      </form>
      <div className="table-wrap" style={{ marginBottom: 16 }}>
        <table>
          <thead><tr><th>No</th><th>{t("common.name")}</th><th>{t("common.department")}</th><th>Job title</th><th>Line manager</th><th>Skills</th><th>SCFHS license</th><th>Clock</th><th>Login</th><th /></tr></thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id}>
                <td>{e.employeeNo}</td>
                <td>{nm(e)}{e.status !== "ACTIVE" && <> <StatusBadge status={e.status} /></>}</td>
                <td>{nm(e.homeDepartment)}</td>
                <td>{e.jobTitle}{e.isClinical && <> <span className="badge">clinical</span></>}</td>
                <td>{e.lineManager ? nm(e.lineManager) : "—"}</td>
                <td style={{ fontSize: 12 }}>{e.skills.join(", ")}</td>
                <td>{e.licenseNo}{" "}{licenseBadge(e.licenseExpiry)}</td>
                <td>{e.clockMethod.toLowerCase()}</td>
                <td>{e.user ? <span className="badge">{roleLabel(e.user.role)}</span> : "—"}</td>
                <td>{editable && <Link className="btn small" href={`/employees?edit=${e.id}#form`}>{t("common.edit")}</Link>}</td>
              </tr>
            ))}
            {!employees.length && <tr><td colSpan={10} className="muted">{t("common.none")}</td></tr>}
          </tbody>
        </table>
      </div>
      {editable && (
        <div className="grid grid-2">
          <div className="card" id="form">
            <h2>{editing ? `${t("common.edit")}: ${editing.nameEn}` : "New employee"}</h2>
            <ActionForm action={saveEmployee} key={editing?.id ?? "new"} resetOnSuccess={!editing}>
              {editing && <input type="hidden" name="id" value={editing.id} />}
              <div className="form-grid">
                <label>Employee number<input name="employeeNo" defaultValue={editing?.employeeNo} required /></label>
                <label>Name (English)<input name="nameEn" defaultValue={editing?.nameEn} required /></label>
                <label>الاسم (عربي)<input name="nameAr" dir="rtl" defaultValue={editing?.nameAr} required /></label>
                <label>Home department<select name="homeDepartmentId" defaultValue={editing?.homeDepartmentId}>{depts.map((d) => <option key={d.id} value={d.id}>{d.nameEn}</option>)}</select></label>
                <label>Job title<input name="jobTitle" defaultValue={editing?.jobTitle} required /></label>
                <label>Work location<select name="workLocationId" defaultValue={editing?.workLocationId ?? ""}><option value="">—</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
                <label>Contract hours / week<input type="number" step="0.5" name="contractHours" defaultValue={editing?.contractHours ?? 48} /></label>
                <label>Line manager<select name="lineManagerId" defaultValue={editing?.lineManagerId ?? ""}><option value="">— none (goes straight to L2) —</option>{managers.map((m) => <option key={m.id} value={m.id}>{m.nameEn}</option>)}</select></label>
                <label>Skills / competencies<input name="skills" defaultValue={editing?.skills.join(", ")} placeholder="BLS, ACLS, CHARGE_NURSE" /></label>
                <label>SCFHS license no<input name="licenseNo" defaultValue={editing?.licenseNo ?? ""} /></label>
                <label>License expiry<input type="date" name="licenseExpiry" defaultValue={editing?.licenseExpiry ? toDateISO(editing.licenseExpiry) : ""} /></label>
                <label>Clock-in method<select name="clockMethod" defaultValue={editing?.clockMethod ?? "BOTH"}><option value="BOTH">Fingerprint or phone</option><option value="FINGERPRINT">Fingerprint only</option><option value="MOBILE">Phone only</option></select></label>
                <label>Kiosk PIN (leave blank to keep)<input name="kioskPin" inputMode="numeric" autoComplete="off" /></label>
                <label>Status<select name="status" defaultValue={editing?.status ?? "ACTIVE"}><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label>
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <span className="muted">Weekend:</span>
                {DOW.map((d, i) => <label key={d} className="inline"><input type="checkbox" name="weekendDays" value={i} defaultChecked={(editing?.weekendDays ?? rules.defaultWeekendDays).includes(i)} /> {d}</label>)}
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <label className="inline"><input type="checkbox" name="isClinical" defaultChecked={editing?.isClinical} /> Clinical staff</label>
                <label className="inline"><input type="checkbox" name="ramadanHours" defaultChecked={editing?.ramadanHours ?? true} /> Ramadan reduced hours apply</label>
                {editing && <label className="inline"><input type="checkbox" name="resetDevices" /> Reset bound phones ({editing.boundDevices.length}/2)</label>}
              </div>
              <div className="form-actions"><button className="primary" type="submit">{t("common.save")}</button>{editing && <Link className="btn" href="/employees">{t("common.cancel")}</Link>}</div>
            </ActionForm>
          </div>
          <div className="card">
            <h2>{t("common.import")} employees (CSV / Excel)</h2>
            <EmployeeImport />
          </div>
        </div>
      )}
    </>
  );
}
