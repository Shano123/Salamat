import { ActionForm } from "@/components/ActionForm";
import { PageHeader } from "@/components/ui";
import { changeOwnPassword } from "@/app/actions/users";
import { requireUser } from "@/lib/auth";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await requireUser();
  const { t } = await getT();
  return (
    <>
      <PageHeader title={t("nav.account")} subtitle={`${user.email} · ${user.baseRole.replace("_", " ").toLowerCase()}`} />
      <div className="card" style={{ maxWidth: 480 }}>
        <h2>Change password</h2>
        <ActionForm action={changeOwnPassword} resetOnSuccess>
          <div className="stack">
            <label>Current password<input type="password" name="current" autoComplete="current-password" required /></label>
            <label>New password (at least 10 characters)<input type="password" name="next" autoComplete="new-password" minLength={10} required /></label>
            <label>Repeat new password<input type="password" name="confirm" autoComplete="new-password" minLength={10} required /></label>
          </div>
          <div className="form-actions"><button className="primary" type="submit">{t("common.save")}</button></div>
        </ActionForm>
      </div>
    </>
  );
}
