import Link from "next/link";
import { fmtMin, PageHeader, Stat, StatusBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { addDays, formatTime, localDateISO, monthRange, parseDateISO, toDateISO } from "@/lib/domain/time";
import { getT } from "@/lib/i18n/server";
import { getRules } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function MyAttendance({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requireUser();
  const { t } = await getT();
  if (!user.employeeId) return <p className="muted">Your account is not linked to an employee.</p>;
  const rules = await getRules();
  const sp = await searchParams;
  const today = localDateISO(new Date(), rules.timezone);
  const { from, to } = monthRange(sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? `${sp.month}-01` : today);
  const rows = await db.shiftAssignment.findMany({
    where: { employeeId: user.employeeId, status: "PUBLISHED", date: { gte: parseDateISO(from), lte: parseDateISO(to) } },
    include: { template: true, attendance: true },
    orderBy: { date: "asc" },
  });
  const sum = (k: "workedMin" | "lateMin" | "overtimeMin" | "earlyMin") => rows.reduce((s, r) => s + (r.attendance?.[k] ?? 0), 0);
  const prev = monthRange(addDays(from, -1)).from.slice(0, 7);
  const next = addDays(to, 1).slice(0, 7);
  return (
    <>
      <PageHeader title={t("nav.myAttendance")} subtitle={from.slice(0, 7)}>
        <Link className="btn" href={`?month=${prev}`}>← {t("common.prev")}</Link>
        <Link className="btn" href={`?month=${next}`}>{t("common.next")} →</Link>
        <Link className="btn primary" href="/requests?new=CORRECTION">{t("req.correction")}</Link>
      </PageHeader>
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat label="Worked" value={fmtMin(sum("workedMin"))} />
        <Stat label="Late (min)" value={sum("lateMin")} tone="warn" />
        <Stat label="Early leave (min)" value={sum("earlyMin")} tone="warn" />
        <Stat label="Approved overtime" value={fmtMin(sum("overtimeMin"))} tone="ok" />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>{t("common.date")}</th><th>Shift</th><th>In</th><th>Out</th><th className="num">Worked</th><th className="num">Late</th><th className="num">Early</th><th className="num">OT</th><th>{t("common.status")}</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{toDateISO(r.date)}</td>
                <td><span className="chip" style={{ background: r.template.color }}>{r.template.code}</span></td>
                <td>{r.attendance?.firstIn ? formatTime(r.attendance.firstIn, rules.timezone) : "—"}</td>
                <td>{r.attendance?.lastOut ? formatTime(r.attendance.lastOut, rules.timezone) : "—"}</td>
                <td className="num">{r.attendance ? fmtMin(r.attendance.workedMin) : "—"}</td>
                <td className="num">{r.attendance?.lateMin || ""}</td>
                <td className="num">{r.attendance?.earlyMin || ""}</td>
                <td className="num">{r.attendance?.overtimeMin ? fmtMin(r.attendance.overtimeMin) : ""}</td>
                <td>
                  {r.attendance ? <StatusBadge status={r.attendance.status} label={t(`att.${r.attendance.status}`)} /> : <StatusBadge status="SCHEDULED" label={t("att.SCHEDULED")} />}
                  {r.attendance?.missingPunch && toDateISO(r.date) <= today && (
                    <> <Link href={`/requests?new=CORRECTION&date=${toDateISO(r.date)}`}>Fix</Link></>
                  )}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={9} className="muted">No published shifts this month.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
