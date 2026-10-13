import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PunchSource, PunchType } from "@prisma/client";
import { db } from "../db";
import { insideFence } from "../domain/geo";
import { addDays, localDateISO } from "../domain/time";
import { getRules } from "../settings";
import { recalcAttendance } from "./attendance";
import { isDateLocked } from "./periods";

export const MAX_DEVICES = 2;
const OFFLINE_MAX_AGE_MS = 72 * 3600_000;

export function storageDir() {
  return path.resolve(process.env.STORAGE_DIR ?? "./storage");
}

async function saveSelfie(dataUrl: string): Promise<string> {
  const m = /^data:image\/(jpeg|png|webp);base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error("Selfie must be a JPEG, PNG or WebP image.");
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > 3_000_000) throw new Error("Selfie is too large (max 3 MB).");
  const dir = path.join(storageDir(), "selfies");
  await mkdir(dir, { recursive: true });
  const name = `${randomUUID()}.${m[1] === "jpeg" ? "jpg" : m[1]}`;
  await writeFile(path.join(dir, name), buf);
  return `/api/files/selfies/${name}`;
}

export interface PunchInput {
  employeeId: string;
  type: PunchType | null;
  source: PunchSource;
  timestamp?: Date; // offline punches keep their original time
  offline?: boolean;
  lat?: number | null;
  lng?: number | null;
  selfie?: string | null;
  clientDeviceId?: string | null;
  deviceId?: string | null; // fingerprint / kiosk device row id
}

/** Records a punch after method, device, geofence and selfie checks; then recalculates attendance. */
export async function recordPunch(input: PunchInput) {
  const rules = await getRules();
  const now = new Date();
  const emp = await db.employee.findUniqueOrThrow({ where: { id: input.employeeId } });
  if (emp.status !== "ACTIVE") throw new Error("This employee is not active.");

  let timestamp = now;
  if (input.offline && input.timestamp) {
    const age = now.getTime() - input.timestamp.getTime();
    if (age < -120_000 || age > OFFLINE_MAX_AGE_MS) throw new Error("Offline punch time is out of range.");
    timestamp = input.timestamp;
  } else if (input.timestamp && input.source === "DEVICE") {
    timestamp = input.timestamp;
  }

  if (input.source === "MOBILE") {
    if (emp.clockMethod === "FINGERPRINT") throw new Error("HR has set you to clock in by fingerprint only.");
    if (input.clientDeviceId) {
      if (!emp.boundDevices.includes(input.clientDeviceId)) {
        if (emp.boundDevices.length >= MAX_DEVICES) throw new Error(`You can use at most ${MAX_DEVICES} phones. Ask HR to reset your devices.`);
        await db.employee.update({ where: { id: emp.id }, data: { boundDevices: { push: input.clientDeviceId } } });
      }
    }
  }
  let photoUrl: string | null = null;
  if (input.source === "MOBILE") {
    const locations = await db.location.findMany();
    if (input.lat == null || input.lng == null) {
      if (locations.some((l) => l.requireGeofence)) throw new Error("Location is required to clock in.");
    } else {
      const fence = insideFence(input.lat, input.lng, locations);
      const needs = locations.filter((l) => l.requireGeofence);
      if (!fence && needs.length) throw new Error("You are outside every branch geofence.");
      if (fence?.requireSelfie && !input.selfie) throw new Error(`${fence.name} requires a selfie.`);
    }
    if (input.selfie) photoUrl = await saveSelfie(input.selfie);
  }

  const date = localDateISO(timestamp, rules.timezone);
  if (await isDateLocked(date)) throw new Error("This date is in a locked pay period.");

  const existing = await db.punch.findFirst({ where: { employeeId: emp.id, timestamp, type: input.type } });
  const punch =
    existing ??
    (await db.punch.create({
      data: {
        employeeId: emp.id,
        timestamp,
        type: input.type,
        source: input.source,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        photoUrl,
        deviceId: input.deviceId ?? null,
        offlineQueued: !!input.offline,
      },
    }));
  await recalcAttendance(emp.id, addDays(date, -1), date);
  return punch;
}

/** Suggests the next punch type from the last punch in the past 20 hours. */
export async function suggestNextType(employeeId: string): Promise<PunchType> {
  const last = await db.punch.findFirst({
    where: { employeeId, timestamp: { gte: new Date(Date.now() - 20 * 3600_000) } },
    orderBy: { timestamp: "desc" },
  });
  if (!last) return "IN";
  if (last.type === "IN" || last.type === "BREAK_END") return "OUT";
  if (last.type === "BREAK_START") return "BREAK_END";
  return "IN";
}
