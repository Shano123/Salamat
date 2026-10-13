import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { PageHeader } from "@/components/ui";
import { markRead } from "@/app/actions/notifications";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await requireUser();
  const { t } = await getT();
  const items = await db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <>
      <PageHeader title={t("nav.notifications")}>
        <ActionForm action={markRead}><button type="submit">Mark all read</button></ActionForm>
      </PageHeader>
      <div className="card">
        {items.map((n) => (
          <div key={n.id} className="row between" style={{ padding: "10px 0", borderBottom: "1px solid var(--border)", opacity: n.readAt ? 0.6 : 1 }}>
            <div>
              <strong>{n.title}</strong> {!n.readAt && <span className="badge info">new</span>}
              {n.body && <div className="muted">{n.body}</div>}
              <small className="muted">{n.createdAt.toISOString().slice(0, 16).replace("T", " ")}</small>
            </div>
            <div className="row">
              {n.link && <Link className="btn small" href={n.link}>Open</Link>}
              {!n.readAt && <ActionForm action={markRead}><input type="hidden" name="id" value={n.id} /><button className="small">✓</button></ActionForm>}
            </div>
          </div>
        ))}
        {!items.length && <p className="muted">{t("common.none")}</p>}
      </div>
    </>
  );
}
