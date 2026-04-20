type RunLifecycleLike = {
  status?: string | null;
  showDate?: string | null;
  actualAttendance?: number | null;
  actualTicketIncome?: unknown;
  actualOtherIncome?: unknown;
  actualExpenses?: unknown;
  actualProfit?: unknown;
  wouldDoAgain?: string | null;
};

function getIsoDate(value: string | null | undefined): string | null {
  if (!value) return value ?? null;
  return value.split("T")[0] ?? null;
}

function hasPostShowFields(run: RunLifecycleLike): boolean {
  return (
    run.actualAttendance != null ||
    run.actualTicketIncome != null ||
    run.actualOtherIncome != null ||
    run.actualExpenses != null ||
    run.actualProfit != null ||
    !!run.wouldDoAgain
  );
}

export function isCompletedRun(run: RunLifecycleLike, todayIsoDate: string): boolean {
  const status = run.status?.toLowerCase().trim();

  if (status === "draft") return false;
  if (status === "completed" || status === "complete" || status === "archived") return true;

  const showDate = getIsoDate(run.showDate);
  return !!(showDate && showDate <= todayIsoDate && hasPostShowFields(run));
}
