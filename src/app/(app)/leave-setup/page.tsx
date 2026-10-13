import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { Forbidden, PageHeader } from "@/components/ui";
import { deleteHoliday, grantEntitlements, runAccrual, saveHoliday, saveLeaveType, setBalance } from "@/app/actions/leave";
import { pageGuard } from "@/lib/auth";
import { db } from "@/lib/db";
import { toDateISO } from "@/lib/domain/time";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function LeaveSetupPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const user = await pageGuard("rules.edit");
  const { t } = await getT();
  if (!user) return <Forbidden message={t("common.forbidden")} />;
  const sp = await searchParams;
  const year = new Date().getFullYear();
  const [types, holidays, locations] = await Promise.all([
    db.leaveType.findMany({ orderBy: { nameEn: "asc" } }),
    db.holiday.findMany({ where: { date: { gte: new Date(`${year - 1}-12-01`) } }, include: { location: true }, orderBy: { date: "asc" } }),
    db.location.findMany({ orderBy: { name: "asc" } }),
  ]);
  const editing = types.find((x) => x.id === sp.edit);
  return (
    <>
      <PageHeader title={t("nav.leaveSetup")} />
      <div className="grid grid-2">
        <div className="card">
          <h2>Leave types</h2>
          <table>
            <thead><tr><th>{t("common.code")}</th><th>{t("common.name")}</th><th className="num">Days / yr</th><th className="num">Accrual / mo</th><th>Flags</th><th /></tr></thead>
            <tbody>
              {types.map((x) => (
                <tr key={x.id}>
                  <td>{x.code}</td><td>{x.nameEn}<div className="muted" dir="rtl">{x.nameAr}</div></td>
                  <td className="num">{x.annualDays}</td><td className="num">{x.accrualPerMonth || ""}</td>
                  <td style={{ fontSize: 12 }}>{[x.paid ? "paid" : "unpaid", x.requiresAttachment && "attachment", x.isToil && "time off in lieu"].filter(Boolean).join(" · ")}</td>
                  <td><Link className="btn small" href={`/leave-setup?edit=${x.id}`}>{t("common.edit")}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
          <h3 style={{ marginTop: 16 }}>{editing ? `${t("common.edit")} ${editing.code}` : "Add leave type"}</h3>
          <ActionForm action={saveLeaveType} key={editing?.id ?? "new"} resetOnSuccess={!editing}>
            {editing && <input type="hidden" name="id" value={editing.id} />}
            <div className="form-grid">
              <label>{t("common.code")}<input name="code" defaultValue={editing?.code} required /></label>
              <label>Name<input name="nameEn" defaultValue={editing?.nameEn} required /></label>
              <label>الاسم<input name="nameAr" dir="rtl" defaultValue={editing?.nameAr} required /></label>
              <label>Days per year<input type="number" step="0.5" name="annualDays" defaultValue={editing?.annualDays ?? 0} /></label>
              <label>Accrual per month<input type="number" step="0.01" name="accrualPerMonth" defaultValue={editing?.accrualPerMonth ?? 0} /></label>
            </div>
            <div className="row" style={{ marginTop: 8 }}>
              <label className="inline"><input type="checkbox" name="paid" defaultChecked={editing?.paid ?? true} /> Paid</label>
              <label className="inline"><input type="checkbox" name="requiresAttachment" defaultChecked={editing?.requiresAttachment} /> Requires attachment</label>
              <label className="inline"><input type="checkbox" name="isToil" defaultChecked={editing?.isToil} /> Uses time-off-in-lieu balance</label>
            </div>
            <div className="form-actions"><button className="primary" type="submit">{t("common.save")}</button></div>
          </ActionForm>
        </div>
        <div className="stack">
          <div className="card">
            <h2>Balances</h2>
            <ActionForm action={grantEntitlements}>
              <div className="row"><input type="number" name="year" defaultValue={year} style={{ width: 100 }} /><button type="submit">Create balances for all active employees</button></div>
            </ActionForm>
            <ActionForm action={runAccrual}>
              <div className="row" style={{ marginTop: 8 }}>
                <input type="number" name="year" defaultValue={year} style={{ width: 100 }} />
                <select name="month" defaultValue={String(new Date().getMonth() + 1).padStart(2, "0")}>{Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map((m) => <option key={m}>{m}</option>)}</select>
                <button type="submit">Run monthly accrual</button>
              </div>
            </ActionForm>
            <h3 style={{ marginTop: 16 }}>Set one employee&apos;s entitlement</h3>
            <ActionForm action={setBalance} resetOnSuccess>
              <div className="form-grid">
                <label>Employee no<input name="employeeNo" required /></label>
                <label>{t("common.type")}<select name="leaveTypeId">{types.map((x) => <option key={x.id} value={x.id}>{x.nameEn}</option>)}</select></label>
                <label>Year<input type="number" name="year" defaultValue={year} /></label>
                <label>Entitled days<input type="number" step="0.5" name="entitled" required /></label>
                <label>{t("common.reason")}<input name="reason" /></label>
              </div>
              <div className="form-actions"><button type="submit">{t("common.save")}</button></div>
            </ActionForm>
          </div>
          <div className="card">
            <h2>Public holidays</h2>
            <ActionForm action={saveHoliday} resetOnSuccess>
              <div className="form-grid">
                <label>{t("common.from")}<input type="date" name="date" required /></label>
                <label>{t("common.to")}<input type="date" name="to" /></label>
                <label>{t("common.name")}<input name="name" required placeholder="Eid al-Fitr" /></label>
                <label>{t("common.location")}<select name="locationId"><option value="">All branches</option>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></label>
              </div>
              <div className="form-actions"><button type="submit">{t("common.create")}</button></div>
            </ActionForm>
            <table style={{ marginTop: 12 }}>
              <tbody>
                {holidays.map((h) => (
                  <tr key={h.id}>
                    <td>{toDateISO(h.date)}</td><td>{h.name}</td><td className="muted">{h.location?.name ?? "All branches"}</td>
                    <td><ActionForm action={deleteHoliday}><input type="hidden" name="id" value={h.id} /><button className="small danger">×</button></ActionForm></td>
                  </tr>
                ))}
                {!holidays.length && <tr><td className="muted">{t("common.none")}</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
