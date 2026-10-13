import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { SelectAll } from "@/components/SelectAll";
import { Forbidden, PageHeader, StatusBadge } from "@/components/ui";
import { decide } from "@/app/actions/requests";
import { pageGuard } from "@/lib/auth";
import { db } from "@/lib/db";
import { cannotActReason, isOverdue, RequestStatusName } from "@/lib/domain/approval";
import { getT } from "@/lib/i18n/server";
import { describeRequests } from "@/lib/services/requestView";

export const dynamic = "force-dynamic";

export default async function Inbox({ searchParams }: { searchParams: Promise<{ type?: string; dept?: string; overdue?: string; id?: string }> }) {
  const user = await pageGuard("requests.approve");
  const { t, locale } = await getT();
  if (!user) return <Forbidden message={t("common.forbidden")} />;
  const sp = await searchParams;

  const scope =
    user.departments === "ALL"
      ? {}
      : { OR: [{ departmentId: { in: user.departments } }, { requesterId: { in: user.teamEmployeeIds } }] };
  const all = await db.request.findMany({
    where: {
      status: { in: ["PENDING_L1", "PENDING_L2", "PENDING_HR"] },
      ...scope,
      ...(sp.type ? { type: sp.type as never } : {}),
      ...(sp.dept ? { departmentId: sp.dept } : {}),
      ...(sp.id ? { id: sp.id } : {}),
    },
    include: { requester: { include: { user: true } }, department: true, approvals: { include: { approver: true } } },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
  const now = new Date();
  const rows = all
    .map((r) => ({
      r,
      blocked: cannotActReason(
        { userId: user.id, role: user.role, departments: user.departments, teamEmployeeIds: user.teamEmployeeIds, employeeId: user.employeeId },
        { status: r.status as RequestStatusName, requesterId: r.requesterId, requesterUserId: r.requester.user?.id ?? null, targetEmployeeId: r.targetEmployeeId, departmentId: r.departmentId },
      ),
      overdue: isOverdue(r.updatedAt, now),
    }))
    .filter((x) => !sp.overdue || x.overdue);
  const desc = await describeRequests(rows.map((x) => x.r));
  const depts = [...new Map(all.map((r) => [r.departmentId, r.department.nameEn])).entries()];
  const actionable = rows.filter((x) => !x.blocked);
  const isHr = user.role === "HR_ADMIN" || user.role === "SUPER_ADMIN";

  return (
    <>
      <PageHeader title={t("nav.inbox")} subtitle={`${actionable.length} waiting for you · ${rows.length - actionable.length} waiting for others`} />
      <form className="row" style={{ marginBottom: 12 }}>
        <select name="type" defaultValue={sp.type ?? ""}>
          <option value="">{t("common.type")}: {t("common.all")}</option>
          {["LEAVE", "SWAP", "SHIFT_CHANGE", "CORRECTION", "OVERTIME"].map((x) => <option key={x} value={x}>{x.replace("_", " ").toLowerCase()}</option>)}
        </select>
        <select name="dept" defaultValue={sp.dept ?? ""}>
          <option value="">{t("common.department")}: {t("common.all")}</option>
          {depts.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
        </select>
        <label className="inline"><input type="checkbox" name="overdue" value="1" defaultChecked={!!sp.overdue} /> Older than 48h</label>
        <button type="submit">{t("common.filter")}</button>
        {(sp.type || sp.dept || sp.overdue || sp.id) && <Link href="/inbox">Clear</Link>}
      </form>
      {isHr && <div className="alert info" style={{ marginBottom: 12 }}>As HR you can approve at any level (override). Every override is logged with your name.</div>}
      <ActionForm action={decide}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th><SelectAll /></th><th>{t("common.employee")}</th><th>{t("common.type")}</th><th>Details</th><th>{t("common.status")}</th><th>Submitted</th></tr>
            </thead>
            <tbody>
              {rows.map(({ r, blocked, overdue }) => (
                <tr key={r.id}>
                  <td>{!blocked && <input type="checkbox" name="id" value={r.id} defaultChecked={sp.id === r.id} aria-label="Select" />}</td>
                  <td>{locale === "ar" ? r.requester.nameAr : r.requester.nameEn}<div className="muted">{r.department.nameEn}</div></td>
                  <td>{r.type.replace("_", " ").toLowerCase()}</td>
                  <td>
                    {desc.get(r.id)}
                    {r.reason && <div className="muted">“{r.reason}”</div>}
                    {(r.payload as { attachmentUrl?: string }).attachmentUrl && <div><a href={(r.payload as { attachmentUrl: string }).attachmentUrl} target="_blank">Attachment</a></div>}
                    {r.approvals.map((a) => <div key={a.id} className="muted" style={{ fontSize: 12 }}>{a.level}: {a.decision.toLowerCase()} by {a.approver.email}</div>)}
                  </td>
                  <td><StatusBadge status={r.status} label={t(`req.status.${r.status}`)} />{blocked && <div className="muted" style={{ fontSize: 12 }}>{blocked}</div>}</td>
                  <td>{r.createdAt.toISOString().slice(0, 16).replace("T", " ")}{overdue && <div><span className="badge danger">overdue</span></div>}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={6} className="muted">Inbox zero.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="form-actions">
          <input name="comment" placeholder="Comment (required to reject)" style={{ minWidth: 260 }} />
          <button className="primary" name="decision" value="APPROVED" type="submit">{t("inbox.bulkApprove")}</button>
          <button className="danger" name="decision" value="REJECTED" type="submit">{t("inbox.bulkReject")}</button>
        </div>
      </ActionForm>
    </>
  );
}
