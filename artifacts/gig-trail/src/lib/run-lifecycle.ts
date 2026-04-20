type RunLifecycleLike = {
  status?: string | null;
  showDate?: string | null;
  actualAttendance?: number | null;
  actualTicketIncome?: number | null;
  actualOtherIncome?: number | null;
  actualExpenses?: number | null;
  actualProfit?: number | null;
  wouldDoAgain?: string | null;
};

export const RUN_STATUS_VALUES = ["draft", "planned", "past"] as const;
export type RunLifecycleState = (typeof RUN_STATUS_VALUES)[number];

const LEGACY_PAST_RUN_STATUSES = new Set(["completed", "complete", "archived"]);

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

export function normalizeRunStatus(status: string | null | undefined): RunLifecycleState | null {
  const normalized = status?.toLowerCase().trim();
  if (!normalized) return null;

  if (normalized === "draft" || normalized === "planned" || normalized === "past") {
    return normalized;
  }

  if (LEGACY_PAST_RUN_STATUSES.has(normalized)) {
    return "past";
  }

  return null;
}

export function getBrowserTimeZone(): string | null {
  if (typeof Intl === "undefined") return null;

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (typeof timeZone !== "string") return null;

  const trimmed = timeZone.trim();
  if (!trimmed) return null;

  return isValidTimeZone(trimmed) ? trimmed : null;
}

export function getTodayIsoDate(
  today = new Date(),
  timeZone = getBrowserTimeZone(),
): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone ?? undefined,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(today);

  return [
    getDatePart(parts, "year"),
    getDatePart(parts, "month"),
    getDatePart(parts, "day"),
  ].join("-");
}

export function getDefaultSavedCalculationStatus(
  showDate: string | null | undefined,
  today = new Date(),
  timeZone = getBrowserTimeZone(),
): RunLifecycleState {
  const normalizedShowDate = getIsoDate(showDate);
  const todayIsoDate = getTodayIsoDate(today, timeZone);

  if (!normalizedShowDate) {
    return "draft";
  }

  if (normalizedShowDate < todayIsoDate) {
    return "past";
  }

  return "planned";
}

export function getSavedCalculationStatusForPersist(
  showDate: string | null | undefined,
  _existingStatus?: string | null | undefined,
  today = new Date(),
  timeZone = getBrowserTimeZone(),
): RunLifecycleState {
  return getDefaultSavedCalculationStatus(showDate, today, timeZone);
}

export function getRunLifecycleState(
  run: RunLifecycleLike,
  today = new Date(),
  timeZone = getBrowserTimeZone(),
): RunLifecycleState {
  const showDate = getIsoDate(run.showDate);
  const todayIsoDate = getTodayIsoDate(today, timeZone);

  if (!showDate) {
    return "draft";
  }

  if (showDate < todayIsoDate) {
    return "past";
  }

  return "planned";
}

export function isDraftRun(run: RunLifecycleLike, today = new Date()): boolean {
  return getRunLifecycleState(run, today) === "draft";
}

export function isPlannedRun(run: RunLifecycleLike, today = new Date()): boolean {
  return getRunLifecycleState(run, today) === "planned";
}

export function isPastRun(run: RunLifecycleLike, today = new Date()): boolean {
  return getRunLifecycleState(run, today) === "past";
}

export function getRunStatusMeta(status: RunLifecycleState): {
  badgeClassName: string;
  label: string;
  shortLabel: string;
} {
  switch (status) {
    case "planned":
      return {
        badgeClassName: "border-sky-200 bg-sky-50 text-sky-700",
        label: "Current Show",
        shortLabel: "Current",
      };
    case "past":
      return {
        badgeClassName: "border-emerald-200 bg-emerald-50 text-emerald-700",
        label: "Past Show",
        shortLabel: "Past",
      };
    default:
      return {
        badgeClassName: "border-slate-200 bg-slate-50 text-slate-700",
        label: "Draft",
        shortLabel: "Draft",
      };
  }
}
