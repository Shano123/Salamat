"use server";
import { randomBytes } from "node:crypto";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { ActionState, bool, num, optStr, run, str } from "@/lib/actions";
import { db } from "@/lib/db";

export async function saveLocation(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission("locations.edit");
    const id = optStr(fd, "id");
    const data = {
      name: str(fd, "name"),
      nameAr: optStr(fd, "nameAr"),
      address: optStr(fd, "address"),
      lat: num(fd, "lat"),
      lng: num(fd, "lng"),
      geofenceM: num(fd, "geofenceM", 200),
      timezone: str(fd, "timezone") || "Asia/Riyadh",
      requireSelfie: bool(fd, "requireSelfie"),
      requireGeofence: bool(fd, "requireGeofence"),
    };
    if (!data.name) throw new Error("Name is required.");
    if (Math.abs(data.lat) > 90 || Math.abs(data.lng) > 180) throw new Error("Invalid coordinates.");
    if (data.geofenceM < 20 || data.geofenceM > 5000) throw new Error("Geofence radius must be 20–5000 m.");
    try {
      new Intl.DateTimeFormat("en", { timeZone: data.timezone });
    } catch {
      throw new Error("Unknown timezone.");
    }
    if (id) {
      const before = await db.location.findUniqueOrThrow({ where: { id } });
      const after = await db.location.update({ where: { id }, data });
      await audit(db, user, "Location", id, "UPDATE", before, after);
    } else {
      const created = await db.location.create({ data });
      await audit(db, user, "Location", created.id, "CREATE", null, created);
    }
    return "Branch saved.";
  }, "/locations");
}

export async function saveDevice(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission("locations.edit");
    const kind = str(fd, "kind") === "KIOSK" ? "KIOSK" : "FINGERPRINT";
    const d = await db.device.create({
      data: { name: str(fd, "name"), brand: str(fd, "brand") || "ZKTeco", serialNo: str(fd, "serialNo"), kind, locationId: str(fd, "locationId"), apiToken: randomBytes(24).toString("hex") },
    });
    await audit(db, user, "Device", d.id, "CREATE", null, { ...d, apiToken: "***" });
    return "Device registered.";
  }, "/locations");
}

export async function rotateDeviceToken(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission("locations.edit");
    const id = str(fd, "id");
    await db.device.update({ where: { id }, data: { apiToken: randomBytes(24).toString("hex") } });
    await audit(db, user, "Device", id, "ROTATE_TOKEN");
    return "New token issued; update the device connector or kiosk link.";
  }, "/locations");
}

export async function deleteDevice(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requirePermission("locations.edit");
    const id = str(fd, "id");
    const before = await db.device.findUniqueOrThrow({ where: { id } });
    await db.punch.updateMany({ where: { deviceId: id }, data: { deviceId: null } });
    await db.device.delete({ where: { id } });
    await audit(db, user, "Device", id, "DELETE", { ...before, apiToken: "***" }, null);
    return "Device removed.";
  }, "/locations");
}
