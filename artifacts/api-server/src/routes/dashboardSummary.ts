import type { runsTable, toursTable, tourStopsTable } from "@workspace/db";
import { isCompletedRun } from "../lib/run-lifecycle";
import { logger } from "../lib/logger";

type RunRecord = typeof runsTable.$inferSelect;
type TourRecord = typeof toursTable.$inferSelect;
type TourStopRecord = typeof tourStopsTable.$inferSelect;

export interface DerivedTourMetrics {
  stopCount: number;
  totalDistance: number;
  totalCost: number;
  totalIncome: number;
  totalProfit: number;
  totalAccommodationCost: number;
  totalFoodCost: number;
  totalMarketingCost: number;
}

export interface DashboardActualPerformance {
  label: "Past Show Snapshot";
  helperText: string;
  totalsBasis: "past_shows";
  totalsRule: "Past Shows only";
  totalShows: number;
  showsUsedInTotals: number;
  incompleteDataCount: number;
  missingFinancialDataMessage: string | null;
  totalIncome: number;
  totalProfit: number;
  totalExpenses: number;
  totalKmDriven: number;
  avgShowProfit: number;
  bestShowProfit: number;
  worstShowProfit: number;
  profitableShowCount: number;
  totalAccommodationCost: number;
  totalFoodCost: number;
  totalMarketingCost: number;
  worthTheDrive: number;
  tightMargins: number;
  notWorthIt: number;
}

export interface DashboardFuturePotential {
  label: "Future Potential";
  helperText: string;
  totalsBasis: "upcoming_tours";
  totalsRule: "Projected from upcoming tours only";
  projectedTours: number;
  projectedShows: number;
  projectedIncome: number;
  projectedProfit: number;
  projectedExpenses: number;
  projectedKm: number;
  avgProjectedTourProfit: number;
  bestProjectedTourProfit: number;
  worstProjectedTourProfit: number;
}

export interface DashboardSummaryResult {
  totalProfiles: number;
  totalVehicles: number;
  actualPerformance: DashboardActualPerformance;
  futurePotential: DashboardFuturePotential;
}

export interface DashboardUpcomingTour {
  id: number;
  name: string;
  nextStopDate: string;
  endDate: string | null;
  projectedShows: number;
  projectedIncome: number;
  projectedProfit: number;
  projectedExpenses: number;
  projectedKm: number;
}

export interface DashboardSummaryInput {
  runs: RunRecord[];
  tours: TourRecord[];
  totalProfiles: number;
  totalVehicles: number;
  todayIsoDate: string;
}

interface UpcomingTourCandidate {
  tour: TourRecord;
  nextStopDate: string;
  projectedShows: number;
}

type JsonRecord = Record<string, unknown>;

interface ResolvedRunFinancials {
  income: number | null;
  expenses: number | null;
  profit: number | null;
  hasFinancialData: boolean;
}

const CANCELLED_STOP_STATUSES = new Set(["cancelled", "canceled"]);
const COMPLETED_RUN_STATUSES = new Set(["completed", "past"]);

function n(value: unknown): number {
  const parsed = Number.parseFloat(String(value ?? 0));
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: unknown): number | null {
  if (value == null || value === "") return null;

  const parsed = Number.parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function asRecord(value: unknown): JsonRecord | null {
  return value != null && typeof value === "object" ? (value as JsonRecord) : null;
}

function getNestedValue(record: JsonRecord | null, path: string[]): unknown {
  let current: unknown = record;

  for (const segment of path) {
    const currentRecord = asRecord(current);
    if (!currentRecord) {
      return null;
    }

    current = currentRecord[segment];
  }

  return current;
}

function pickFirstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = nullableNumber(value);
    if (parsed != null) {
      return parsed;
    }
  }

  return null;
}

function getIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.split("T")[0] ?? null;
}

function isCancelledStop(stop: TourStopRecord): boolean {
  const status = (stop.bookingStatus ?? "confirmed").toLowerCase();
  return CANCELLED_STOP_STATUSES.has(status);
}

