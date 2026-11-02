/**
 * Small CSV helpers for exports (finance, payroll, audit).
 * Cells that start with = + - @ are prefixed with ' so Excel and Google Sheets
 * never run them as formulas.
 */
export type CsvCell = string | number | boolean | null | undefined | Date;

function cell(v: CsvCell) {
  if (v === null || v === undefined) return '';
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@]/.test(s) && typeof v !== 'number') s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(header: string[], rows: CsvCell[][]) {
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export function csvResponse(filename: string, body: string) {
  return new Response('﻿' + body, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename.replace(/[^a-zA-Z0-9._-]/g, '_')}"`,
      'Cache-Control': 'no-store',
    },
  });
}

/** Accepts "YYYY-MM" and returns it, otherwise null. */
export function parseMonthKey(v: string | null | undefined) {
  return v && /^\d{4}-(0[1-9]|1[0-2])$/.test(v) ? v : null;
}

export const istDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
