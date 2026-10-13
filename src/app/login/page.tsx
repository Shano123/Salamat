import { getT } from "@/lib/i18n/server";
import { LoginForm } from "./LoginForm";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const { t, locale } = await getT();
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
          <LanguageSwitcher current={locale} />
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
