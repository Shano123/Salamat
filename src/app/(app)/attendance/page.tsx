import { ActionForm } from "@/components/ActionForm";
import { Icon } from "@/components/Icon";
import { fmtMin, Forbidden, PageHeader, StatusBadge } from "@/components/ui";
import { correctionForEmployee, recalc } from "@/app/actions/attendance";
import { employeeScope, pageGuard, visibleDepartments } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/domain/permissions";
import { addDays, formatTime, localDateISO, parseDateISO, toDateISO } from "@/lib/domain/time";
import { getT } from "@/lib/i18n/server";
import { getRules } from "@/lib/settings";

export const dynamic = "force-dynamic";

const STATUSES = ["PRESENT", "LATE", "EARLY_LEAVE", "LATE_AND_EARLY", "ABSENT", "MISSING_PUNCH", "ON_LEAVE", "HOLIDAY", "ON_CALL", "SCHEDULED"];

export default async function AttendancePage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; dept?: string; status?: string; q?: string }> }) {
  const user = await pageGuard("roster.view");
  const { t, locale } = await getT();
  if (!user) return <Forbidden message={t("common.forbidden")} />;
  const sp = await searchParams;
  const rules = await getRules();
  const tz = rules.timezone;
  const today = localDateISO(new Date(), tz);
  const from = sp.from ?? addDays(today, -6);
  const to = sp.to ?? today;
  const depts = await visibleDepartments(user);
  const scope = employeeScope(user);
  const rows = await db.shiftAssignment.findMany({
    where: {
      status: "PUBLISHED",
      date: { gte: parseDateISO(from), lte: parseDateISO(to) },
      employee: { ...scope, ...(sp.q ? { OR: [{ nameEn: { contains: sp.q, mode: "insensitive" } }, { employeeNo: { contains: sp.q } }] } : {}) },
      ...(sp.dept ? { departmentId: sp.dept } : {}),
      ...(sp.status ? { attendance: { status: sp.status as never } } : {}),
      template: { type: { not: "OFF" } },
    },
    include: { employee: true, template: true, attendance: true, department: true, punches: { orderBy: { timestamp: "asc" } } },
    orderBy: [{ date: "desc" }, { employee: { nameEn: "asc" } }],
    take: 1000,
  });
  const team = await db.employee.findMany({ where: { ...scope, status: "ACTIVE" }, orderBy: { nameEn: "asc" }, select: { id: true, nameEn: true, nameAr: true, employeeNo: true } });
  const canCorrect = can(user.role, "attendance.correct");

  return (
    <>
      <PageHeader title={t("nav.attendance")} subtitle={`${rows.length} shift(s) · ${from} → ${to}`}>
        <a className="btn" href={`/api/reports/daily?from=${from}&to=${to}${sp.dept ? `&dept=${sp.dept}` : ""}&format=xlsx`}>{t("common.export")} Excel</a>
      </PageHeader>
      <form className="row" style={{ marginBottom: 12 }}>
        <input type="date" name="from" defaultValue={from} />
        <input type="date" name="to" defaultValue={to} />
        <select name="dept" defaultValue={sp.dept ?? ""}><option value="">{t("common.department")}: {t("common.all")}</option>{depts.map((d) => <option key={d.id} value={d.id}>{locale === "ar" ? d.nameAr : d.nameEn}</option>)}</select>
        <select name="status" defaultValue={sp.status ?? ""}><option value="">{t("common.status")}: {t("common.all")}</option>{STATUSES.map((s) => <option key={s} value={s}>{t(`att.${s}`)}</option>)}</select>
        <input name="q" placeholder={t("common.search")} defaultValue={sp.q} />
        <button type="submit">{t("common.filter")}</button>
      </form>
      <div className="table-wrap">
        <table>
          <thead><tr><th>{t("common.date")}</th><th>{t("common.employee")}</th><th>{t("common.department")}</th><th>Shift</th><th>Punches</th><th className="num">Worked</th><th className="num">Late</th><th className="num">Early</th><th className="num">OT approved</th><th className="num">OT unapproved</th><th>{t("common.status")}</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{toDateISO(r.date)}</td>
                <td>{locale === "ar" ? r.employee.nameAr : r.employee.nameEn} <small className="muted">#{r.employee.employeeNo}</small></td>
                <td>{r.department.nameEn}</td>
                <td><span className="chip" style={{ background: r.template.color }}>{r.template.code}</span></td>
                <td style={{ fontSize: 12 }}>
                  {r.punches.map((p) => (
                    <span key={p.id} title={`${p.source}${p.lat ? ` @ ${p.lat.toFixed(4)},${p.lng?.toFixed(4)}` : ""}`} style={{ marginInlineEnd: 6 }}>
                      {p.type ?? "?"} {formatTime(p.timestamp, tz)}{p.photoUrl && <a href={p.photoUrl} target="_blank" aria-label="Selfie" style={{ marginLeft: 4, verticalAlign: "middle" }}><Icon name="camera" size={14} /></a>}
                    </span>
                  ))}
                </td>
                <td className="num">{r.attendance ? fmtMin(r.attendance.workedMin) : "—"}</td>
                <td className="num">{r.attendance?.lateMin || ""}</td>
                <td className="num">{r.attendance?.earlyMin || ""}</td>
                <td className="num">{r.attendance?.overtimeMin ? fmtMin(r.attendance.overtimeMin) : ""}</td>
                <td className="num muted">{r.attendance?.unapprovedOvertimeMin ? fmtMin(r.attendance.unapprovedOvertimeMin) : ""}</td>
                <td>{r.attendance ? <StatusBadge status={r.attendance.status} label={t(`att.${r.attendance.status}`)} /> : <StatusBadge status="SCHEDULED" label={t("att.SCHEDULED")} />}{r.attendance?.locked && <span className="badge info">locked</span>}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={11} className="muted">{t("common.none")}</td></tr>}
          </tbody>
        </table>
      </div>
      {canCorrect && (
        <div className="grid grid-2" style={{ marginTop: 16 }}>
          <div className="card">
            <h2>Correct a team member&apos;s record</h2>
            <p className="muted">Goes through Line Manager → Department Manager approval. Locked periods need HR.</p>
            <ActionForm action={correctionForEmployee} resetOnSuccess>
              <div className="form-grid">
                <label>{t("common.employee")}<select name="employeeId">{team.filter((e) => e.id !== user.employeeId).map((e) => <option key={e.id} value={e.id}>{e.nameEn} #{e.employeeNo}</option>)}</select></label>
                <label>{t("common.date")}<input type="date" name="date" max={today} required /></label>
                {[0, 1].map((i) => (
                  <label key={i}>Punch {i + 1}
                    <span className="row"><select name={`ptype${i}`} defaultValue={i ? "OUT" : "IN"}><option>IN</option><option>OUT</option></select><input type="time" name={`time${i}`} /><label className="inline"><input type="checkbox" name={`next${i}`} /> +1d</label></span>
                  </label>
                ))}
              </div>
              <label style={{ marginTop: 8 }}>{t("common.reason")}<input name="reason" required /></label>
              <div className="form-actions"><button className="primary" type="submit">{t("common.submit")}</button></div>
            </ActionForm>
          </div>
          <div className="card">
            <h2>Recalculate</h2>
            <p className="muted">Re-runs late / early / overtime for the filtered range (locked records are skipped).</p>
            <ActionForm action={recalc}>
              <input type="hidden" name="from" value={from} />
              <input type="hidden" name="to" value={to} />
              <input type="hidden" name="dept" value={sp.dept ?? ""} />
              <button type="submit">Recalculate {from} → {to}</button>
            </ActionForm>
          </div>
        </div>
      )}
    </>
  );
}