function resolveRunFinancials(run: RunRecord): ResolvedRunFinancials {
  const runRecord = run as unknown as JsonRecord;
  const snapshot = asRecord(run.calculationSnapshot);

  let income =
    run.actualTicketIncome != null || run.actualOtherIncome != null
      ? n(run.actualTicketIncome) + n(run.actualOtherIncome)
      : pickFirstNumber(
          run.totalIncome,
          runRecord.totalIncome,
          runRecord.total_income,
          runRecord.income,
          getNestedValue(snapshot, ["outputs", "totalIncome"]),
          getNestedValue(snapshot, ["totalIncome"]),
          getNestedValue(snapshot, ["formData", "totalIncome"]),
          getNestedValue(snapshot, ["outputs", "grossRevenue"]),
        );

  let expenses = pickFirstNumber(
    run.actualExpenses,
    runRecord.actualExpenses,
    runRecord.actual_expenses,
    runRecord.totalExpenses,
    runRecord.total_expenses,
    runRecord.expenses,
    run.totalCost,
    runRecord.totalCost,
    runRecord.total_cost,
    getNestedValue(snapshot, ["outputs", "totalCost"]),
    getNestedValue(snapshot, ["totalCost"]),
    getNestedValue(snapshot, ["formData", "totalCost"]),
  );

  let profit = pickFirstNumber(
    run.actualProfit,
    runRecord.actualProfit,
    runRecord.actual_profit,
    runRecord.netProfit,
    runRecord.net_profit,
    runRecord.profit,
    run.totalProfit,
    runRecord.totalProfit,
    runRecord.total_profit,
    getNestedValue(snapshot, ["outputs", "netProfit"]),
    getNestedValue(snapshot, ["netProfit"]),
    getNestedValue(snapshot, ["formData", "totalProfit"]),
    getNestedValue(snapshot, ["outputs", "profit"]),
  );

  if (profit == null && income != null && expenses != null) {
    profit = roundMoney(income - expenses);
  }

  if (expenses == null && income != null && profit != null) {
    expenses = roundMoney(income - profit);
  }

  if (income == null && expenses != null && profit != null) {
    income = roundMoney(expenses + profit);
  }

  return {
    income,
    expenses,
    profit,
    hasFinancialData: income != null || expenses != null || profit != null,
  };
}

function buildMissingFinancialDataMessage(totalShows: number, incompleteDataCount: number): string | null {
  if (totalShows === 0 || incompleteDataCount === 0) {
    return null;
  }

  if (incompleteDataCount === totalShows) {
    return "Past shows found but financial data not saved yet";
  }

  return `${incompleteDataCount} past show${incompleteDataCount === 1 ? "" : "s"} excluded due to incomplete financial data.`;
}

function isCompletedPastShowRun(run: RunRecord, todayIsoDate: string): boolean {
  if (isCompletedRun(run, todayIsoDate)) {
    return true;
  }

  const status = String((run as unknown as JsonRecord).status ?? "")
    .trim()
    .toLowerCase();

  return COMPLETED_RUN_STATUSES.has(status);
}

export function buildActualPerformanceSummary(
  runs: RunRecord[],
  todayIsoDate: string,
): DashboardActualPerformance {
  const completedRuns = runs.filter(run => isCompletedPastShowRun(run, todayIsoDate));
  const financiallyUsableRuns = completedRuns.map(run => ({
    run,
    financials: resolveRunFinancials(run),
  }));
  const runsUsedInTotals = financiallyUsableRuns.filter(entry => entry.financials.hasFinancialData);
  const incompleteDataCount = completedRuns.length - runsUsedInTotals.length;

  let totalKmDriven = 0;
  let totalIncome = 0;
  let totalProfit = 0;
  let totalExpenses = 0;
  let profitSum = 0;
  let bestShowProfit: number | null = null;
  let worstShowProfit: number | null = null;
  let profitableShowCount = 0;
  let worthTheDrive = 0;
  let tightMargins = 0;
  let notWorthIt = 0;
  let totalAccommodationCost = 0;
  let totalFoodCost = 0;
  let totalMarketingCost = 0;

  for (const { run, financials } of runsUsedInTotals) {
    const km = n(run.distanceKm) * (run.returnTrip ? 2 : 1);
    const income = financials.income ?? 0;
    const profit = financials.profit ?? 0;
    const expenses = financials.expenses ?? 0;

    totalKmDriven += km;
    totalIncome += income;
    totalProfit += profit;
    totalExpenses += expenses;
    profitSum += profit;

    if (bestShowProfit === null || profit > bestShowProfit) bestShowProfit = profit;
    if (worstShowProfit === null || profit < worstShowProfit) worstShowProfit = profit;
    if (profit >= 0) profitableShowCount++;

    totalAccommodationCost += n(run.accommodationCost);
    totalFoodCost += n(run.foodCost);
    totalMarketingCost += n(run.marketingCost);

    if (income > 0) {
      const margin = profit / income;
      if (margin > 0.2) worthTheDrive++;
      else if (margin >= 0) tightMargins++;
      else notWorthIt++;
    } else if (profit < 0) {
      notWorthIt++;
    }
  }

  logger.info(
    {
      totalCompletedShows: completedRuns.length,
      showsUsedInTotals: runsUsedInTotals.length,
      incompleteDataCount,
      sampleCompletedRun:
        completedRuns.length > 0
          ? {
              id: completedRuns[0].id,
              status: completedRuns[0].status,
              showDate: completedRuns[0].showDate,
              totalIncome: completedRuns[0].totalIncome,
              totalCost: completedRuns[0].totalCost,
              totalProfit: completedRuns[0].totalProfit,
              actualExpenses: completedRuns[0].actualExpenses,
              actualProfit: completedRuns[0].actualProfit,
              hasCalculationSnapshot: completedRuns[0].calculationSnapshot != null,
            }
          : null,
      summedValues: runsUsedInTotals.map(({ run, financials }) => ({
        id: run.id,
        status: run.status,
        income: financials.income,
        expenses: financials.expenses,
        profit: financials.profit,
      })),
    },
    "[DashboardSummary] Aggregating past-show financials",
  );

  return {
    label: "Past Show Snapshot",
    helperText: "Real numbers from past-dated shows only.",
    totalsBasis: "past_shows",
    totalsRule: "Past Shows only",
    totalShows: completedRuns.length,
    showsUsedInTotals: runsUsedInTotals.length,
    incompleteDataCount,
    missingFinancialDataMessage: buildMissingFinancialDataMessage(completedRuns.length, incompleteDataCount),
    totalIncome,
    totalProfit,
    totalExpenses,
    totalKmDriven,
    avgShowProfit: runsUsedInTotals.length > 0 ? profitSum / runsUsedInTotals.length : 0,
    bestShowProfit: bestShowProfit ?? 0,
    worstShowProfit: worstShowProfit ?? 0,
    profitableShowCount,
    totalAccommodationCost,
    totalFoodCost,
    totalMarketingCost,
    worthTheDrive,
    tightMargins,
    notWorthIt,
  };
}

