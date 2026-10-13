import { getT } from "@/lib/i18n/server";
import { LoginForm } from "./LoginForm";
import { toggleLocale } from "../actions/session";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const { t } = await getT();
  return (
    <div className="login">
      <div className="card stack">
        <div className="brand" style={{ padding: 0 }}>
          <div className="brand-mark">S</div>
          <div>
            <strong>{t("appName")}</strong>
            <small className="muted">{t("tagline")}</small>
          </div>
          <span className="spacer" />
          <form action={toggleLocale}>
            <button className="small" type="submit">{t("common.language")}</button>
          </form>
        </div>
        <h2>{t("login.title")}</h2>
        <LoginForm next={next ?? "/dashboard"} />
        <p className="muted" style={{ fontSize: 12 }}>
          SSO (Microsoft / Google) and phone OTP sign-in plug in here; email + password is the Phase 1 fallback.
        </p>
      </div>
    </div>
  );
}
