import type { runsTable, toursTable, tourStopsTable } from "@workspace/db";
import { isCompletedRun } from "../lib/run-lifecycle";

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
  stopsByTourId: Map<number, TourStopRecord[]>;
  metricsByTourId: Map<number, DerivedTourMetrics>;
  totalProfiles: number;
  totalVehicles: number;
  todayIsoDate: string;
}

interface UpcomingTourCandidate {
  tour: TourRecord;
  nextStopDate: string;
  projectedShows: number;
}

const CANCELLED_STOP_STATUSES = new Set(["cancelled", "canceled"]);

function n(value: unknown): number {
  const parsed = Number.parseFloat(String(value ?? 0));
  return Number.isFinite(parsed) ? parsed : 0;
}

function getIsoDate(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.split("T")[0] ?? null;
}

function isCancelledStop(stop: TourStopRecord): boolean {
  const status = (stop.bookingStatus ?? "confirmed").toLowerCase();
  return CANCELLED_STOP_STATUSES.has(status);
}

function getRunIncome(run: RunRecord): number {
  const hasActualIncome = run.actualTicketIncome != null || run.actualOtherIncome != null;
  if (hasActualIncome) {
    return n(run.actualTicketIncome) + n(run.actualOtherIncome);
  }
  return n(run.totalIncome);
}

function getRunExpenses(run: RunRecord): number {
  return run.actualExpenses != null ? n(run.actualExpenses) : n(run.totalCost);
}

function getRunProfit(run: RunRecord): number {
  return run.actualProfit != null ? n(run.actualProfit) : n(run.totalProfit);
}

function isCompletedPastShowRun(run: RunRecord, todayIsoDate: string): boolean {
  return isCompletedRun(run, todayIsoDate);
}

export function buildActualPerformanceSummary(
  runs: RunRecord[],
  todayIsoDate: string,
): DashboardActualPerformance {
  const completedRuns = runs.filter(run => isCompletedPastShowRun(run, todayIsoDate));

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

  for (const run of completedRuns) {
    const km = n(run.distanceKm) * (run.returnTrip ? 2 : 1);
    const income = getRunIncome(run);
    const profit = getRunProfit(run);
    const expenses = getRunExpenses(run);

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

  return {
    label: "Past Show Snapshot",
    helperText: "Real numbers from past-dated shows only.",
    totalsBasis: "past_shows",
    totalsRule: "Past Shows only",
    totalShows: completedRuns.length,
    totalIncome,
    totalProfit,
    totalExpenses,
    totalKmDriven,
    avgShowProfit: completedRuns.length > 0 ? profitSum / completedRuns.length : 0,
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
  stopsByTourId: Map<number, TourStopRecord[]>,
  metricsByTourId: Map<number, DerivedTourMetrics>,
  todayIsoDate: string,
): DashboardFuturePotential {
  const candidates = getUpcomingTourCandidates(tours, stopsByTourId, todayIsoDate);

  let projectedShows = 0;
  let projectedIncome = 0;
  let projectedProfit = 0;
  let projectedExpenses = 0;
  let projectedKm = 0;
  let profitSum = 0;
  let bestProjectedTourProfit: number | null = null;
  let worstProjectedTourProfit: number | null = null;

  for (const candidate of candidates) {
    const metrics = metricsByTourId.get(candidate.tour.id);
    if (!metrics) continue;

    projectedShows += candidate.projectedShows;
    projectedIncome += metrics.totalIncome;
    projectedProfit += metrics.totalProfit;
    projectedExpenses += metrics.totalCost;
    projectedKm += metrics.totalDistance;
    profitSum += metrics.totalProfit;

    if (bestProjectedTourProfit === null || metrics.totalProfit > bestProjectedTourProfit) {
      bestProjectedTourProfit = metrics.totalProfit;
    }
    if (worstProjectedTourProfit === null || metrics.totalProfit < worstProjectedTourProfit) {
      worstProjectedTourProfit = metrics.totalProfit;
    }
  }

  const projectedTours = candidates.filter(candidate => metricsByTourId.has(candidate.tour.id)).length;

  return {
    label: "Future Potential",
    helperText: "Projected numbers from upcoming tours only - estimates, not actuals.",
    totalsBasis: "upcoming_tours",
    totalsRule: "Projected from upcoming tours only",
    projectedTours,
    projectedShows,
    projectedIncome,
    projectedProfit,
    projectedExpenses,
    projectedKm,
    avgProjectedTourProfit: projectedTours > 0 ? profitSum / projectedTours : 0,
    bestProjectedTourProfit: bestProjectedTourProfit ?? 0,
    worstProjectedTourProfit: worstProjectedTourProfit ?? 0,
  };
}

export function buildDashboardSummary(input: DashboardSummaryInput): DashboardSummaryResult {
  return {
    totalProfiles: input.totalProfiles,
    totalVehicles: input.totalVehicles,
    actualPerformance: buildActualPerformanceSummary(input.runs, input.todayIsoDate),
    futurePotential: buildFuturePotentialSummary(
      input.tours,
      input.stopsByTourId,
      input.metricsByTourId,
      input.todayIsoDate,
    ),
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
