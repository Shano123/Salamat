import { setLocale } from "@/app/actions/session";
import { Locale, LOCALES } from "@/lib/i18n/dictionaries";

/** One small button per other language; works without client JavaScript. */
export function LanguageSwitcher({ current }: { current: Locale }) {
  return (
    <div className="row" style={{ gap: 4 }}>
      {LOCALES.filter((l) => l.code !== current).map((l) => (
        <form key={l.code} action={setLocale}>
          <input type="hidden" name="locale" value={l.code} />
          <button className="small" type="submit" lang={l.code}>{l.label}</button>
        </form>
      ))}
    </div>
  );
}
