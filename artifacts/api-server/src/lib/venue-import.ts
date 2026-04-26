import type { InsertVenueImportRow, venuesTable } from "@workspace/db";

export type VenueImportStatus =
  | "unverified"
  | "ready_to_import"
  | "needs_review"
  | "duplicate"
  | "missing_required"
  | "imported"
  | "skipped";

export type ExistingVenueMatch = Pick<typeof venuesTable.$inferSelect, "id" | "name" | "city" | "country">;

export interface ParsedVenueImportRow {
  sourceDatabase: string;
  sourceSheet: string | null;
  sourceRowNumber: number | null;
  venueName: string | null;
  cityTown: string | null;
  country: string | null;
  bookingEmail: string | null;
  bookingContactName: string | null;
  bookingPhone: string | null;
  website: string | null;
  facebook: string | null;
  instagram: string | null;
  notes: string | null;
  rawAction: string | null;
  duplicateKey: string | null;
  importStatus: VenueImportStatus;
  duplicateStatus: string | null;
  matchedVenueId: number | null;
  rawOriginalData: Record<string, unknown>;
}

export interface VenueImportSummary {
  totalRows: number;
  readyRows: number;
  duplicateRows: number;
  needsReviewRows: number;
  missingRequiredRows: number;
}

const EXPECTED_COLUMNS = [
  "venueName",
  "cityTown",
  "country",
  "bookingEmail",
  "bookingContactName",
  "bookingPhone",
  "website",
  "facebook",
  "instagram",
  "notes",
  "rawAction",
  "sourceSheet",
  "sourceRowNumber",
  "duplicateKey",
  "importStatus",
  "sourceDatabase",
] as const;

function clean(value: unknown): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function cleanEmail(value: unknown): string | null {
  return clean(value)?.toLowerCase() ?? null;
}

function parseRowNumber(value: unknown): number | null {
  const cleaned = clean(value);
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function venueDuplicateKey(venueName: string | null, cityTown: string | null, country: string | null): string {
  return [venueName, cityTown, country]
    .map((part) => (part ?? "").trim().toLowerCase())
    .join("|");
}

function splitCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      value += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      values.push(value);
      value = "";
    } else {
      value += char;
    }
  }

  values.push(value);
  return values;
}

export function parseCsv(csvText: string): Record<string, string>[] {
  const lines: string[] = [];
  let line = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i += 1) {
    const char = csvText[i];
    const next = csvText[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      line += char + next;
      i += 1;
      continue;
    }
    if (char === '"') inQuotes = !inQuotes;
    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      lines.push(line);
      line = "";
    } else {
      line += char;
    }
  }
  if (line.length > 0) lines.push(line);

  const nonEmptyLines = lines.filter((l) => l.trim().length > 0);
  if (nonEmptyLines.length === 0) return [];

  const headers = splitCsvLine(nonEmptyLines[0]).map((h) => h.trim().replace(/^\uFEFF/, ""));
  return nonEmptyLines.slice(1).map((csvLine) => {
    const values = splitCsvLine(csvLine);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    return row;
  });
}

export function summarizeRows(rows: ParsedVenueImportRow[]): VenueImportSummary {
  return {
    totalRows: rows.length,
    readyRows: rows.filter((row) => row.importStatus === "ready_to_import").length,
    duplicateRows: rows.filter((row) => row.importStatus === "duplicate").length,
    needsReviewRows: rows.filter((row) => row.importStatus === "needs_review").length,
    missingRequiredRows: rows.filter((row) => row.importStatus === "missing_required").length,
  };
}

export function buildExistingVenueMap(existingVenues: ExistingVenueMatch[]): Map<string, ExistingVenueMatch> {
  const map = new Map<string, ExistingVenueMatch>();
  for (const venue of existingVenues) {
    const key = venueDuplicateKey(venue.name, venue.city, venue.country);
    if (key !== "||" && !map.has(key)) map.set(key, venue);
  }
  return map;
}

