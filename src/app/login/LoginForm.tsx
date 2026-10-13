"use client";
import { useActionState } from "react";
import { login } from "../actions/session";
import { useT } from "@/lib/i18n/client";

export function LoginForm({ next }: { next: string }) {
  const { t } = useT();
  const [state, action, pending] = useActionState(login, null);
  return (
    <form action={action} className="stack">
      <input type="hidden" name="next" value={next} />
      <label>
        {t("login.email")}
        <input name="email" type="email" autoComplete="username" required autoFocus />
      </label>
      <label>
        {t("login.password")}
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {state?.error && <div className="alert danger">{t(state.error)}</div>}
      <button className="primary" disabled={pending} type="submit" style={{ justifyContent: "center" }}>
        {t("login.submit")}
      </button>
    </form>
  );
}
