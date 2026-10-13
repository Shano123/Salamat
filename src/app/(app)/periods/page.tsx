import { ActionForm } from "@/components/ActionForm";
import { Forbidden, PageHeader, StatusBadge } from "@/components/ui";
import { createPeriod, lockPeriod, reopenPeriod } from "@/app/actions/periods";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/domain/permissions";
import { addDays, localDateISO, monthRange, toDateISO } from "@/lib/domain/time";
import { getT } from "@/lib/i18n/server";
import { getRules } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function PeriodsPage() {
  const user = await requireUser();
  const { t } = await getT();
  if (!can(user.role, "periods.lock") && user.role !== "HR_VIEWER") return <Forbidden message={t("common.forbidden")} />;
  const editable = can(user.role, "periods.lock");
  const rules = await getRules();
  const periods = await db.attendancePeriod.findMany({ orderBy: { startDate: "desc" } });
  const lockers = new Map((await db.user.findMany({ where: { id: { in: periods.map((p) => p.lockedById).filter(Boolean) as string[] } } })).map((u) => [u.id, u.email]));
  const last = periods[0] ? addDays(toDateISO(periods[0].endDate), 1) : monthRange(localDateISO(new Date(), rules.timezone)).from;
  const next = monthRange(last);

  return (
    <>
      <PageHeader title={t("nav.periods")} subtitle="Lock a pay period once every correction is approved. Locked records are read-only; reopening requires HR Admin and is logged." />
      {editable && (
        <div className="card" style={{ marginBottom: 16 }}>
          <ActionForm action={createPeriod}>
            <div className="form-grid">
              <label>Start<input type="date" name="start" defaultValue={last} required /></label>
              <label>End<input type="date" name="end" defaultValue={next.to} required /></label>
              <button type="submit">{t("common.create")} period</button>
            </div>
          </ActionForm>
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead><tr><th>{t("common.from")}</th><th>{t("common.to")}</th><th>{t("common.status")}</th><th>Locked by</th><th>{t("common.actions")}</th></tr></thead>
          <tbody>
            {periods.map((p) => (
              <tr key={p.id}>
                <td>{toDateISO(p.startDate)}</td>
                <td>{toDateISO(p.endDate)}</td>
                <td><StatusBadge status={p.status} /></td>
                <td>{p.lockedById ? `${lockers.get(p.lockedById)} · ${p.lockedAt?.toISOString().slice(0, 16).replace("T", " ")}` : "—"}</td>
                <td>
                  {editable && p.status === "OPEN" && (
                    <ActionForm action={lockPeriod} confirm="Lock this period? Records become read-only.">
                      <input type="hidden" name="id" value={p.id} /><button className="primary small">Lock</button>
                    </ActionForm>
                  )}
                  {editable && p.status === "LOCKED" && (
                    <ActionForm action={reopenPeriod}>
                      <input type="hidden" name="id" value={p.id} />
                      <div className="row"><input name="reason" placeholder="Reason" required /><button className="small danger">Reopen</button></div>
                    </ActionForm>
                  )}
                  <a className="btn small" href={`/payroll?from=${toDateISO(p.startDate)}&to=${toDateISO(p.endDate)}`}>Payroll</a>
                </td>
              </tr>
            ))}
            {!periods.length && <tr><td colSpan={5} className="muted">{t("common.none")}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
