# Salamat — Attendance & Department Shift Roster

Phase 1 (MVP) of the PRD *Attendance & Department Shift Roster*: HR owns the rules, each department owns its roster, and every employee clocks in against the shift they were assigned. Late, early-leave, absent and overtime are calculated per shift against the roster, not against a fixed 8-to-5.

Built for one hospital group (≈800 employees, 5 branches, 24/7 clinical and non-clinical departments), designed to scale to 5,000 employees and 200 departments.

## Stack

- **Next.js 15** (App Router, server components, server actions), TypeScript, React 19
- **PostgreSQL** via **Prisma 6**
- **ExcelJS** for roster / punch / report / payroll files
- Arabic + English with full right-to-left layout, Asia/Riyadh by default, optional Hijri (Umm al-Qura) display
- Business rules are pure functions in `src/lib/domain/` with unit tests (`npm test`)

## Getting started

```bash
cp .env.example .env            # set DATABASE_URL, DIRECT_URL, AUTH_SECRET, CRON_SECRET
npm install
npm run db:deploy               # apply prisma/migrations (or `npm run db:push` in development)
npm run db:seed                 # optional demo hospital
npm run dev                     # http://localhost:3000
```

Demo accounts from the seed (password `Salamat!2026`):

| Email | Role |
|---|---|
| `admin@salamat.test` | Super Admin |
| `hr@salamat.test` | HR Admin |
| `payroll@salamat.test` | HR Viewer |
| `icu.manager@salamat.test` | Department Manager (L2), ICU |
| `icu.charge@salamat.test` | Line Manager (L1), ICU |
| `2002@salamat.test` … `2008@salamat.test`, `3001`, `4001` | Employees |

Kiosk: `/kiosk?token=dev-token-kiosk-main` (employee `2005`, PIN `1234`).
Fingerprint device API token: `dev-token-fingerprint-1`.

### Hosting on Vercel + Supabase

1. Supabase → **Connect**: copy the *Transaction pooler* string (port 6543) and the *Session pooler* string (port 5432).
2. Vercel → import this repository and set the environment variables:
   - `DATABASE_URL` = transaction pooler string + `?pgbouncer=true&connection_limit=1`
   - `DIRECT_URL` = session pooler string
   - `AUTH_SECRET`, `CRON_SECRET` = long random strings
3. Build command: `npx prisma migrate deploy && npm run db:seed && npm run build` (drop `npm run db:seed` once you load real data).

Other scripts: `npm test` (unit tests), `npm run typecheck`, `npm run build`.

## Pages

| Area | Route | Who |
|---|---|---|
| Live board (who is in / late / absent now, by department and branch) | `/dashboard` | everyone (board for managers) |
| My schedule (month calendar, who works with me today) | `/me/schedule` | employees |
| Clock in / out (GPS geofence, selfie, offline queue, device binding) | `/clock` | employees |
| My attendance (status, late/early/overtime per shift) | `/me/attendance` | employees |
| My leave (balances, time off in lieu, holidays) | `/me/leave` | employees |
| My requests (leave, swap / give-away, shift change, correction, overtime) | `/requests` | employees |
| Approval inbox (filters, bulk approve, overdue flag) | `/inbox` | L1, L2, HR |
| Monthly duty roster in the hospital's Excel layout (period from the Settings start day, e.g. 17th → 16th; No. / Staff Name / Staff ID / Designation, colour-coded shift codes, Duty Days / Off / Leave / Planned vs Required hours, daily coverage with LOW flags, legend, signature block, A4 landscape print), plus week view, drag-and-drop, paint, conflicts, publish, copy last week, bulk assign, rotation, float pool, loans | `/roster` | managers, HR |
| Excel roster import: the Duty Roster sheet as-is (title rows, Staff ID column, coverage block ignored), the app's own export, or a row layout; merge/replace, per-cell errors, undo | `/roster/import` | Dept Manager, HR |
| Open shifts (post, claim, approve) | `/open-shifts` | managers, employees |
| Shift templates (HR approval, rule checks, disable) | `/templates` | Dept Manager, HR |
| Minimum staffing per unit / shift / role | `/staffing` | Dept Manager, HR |
| Attendance records, manager-raised corrections, recalculation | `/attendance` | managers, HR |
| Reports (daily, timesheet, lateness, absence, overtime, leave, roster vs actual, scorecards) + Excel/CSV | `/reports` | managers, HR, HR Viewer |
| Raw punch import: the device's Raw Punch sheet (`EmpID | Day | Date | Time | Date and Time`, no IN/OUT) is read directly; EmpIDs that lost the Staff ID's leading zero still match; column mapping per device brand for other formats | `/punches/import` | HR (Dept Managers with HR approval) |
| Payroll export with configurable columns | `/payroll` | HR Admin |
| Pay periods (lock / reopen) | `/periods` | HR Admin |
| Departments tree and managers | `/departments` | HR |
| Employees (+ CSV/Excel import, licenses, PINs, device reset) | `/employees` | HR |
| Leave types, balances, accrual, public holidays | `/leave-setup` | HR |
| Branches, geofences, fingerprint devices and kiosks | `/locations` | HR (Dept Manager view) |
| Users, roles, delegation | `/users` | HR / Super Admin; managers for their own delegation |
| Company rules | `/settings` | HR |
| Audit log | `/audit` | HR, HR Viewer |
| Notifications | `/notifications` | everyone |

