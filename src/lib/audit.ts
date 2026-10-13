import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import type { CurrentUser } from "./auth";

type Tx = Prisma.TransactionClient | typeof db;

const json = (v: unknown) => (v === undefined || v === null ? Prisma.JsonNull : (JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue));

/** Every create / edit / delete on roster, attendance and permissions is logged and never deleted. */
export async function audit(
  tx: Tx,
  actor: Pick<CurrentUser, "id" | "role"> | null,
  entity: string,
  entityId: string,
  action: string,
  before?: unknown,
  after?: unknown,
  reason?: string | null,
) {
  await tx.auditLog.create({
    data: {
      actorId: actor?.id ?? null,
      actorRole: actor?.role ?? "SYSTEM",
      entity,
      entityId,
      action,
      before: json(before),
      after: json(after),
      reason: reason ?? null,
    },
  });
}
