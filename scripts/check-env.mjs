// Runs first on every deploy and explains, in plain words, what is wrong with the
// database settings before Prisma fails with a less readable error.
import net from "node:net";

const errors = [];
const warnings = [];
const ok = [];

function parse(name) {
  const raw = process.env[name];
  if (!raw || !raw.trim()) {
    errors.push(`${name} is missing. Add it in Vercel → Settings → Environment Variables and tick Production AND Preview.`);
    return null;
  }
  const v = raw.trim();
  if (v !== raw) warnings.push(`${name} has spaces before or after it; remove them.`);
  if (/^["']|["']$/.test(v)) errors.push(`${name} is wrapped in quotes. Paste the value without " or ' around it.`);
  if (!/^postgres(ql)?:\/\//.test(v.replace(/^["']/, ""))) {
    errors.push(`${name} must start with postgresql:// (it starts with "${v.slice(0, 12)}…"). Did you paste the key name into the value box?`);
    return null;
  }
  if (/YOUR-|\[YOUR|\[|\]/.test(v)) errors.push(`${name} still contains a placeholder such as YOUR-PASSWORD or [ ]. Replace it with your real details (no square brackets).`);
  let u;
  try {
    u = new URL(v.replace(/^["']|["']$/g, ""));
  } catch {
    errors.push(`${name} cannot be read. Your password probably contains @ # / : ? & or %; write them as %40 %23 %2F %3A %3F %26 %25.`);
    return null;
  }
  if ((v.match(/@/g) || []).length > 1) errors.push(`${name} has more than one "@". If your password contains @, write it as %40.`);
  if (!u.password) errors.push(`${name} has no password (expected postgresql://USER:PASSWORD@HOST…).`);
  if (/^db\..*\.supabase\.co$/.test(u.hostname)) {
    errors.push(`${name} uses the direct host ${u.hostname}, which Vercel cannot reach (IPv6 only). Use the Supabase "Transaction pooler" / "Session pooler" strings (…pooler.supabase.com).`);
  }
  return u;
}

const db = parse("DATABASE_URL");
const direct = parse("DIRECT_URL");
if (db && db.port === "6543" && db.searchParams.get("pgbouncer") !== "true") {
  errors.push("DATABASE_URL uses port 6543 (transaction pooler) but is missing ?pgbouncer=true&connection_limit=1 at the end.");
}
if (direct && direct.port === "6543") {
  errors.push("DIRECT_URL must be the Session pooler string (port 5432), not the Transaction pooler (6543).");
}
if (db && direct && db.username !== direct.username) {
  warnings.push(`DATABASE_URL user (${db.username}) and DIRECT_URL user (${direct.username}) differ; both should be postgres.<project-ref>.`);
}
for (const name of ["AUTH_SECRET", "CRON_SECRET"]) {
  const v = process.env[name];
  if (!v) errors.push(`${name} is missing. Any long random text (32+ characters) works.`);
  else if (v.length < 32) warnings.push(`${name} is short; use 32+ random characters.`);
}

async function reachable(u, name) {
  const port = Number(u.port || 5432);
  await new Promise((resolve) => {
    const s = net.connect({ host: u.hostname, port, timeout: 8000 });
    s.once("connect", () => { ok.push(`${name}: reached ${u.hostname}:${port}`); s.destroy(); resolve(); });
    s.once("timeout", () => { errors.push(`${name}: cannot reach ${u.hostname}:${port} (timed out). Is the Supabase project paused, or the region in the host wrong?`); s.destroy(); resolve(); });
    s.once("error", (e) => { errors.push(`${name}: cannot reach ${u.hostname}:${port} (${e.code ?? e.message}). Check the host name is copied exactly from Supabase → Connect.`); resolve(); });
  });
}
if (!errors.length) {
  if (db) await reachable(db, "DATABASE_URL");
  if (direct) await reachable(direct, "DIRECT_URL");
}

console.log("\n========== SALAMAT DEPLOY CHECK ==========");
for (const m of ok) console.log(`  OK    ${m}`);
for (const m of warnings) console.log(`  WARN  ${m}`);
for (const m of errors) console.log(`  ERROR ${m}`);
console.log(errors.length ? "==========================================\nFix the ERROR lines above in Vercel → Settings → Environment Variables, then Redeploy.\n" : "  All database settings look right.\n==========================================\n");
process.exit(errors.length ? 1 : 0);
