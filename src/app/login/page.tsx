import { Icon } from "@/components/Icon";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };

const POINTS = [
  "Department rosters with conflict, rest-time and minimum-staffing checks",
  "Fingerprint, mobile and kiosk clock-in matched to the published shift",
  "Two-level approvals for leave, swaps, corrections and overtime",
  "Locked pay periods and payroll-ready exports with a full audit trail",
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="login">
      <section className="login-hero">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
          <span>
            <span className="brand-name">Salamat</span>
            <span className="brand-tag">Workforce &amp; Attendance</span>
          </span>
        </div>
        <div>
          <h1>Every shift planned. Every hour accounted for.</h1>
          <p>Rostering and time &amp; attendance for 24/7 clinical and non-clinical teams across every branch.</p>
          <ul className="login-points">
            {POINTS.map((p) => (
              <li key={p}><Icon name="checklist" size={18} /> {p}</li>
            ))}
          </ul>
        </div>
        <div className="login-foot">© {new Date().getFullYear()} Salamat · Authorised personnel only</div>
      </section>
      <section className="login-panel">
        <div className="login-card">
          <h2>Sign in</h2>
          <p className="sub">Use your work email and password.</p>
          <LoginForm next={next ?? "/dashboard"} />
        </div>
      </section>
    </div>
  );
}
