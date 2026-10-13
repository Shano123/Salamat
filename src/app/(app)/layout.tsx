import Link from "next/link";
import { Shell, NavSection } from "@/components/Shell";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/domain/permissions";
import { getT } from "@/lib/i18n/server";
import { logout, toggleLocale } from "../actions/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const { t } = await getT();
  const unread = await db.notification.count({ where: { userId: user.id, readAt: null } });
  const r = user.role;
  const item = (href: string, key: string, ok = true, badge?: number) => (ok ? [{ href, label: t(key), badge }] : []);

  const sections: NavSection[] = [
    {
      title: t("nav.section.me"),
      items: [
        ...item("/dashboard", "nav.dashboard"),
        ...item("/me/schedule", "nav.mySchedule", !!user.employeeId),
        ...item("/clock", "nav.clock", !!user.employeeId),
        ...item("/me/attendance", "nav.myAttendance", !!user.employeeId),
        ...item("/me/leave", "nav.myLeave", !!user.employeeId),
        ...item("/requests", "nav.requests", !!user.employeeId),
        ...item("/notifications", "nav.notifications", true, unread),
      ],
    },
    {
      title: t("nav.section.manage"),
      items: [
        ...item("/inbox", "nav.inbox", can(r, "requests.approve")),
        ...item("/roster", "nav.roster", can(r, "roster.view")),
        ...item("/roster/import", "nav.rosterImport", can(r, "roster.import")),
        ...item("/open-shifts", "nav.openShifts", !!user.employeeId || can(r, "roster.edit")),
        ...item("/templates", "nav.templates", can(r, "roster.view")),
        ...item("/staffing", "nav.staffing", can(r, "roster.view")),
        ...item("/attendance", "nav.attendance", can(r, "roster.view")),
        ...item("/reports", "nav.reports", can(r, "reports.view")),
      ],
    },
    {
      title: t("nav.section.hr"),
      items: [
        ...item("/punches/import", "nav.punchImport", can(r, "punches.import")),
        ...item("/payroll", "nav.payroll", can(r, "payroll.export")),
        ...item("/periods", "nav.periods", can(r, "periods.lock") || r === "HR_VIEWER"),
        ...item("/departments", "nav.departments", can(r, "employees.view")),
        ...item("/employees", "nav.employees", can(r, "employees.view")),
        ...item("/leave-setup", "nav.leaveSetup", can(r, "rules.edit")),
      ],
    },
    {
      title: t("nav.section.admin"),
      items: [
        ...item("/locations", "nav.locations", can(r, "locations.view")),
        ...item("/users", "nav.users", can(r, "users.manage") || ["DEPT_MANAGER", "LINE_MANAGER"].includes(user.baseRole)),
        ...item("/settings", "nav.settings", can(r, "rules.edit")),
        ...item("/audit", "nav.audit", can(r, "audit.view")),
      ],
    },
  ];

  return (
    <Shell
      sections={sections}
      brand={t("appName")}
      tagline={t("tagline")}
      topbar={
        <>
          {user.delegatedFrom.length > 0 && <span className="badge info">Acting as delegate</span>}
          <span className="muted">
            {user.employeeName} · <span className="badge">{r.replace("_", " ").toLowerCase()}</span>
          </span>
          <Link href="/notifications" aria-label="Notifications">🔔{unread ? ` ${unread}` : ""}</Link>
          <form action={toggleLocale}>
            <button className="small" type="submit">{t("common.language")}</button>
          </form>
          <form action={logout}>
            <button className="small" type="submit">{t("common.logout")}</button>
          </form>
        </>
      }
    >
      {children}
    </Shell>
  );
}
