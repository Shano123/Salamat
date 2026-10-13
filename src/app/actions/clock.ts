"use server";
import { PunchType } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { recordPunch } from "@/lib/services/punch";

export interface ClockPayload {
  type: PunchType;
  lat?: number | null;
  lng?: number | null;
  selfie?: string | null;
  clientTime?: string; // ISO, for offline-queued punches
  offline?: boolean;
  deviceId?: string;
}

export async function clockPunch(p: ClockPayload): Promise<{ ok?: string; error?: string }> {
  try {
    const user = await requireUser();
    if (!user.employeeId) throw new Error("Your account is not linked to an employee.");
    if (!["IN", "OUT", "BREAK_START", "BREAK_END"].includes(p.type)) throw new Error("Invalid punch type.");
    const punch = await recordPunch({
      employeeId: user.employeeId,
      type: p.type,
      source: "MOBILE",
      lat: p.lat,
      lng: p.lng,
      selfie: p.selfie,
      offline: p.offline,
      timestamp: p.clientTime ? new Date(p.clientTime) : undefined,
      clientDeviceId: p.deviceId,
    });
    revalidatePath("/clock");
    revalidatePath("/dashboard");
    return { ok: `${p.type.replace("_", " ")} recorded at ${punch.timestamp.toISOString()}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
