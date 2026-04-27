import type { Request } from "express";

type RunLifecycleLike = {
  showDate?: string | null;
};

export const RUN_STATUS_VALUES = ["draft", "planned", "past"] as const;
export type RunStatus = (typeof RUN_STATUS_VALUES)[number];

function getIsoDate(value: string | null | undefined): string | null {
  if (!value) return value ?? null;
  return value.split("T")[0] ?? null;
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function getDatePart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPart["type"]): string {
  return parts.find((part) => part.type === type)?.value ?? "";
}

export function getRequestTimeZone(request: Pick<Request, "headers">): string | null {
  const rawHeader = request.headers["x-gigtrail-timezone"] ?? request.headers["x-timezone"];
  const value = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  return isValidTimeZone(trimmed) ? trimmed : null;
}

export function getTodayIsoDate(timeZone: string | null = null, now = new Date()): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone ?? undefined,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(now);

  return [
    getDatePart(parts, "year"),
    getDatePart(parts, "month"),
    getDatePart(parts, "day"),
  ].join("-");
}

export function getTodayIsoDateFromRequest(
  request: Pick<Request, "headers">,
  now = new Date(),
): string {
  return getTodayIsoDate(getRequestTimeZone(request), now);
}

export function getDefaultSavedCalculationStatus(showDate: string | null | undefined, todayIsoDate: string): RunStatus {
  const normalizedShowDate = getIsoDate(showDate);
  if (!normalizedShowDate) {
    return "draft";
  }

  if (normalizedShowDate < todayIsoDate) {
    return "past";
  }

  return "planned";
}

export function getRunStatus(run: RunLifecycleLike, todayIsoDate: string): RunStatus {
  return getDefaultSavedCalculationStatus(run.showDate, todayIsoDate);
}

export function isCompletedRun(run: RunLifecycleLike, todayIsoDate: string): boolean {
  return getRunStatus(run, todayIsoDate) === "past";
}

export function isPastRun(run: RunLifecycleLike, todayIsoDate: string): boolean {
  return getRunStatus(run, todayIsoDate) === "past";
}