## Hospital workbook data

`prisma/data/driver-roster-2026-09.json` holds the hospital's own workbook (*Driver Attendance, 17 Sep – 16 Oct 2026*): departments, staff, the 16 shift codes (M1–M3, E1–E2, N1, D12, N12, B1–B3, X, L, EID, ND, V), public holidays, attendance rules (15 min late / early-out grace), the published Driver roster and 230 raw fingerprint punches. The seed loads it once (skipped when the Driver department exists) and sets the roster period to start on the 17th, Friday as the weekend and 8 standard hours a day. Department manager login: `transport@salamat.test`.

Untyped device punches are read the way the workbook does: IN = last punch at or before shift start (otherwise the first punch before mid-shift, counted late), OUT = last punch from mid-shift on; punches in between (vehicle trips) are extra punches and do not change hours.

## Integrations

- **Fingerprint devices (ZKTeco or similar):** a connector at each branch pulls logs every few minutes and posts them:
  ```http
  POST /api/devices/punches
  Authorization: Bearer <device token from Branches & devices>
  {"punches":[{"employeeNo":"2002","timestamp":"2026-10-13T07:02:00+03:00","type":"in"}]}
  ```
  Duplicates are skipped; untyped punches are paired by time against the roster.
- **Scheduled job:** call every 5 minutes. It sends missed clock-in alerts (shift start + 15 min), missing clock-out alerts, license expiry alerts (60 and 30 days), and 48-hour escalations. It also deletes selfies after 90 days and finalises yesterday's absences.
  ```bash
  curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/alerts
  ```
- **Payroll:** CSV / Excel from `/api/payroll?from=…&to=…&mapping=<saved format>`; columns are configured on the Payroll page because the payroll system's format is not known yet.

## How the main rules are implemented

- **Roles and scope** (`src/lib/domain/permissions.ts`, `src/lib/auth.ts`): the PRD permission matrix; HR sees everything, Department Managers their department tree, Line Managers their direct reports, employees themselves. Delegations grant a deputy the delegator's rights for a date range.
- **Approval chain** (`src/lib/domain/approval.ts`): L1 → L2; straight to L2 when there is no line manager or the L1 is the requester; swaps need the colleague first; HR is the final step for locked periods, corrections outside the 7-day window and leave beyond balance; HR can override at any level (logged). Nobody approves their own request.
- **Roster checks** (`src/lib/domain/conflicts.ts`): overlap, rest < 11h, daily/weekly limits (Ramadan limits for flagged employees in the Ramadan range), approved leave, minimum staffing per role, missing skill, expired license on clinical shifts, unapproved template. Overlaps, expired licenses and unapproved templates block publishing; under-staffing needs an L2 override reason; the rest are warnings.
- **Attendance** (`src/lib/domain/attendance.ts`): punches are matched to the nearest shift (overnight shifts belong to their start date); late = in after start + grace; absent = no in by shift end and no leave; overtime counts only when pre-approved (paid or time off in lieu); optional rounding; flexible shifts use core hours; on-call shifts are not absences.
- **Audit:** every create / edit / delete on rosters, attendance, requests, templates, permissions and settings is written to `AuditLog`; published-roster changes keep before/after and reason.

## Notes and decisions to confirm

- **Daily hours default:** the PRD sets the default maximum to 8 hours/day but also requires 12-hour clinical shifts as P0. The seed sets HR's limit to 12 so D12/N12 templates validate; change it on Company rules.
- **Sign-in:** Phase 1 uses email + password with signed session cookies. SSO (Microsoft / Google), phone OTP and MFA for HR Admin plug in at `/login` and `src/lib/session.ts`.
- **Notifications** are in-app; the `notify*` helpers in `src/lib/notify.ts` are where push, email digest and WhatsApp/SMS delivery go.
- **Mobile:** the clock page is mobile-first and works as a web app (offline queue keeps original timestamps, up to 2 bound phones per employee). Mock-GPS detection and face match need the native iOS/Android app.
- **Storage:** selfies and leave attachments are written to `STORAGE_DIR` and served only to the employee, their managers and HR. Point it at in-country storage for PDPL.
- **Editing published rosters:** cell edits on a published week apply immediately with a mandatory reason and notify the employee; Excel *replace* on a published week does the same.
- Phase 2/3 items not in this build: HRIS sync, email digests, Mudad/GOSI exports, public API/webhooks, Teams/Slack, AI auto-scheduling, employee availability preferences.
