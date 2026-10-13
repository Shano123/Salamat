import Link from "next/link";

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {children && <div className="row">{children}</div>}
    </div>
  );
}

export function Forbidden({ message = "You do not have access to this page." }: { message?: string }) {
  return (
    <div className="card">
      <h2>403</h2>
      <p className="muted">{message}</p>
      <Link href="/dashboard">Back to dashboard</Link>
    </div>
  );
}

export function Empty({ children = "Nothing here yet." }: { children?: React.ReactNode }) {
  return <p className="muted" style={{ padding: 12 }}>{children}</p>;
}

const STATUS_TONE: Record<string, string> = {
  PRESENT: "ok",
  APPROVED: "ok",
  PUBLISHED: "ok",
  OPEN: "ok",
  ACTIVE: "ok",
  APPLIED: "ok",
  LATE: "warn",
  EARLY_LEAVE: "warn",
  LATE_AND_EARLY: "warn",
  MISSING_PUNCH: "warn",
  PENDING: "warn",
  PENDING_PEER: "warn",
  PENDING_L1: "warn",
  PENDING_L2: "warn",
  PENDING_HR: "warn",
  DRAFT: "info",
  SCHEDULED: "info",
  ON_LEAVE: "info",
  ON_CALL: "info",
  HOLIDAY: "info",
  LOCKED: "info",
  ABSENT: "danger",
  REJECTED: "danger",
  DISABLED: "danger",
  INACTIVE: "danger",
  UNDONE: "danger",
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return <span className={`badge ${STATUS_TONE[status] ?? ""}`}>{label ?? status.replace(/_/g, " ").toLowerCase()}</span>;
}

export function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: string }) {
  return (
    <div className={`card stat${tone ? ` tone-${tone}` : ""}`}>
      <span className="label">{label}</span>
      <span className="value">{value}</span>
    </div>
  );
}

export function fmtMin(m: number): string {
  const sign = m < 0 ? "-" : "";
  const a = Math.abs(Math.round(m));
  return `${sign}${Math.floor(a / 60)}:${String(a % 60).padStart(2, "0")}`;
}
