import "server-only";
import ExcelJS from "exceljs";
import type { Cell } from "./domain/rosterImport";
import { parseCsv } from "./domain/payroll";

/** Reads the first sheet of an .xlsx or .csv upload into rows of plain cell values. */
export async function readSheet(file: File): Promise<Cell[][]> {
  const buf = Buffer.from(await file.arrayBuffer());
  if (/\.csv$/i.test(file.name) || file.type === "text/csv") return parseCsv(buf.toString("utf8"));
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows: Cell[][] = [];
  ws.eachRow({ includeEmpty: true }, (row, n) => {
    const vals: Cell[] = [];
    row.eachCell({ includeEmpty: true }, (cell, c) => {
      let v = cell.value as unknown;
      if (v && typeof v === "object" && !(v instanceof Date)) {
        const o = v as { result?: unknown; text?: string; richText?: Array<{ text: string }> };
        v = o.result ?? o.text ?? o.richText?.map((r) => r.text).join("") ?? null;
      }
      vals[c - 1] = v as Cell;
    });
    rows[n - 1] = vals;
  });
  return Array.from(rows, (r) => r ?? []);
}

export async function workbookResponse(wb: ExcelJS.Workbook, fileName: string): Promise<Response> {
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${fileName}"`,
    },
  });
}

export function csvResponse(csv: string, fileName: string): Response {
  return new Response("﻿" + csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${fileName}"` },
  });
}

export function styleHeader(ws: ExcelJS.Worksheet) {
  const r = ws.getRow(1);
  r.font = { bold: true };
  r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE3F3EF" } };
  ws.views = [{ state: "frozen", xSplit: 0, ySplit: 1 }];
}
