import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { Forbidden, PageHeader } from "@/components/ui";
import { addDelegation, removeDelegation, saveUser } from "@/app/actions/users";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/domain/permissions";
import { localDateISO, toDateISO } from "@/lib/domain/time";
import { getT } from "@/lib/i18n/server";
import { getRules } from "@/lib/settings";

export const dynamic = "force-dynamic";

const ROLES = ["EMPLOYEE", "LINE_MANAGER", "DEPT_MANAGER", "HR_VIEWER", "HR_ADMIN", "SUPER_ADMIN"];

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ edit?: string; q?: string }> }) {
  const user = await requireUser();
  const { t } = await getT();
  const manage = can(user.role, "users.manage");
  const isManager = ["DEPT_MANAGER", "LINE_MANAGER"].includes(user.baseRole);
  if (!manage && !isManager) return <Forbidden message={t("common.forbidden")} />;
  const sp = await searchParams;
  const rules = await getRules();
  const today = localDateISO(new Date(), rules.timezone);
  const users = manage
    ? await db.user.findMany({
        where: sp.q ? { OR: [{ email: { contains: sp.q, mode: "insensitive" } }, { employee: { nameEn: { contains: sp.q, mode: "insensitive" } } }] } : {},
        include: { employee: { include: { homeDepartment: true } }, scopes: { include: { department: true } } },
        orderBy: [{ role: "desc" }, { email: "asc" }],
        take: 300,
      })
    : [];
  const editing = manage && sp.edit ? await db.user.findUnique({ where: { id: sp.edit } }) : null;
  const unlinked = manage ? await db.employee.findMany({ where: { OR: [{ user: null }, ...(editing?.employeeId ? [{ id: editing.employeeId }] : [])] }, orderBy: { nameEn: "asc" }, take: 1000 }) : [];
  const deputies = await db.user.findMany({ where: { role: { in: ["DEPT_MANAGER", "LINE_MANAGER", "EMPLOYEE"] } }, include: { employee: true }, orderBy: { email: "asc" }, take: 1000 });
  const delegations = await db.delegation.findMany({
    where: manage ? {} : { fromUserId: user.id },
    include: { from: { include: { employee: true } }, to: { include: { employee: true } } },
    orderBy: { startDate: "desc" },
    take: 100,
  });
  const managers = manage ? await db.user.findMany({ where: { role: { in: ["DEPT_MANAGER", "LINE_MANAGER"] } }, include: { employee: true } }) : [];
  const label = (u: { email: string; employee: { nameEn: string } | null }) => u.employee?.nameEn ?? u.email;

  return (
    <>
      <PageHeader title={manage ? t("nav.users") : "Delegation"} subtitle={manage ? "Roles are scoped by department: assign department scopes in Departments." : "Hand your approval rights to a deputy for a date range (vacation cover)."} />
      {manage && (
        <>
          <form className="row" style={{ marginBottom: 12 }}><input name="q" placeholder={t("common.search")} defaultValue={sp.q} /><button type="submit">{t("common.search")}</button></form>
          <div className="table-wrap" style={{ marginBottom: 16 }}>
            <table>
              <thead><tr><th>Email</th><th>{t("common.employee")}</th><th>Role</th><th>Department scope</th><th /></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{u.email}</td>
                    <td>{u.employee ? `${u.employee.nameEn} · ${u.employee.homeDepartment.nameEn}` : "—"}</td>
                    <td><span className="badge">{u.role.replace("_", " ").toLowerCase()}</span></td>
                    <td style={{ fontSize: 12 }}>{u.scopes.map((s) => s.department.nameEn).join(", ") || (["SUPER_ADMIN", "HR_ADMIN", "HR_VIEWER"].includes(u.role) ? "all" : "—")}</td>
                    <td><Link className="btn small" href={`/users?edit=${u.id}#form`}>{t("common.edit")}</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card" id="form" style={{ marginBottom: 16 }}>
            <h2>{editing ? `${t("common.edit")}: ${editing.email}` : "New user"}</h2>
            <ActionForm action={saveUser} key={editing?.id ?? "new"} resetOnSuccess={!editing}>
              {editing && <input type="hidden" name="id" value={editing.id} />}
              <div className="form-grid">
                {!editing && <label>Email<input type="email" name="email" required /></label>}
                <label>Role<select name="role" defaultValue={editing?.role ?? "EMPLOYEE"}>{ROLES.map((r) => <option key={r} value={r}>{r.replace("_", " ").toLowerCase()}</option>)}</select></label>
                <label>Linked employee<select name="employeeId" defaultValue={editing?.employeeId ?? ""}><option value="">—</option>{unlinked.map((e) => <option key={e.id} value={e.id}>{e.nameEn} #{e.employeeNo}</option>)}</select></label>
                <label>{editing ? "New password (optional)" : "Password"}<input type="password" name="password" autoComplete="new-password" minLength={10} required={!editing} /></label>
              </div>
              <div className="form-actions"><button className="primary" type="submit">{t("common.save")}</button>{editing && <Link className="btn" href="/users">{t("common.cancel")}</Link>}</div>
            </ActionForm>
            <p className="muted" style={{ marginTop: 8 }}>Production sign-in: SSO (Microsoft / Google) for staff with email, phone OTP for frontline, MFA for HR Admin.</p>
          </div>
        </>
      )}
      <div className="card">
        <h2>Delegations</h2>
        <ActionForm action={addDelegation} resetOnSuccess>
          <div className="form-grid">
            {manage && <label>From manager<select name="fromUserId">{managers.map((m) => <option key={m.id} value={m.id}>{label(m)}</option>)}</select></label>}
            <label>Deputy<select name="toUserId">{deputies.filter((d) => d.id !== user.id).map((d) => <option key={d.id} value={d.id}>{label(d)}</option>)}</select></label>
            <label>{t("common.from")}<input type="date" name="startDate" defaultValue={today} required /></label>
            <label>{t("common.to")}<input type="date" name="endDate" required /></label>
            <button type="submit">{t("common.create")}</button>
          </div>
        </ActionForm>
        <table style={{ marginTop: 12 }}>
          <thead><tr><th>From</th><th>Deputy</th><th>{t("common.from")}</th><th>{t("common.to")}</th><th /></tr></thead>
          <tbody>
            {delegations.map((d) => (
              <tr key={d.id}>
                <td>{label(d.from)}</td><td>{label(d.to)}</td><td>{toDateISO(d.startDate)}</td><td>{toDateISO(d.endDate)}</td>
                <td>{toDateISO(d.endDate) >= today ? <ActionForm action={removeDelegation}><input type="hidden" name="id" value={d.id} /><button className="small danger">{t("common.delete")}</button></ActionForm> : <span className="muted">ended</span>}</td>
              </tr>
            ))}
            {!delegations.length && <tr><td colSpan={5} className="muted">{t("common.none")}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
