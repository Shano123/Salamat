import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatTime, localDateISO, parseDateISO } from "@/lib/domain/time";
import { getT } from "@/lib/i18n/server";
import { suggestNextType } from "@/lib/services/punch";
import { getRules } from "@/lib/settings";
import { ClockClient } from "./ClockClient";

export const dynamic = "force-dynamic";

export default async function ClockPage() {
  const user = await requireUser();
  const { t } = await getT();
  if (!user.employeeId) return <p className="muted">Your account is not linked to an employee.</p>;
  const rules = await getRules();
  const today = localDateISO(new Date(), rules.timezone);
  const [suggested, emp, recent, todayShift] = await Promise.all([
    suggestNextType(user.employeeId),
    db.employee.findUniqueOrThrow({ where: { id: user.employeeId } }),
    db.punch.findMany({ where: { employeeId: user.employeeId }, orderBy: { timestamp: "desc" }, take: 8 }),
    db.shiftAssignment.findFirst({ where: { employeeId: user.employeeId, status: "PUBLISHED", date: parseDateISO(today) }, include: { template: true } }),
  ]);
  const anySelfie = (await db.location.count({ where: { requireSelfie: true } })) > 0;
  return (
    <>
      <PageHeader title={t("nav.clock")} subtitle={todayShift ? `Today: ${todayShift.template.code} · ${todayShift.template.name}` : "No published shift today"} />
      {emp.clockMethod === "FINGERPRINT" ? (
        <div className="alert info">HR has set you to clock in with the fingerprint device at your branch.</div>
      ) : (
        <ClockClient suggested={suggested} selfieAvailable={anySelfie} tz={rules.timezone} />
      )}
      <div className="card" style={{ maxWidth: 480, margin: "16px auto 0" }}>
        <h3>Recent punches</h3>
        <table>
          <tbody>
            {recent.map((p) => (
              <tr key={p.id}>
                <td>{localDateISO(p.timestamp, rules.timezone)}</td>
                <td>{formatTime(p.timestamp, rules.timezone)}</td>
                <td>{p.type ?? "—"}</td>
                <td className="muted">{p.source.toLowerCase()}{p.offlineQueued ? " · offline" : ""}</td>
              </tr>
            ))}
            {!recent.length && <tr><td className="muted">No punches yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
