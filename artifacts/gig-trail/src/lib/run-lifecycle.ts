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

export type RunLifecycleState = "draft" | "completed";

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

export function getRunLifecycleState(run: RunLifecycleLike, today = new Date()): RunLifecycleState {
  const status = run.status?.toLowerCase().trim();

  if (status === "draft") return "draft";
  if (status === "completed" || status === "complete" || status === "archived") return "completed";

  const showDate = getIsoDate(run.showDate);
  const todayIsoDate = today.toISOString().slice(0, 10);
  if (showDate && showDate <= todayIsoDate && hasPostShowFields(run)) {
    return "completed";
  }

  return "draft";
}

export function isDraftRun(run: RunLifecycleLike, today = new Date()): boolean {
  return getRunLifecycleState(run, today) === "draft";
}

export function isCompletedRun(run: RunLifecycleLike, today = new Date()): boolean {
  return getRunLifecycleState(run, today) === "completed";
}
