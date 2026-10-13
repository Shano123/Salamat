import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "../db";
import { toDateISO } from "../domain/time";

type Tx = Prisma.TransactionClient | typeof db;

export async function lockedRanges(tx: Tx = db): Promise<Array<{ from: string; to: string }>> {
  const periods = await tx.attendancePeriod.findMany({ where: { status: "LOCKED" } });
  return periods.map((p) => ({ from: toDateISO(p.startDate), to: toDateISO(p.endDate) }));
}

export async function isDateLocked(date: string, tx: Tx = db): Promise<boolean> {
  const p = await tx.attendancePeriod.findFirst({
    where: { status: "LOCKED", startDate: { lte: new Date(date) }, endDate: { gte: new Date(date) } },
  });
  return !!p;
}