function getUpcomingTourCandidate(
  tour: TourRecord,
  stops: TourStopRecord[],
  todayIsoDate: string,
): UpcomingTourCandidate | null {
  const activeStops = stops.filter(stop => !isCancelledStop(stop));
  if (activeStops.length === 0) return null;

  const stopDates = activeStops.map(stop => getIsoDate(stop.date));
  if (stopDates.some(date => date == null)) {
    return null;
  }

  const datedStops = stopDates as string[];
  if (datedStops.some(date => date <= todayIsoDate)) {
    return null;
  }

  const nextStopDate = [...datedStops].sort()[0] ?? null;
  if (!nextStopDate) return null;

  return {
    tour,
    nextStopDate,
    projectedShows: activeStops.length,
  };
}

export function getUpcomingTourCandidates(
  tours: TourRecord[],
  stopsByTourId: Map<number, TourStopRecord[]>,
  todayIsoDate: string,
): UpcomingTourCandidate[] {
  return tours
    .map(tour => getUpcomingTourCandidate(tour, stopsByTourId.get(tour.id) ?? [], todayIsoDate))
    .filter((candidate): candidate is UpcomingTourCandidate => candidate != null)
    .sort((left, right) => {
      if (left.nextStopDate !== right.nextStopDate) {
        return left.nextStopDate < right.nextStopDate ? -1 : 1;
      }
      return left.tour.id - right.tour.id;
    });
}

export function buildFuturePotentialSummary(
  tours: TourRecord[],
): DashboardFuturePotential {
  return {
    label: "Future Potential",
    helperText: "Tours are planning objects here; dashboard financial totals come from past shows only.",
    totalsBasis: "upcoming_tours",
    totalsRule: "Projected from upcoming tours only",
    projectedTours: tours.length,
    projectedShows: 0,
    projectedIncome: 0,
    projectedProfit: 0,
    projectedExpenses: 0,
    projectedKm: 0,
    avgProjectedTourProfit: 0,
    bestProjectedTourProfit: 0,
    worstProjectedTourProfit: 0,
  };
}

export function buildDashboardSummary(input: DashboardSummaryInput): DashboardSummaryResult {
  // Runs are the historical financial truth; tours are planning objects and
  // are count-only in the dashboard summary to avoid double-counting totals.
  return {
    totalProfiles: input.totalProfiles,
    totalVehicles: input.totalVehicles,
    actualPerformance: buildActualPerformanceSummary(input.runs, input.todayIsoDate),
    futurePotential: buildFuturePotentialSummary(input.tours),
  };
}

export function buildUpcomingTours(
  tours: TourRecord[],
  stopsByTourId: Map<number, TourStopRecord[]>,
  metricsByTourId: Map<number, DerivedTourMetrics>,
  todayIsoDate: string,
  limit = 4,
): DashboardUpcomingTour[] {
  return getUpcomingTourCandidates(tours, stopsByTourId, todayIsoDate)
    .filter(candidate => metricsByTourId.has(candidate.tour.id))
    .slice(0, limit)
    .map(candidate => {
      const metrics = metricsByTourId.get(candidate.tour.id)!;
      return {
        id: candidate.tour.id,
        name: candidate.tour.name,
        nextStopDate: candidate.nextStopDate,
        endDate: candidate.tour.endDate ?? null,
        projectedShows: candidate.projectedShows,
        projectedIncome: metrics.totalIncome,
        projectedProfit: metrics.totalProfit,
        projectedExpenses: metrics.totalCost,
        projectedKm: metrics.totalDistance,
      };
    });
}
