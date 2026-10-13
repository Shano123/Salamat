import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { hijri, minutesToHHMM, addDays, dateRange, localDateISO, monthRange, parseDateISO, toDateISO, weekStartOf } from "@/lib/domain/time";
import { getT } from "@/lib/i18n/server";
import { approvedLeave } from "@/lib/services/attendance";
import { getRules } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function MySchedule({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const user = await requireUser();
  const { t, locale } = await getT();
  if (!user.employeeId) return <p className="muted">Your account is not linked to an employee.</p>;
  const rules = await getRules();
  const today = localDateISO(new Date(), rules.timezone);
  const sp = await searchParams;
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? `${sp.month}-01` : today;
  const { from, to } = monthRange(month);
  const gridFrom = weekStartOf(from);
  const gridTo = addDays(weekStartOf(to), 6);

  const [mine, leave, teamToday] = await Promise.all([
    db.shiftAssignment.findMany({
      where: { employeeId: user.employeeId, status: "PUBLISHED", date: { gte: parseDateISO(gridFrom), lte: parseDateISO(gridTo) } },
      include: { template: true, department: true, location: true },
    }),
    approvedLeave([user.employeeId], gridFrom, gridTo),
    db.shiftAssignment.findMany({
      where: { status: "PUBLISHED", date: parseDateISO(today), departmentId: user.homeDepartmentId ?? "__", template: { type: { not: "OFF" } } },
      include: { employee: true, template: true },
      orderBy: { template: { startMin: "asc" } },
    }),
  ]);
  const byDate = new Map(mine.map((a) => [toDateISO(a.date), a]));
  const days = dateRange(gridFrom, gridTo);
  const prev = monthRange(addDays(from, -1)).from.slice(0, 7);
  const next = addDays(to, 1).slice(0, 7);
  const dow = locale === "ar" ? ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"] : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <>
      <PageHeader title={t("nav.mySchedule")} subtitle={`${from.slice(0, 7)} · ${hijri(from, locale)} – ${hijri(to, locale)}`}>
        <Link className="btn" href={`?month=${prev}`}>← {t("common.prev")}</Link>
        <Link className="btn" href="?">{t("common.today")}</Link>
        <Link className="btn" href={`?month=${next}`}>{t("common.next")} →</Link>
      </PageHeader>
      <div className="grid" style={{ gridTemplateColumns: "minmax(0, 3fr) minmax(260px, 1fr)" }}>
        <div className="table-wrap">
          <table style={{ tableLayout: "fixed" }}>
            <thead><tr>{dow.map((d) => <th key={d}>{d}</th>)}</tr></thead>
            <tbody>
              {Array.from({ length: days.length / 7 }, (_, w) => (
                <tr key={w}>
                  {days.slice(w * 7, w * 7 + 7).map((d) => {
                    const a = byDate.get(d);
                    const onLeave = leave.some((l) => d >= l.from && d <= l.to);
                    return (
                      <td key={d} style={{ height: 76, verticalAlign: "top", opacity: d < from || d > to ? 0.45 : 1, background: d === today ? "var(--primary-soft)" : undefined }}>
                        <small className="muted" title={hijri(d, locale)}>{d.slice(8)}</small>
                        {onLeave && <div><span className="chip leave">Leave</span></div>}
                        {a && (
                          <div title={`${a.template.name} · ${a.department.nameEn}`}>
                            <span className="chip" style={{ background: a.template.color }}>{a.template.code}</span>
                            {a.template.type !== "OFF" && (
                              <div><small>{minutesToHHMM(a.template.startMin)}–{minutesToHHMM(a.template.endMin)}</small></div>
                            )}
                            {a.departmentId !== user.homeDepartmentId && <small className="badge info">{a.department.nameEn}</small>}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3>Working with me today</h3>
          <table>
            <tbody>
              {teamToday.map((a) => (
                <tr key={a.id}>
                  <td>{locale === "ar" ? a.employee.nameAr : a.employee.nameEn}</td>
                  <td><span className="chip" style={{ background: a.template.color }}>{a.template.code}</span></td>
                </tr>
              ))}
              {!teamToday.length && <tr><td className="muted">Nobody scheduled today.</td></tr>}
            </tbody>
          </table>
          <div className="stack" style={{ marginTop: 12 }}>
            <Link href="/requests?new=SWAP">{t("req.swap")} →</Link>
            <Link href="/open-shifts">{t("nav.openShifts")} →</Link>
          </div>
        </div>
      </div>
    </>
  );
}
