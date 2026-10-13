import { db } from "@/lib/db";
import { KioskClient } from "./KioskClient";

export const dynamic = "force-dynamic";

export default async function KioskPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const device = token ? await db.device.findUnique({ where: { apiToken: token }, include: { location: true } }) : null;
  return (
    <div className="kiosk">
      {device && device.kind === "KIOSK" ? (
        <KioskClient token={token!} branch={`${device.location.name} — ${device.name}`} />
      ) : (
        <div className="card">
          <h2>Kiosk not registered</h2>
          <p className="muted">Open the kiosk link from Branches &amp; devices (HR) on this tablet.</p>
        </div>
      )}
    </div>
  );
}
