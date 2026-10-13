import Link from "next/link";
import { PageHeader, Stat, StatusBadge } from "@/components/ui";
import { employeeScope, requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/domain/permissions";
import { formatTime, hijri, localDateISO, parseDateISO, toDateISO } from "@/lib/domain/time";
import { getT } from "@/lib/i18n/server";
import { liveBoard, LiveState } from "@/lib/services/live";
import { getRules } from "@/lib/settings";

export const dynamic = "force-dynamic";

const STATE_LABEL: Record<LiveState, [string, string]> = {
  IN: ["In", "PRESENT"],
  OUT: ["Finished", "APPROVED"],
  LATE_IN: ["In (late)", "LATE"],
  LATE_NOT_IN: ["Late — not in", "MISSING_PUNCH"],
  NOT_YET: ["Not yet", "SCHEDULED"],
  ABSENT: ["Absent", "ABSENT"],
  ON_LEAVE: ["On leave", "ON_LEAVE"],
  MISSING_OUT: ["Missing clock-out", "MISSING_PUNCH"],
};

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ dept?: string; loc?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const { t, locale } = await getT();
  const rules = await getRules();
  const tz = rules.timezone;
  const now = new Date();
  const today = localDateISO(now, tz);
  const isManager = can(user.role, "roster.view");

  const nextShift = user.employeeId
    ? await db.shiftAssignment.findFirst({
        where: { employeeId: user.employeeId, status: "PUBLISHED", date: { gte: parseDateISO(today) }, template: { type: { not: "OFF" } } },
        orderBy: { date: "asc" },
        include: { template: true, department: true, location: true },
      })
    : null;
  const myPending = user.employeeId
    ? await db.request.count({ where: { requesterId: user.employeeId, status: { in: ["PENDING_PEER", "PENDING_L1", "PENDING_L2", "PENDING_HR"] } } })
    : 0;

  let rows = isManager ? await liveBoard(employeeScope(user), now) : [];
  const depts = [...new Map(rows.map((r) => [r.departmentId, r.department])).entries()];
  const locs = [...new Set(rows.map((r) => r.location))];
  if (sp.dept) rows = rows.filter((r) => r.departmentId === sp.dept);
  if (sp.loc) rows = rows.filter((r) => r.location === sp.loc);
  const count = (...s: LiveState[]) => rows.filter((r) => s.includes(r.state)).length;

  const inboxCount = can(user.role, "requests.approve")
    ? await db.request.count({ where: { status: { in: ["PENDING_L1", "PENDING_L2", "PENDING_HR"] }, ...(user.departments === "ALL" ? {} : { OR: [{ departmentId: { in: user.departments } }, { requesterId: { in: user.teamEmployeeIds } }] }) } })
    : 0;

  return (
    <>
      <PageHeader title={t("nav.dashboard")} subtitle={`${today} · ${hijri(today, locale)} · ${formatTime(now, tz)} (${tz})`}>
        {user.employeeId && <Link className="btn primary" href="/clock">{t("nav.clock")}</Link>}
      </PageHeader>

      <div className="grid grid-3" style={{ marginBottom: 16 }}>
        {user.employeeId && (
          <div className="card">
            <h3>{t("dash.nextShift")}</h3>
            {nextShift ? (
              <div className="row">
                <span className="chip" style={{ background: nextShift.template.color }}>{nextShift.template.code}</span>
                <div>
                  <strong>{toDateISO(nextShift.date)}</strong> · {nextShift.template.name}
                  <div className="muted">{nextShift.department.nameEn}{nextShift.location ? ` · ${nextShift.location.name}` : ""}</div>
                </div>
              </div>
            ) : (
              <p className="muted">{t("dash.noShift")}</p>
            )}
            <div className="row" style={{ marginTop: 10 }}>
              <Link href="/me/schedule">{t("nav.mySchedule")} →</Link>
              {myPending > 0 && <Link href="/requests">{myPending} pending request(s)</Link>}
            </div>
          </div>
        )}
        {can(user.role, "requests.approve") && (
          <div className="card stat">
            <span className="label">{t("dash.pending")}</span>
            <span className="value">{inboxCount}</span>
            <Link href="/inbox">{t("nav.inbox")} →</Link>
          </div>
        )}
      </div>

      {isManager && (
        <>
          <form className="row" style={{ marginBottom: 12 }}>
            <select name="dept" defaultValue={sp.dept ?? ""}>
              <option value="">{t("common.department")}: {t("common.all")}</option>
              {depts.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
            </select>
            <select name="loc" defaultValue={sp.loc ?? ""}>
              <option value="">{t("common.location")}: {t("common.all")}</option>
              {locs.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <button type="submit">{t("common.filter")}</button>
          </form>
          <div className="grid grid-4" style={{ marginBottom: 16 }}>
            <Stat label={t("dash.scheduled")} value={rows.length} />
            <Stat label={t("dash.in")} value={count("IN", "LATE_IN")} tone="ok" />
            <Stat label={t("dash.late")} value={count("LATE_IN", "LATE_NOT_IN")} tone="warn" />
            <Stat label={t("dash.absent")} value={count("ABSENT")} tone="danger" />
            <Stat label={t("dash.notYet")} value={count("NOT_YET")} />
            <Stat label={t("dash.onLeave")} value={count("ON_LEAVE")} tone="info" />
            <Stat label={t("dash.missing")} value={count("MISSING_OUT")} tone="warn" />
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t("common.employee")}</th>
                  <th>{t("common.department")}</th>
                  <th>{t("common.location")}</th>
                  <th>Shift</th>
                  <th>In</th>
                  <th>Out</th>
                  <th>{t("common.status")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.assignmentId}>
                    <td>{locale === "ar" ? r.nameAr : r.name} <small className="muted">#{r.employeeNo}</small></td>
                    <td>{r.department}</td>
                    <td>{r.location}</td>
                    <td><span className="chip" style={{ background: r.color }}>{r.code}</span> <small className="muted">{formatTime(r.start, tz)}–{formatTime(r.end, tz)}</small></td>
                    <td>{r.firstIn ? formatTime(r.firstIn, tz) : "—"}</td>
                    <td>{r.lastOut ? formatTime(r.lastOut, tz) : "—"}</td>
                    <td><StatusBadge status={STATE_LABEL[r.state][1]} label={STATE_LABEL[r.state][0]} /></td>
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={7} className="muted">No published shifts right now.</td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
