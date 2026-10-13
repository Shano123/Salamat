import { punchTemplateCsv } from "@/app/actions/punchImport";
import { csvResponse } from "@/lib/excel";

export async function GET() {
  return csvResponse(await punchTemplateCsv(), "punch-import-template.csv");
}
