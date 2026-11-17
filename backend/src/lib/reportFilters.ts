import type { Request } from "express";

export interface ReportFilters {
  from?: Date;
  to?: Date;
  areaIds: string[];
}

/**
 * Parse filter tanggal + area dari query string.
 * Menerima alias lama (startDate/endDate/areaId) dan baru (fromDate/toDate/areaIds).
 * Tanggal "to" inklusif hingga akhir hari (disimpan sebagai awal hari berikutnya untuk query "lt").
 */
export function parseReportFilters(query: Request["query"]): ReportFilters {
  const fromRaw = (query.fromDate ?? query.startDate) as string | undefined;
  const toRaw = (query.toDate ?? query.endDate) as string | undefined;
  const areaRaw = (query.areaIds ?? query.areaId) as string | string[] | undefined;

  let from: Date | undefined;
  let to: Date | undefined;

  if (fromRaw) {
    from = startOfDay(new Date(fromRaw));
    if (Number.isNaN(from.getTime())) {
      throw new ReportFilterError("Tanggal 'fromDate' tidak valid");
    }
  }

  if (toRaw) {
    const d = startOfDay(new Date(toRaw));
    if (Number.isNaN(d.getTime())) {
      throw new ReportFilterError("Tanggal 'toDate' tidak valid");
    }
    to = addDays(d, 1); // eksklusif akhir hari berikutnya
  }

  if (from && to && from >= to) {
    throw new ReportFilterError("Rentang tanggal tidak valid: fromDate harus sebelum toDate");
  }

  const areaIds = (Array.isArray(areaRaw) ? areaRaw : areaRaw ? areaRaw.split(",") : [])
    .map((s) => String(s).trim())
    .filter(Boolean);

  return { from, to, areaIds };
}

export class ReportFilterError extends Error {}

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}