export function parseVenueImportCsv(
  csvText: string,
  existingVenueMap: Map<string, ExistingVenueMatch>,
): ParsedVenueImportRow[] {
  const csvRows = parseCsv(csvText);
  const seenDuplicateKeys = new Set<string>();

  return csvRows.map((row): ParsedVenueImportRow => {
    try {
      const normalized: Record<string, unknown> = {};
      for (const column of EXPECTED_COLUMNS) normalized[column] = row[column] ?? "";

      const venueName = clean(row.venueName);
      const cityTown = clean(row.cityTown);
      const country = clean(row.country);
      const sourceDatabase = clean(row.sourceDatabase) ?? "Europe Master Sheet";
      const providedDuplicateKey = clean(row.duplicateKey);
      const computedKey = venueDuplicateKey(venueName, cityTown, country);
      const matchedVenue = existingVenueMap.get(computedKey) ?? null;

      let importStatus: VenueImportStatus = "unverified";
      let duplicateStatus: string | null = null;

      if (!venueName || !cityTown || !country) {
        importStatus = "missing_required";
      } else if (matchedVenue) {
        importStatus = "duplicate";
        duplicateStatus = "existing_venue";
      } else if (providedDuplicateKey && seenDuplicateKeys.has(providedDuplicateKey)) {
        importStatus = "duplicate";
        duplicateStatus = "same_batch_duplicate_key";
      }

      if (providedDuplicateKey) seenDuplicateKeys.add(providedDuplicateKey);

      return {
        sourceDatabase,
        sourceSheet: clean(row.sourceSheet),
        sourceRowNumber: parseRowNumber(row.sourceRowNumber),
        venueName,
        cityTown,
        country,
        bookingEmail: cleanEmail(row.bookingEmail),
        bookingContactName: clean(row.bookingContactName),
        bookingPhone: clean(row.bookingPhone),
        website: clean(row.website),
        facebook: clean(row.facebook),
        instagram: clean(row.instagram),
        notes: clean(row.notes),
        rawAction: clean(row.rawAction),
        duplicateKey: providedDuplicateKey,
        importStatus,
        duplicateStatus,
        matchedVenueId: matchedVenue?.id ?? null,
        rawOriginalData: normalized,
      };
    } catch (error) {
      return {
        sourceDatabase: "Europe Master Sheet",
        sourceSheet: clean(row.sourceSheet),
        sourceRowNumber: parseRowNumber(row.sourceRowNumber),
        venueName: clean(row.venueName),
        cityTown: clean(row.cityTown),
        country: clean(row.country),
        bookingEmail: cleanEmail(row.bookingEmail),
        bookingContactName: clean(row.bookingContactName),
        bookingPhone: clean(row.bookingPhone),
        website: clean(row.website),
        facebook: clean(row.facebook),
        instagram: clean(row.instagram),
        notes: clean(row.notes),
        rawAction: clean(row.rawAction),
        duplicateKey: clean(row.duplicateKey),
        importStatus: "needs_review",
        duplicateStatus: null,
        matchedVenueId: null,
        rawOriginalData: { ...row, parseError: error instanceof Error ? error.message : "Unknown parse error" },
      };
    }
  });
}

export function toImportRowValues(importBatchId: number, row: ParsedVenueImportRow): InsertVenueImportRow {
  return {
    importBatchId,
    sourceDatabase: row.sourceDatabase,
    sourceSheet: row.sourceSheet,
    sourceRowNumber: row.sourceRowNumber,
    venueName: row.venueName,
    cityTown: row.cityTown,
    country: row.country,
    bookingEmail: row.bookingEmail,
    bookingContactName: row.bookingContactName,
    bookingPhone: row.bookingPhone,
    website: row.website,
    facebook: row.facebook,
    instagram: row.instagram,
    notes: row.notes,
    rawAction: row.rawAction,
    duplicateKey: row.duplicateKey,
    importStatus: row.importStatus,
    duplicateStatus: row.duplicateStatus,
    matchedVenueId: row.matchedVenueId,
    rawOriginalData: row.rawOriginalData,
  };
}
