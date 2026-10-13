"use server";
import { requireUser } from "@/lib/auth";
import { ActionState, run, str } from "@/lib/actions";
import { db } from "@/lib/db";

export async function markRead(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(async () => {
    const user = await requireUser();
    const id = str(fd, "id");
    await db.notification.updateMany({ where: { userId: user.id, readAt: null, ...(id ? { id } : {}) }, data: { readAt: new Date() } });
    return "Marked as read.";
  }, "/notifications");
}
