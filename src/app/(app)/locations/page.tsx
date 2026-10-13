import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { Forbidden, PageHeader } from "@/components/ui";
import { deleteDevice, rotateDeviceToken, saveDevice, saveLocation } from "@/app/actions/locations";
import { pageGuard } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/domain/permissions";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function LocationsPage({ searchParams }: { searchParams: Promise<{ edit?: string; show?: string }> }) {
  const user = await pageGuard("locations.view");
  const { t } = await getT();
  if (!user) return <Forbidden message={t("common.forbidden")} />;
  const sp = await searchParams;
  const editable = can(user.role, "locations.edit");
  const locations = await db.location.findMany({ include: { devices: true, _count: { select: { departments: true } } }, orderBy: { name: "asc" } });
  const editing = locations.find((l) => l.id === sp.edit);

  return (
    <>
      <PageHeader title={t("nav.locations")} subtitle="Branches as work locations with geofence radius, selfie policy, fingerprint devices and kiosks." />
      <div className="stack">
        {locations.map((l) => (
          <div key={l.id} className="card">
            <div className="row between">
              <div>
                <h2 style={{ marginBottom: 4 }}>{l.name} {l.nameAr && <small className="muted">· {l.nameAr}</small>}</h2>
                <small className="muted">{l.address} · {l.lat.toFixed(5)}, {l.lng.toFixed(5)} · geofence {l.geofenceM} m · {l.timezone} · {l._count.departments} dept(s)</small>
                <div className="row" style={{ marginTop: 4 }}>
                  {l.requireGeofence ? <span className="badge ok">GPS geofence on</span> : <span className="badge">geofence off</span>}
                  {l.requireSelfie ? <span className="badge ok">selfie required</span> : <span className="badge">no selfie</span>}
                </div>
              </div>
              {editable && <Link className="btn small" href={`/locations?edit=${l.id}#form`}>{t("common.edit")}</Link>}
            </div>
            <table style={{ marginTop: 12 }}>
              <thead><tr><th>Device</th><th>Brand</th><th>Serial</th><th>Kind</th><th>Last seen</th>{editable && <th>Token / link</th>}{editable && <th />}</tr></thead>
              <tbody>
                {l.devices.map((d) => (
                  <tr key={d.id}>
                    <td>{d.name}</td><td>{d.brand}</td><td>{d.serialNo}</td><td>{d.kind.toLowerCase()}</td>
                    <td>{d.lastSeenAt ? d.lastSeenAt.toISOString().slice(0, 16).replace("T", " ") : <span className="badge warn">never</span>}</td>
                    {editable && (
                      <td style={{ fontSize: 12 }}>
                        {sp.show === d.id ? (
                          d.kind === "KIOSK" ? <code>/kiosk?token={d.apiToken}</code> : <code>Authorization: Bearer {d.apiToken}</code>
                        ) : (
                          <Link href={`/locations?show=${d.id}`}>Show</Link>
                        )}
                      </td>
                    )}
                    {editable && (
                      <td>
                        <div className="row">
                          <ActionForm action={rotateDeviceToken} confirm="Issue a new token? The old one stops working."><input type="hidden" name="id" value={d.id} /><button className="small">Rotate</button></ActionForm>
                          <ActionForm action={deleteDevice} confirm="Remove this device?"><input type="hidden" name="id" value={d.id} /><button className="small danger">{t("common.delete")}</button></ActionForm>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {!l.devices.length && <tr><td colSpan={7} className="muted">No devices.</td></tr>}
              </tbody>
            </table>
            {editable && (
              <details style={{ marginTop: 8 }}>
                <summary>Register a device</summary>
                <ActionForm action={saveDevice} resetOnSuccess>
                  <input type="hidden" name="locationId" value={l.id} />
                  <div className="form-grid">
                    <label>Name<input name="name" required placeholder="ER entrance" /></label>
                    <label>Brand<input name="brand" defaultValue="ZKTeco" /></label>
                    <label>Serial no<input name="serialNo" required /></label>
                    <label>Kind<select name="kind"><option value="FINGERPRINT">Fingerprint device</option><option value="KIOSK">Tablet kiosk (PIN / QR)</option></select></label>
                    <button type="submit">Register</button>
                  </div>
                </ActionForm>
              </details>
            )}
          </div>
        ))}
        {editable && (
          <div className="card" id="form">
            <h2>{editing ? `${t("common.edit")}: ${editing.name}` : "Add a branch"}</h2>
            <ActionForm action={saveLocation} key={editing?.id ?? "new"} resetOnSuccess={!editing}>
              {editing && <input type="hidden" name="id" value={editing.id} />}
              <div className="form-grid">
                <label>Name<input name="name" defaultValue={editing?.name} required /></label>
                <label>الاسم<input name="nameAr" dir="rtl" defaultValue={editing?.nameAr ?? ""} /></label>
                <label>Address<input name="address" defaultValue={editing?.address ?? ""} /></label>
                <label>Latitude<input name="lat" type="number" step="any" defaultValue={editing?.lat} required /></label>
                <label>Longitude<input name="lng" type="number" step="any" defaultValue={editing?.lng} required /></label>
                <label>Geofence radius (m)<input name="geofenceM" type="number" defaultValue={editing?.geofenceM ?? 200} /></label>
                <label>Timezone<input name="timezone" defaultValue={editing?.timezone ?? "Asia/Riyadh"} /></label>
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                <label className="inline"><input type="checkbox" name="requireGeofence" defaultChecked={editing?.requireGeofence ?? true} /> Require GPS geofence for phone clock-in</label>
                <label className="inline"><input type="checkbox" name="requireSelfie" defaultChecked={editing?.requireSelfie} /> Require selfie</label>
              </div>
              <div className="form-actions"><button className="primary" type="submit">{t("common.save")}</button>{editing && <Link className="btn" href="/locations">{t("common.cancel")}</Link>}</div>
            </ActionForm>
            <p className="muted" style={{ marginTop: 12 }}>
              Fingerprint devices: a small connector at each branch pulls logs from the device every few minutes and posts them to <code>POST /api/devices/punches</code> with the device token.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
