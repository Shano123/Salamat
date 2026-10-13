import Link from "next/link";
import { Forbidden, PageHeader } from "@/components/ui";
import { pageGuard } from "@/lib/auth";
import { db } from "@/lib/db";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

const PAGE = 100;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ entity?: string; id?: string; actor?: string; page?: string }> }) {
  const user = await pageGuard("audit.view");
  const { t } = await getT();
  if (!user) return <Forbidden message={t("common.forbidden")} />;
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.page ?? 0));
  const where = {
    ...(sp.entity ? { entity: sp.entity } : {}),
    ...(sp.id ? { entityId: sp.id } : {}),
    ...(sp.actor ? { actorId: sp.actor } : {}),
  };
  const [rows, entities] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: page * PAGE, take: PAGE + 1 }),
    db.auditLog.findMany({ distinct: ["entity"], select: { entity: true }, orderBy: { entity: "asc" } }),
  ]);
  const actors = new Map((await db.user.findMany({ where: { id: { in: rows.map((r) => r.actorId).filter(Boolean) as string[] } } })).map((u) => [u.id, u.email]));
  const qs = (o: Record<string, string>) => new URLSearchParams({ ...(sp.entity ? { entity: sp.entity } : {}), ...(sp.id ? { id: sp.id } : {}), ...(sp.actor ? { actor: sp.actor } : {}), ...o }).toString();
  const short = (v: unknown) => {
    if (v == null) return "";
    const s = JSON.stringify(v);
    return s.length > 300 ? `${s.slice(0, 300)}…` : s;
  };
  return (
    <>
      <PageHeader title={t("nav.audit")} subtitle="Every create / edit / delete on roster, attendance and permissions. Entries are never deleted." />
      <form className="row" style={{ marginBottom: 12 }}>
        <select name="entity" defaultValue={sp.entity ?? ""}><option value="">All entities</option>{entities.map((e) => <option key={e.entity}>{e.entity}</option>)}</select>
        <input name="id" placeholder="Entity id" defaultValue={sp.id} />
        <button type="submit">{t("common.filter")}</button>
        {(sp.entity || sp.id || sp.actor) && <Link href="/audit">Clear</Link>}
      </form>
      <div className="table-wrap">
        <table>
          <thead><tr><th>When</th><th>Actor</th><th>Entity</th><th>Action</th><th>Reason</th><th>Before → After</th></tr></thead>
          <tbody>
            {rows.slice(0, PAGE).map((r) => (
              <tr key={r.id}>
                <td style={{ whiteSpace: "nowrap" }}>{r.createdAt.toISOString().slice(0, 19).replace("T", " ")}</td>
                <td>{r.actorId ? <Link href={`/audit?${qs({ actor: r.actorId, page: "0" })}`}>{actors.get(r.actorId) ?? r.actorId}</Link> : "system"}<div className="muted" style={{ fontSize: 11 }}>{r.actorRole}</div></td>
                <td><Link href={`/audit?entity=${r.entity}&id=${r.entityId}`}>{r.entity}</Link><div className="muted" style={{ fontSize: 11 }}>{r.entityId}</div></td>
                <td><span className="badge">{r.action}</span></td>
                <td>{r.reason}</td>
                <td style={{ fontSize: 11, fontFamily: "monospace", maxWidth: 520, wordBreak: "break-all" }}>
                  {r.before != null && <div className="muted">− {short(r.before)}</div>}
                  {r.after != null && <div>+ {short(r.after)}</div>}
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={6} className="muted">{t("common.none")}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        {page > 0 && <Link className="btn" href={`/audit?${qs({ page: String(page - 1) })}`}>← {t("common.prev")}</Link>}
        {rows.length > PAGE && <Link className="btn" href={`/audit?${qs({ page: String(page + 1) })}`}>{t("common.next")} →</Link>}
      </div>
    </>
  );
}
