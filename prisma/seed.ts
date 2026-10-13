// Demo data: one hospital group, 5 branches, clinical + non-clinical departments,
// an ICU with a published roster for this week and a draft for next week.
// Run: npm run db:seed   (all demo users share the password below)
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { computeAttendance, matchPunches } from "../src/lib/domain/attendance";
import { TemplateLike } from "../src/lib/domain/shift";
import { addDays, localDateISO, parseDateISO, toDateISO, weekStartOf, zonedToUtc } from "../src/lib/domain/time";

const db = new PrismaClient();
const PASSWORD = "Salamat!2026";
const TZ = "Asia/Riyadh";

async function main() {
  const hash = await bcrypt.hash(PASSWORD, 10);
  const pin = await bcrypt.hash("1234", 10);

  await db.companyRules.upsert({
    where: { id: 1 },
    // 12-hour clinical shifts are standard in the hospital, so the daily cap is 12 here (PRD default is 8).
    create: { id: 1, maxDailyHours: 12, maxWeeklyHours: 48 },
    update: {},
  });

  const branches = [
    { name: "Main Hospital", nameAr: "المستشفى الرئيسي", lat: 24.7136, lng: 46.6753, requireSelfie: true },
    { name: "North Branch", nameAr: "الفرع الشمالي", lat: 24.8, lng: 46.65, requireSelfie: false },
    { name: "East Clinic", nameAr: "عيادة الشرق", lat: 24.72, lng: 46.8, requireSelfie: false },
    { name: "Jeddah Branch", nameAr: "فرع جدة", lat: 21.5433, lng: 39.1728, requireSelfie: false },
    { name: "Dammam Branch", nameAr: "فرع الدمام", lat: 26.4207, lng: 50.0888, requireSelfie: false },
  ];
  const locs = [];
  for (const b of branches) {
    const existing = await db.location.findFirst({ where: { name: b.name } });
    locs.push(existing ?? (await db.location.create({ data: { ...b, address: `${b.name}, Saudi Arabia`, geofenceM: 250 } })));
  }
  const main = locs[0];
  for (const [i, l] of locs.entries()) {
    await db.device.upsert({ where: { serialNo: `ZK-${i + 1}-001` }, create: { name: `${l.name} entrance`, serialNo: `ZK-${i + 1}-001`, apiToken: `dev-token-fingerprint-${i + 1}`, locationId: l.id }, update: {} });
  }
  await db.device.upsert({ where: { serialNo: "KIOSK-MAIN-1" }, create: { name: "Main lobby tablet", serialNo: "KIOSK-MAIN-1", kind: "KIOSK", apiToken: "dev-token-kiosk-main", locationId: main.id }, update: {} });

  const dept = async (code: string, nameEn: string, nameAr: string, kind: "CLINICAL" | "CLINICAL_SUPPORT" | "NON_CLINICAL", parentId: string | null = null, extra: object = {}) =>
    db.department.upsert({
      where: { code },
      create: { code, nameEn, nameAr, kind, parentId, locationId: main.id, costCenter: `CC-${code}`, level: parentId ? "SUB_DEPARTMENT" : "DEPARTMENT", ...extra },
      update: {},
    });
  const clinical = await dept("CLIN", "Clinical Services", "الخدمات السريرية", "CLINICAL");
  const er = await dept("ER", "Emergency", "الطوارئ", "CLINICAL", clinical.id);
  const icu = await dept("ICU", "Intensive Care Unit", "العناية المركزة", "CLINICAL", clinical.id);
  await dept("OR", "Operating Rooms", "غرف العمليات", "CLINICAL", clinical.id);
  const wards = await dept("WARDS", "Inpatient Wards", "أجنحة التنويم", "CLINICAL", clinical.id);
  await dept("MED", "Medical Ward", "الجناح الباطني", "CLINICAL", wards.id);
  await dept("SURG", "Surgical Ward", "الجناح الجراحي", "CLINICAL", wards.id);
  await dept("OPD", "Outpatient Clinics", "العيادات الخارجية", "CLINICAL", clinical.id);
  const float = await dept("FLOAT", "Nursing Float Pool", "مجموعة التمريض المتنقلة", "CLINICAL", clinical.id, { isFloatPool: true });
  const support = await dept("SUPP", "Clinical Support", "الدعم السريري", "CLINICAL_SUPPORT");
  await dept("LAB", "Laboratory", "المختبر", "CLINICAL_SUPPORT", support.id);
  await dept("RAD", "Radiology", "الأشعة", "CLINICAL_SUPPORT", support.id);
  await dept("PHARM", "Pharmacy", "الصيدلية", "CLINICAL_SUPPORT", support.id);
  const nonClin = await dept("ADMIN", "Administration", "الإدارة", "NON_CLINICAL");
  const hrDept = await dept("HR", "Human Resources", "الموارد البشرية", "NON_CLINICAL", nonClin.id);
  await dept("FIN", "Finance", "المالية", "NON_CLINICAL", nonClin.id);
  await dept("HSK", "Housekeeping", "الإشراف الداخلي", "NON_CLINICAL", nonClin.id);
  await dept("SEC", "Security", "الأمن", "NON_CLINICAL", nonClin.id);
  await dept("IT", "Information Technology", "تقنية المعلومات", "NON_CLINICAL", nonClin.id);

  const today = localDateISO(new Date(), TZ);
  const emp = async (no: string, nameEn: string, nameAr: string, deptId: string, jobTitle: string, extra: Record<string, unknown> = {}) =>
    db.employee.upsert({
      where: { employeeNo: no },
      create: { employeeNo: no, nameEn, nameAr, homeDepartmentId: deptId, jobTitle, kioskPin: pin, workLocationId: main.id, ...extra },
      update: {},
    });
  const hrEmp = await emp("0001", "Huda Al-Qahtani", "هدى القحطاني", hrDept.id, "HR Manager");
  const icuHead = await emp("2000", "Dr. Faisal Al-Otaibi", "د. فيصل العتيبي", icu.id, "ICU Nurse Manager", { isClinical: true, skills: ["BLS", "ACLS", "CHARGE_NURSE"], licenseNo: "SCFHS-20000", licenseExpiry: parseDateISO(addDays(today, 400)) });
  const charge = await emp("2001", "Mariam Al-Shehri", "مريم الشهري", icu.id, "Charge Nurse", { isClinical: true, skills: ["BLS", "ACLS", "CHARGE_NURSE", "VENT"], licenseNo: "SCFHS-20001", licenseExpiry: parseDateISO(addDays(today, 300)), lineManagerId: icuHead.id });
  const nurses = [
    ["2002", "Aisha Al-Harbi", "عائشة الحربي", ["BLS", "ACLS", "VENT"], 200],
    ["2003", "Omar Al-Dosari", "عمر الدوسري", ["BLS", "ACLS"], 45],
    ["2004", "Noura Al-Zahrani", "نورة الزهراني", ["BLS", "VENT"], 250],
    ["2005", "Khalid Al-Ghamdi", "خالد الغامدي", ["BLS", "ACLS", "CHARGE_NURSE"], 365],
    ["2006", "Reem Al-Mutairi", "ريم المطيري", ["BLS"], 20],
    ["2007", "Yousef Al-Shammari", "يوسف الشمري", ["BLS", "ACLS", "VENT"], 500],
    ["2008", "Sara Al-Anazi", "سارة العنزي", ["BLS", "ACLS"], -5],
  ] as const;
  const icuStaff = [charge];
  for (const [no, en, ar, skills, days] of nurses) {
    icuStaff.push(await emp(no, en, ar, icu.id, "Staff Nurse", { isClinical: true, skills: [...skills], licenseNo: `SCFHS-${no}`, licenseExpiry: parseDateISO(addDays(today, days)), lineManagerId: charge.id }));
  }
  const floatNurse = await emp("3001", "Lina Al-Juhani", "لينا الجهني", float.id, "Float Nurse", { isClinical: true, skills: ["BLS", "ACLS"], licenseNo: "SCFHS-3001", licenseExpiry: parseDateISO(addDays(today, 400)) });
  const erNurse = await emp("4001", "Hassan Al-Malki", "حسن المالكي", er.id, "ER Nurse", { isClinical: true, skills: ["BLS", "ACLS"], licenseNo: "SCFHS-4001", licenseExpiry: parseDateISO(addDays(today, 400)) });

  const user = async (email: string, role: "SUPER_ADMIN" | "HR_ADMIN" | "HR_VIEWER" | "DEPT_MANAGER" | "LINE_MANAGER" | "EMPLOYEE", employeeId: string | null, scopes: string[] = []) => {
    const u = await db.user.upsert({ where: { email }, create: { email, role, employeeId, passwordHash: hash }, update: {} });
    for (const d of scopes) await db.userDepartmentScope.upsert({ where: { userId_departmentId: { userId: u.id, departmentId: d } }, create: { userId: u.id, departmentId: d }, update: {} });
    return u;
  };
  await user("admin@salamat.test", "SUPER_ADMIN", null);
  await user("hr@salamat.test", "HR_ADMIN", hrEmp.id);
  await user("payroll@salamat.test", "HR_VIEWER", null);
  await user("icu.manager@salamat.test", "DEPT_MANAGER", icuHead.id, [icu.id]);
  await user("icu.charge@salamat.test", "LINE_MANAGER", charge.id, [icu.id]);
  await user("float.manager@salamat.test", "DEPT_MANAGER", null, [float.id]);
  for (const e of [...icuStaff.slice(1), floatNurse, erNurse]) await user(`${e.employeeNo}@salamat.test`, "EMPLOYEE", e.id);

  const tpl = async (code: string, name: string, color: string, startH: number, endH: number, extra: Record<string, unknown> = {}) => {
    const existing = await db.shiftTemplate.findFirst({ where: { code, ownerDepartmentId: null } });
    return existing ?? db.shiftTemplate.create({ data: { code, name, color, startMin: startH * 60, endMin: endH * 60, graceInMin: 10, status: "APPROVED", ...extra } });
  };
  const M8 = await tpl("M8", "Morning 8h", "#2f855a", 7, 15, { breakMin: 30, paidBreak: true });
  const E8 = await tpl("E8", "Evening 8h", "#b7791f", 15, 23, { breakMin: 30, paidBreak: true });
  const N8 = await tpl("N8", "Night 8h", "#2c5282", 23, 7, { breakMin: 30, paidBreak: true, overnight: true });
  const D12 = await tpl("D12", "Day 12h", "#0e7c66", 7, 19, { breakMin: 60, isClinical: true });
  const N12 = await tpl("N12", "Night 12h", "#553c9a", 19, 7, { breakMin: 60, overnight: true, isClinical: true });
  const OC = await tpl("OC", "On-call standby", "#9b2c2c", 19, 7, { type: "ON_CALL", overnight: true, payCode: "ONCALL" });
  const OFF = await tpl("OFF", "Off day", "#718096", 0, 0, { type: "OFF" });
  await tpl("ADM", "Office hours", "#4a5568", 8, 16, { breakMin: 30, paidBreak: true });
  await tpl("R6", "Ramadan 6h", "#805ad5", 9, 15, { isRamadan: true });
  const existingVent = await db.shiftTemplate.findFirst({ where: { code: "D12V", ownerDepartmentId: icu.id } });
  if (!existingVent) {
    await db.shiftTemplate.create({ data: { code: "D12V", name: "Day 12h — ventilator bay", color: "#285e61", startMin: 420, endMin: 1140, breakMin: 60, isClinical: true, requiredSkills: ["VENT"], ownerDepartmentId: icu.id, status: "PENDING" } });
  }
  void [OC, OFF, M8, E8, N8];

  if (!(await db.staffingRequirement.count({ where: { departmentId: icu.id } }))) {
    await db.staffingRequirement.createMany({
      data: [
        { departmentId: icu.id, templateId: N12.id, skill: "CHARGE_NURSE", minCount: 1 },
        { departmentId: icu.id, templateId: N12.id, minCount: 3 },
        { departmentId: icu.id, templateId: D12.id, minCount: 3 },
      ],
    });
  }

  const lt = async (code: string, nameEn: string, nameAr: string, annualDays: number, extra: Record<string, unknown> = {}) =>
    db.leaveType.upsert({ where: { code }, create: { code, nameEn, nameAr, annualDays, ...extra }, update: {} });
  const annual = await lt("ANNUAL", "Annual leave", "إجازة سنوية", 21);
  await lt("SICK", "Sick leave", "إجازة مرضية", 30, { requiresAttachment: true });
  await lt("EMERG", "Emergency leave", "إجازة طارئة", 5);
  await lt("UNPAID", "Unpaid leave", "إجازة بدون راتب", 0, { paid: false });
  await lt("HAJJ", "Hajj leave", "إجازة الحج", 10);
  await lt("MARR", "Marriage leave", "إجازة الزواج", 5);
  await lt("BEREAV", "Bereavement leave", "إجازة الوفاة", 5);
  await lt("TOIL", "Time off in lieu", "إجازة تعويضية", 0, { isToil: true });
  const year = Number(today.slice(0, 4));
  for (const e of [...icuStaff, icuHead, floatNurse, erNurse, hrEmp]) {
    await db.leaveBalance.upsert({ where: { employeeId_leaveTypeId_year: { employeeId: e.id, leaveTypeId: annual.id, year } }, create: { employeeId: e.id, leaveTypeId: annual.id, year, entitled: 21, used: 3 }, update: {} });
  }
  if (!(await db.holiday.count())) {
    await db.holiday.createMany({ data: [{ date: parseDateISO(`${year}-09-23`), name: "Saudi National Day" }, { date: parseDateISO(`${year}-02-22`), name: "Founding Day" }] });
  }

  // Roster: this week published (with punches up to yesterday), next week draft.
  if (!(await db.shiftAssignment.count({ where: { departmentId: icu.id } }))) {
    const thisWeek = weekStartOf(today);
    const nextWeek = addDays(thisWeek, 7);
    const pattern = [D12.id, D12.id, null, N12.id, N12.id, null, null]; // 4 × 12h = 44h/week
    for (const [w, status] of [[thisWeek, "PUBLISHED"], [nextWeek, "DRAFT"]] as const) {
      for (const [i, e] of icuStaff.entries()) {
        for (let d = 0; d < 7; d++) {
          const t = pattern[(d + i * 2) % pattern.length];
          if (!t) continue;
          await db.shiftAssignment.create({ data: { employeeId: e.id, date: parseDateISO(addDays(w, d)), templateId: t, departmentId: icu.id, locationId: main.id, status } });
        }
      }
      await db.rosterPeriod.create({ data: { departmentId: icu.id, weekStart: parseDateISO(w), status, ...(status === "PUBLISHED" ? { publishedAt: parseDateISO(addDays(w, -8)) } : {}) } });
    }
    const published = await db.shiftAssignment.findMany({ where: { departmentId: icu.id, status: "PUBLISHED", date: { lt: parseDateISO(today) } }, include: { template: true } });
    for (const [k, a] of published.entries()) {
      if (k % 9 === 4) continue; // an absence
      const date = a.date.toISOString().slice(0, 10);
      const late = k % 5 === 1 ? 23 : -(k % 7);
      const inTs = zonedToUtc(date, a.template.startMin + late, TZ);
      const span = (a.template.endMin - a.template.startMin + 1440) % 1440 || 1440;
      await db.punch.create({ data: { employeeId: a.employeeId, timestamp: inTs, type: "IN", source: k % 2 ? "DEVICE" : "MOBILE", lat: main.lat, lng: main.lng } });
      if (k % 11 !== 6) {
        const outTs = new Date(zonedToUtc(date, a.template.startMin, TZ).getTime() + (span + (k % 3) * 10) * 60_000);
        await db.punch.create({ data: { employeeId: a.employeeId, timestamp: outTs, type: "OUT", source: "DEVICE" } });
      }
    }
  }

  // Attendance records for published shifts (the app recalculates these on every punch).
  const shifts = await db.shiftAssignment.findMany({ where: { status: "PUBLISHED" }, include: { template: true, attendance: true } });
  const allPunches = await db.punch.findMany();
  const asTpl = (t: (typeof shifts)[number]["template"]) => ({ ...t, type: t.type, status: t.status }) as TemplateLike;
  for (const a of shifts) {
    if (a.attendance) continue; // re-running the seed never overwrites calculated or locked records
    const mine = shifts.filter((x) => x.employeeId === a.employeeId);
    const punches = allPunches.filter((p) => p.employeeId === a.employeeId);
    const matched = matchPunches(
      punches.map((p) => ({ id: p.id, timestamp: p.timestamp, type: p.type })),
      mine.map((x) => ({ id: x.id, date: toDateISO(x.date), template: asTpl(x.template) })),
      TZ,
    );
    const own = punches.filter((p) => matched.get(p.id) === a.id);
    for (const p of own) await db.punch.update({ where: { id: p.id }, data: { assignmentId: a.id } });
    const r = computeAttendance({ date: toDateISO(a.date), template: asTpl(a.template), tz: TZ, now: new Date(), punches: own.map((p) => ({ id: p.id, timestamp: p.timestamp, type: p.type })) });
    await db.attendanceRecord.upsert({ where: { assignmentId: a.id }, create: { assignmentId: a.id, ...r }, update: r });
  }

  const monthStart = `${today.slice(0, 7)}-01`;
  await db.attendancePeriod.upsert({
    where: { startDate_endDate: { startDate: parseDateISO(monthStart), endDate: parseDateISO(addDays(`${addDays(monthStart, 32).slice(0, 7)}-01`, -1)) } },
    create: { startDate: parseDateISO(monthStart), endDate: parseDateISO(addDays(`${addDays(monthStart, 32).slice(0, 7)}-01`, -1)) },
    update: {},
  });

  console.log(`Seeded. Sign in with any of these (password ${PASSWORD}):
  admin@salamat.test (Super Admin)      hr@salamat.test (HR Admin)        payroll@salamat.test (HR Viewer)
  icu.manager@salamat.test (Dept Mgr)   icu.charge@salamat.test (Line Mgr) 2002@salamat.test (Employee)
Kiosk: /kiosk?token=dev-token-kiosk-main  (employee 2002, PIN 1234)
Fingerprint device token for /api/devices/punches: dev-token-fingerprint-1`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
