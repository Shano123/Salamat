import { toCsv } from "@/lib/domain/payroll";
import { csvResponse } from "@/lib/excel";

export async function GET() {
  return csvResponse(
    toCsv(
      ["employee_no", "name_en", "name_ar", "department_code", "job_title", "work_location", "contract_hours", "weekend_days", "skills", "license_no", "license_expiry", "line_manager_no", "is_clinical", "clock_method", "email"],
      [["1001", "Aisha Al-Harbi", "عائشة الحربي", "ICU", "Staff Nurse", "Main Hospital", 48, "Fri,Sat", "BLS,ACLS", "SCFHS-12345", "2027-03-31", "1000", "yes", "BOTH", "aisha@example.com"]],
    ),
    "employees-template.csv",
  );
}
