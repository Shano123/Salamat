// Approval chain: Line Manager (L1) → Department Manager (L2).
// Swaps first need the colleague's acceptance. Locked-period corrections and leave balance overrides end with HR.

export type RequestTypeName = "SWAP" | "LEAVE" | "CORRECTION" | "OVERTIME" | "SHIFT_CHANGE";
export type RequestStatusName =
  | "PENDING_PEER"
  | "PENDING_L1"
  | "PENDING_L2"
  | "PENDING_HR"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED";
export type ApprovalLevel = "PEER" | "L1" | "L2" | "HR";

export interface ChainContext {
  type: RequestTypeName;
  /** User id of the requester's line manager, if they have one with a login. */
  lineManagerUserId: string | null;
  requesterUserId: string | null;
  /**
   * True when HR must give the final step: corrections to locked periods or outside the
   * correction window, and leave that exceeds the employee's balance.
   */
  needsHr: boolean;
}

export function initialStatus(ctx: ChainContext): RequestStatusName {
  if (ctx.type === "SWAP") return "PENDING_PEER";
  return firstManagerStep(ctx);
}

function firstManagerStep(ctx: ChainContext): RequestStatusName {
  const hasL1 = !!ctx.lineManagerUserId && ctx.lineManagerUserId !== ctx.requesterUserId;
  return hasL1 ? "PENDING_L1" : "PENDING_L2";
}

export function levelOf(status: RequestStatusName): ApprovalLevel | null {
  switch (status) {
    case "PENDING_PEER":
      return "PEER";
    case "PENDING_L1":
      return "L1";
    case "PENDING_L2":
      return "L2";
    case "PENDING_HR":
      return "HR";
    default:
      return null;
  }
}

export function nextStatus(
  current: RequestStatusName,
  decision: "APPROVED" | "REJECTED",
  ctx: ChainContext,
  opts: { hrOverride?: boolean } = {},
): RequestStatusName {
  if (!levelOf(current)) throw new Error(`Request is already ${current}.`);
  if (decision === "REJECTED") return "REJECTED";
  if (opts.hrOverride) return "APPROVED";
  switch (current) {
    case "PENDING_PEER":
      return firstManagerStep(ctx);
    case "PENDING_L1":
      return "PENDING_L2";
    case "PENDING_L2":
      return ctx.needsHr ? "PENDING_HR" : "APPROVED";
    case "PENDING_HR":
      return "APPROVED";
    default:
      return current;
  }
}

export interface Approver {
  userId: string;
  role: string;
  /** Departments the approver manages (including active delegations). "ALL" for HR Admin. */
  departments: string[] | "ALL";
  /** Employee ids the approver line-manages (including active delegations). */
  teamEmployeeIds: string[];
  employeeId: string | null;
}

export interface PendingRequest {
  status: RequestStatusName;
  requesterId: string;
  requesterUserId: string | null;
  targetEmployeeId: string | null;
  departmentId: string;
}

/** Returns why the approver cannot act, or null if they can. */
export function cannotActReason(a: Approver, r: PendingRequest): string | null {
  const level = levelOf(r.status);
  if (!level) return "This request is closed.";
  if (a.userId === r.requesterUserId || (a.employeeId && a.employeeId === r.requesterId)) {
    return "Nobody can approve their own request.";
  }
  if (a.role === "HR_ADMIN" || a.role === "SUPER_ADMIN") return null; // HR override at any level, logged.
  switch (level) {
    case "PEER":
      return a.employeeId && a.employeeId === r.targetEmployeeId ? null : "Waiting for the colleague to accept.";
    case "L1":
      return a.teamEmployeeIds.includes(r.requesterId) ||
        (a.role === "DEPT_MANAGER" && a.departments !== "ALL" && a.departments.includes(r.departmentId))
        ? null
        : "Only the line manager can approve at level 1.";
    case "L2":
      return a.role === "DEPT_MANAGER" && (a.departments === "ALL" || a.departments.includes(r.departmentId))
        ? null
        : "Only the department manager can give final approval.";
    case "HR":
      return "Only HR can give this final approval.";
  }
}

export const ESCALATION_HOURS = 48;

export function isOverdue(updatedAt: Date, now: Date): boolean {
  return now.getTime() - updatedAt.getTime() > ESCALATION_HOURS * 3600_000;
}
