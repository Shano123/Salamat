import Link from "next/link";
import { Forbidden, PageHeader, StatusBadge } from "@/components/ui";
import { canManageDepartment, pageGuard, visibleDepartments } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/domain/permissions";
import { addDays, dateRange, diffDays, localDateISO, monthRange, parseDateISO, toDateISO, weekStartOf } from "@/lib/domain/time";
import { getT } from "@/lib/i18n/server";
import { approvedLeave } from "@/lib/services/attendance";
import { checkDepartmentRoster, departmentTemplates } from "@/lib/services/roster";
import { getRules } from "@/lib/settings";
import { RosterGrid } from "./RosterGrid";
import { RosterTools } from "./RosterTools";

export const dynamic = "force-dynamic";

export default async function RosterPage({ searchParams }: { searchParams: Promise<{ dept?: string; week?: string; view?: string }> }) {
  const user = await pageGuard("roster.view");
  const { t, locale } = await getT();
  if (!user) return <Forbidden message={t("common.forbidden")} />;
  const sp = await searchParams;
  const rules = await getRules();
  const today = localDateISO(new Date(), rules.timezone);
  const depts = await visibleDepartments(user);
  if (!depts.length) return <p className="muted">No departments in your scope.</p>;
  // Without an explicit choice, managers open their own department; HR opens the largest one.
  const staffed = await db.employee.groupBy({ by: ["homeDepartmentId"], where: { status: "ACTIVE", homeDepartmentId: { in: depts.map((d) => d.id) } }, _count: true });
  const largest = [...staffed].sort((a, b) => b._count - a._count)[0]?.homeDepartmentId;
  const dept =
    depts.find((d) => d.id === sp.dept) ??
    (user.departments !== "ALL" ? depts.find((d) => d.id === user.homeDepartmentId && staffed.some((x) => x.homeDepartmentId === d.id)) : undefined) ??
    depts.find((d) => d.id === largest) ??
    depts[0];
  const view = sp.view === "month" ? "month" : "week";
  const anchor = sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? sp.week : today;
  let from: string;
  let to: string;
  if (view === "month") {
    const m = monthRange(anchor);
    from = m.from;
    to = m.to;
  } else {
    from = weekStartOf(anchor);
    to = addDays(from, 6);
  }
  const dates = dateRange(from, to);

  const [home, assignments, templates, periods, staffing, leaveAll, floatPool, otherDepts] = await Promise.all([
    db.employee.findMany({ where: { homeDepartmentId: dept.id, status: "ACTIVE" }, orderBy: [{ jobTitle: "asc" }, { nameEn: "asc" }] }),
    db.shiftAssignment.findMany({
      where: { date: { gte: parseDateISO(from), lte: parseDateISO(to) }, isOpenShift: false, OR: [{ departmentId: dept.id }, { employee: { homeDepartmentId: dept.id } }] },
      include: { template: true, department: true },
    }),
    departmentTemplates(dept.id),
    db.rosterPeriod.findMany({ where: { departmentId: dept.id, weekStart: { gte: parseDateISO(weekStartOf(from)), lte: parseDateISO(to) } } }),
    db.staffingRequirement.findMany({ where: { departmentId: dept.id }, include: { template: true } }),
    approvedLeave(null, from, to),
    db.employee.findMany({ where: { homeDepartment: { isFloatPool: true }, status: "ACTIVE", homeDepartmentId: { not: dept.id } }, orderBy: { nameEn: "asc" } }),
    db.department.findMany({ where: { id: { not: dept.id } }, orderBy: { nameEn: "asc" } }),
  ]);
  const guestIds = [...new Set(assignments.filter((a) => a.departmentId === dept.id).map((a) => a.employeeId))].filter((id) => !home.some((e) => e.id === id));
  const guests = guestIds.length ? await db.employee.findMany({ where: { id: { in: guestIds } }, include: { homeDepartment: true } }) : [];
  const { conflicts } = await checkDepartmentRoster(dept.id, from, to);

  const canEdit = can(user.role, "roster.edit") && (canManageDepartment(user, dept.id) || user.role === "LINE_MANAGER");
  const canPublish = can(user.role, "roster.publish") && canManageDepartment(user, dept.id);
  const weekStarts = [...new Set(dates.map((d) => weekStartOf(d)))];
  const periodStatus = Object.fromEntries(weekStarts.map((w) => [w, periods.find((p) => toDateISO(p.weekStart) === w)?.status ?? "DRAFT"]));
  const anyDraft = assignments.some((a) => a.departmentId === dept.id && a.status === "DRAFT");
  const nm = (e: { nameEn: string; nameAr: string }) => (locale === "ar" ? e.nameAr : e.nameEn);
  const daysAhead = diffDays(today, from);
  const deadlineMissed = view === "week" && periodStatus[from] !== "PUBLISHED" && daysAhead < rules.publishDeadlineDays && daysAhead >= 0;

  const prevAnchor = view === "month" ? addDays(from, -1) : addDays(from, -7);
  const nextAnchor = view === "month" ? addDays(to, 1) : addDays(from, 7);
  const q = (o: Record<string, string>) => `?${new URLSearchParams({ dept: dept.id, view, week: anchor, ...o })}`;

  return (
    <>
      <PageHeader title={`${t("nav.roster")} · ${nm(dept)}`} subtitle={`${from} → ${to}`}>
        <form className="row">
          <input type="hidden" name="view" value={view} />
          <input type="hidden" name="week" value={anchor} />
          <select name="dept" defaultValue={dept.id} aria-label={t("common.department")}>
            {depts.map((d) => <option key={d.id} value={d.id}>{nm(d)}</option>)}
          </select>
          <button type="submit">{t("common.filter")}</button>
        </form>
        <Link className="btn" href={q({ week: prevAnchor })}>←</Link>
        <Link className="btn" href={q({ week: today })}>{t("common.today")}</Link>
        <Link className="btn" href={q({ week: nextAnchor })}>→</Link>
        <Link className={`btn ${view === "week" ? "primary" : ""}`} href={q({ view: "week" })}>{t("common.week")}</Link>
        <Link className={`btn ${view === "month" ? "primary" : ""}`} href={q({ view: "month" })}>{t("common.month")}</Link>
      </PageHeader>

      <div className="row" style={{ marginBottom: 12 }}>
        {weekStarts.map((w) => (
          <span key={w} className="row" style={{ gap: 4 }}>
            <small className="muted">{w}</small>
            <StatusBadge status={periodStatus[w]} label={periodStatus[w] === "PUBLISHED" ? t("roster.published") : t("roster.draft")} />
          </span>
        ))}
        {deadlineMissed && <span className="badge danger">Publish deadline ({rules.publishDeadlineDays} days ahead) missed</span>}
      </div>

      <RosterGrid
        departmentId={dept.id}
        dates={dates}
        today={today}
        canEdit={canEdit}
        lineManagerTeam={user.role === "LINE_MANAGER" ? user.teamEmployeeIds : null}
        publishedWeeks={weekStarts.filter((w) => periodStatus[w] === "PUBLISHED")}
        weekendDays={rules.defaultWeekendDays}
        employees={[
          ...home.map((e) => ({ id: e.id, name: nm(e), sub: `${e.employeeNo} · ${e.jobTitle}`, skills: e.skills, guest: null as string | null })),
          ...guests.map((e) => ({ id: e.id, name: nm(e), sub: `${e.employeeNo} · ${e.jobTitle}`, skills: e.skills, guest: nm(e.homeDepartment) })),
        ]}
        templates={templates.map((x) => ({ id: x.id, code: x.code, name: x.name, color: x.color, status: x.status, type: x.type }))}
        assignments={assignments.map((a) => ({
          id: a.id,
          employeeId: a.employeeId,
          date: toDateISO(a.date),
          templateId: a.templateId,
          code: a.template.code,
          color: a.template.color,
          status: a.status,
          departmentId: a.departmentId,
          departmentName: nm(a.department),
          loanStatus: a.loanStatus,
          type: a.template.type,
        }))}
        leave={leaveAll.map((l) => ({ employeeId: l.employeeId, from: l.from, to: l.to }))}
        staffing={staffing.map((s) => ({ templateId: s.templateId, code: s.template.code, skill: s.skill, minCount: s.minCount }))}
        conflicts={conflicts.map((c) => ({ kind: c.kind, severity: c.severity, date: c.date, employeeId: c.employeeId ?? null, message: c.message }))}
      />

      <RosterTools
        departmentId={dept.id}
        from={from}
        to={to}
        canEdit={canEdit}
        canPublish={canPublish}
        anyDraft={anyDraft}
        publishedWeeks={weekStarts.filter((w) => periodStatus[w] === "PUBLISHED")}
        employees={home.map((e) => ({ id: e.id, name: nm(e) }))}
        templates={templates.filter((x) => x.status === "APPROVED").map((x) => ({ id: x.id, code: x.code, name: x.name }))}
        floatPool={floatPool.map((e) => ({ id: e.id, name: `${nm(e)} (${e.jobTitle})` }))}
        otherDepartments={otherDepts.map((d) => ({ id: d.id, name: nm(d) }))}
        conflicts={conflicts.map((c) => ({ kind: c.kind, severity: c.severity, date: c.date, message: c.message }))}
      />
    </>
  );
}
