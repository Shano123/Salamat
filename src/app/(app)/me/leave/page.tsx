import Link from "next/link";
import { PageHeader, StatusBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { toDateISO } from "@/lib/domain/time";
import { getT } from "@/lib/i18n/server";
import { toilBalanceHours } from "@/lib/services/requests";

export const dynamic = "force-dynamic";

export default async function MyLeave() {
  const user = await requireUser();
  const { t, locale } = await getT();
  if (!user.employeeId) return <p className="muted">Your account is not linked to an employee.</p>;
  const year = new Date().getFullYear();
  const [balances, requests, holidays, toil] = await Promise.all([
    db.leaveBalance.findMany({ where: { employeeId: user.employeeId, year }, include: { leaveType: true } }),
    db.request.findMany({ where: { requesterId: user.employeeId, type: "LEAVE" }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.holiday.findMany({ where: { date: { gte: new Date(`${year}-01-01`) } }, orderBy: { date: "asc" }, include: { location: true } }),
    toilBalanceHours(db, user.employeeId),
  ]);
  const types = await db.leaveType.findMany();
  const typeName = (id: string) => {
    const lt = types.find((x) => x.id === id);
    return lt ? (locale === "ar" ? lt.nameAr : lt.nameEn) : id;
  };
  return (
    <>
      <PageHeader title={t("nav.myLeave")} subtitle={String(year)}>
        <Link className="btn primary" href="/requests?new=LEAVE">{t("req.new")}: {t("req.leave")}</Link>
      </PageHeader>
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        {balances.map((b) => (
          <div key={b.id} className="card stat">
            <span className="label">{locale === "ar" ? b.leaveType.nameAr : b.leaveType.nameEn}</span>
            <span className="value">{(b.entitled - b.used).toFixed(1)}</span>
            <small className="muted">{b.used} used of {b.entitled} days</small>
          </div>
        ))}
        <div className="card stat">
          <span className="label">Time off in lieu</span>
          <span className="value">{toil.toFixed(1)}h</span>
          <small className="muted">From approved overtime; expires per HR policy</small>
        </div>
      </div>
      <div className="grid grid-2">
        <div className="card">
          <h3>My leave requests</h3>
          <table>
            <thead><tr><th>{t("common.type")}</th><th>{t("common.from")}</th><th>{t("common.to")}</th><th className="num">Days</th><th>{t("common.status")}</th></tr></thead>
            <tbody>
              {requests.map((r) => {
                const p = r.payload as { leaveTypeId: string; from: string; to: string; days: number };
                return (
                  <tr key={r.id}>
                    <td>{typeName(p.leaveTypeId)}</td><td>{p.from}</td><td>{p.to}</td><td className="num">{p.days}</td>
                    <td><StatusBadge status={r.status} label={t(`req.status.${r.status}`)} /></td>
                  </tr>
                );
              })}
              {!requests.length && <tr><td colSpan={5} className="muted">{t("common.none")}</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="card">
          <h3>Public holidays</h3>
          <table>
            <tbody>
              {holidays.map((h) => (
                <tr key={h.id}><td>{toDateISO(h.date)}</td><td>{h.name}</td><td className="muted">{h.location?.name ?? "All branches"}</td></tr>
              ))}
              {!holidays.length && <tr><td className="muted">{t("common.none")}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
