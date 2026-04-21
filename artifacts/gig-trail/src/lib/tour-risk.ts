import { calculateShowIncome, calculateTicketBreakEven } from "./calculations";

function n(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function roundCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundRatio(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

export type TourIntent = "profit" | "break_even" | "strategic_loss_leader";
export type RiskConfidenceLevel = "high" | "medium" | "low";

export const TOUR_RISK_CONFIG = {
  weakestShowCount: 3,
  logisticsSpikeRate: 0.2,
  missingData: {
    partialWarningShare: 0.3,
    insufficientShare: 0.5,
  },
  costRecovery: {
    showSpecificCostRecoveryRate: 0.5,
    accommodationRecoveryRate: 0.35,
    routeCostRecoveryRate: 0,
  },
  labels: [
    { max: 20, label: "Bulletproof" },
    { max: 40, label: "Healthy" },
    { max: 60, label: "Balanced / Caution" },
    { max: 80, label: "Fragile" },
    { max: 100, label: "High Stakes / Dangerous" },
  ],
  concentration: {
    topShowLow: 0.2,
    topShowGuarded: 0.35,
    topShowFragile: 0.5,
    topTwoGuarded: 0.35,
    topTwoFragile: 0.55,
    topTwoHigh: 0.7,
  },
  liquidity: {
    healthyMargin: 0.2,
    guardedMargin: 0.1,
    thinMargin: 0.05,
    strongGuaranteeCoverage: 0.5,
    workableGuaranteeCoverage: 0.3,
    weakGuaranteeCoverage: 0.15,
  },
  structuralFragility: {
    healthyMargin: 0.15,
    guardedMargin: 0.08,
    thinMargin: 0.02,
  },
  logistics: {
    highOpExShare: 0.4,
    pressuredOpExShare: 0.25,
    noticeableOpExShare: 0.15,
    highNetErosion: 0.5,
  },
  revenueVolatility: {
    weakGuaranteedIncomeShare: 0.3,
    guardedGuaranteedIncomeShare: 0.5,
    criticalDistanceToRuin: 10,
    dangerousDistanceToRuin: 12,
    fragileDistanceToRuin: 20,
    guardedDistanceToRuin: 30,
    strongDistanceToRuin: 45,
  },
  schedule: {
    amberDeadDayRatio: 0.25,
    redDeadDayRatio: 0.4,
    sparseDeadDayRatio: 0.3,
    healthyEfficiencyRatio: 0.65,
    weakEfficiencyRatio: 0.5,
    highOperationalLoadPerShow: 2,
    severeOperationalLoadPerShow: 2.5,
    highTravelDayDistanceKm: 400,
    consecutiveBurnDaysHigh: 3,
    loadedCostBurdenMultiplier: 1.35,
  },
} as const;

export interface TourRiskFlag {
  code: string;
  label: string;
  explanation: string;
}

export interface TourRiskRecommendation {
  code: string;
  message: string;
  mitigation: string;
}

export type TourRiskDayType = "show_day" | "day_off" | "travel_day";

export interface TourRiskDaySnapshotInput {
  date: string;
  type?: TourRiskDayType;
  hasShow?: boolean;
  showId?: number | string | null;
  revenue?: number;
  showSpecificCosts?: number;
  fixedOperatingCosts?: number;
  accommodationCost?: number;
  travelDistance?: number;
  travelHours?: number;
  dailyTravelBurn?: number;
}

export interface TourRiskDaySnapshot {
  date: string;
  type: TourRiskDayType;
  hasShow: boolean;
  showId: number | string | null;
  revenue: number;
  showSpecificCosts: number;
  fixedOperatingCosts: number;
  accommodationCost: number;
  travelDistance: number;
  travelHours: number;
  dailyTravelBurn: number;
  burnCost: number;
  netImpact: number;
}

export interface TourRiskShowSnapshotInput {
  showId: number | string;
  date?: string | null;
  venueName: string;
  showType: string;
  dealType?: string | null;
  fee?: number | null;
  capacity?: number | null;
  ticketPrice?: number | null;
  expectedAttendancePct?: number | null;
  splitPct?: number | null;
  guarantee?: number | null;
  merchEstimate?: number | null;
  totalCosts: number;
  fuelCost?: number;
  accommodationCost?: number;
  travelDistance?: number;
  travelHours?: number;
  otherRevenue?: number;
  variableCostFlags?: string[];
}

export interface TourRiskShowSnapshot {
  showId: number | string;
  date: string | null;
  venueName: string;
  showType: string;
  dealType: string | null;
  grossIncome: number;
  guaranteeIncome: number;
  ticketRevenue: number;
  ticketRevenueBase: number;
  guaranteeFloorAppliesToTicketRevenue: boolean;
  merchRevenue: number;
  otherRevenue: number;
  totalCosts: number;
  fuelCost: number;
  accommodationCost: number;
  travelDistance: number;
  travelHours: number;
  expectedTickets: number;
  breakEvenTickets: number;
  netProfit: number;
  marginPercent: number;
  variableCostFlags: string[];
  missingRevenueAssumptions: boolean;
}

export interface TourRiskSnapshotInput {
  totalGrossIncome?: number;
  totalGuaranteeIncome?: number;
  totalTicketRevenue?: number;
  totalMerchRevenue?: number;
  totalOtherRevenue?: number;
  totalCosts: number;
  totalFuelCost?: number;
  totalAccommodationCost?: number;
  totalNetProfit: number;
  overallMarginPercent?: number;
  totalDistance?: number;
  totalTravelHours?: number;
  breakEvenPoint?: number;
  expectedTicketTotals?: number;
  runDays?: number;
  volatileCostFlags?: string[];
  tourIntent?: TourIntent;
  dayResults?: TourRiskDaySnapshotInput[];
  showResults: TourRiskShowSnapshot[];
}

export interface TourRiskSnapshot {
  totalGrossIncome: number;
  totalGuaranteeIncome: number;
  totalTicketRevenue: number;
  totalMerchRevenue: number;
  totalOtherRevenue: number;
  totalCosts: number;
  totalFuelCost: number;
  totalAccommodationCost: number;
  totalNetProfit: number;
  overallMarginPercent: number;
  totalDistance: number;
  totalTravelHours: number;
  breakEvenPoint: number;
  expectedTicketTotals: number;
  runDays: number;
  showCount: number;
  profitableShowCount: number;
  lossMakingShowCount: number;
  volatileCostFlags: string[];
  tourIntent: TourIntent;
  missingRevenueAssumptionCount: number;
  speculativeShowCount: number;
  dayResults: TourRiskDaySnapshot[];
  scheduleMetrics: TourRiskScheduleMetrics;
  showResults: TourRiskShowSnapshot[];
}

export interface TourRiskScheduleMetrics {
  totalCalendarDays: number;
  totalShowDays: number;
  totalOffDays: number;
  totalTravelDays: number;
  deadDayCount: number;
  deadDayRatio: number;
  efficiencyRatio: number;
  operationalLoadPerShow: number;
  loadedCostPerShowDay: number;
  consecutiveOffDayMax: number;
  consecutiveBurnDaysMax: number;
  highBurnTravelDayCount: number;
  worstTravelDayDistance: number;
  worstTravelDayBurn: number;
}

export interface TourRiskCategoryScore {
  score: number;
  explanation: string;
}

export interface TourRiskCategoryScores {
  concentrationRisk: TourRiskCategoryScore;
  liquidityRisk: TourRiskCategoryScore;
  structuralFragility: TourRiskCategoryScore;
  logisticsPressure: TourRiskCategoryScore;
  revenueVolatility: TourRiskCategoryScore;
}

export interface AnchorCollapseStressTest {
  anchorShowId: number | string | null;
  anchorShowName: string | null;
  anchorProfitContributionShare: number;
  anchorNetImpact: number;
  anchorCollapseNet: number;
  anchorCollapseMarginPercent: number;
  remainsViableWithoutAnchor: boolean;
  recoverableAnchorCosts: number;
  deadDayRatio: number;
  activeDayCoverageRatio: number;
  anchorCollapseWithBurnNet: number;
}

export interface DistanceToRuinStressTest {
  revenueSensitiveIncome: number;
  loadedBreakevenRevenueThreshold: number;
  costPerShowDay: number;
  operationalLoadPerShow: number;
  distanceToRuinRatio: number;
  distanceToRuinPercent: number;
  riskBand: string;
}

export interface LogisticsSpikeStressTest {
  logisticsOpEx: number;
  spikeCostIncrease: number;
  postSpikeNet: number;
  netErosionPercent: number | null;
  highBurnTravelDayCount: number;
  worstTravelDayDistance: number;
  worstTravelDayBurn: number;
}

export interface TourRiskStressTests {
  anchorCollapse: AnchorCollapseStressTest;
  distanceToRuin: DistanceToRuinStressTest;
  logisticsSpike: LogisticsSpikeStressTest;
}

export interface TourRiskSummary {
  overallScore: number;
  label: string;
  primaryConcern: string;
  confidenceLevel: RiskConfidenceLevel;
}

export interface TourRiskWeakShow {
  showId: number | string;
  venueName: string;
  date: string | null;
  netProfit: number;
  travelBurden: number;
  explanation: string;
}

export interface TourRiskResult {
  riskSummary: TourRiskSummary;
  stressTests: TourRiskStressTests;
  categoryScores: TourRiskCategoryScores;
  flags: {
    redFlags: TourRiskFlag[];
    amberFlags: TourRiskFlag[];
  };
  recommendations: TourRiskRecommendation[];
  summaryText: string;
  insufficientData: boolean;
  scheduleMetrics: TourRiskScheduleMetrics;
  weakestShows: TourRiskWeakShow[];
}

type CategoryResult = TourRiskCategoryScore & {
  reason: string;
};

export function getTourRiskLabel(score: number): string {
  const clamped = clamp(Math.round(score), 0, 100);
  return TOUR_RISK_CONFIG.labels.find((entry) => clamped <= entry.max)?.label ?? "High Stakes / Dangerous";
}

function isRevenueAssumptionMissing(input: TourRiskShowSnapshotInput): boolean {
  if (input.showType === "Flat Fee") return n(input.fee) <= 0;
  const ticketedMissing =
    n(input.capacity) <= 0 ||
    n(input.ticketPrice) <= 0 ||
    input.expectedAttendancePct == null ||
    n(input.expectedAttendancePct) <= 0;
  if (input.showType === "Hybrid") return n(input.guarantee) <= 0 && ticketedMissing;
  return ticketedMissing;
}

export function buildTourRiskShowSnapshot(input: TourRiskShowSnapshotInput): TourRiskShowSnapshot {
  const showIncomeResult = calculateShowIncome({
    showType: input.showType,
    fee: input.fee,
    capacity: input.capacity,
    ticketPrice: input.ticketPrice,
    expectedAttendancePct: input.expectedAttendancePct,
    dealType: input.dealType,
    splitPct: input.splitPct,
    guarantee: input.guarantee,
  });

  const expectedTickets = showIncomeResult.expectedTicketsSold;
  const merchRevenue = roundCurrency(n(input.merchEstimate));
  const otherRevenue = roundCurrency(n(input.otherRevenue));
  const guarantee = roundCurrency(n(input.guarantee));
  const fee = roundCurrency(n(input.fee));
  const totalCosts = roundCurrency(n(input.totalCosts));
  const showIncome = roundCurrency(showIncomeResult.showIncome);

  let guaranteeIncome = 0;
  let ticketRevenue = 0;
  let ticketRevenueBase = 0;
  let guaranteeFloorAppliesToTicketRevenue = false;

  if (input.showType === "Flat Fee") {
    guaranteeIncome = fee;
  } else if (input.showType === "Hybrid") {
    guaranteeIncome = guarantee;
    ticketRevenueBase = Math.max(0, showIncome - guaranteeIncome);
    ticketRevenue = ticketRevenueBase;
  } else if (input.showType === "Ticketed Show" && input.dealType === "guarantee vs door") {
    const splitPct = n(input.splitPct) > 0 ? n(input.splitPct) / 100 : 1;
    const doorShare = roundCurrency(showIncomeResult.netTicketRevenue * splitPct);
    guaranteeIncome = guarantee;
    ticketRevenueBase = doorShare;
    ticketRevenue = Math.max(0, roundCurrency(doorShare - guaranteeIncome));
    guaranteeFloorAppliesToTicketRevenue = guaranteeIncome > 0;
  } else {
    ticketRevenueBase = showIncome;
    ticketRevenue = showIncome;
  }

  const grossIncome = roundCurrency(guaranteeIncome + ticketRevenue + merchRevenue + otherRevenue);
  const netProfit = roundCurrency(grossIncome - totalCosts);
  const marginPercent = grossIncome > 0 ? roundRatio(netProfit / grossIncome) : 0;

  const breakEven = calculateTicketBreakEven({
    showType: input.showType,
    dealType: input.dealType,
    ticketPrice: n(input.ticketPrice),
    splitPct: input.splitPct,
    guarantee: input.guarantee,
    capacity: n(input.capacity),
    totalCost: totalCosts,
    merchEstimate: input.merchEstimate,
  });

  return {
    showId: input.showId,
    date: input.date ?? null,
    venueName: input.venueName,
    showType: input.showType,
    dealType: input.dealType ?? null,
    grossIncome,
    guaranteeIncome: roundCurrency(guaranteeIncome),
    ticketRevenue: roundCurrency(ticketRevenue),
    ticketRevenueBase: roundCurrency(ticketRevenueBase),
    guaranteeFloorAppliesToTicketRevenue,
    merchRevenue,
    otherRevenue,
    totalCosts,
    fuelCost: roundCurrency(n(input.fuelCost)),
    accommodationCost: roundCurrency(n(input.accommodationCost)),
    travelDistance: roundCurrency(n(input.travelDistance)),
    travelHours: roundRatio(n(input.travelHours)),
    expectedTickets,
    breakEvenTickets: breakEven.breakEvenTickets,
    netProfit,
    marginPercent,
    variableCostFlags: uniqueStrings(input.variableCostFlags ?? []),
    missingRevenueAssumptions: isRevenueAssumptionMissing(input),
  };
}

function normalizeDaySnapshot(input: TourRiskDaySnapshotInput): TourRiskDaySnapshot {
  const hasShow = Boolean(input.hasShow ?? input.showId);
  const travelDistance = roundCurrency(n(input.travelDistance));
  const dailyTravelBurn = roundCurrency(n(input.dailyTravelBurn));
  const fixedOperatingCosts = roundCurrency(n(input.fixedOperatingCosts));
  const accommodationCost = roundCurrency(n(input.accommodationCost));
  const showSpecificCosts = roundCurrency(n(input.showSpecificCosts));
  const type: TourRiskDayType =
    input.type ??
    (hasShow
      ? "show_day"
      : travelDistance >= TOUR_RISK_CONFIG.schedule.highTravelDayDistanceKm || dailyTravelBurn > 0
        ? "travel_day"
        : "day_off");
  const burnCost = roundCurrency(fixedOperatingCosts + accommodationCost + dailyTravelBurn);
  const revenue = roundCurrency(n(input.revenue));

  return {
    date: input.date,
    type,
    hasShow,
    showId: input.showId ?? null,
    revenue,
    showSpecificCosts,
    fixedOperatingCosts,
    accommodationCost,
    travelDistance,
    travelHours: roundRatio(n(input.travelHours)),
    dailyTravelBurn,
    burnCost,
    netImpact: roundCurrency(revenue - showSpecificCosts - burnCost),
  };
}

function deriveDayResultsFromShows(showResults: TourRiskShowSnapshot[], runDays: number, totalCosts: number): TourRiskDaySnapshot[] {
  const showDays = showResults.map((show, index) => {
    const travelBurn = show.fuelCost;
    const accommodationCost = show.accommodationCost;
    const showSpecificCosts = Math.max(0, show.totalCosts - travelBurn - accommodationCost);
    return normalizeDaySnapshot({
      date: show.date ?? `show-day-${index + 1}`,
      type: "show_day",
      hasShow: true,
      showId: show.showId,
      revenue: show.grossIncome,
      showSpecificCosts,
      accommodationCost,
      travelDistance: show.travelDistance,
      travelHours: show.travelHours,
      dailyTravelBurn: travelBurn,
    });
  });

  const missingDayCount = Math.max(0, Math.round(runDays) - showDays.length);
  if (missingDayCount === 0) return showDays;

  const knownDayCost = showDays.reduce((sum, day) => sum + day.showSpecificCosts + day.burnCost, 0);
  const fallbackBurn = missingDayCount > 0 ? Math.max(0, totalCosts - knownDayCost) / missingDayCount : 0;
  const offDays = Array.from({ length: missingDayCount }, (_, index) =>
    normalizeDaySnapshot({
      date: `off-day-${index + 1}`,
      type: "day_off",
      fixedOperatingCosts: fallbackBurn,
    }),
  );

  return [...showDays, ...offDays];
}

function assignTravelToEmptyDays(days: TourRiskDaySnapshot[]): TourRiskDaySnapshot[] {
  const normalized = [...days].sort((left, right) => left.date.localeCompare(right.date));

  for (let index = 1; index < normalized.length; index++) {
    const day = normalized[index];
    const previousDay = normalized[index - 1];
    const canShiftTravel =
      day.hasShow &&
      !previousDay.hasShow &&
      previousDay.travelDistance === 0 &&
      day.travelDistance >= TOUR_RISK_CONFIG.schedule.highTravelDayDistanceKm;

    if (!canShiftTravel) continue;

    normalized[index - 1] = normalizeDaySnapshot({
      ...previousDay,
      type: "travel_day",
      travelDistance: day.travelDistance,
      travelHours: day.travelHours,
      dailyTravelBurn: day.dailyTravelBurn,
    });
    normalized[index] = normalizeDaySnapshot({
      ...day,
      travelDistance: 0,
      travelHours: 0,
      dailyTravelBurn: 0,
    });
  }

  return normalized;
}

function buildDayResults(
  inputDays: TourRiskDaySnapshotInput[] | undefined,
  showResults: TourRiskShowSnapshot[],
  runDays: number,
  totalCosts: number,
): TourRiskDaySnapshot[] {
  const dayResults = inputDays && inputDays.length > 0
    ? inputDays.map(normalizeDaySnapshot)
    : deriveDayResultsFromShows(showResults, runDays, totalCosts);

  return assignTravelToEmptyDays(dayResults);
}

function getMaxConsecutive(days: TourRiskDaySnapshot[], predicate: (day: TourRiskDaySnapshot) => boolean): number {
  let current = 0;
  let max = 0;
  for (const day of days) {
    if (predicate(day)) {
      current += 1;
      max = Math.max(max, current);
    } else {
      current = 0;
    }
  }
  return max;
}

function buildScheduleMetrics(dayResults: TourRiskDaySnapshot[], totalCosts: number): TourRiskScheduleMetrics {
  const totalCalendarDays = dayResults.length;
  const totalShowDays = dayResults.filter((day) => day.hasShow).length;
  const totalTravelDays = dayResults.filter((day) => !day.hasShow && day.type === "travel_day").length;
  const totalOffDays = dayResults.filter((day) => !day.hasShow && day.type !== "travel_day").length;
  const deadDayCount = totalOffDays + totalTravelDays;
  const highBurnTravelDays = dayResults.filter(
    (day) => !day.hasShow && day.travelDistance >= TOUR_RISK_CONFIG.schedule.highTravelDayDistanceKm,
  );
  const worstTravelDay = highBurnTravelDays
    .slice()
    .sort((left, right) => right.travelDistance - left.travelDistance || right.burnCost - left.burnCost)[0];

  return {
    totalCalendarDays,
    totalShowDays,
    totalOffDays,
    totalTravelDays,
    deadDayCount,
    deadDayRatio: roundRatio(ratio(deadDayCount, totalCalendarDays)),
    efficiencyRatio: roundRatio(ratio(totalShowDays, totalCalendarDays)),
    operationalLoadPerShow: roundRatio(totalShowDays > 0 ? totalCalendarDays / totalShowDays : totalCalendarDays),
    loadedCostPerShowDay: roundCurrency(totalShowDays > 0 ? totalCosts / totalShowDays : totalCosts),
    consecutiveOffDayMax: getMaxConsecutive(dayResults, (day) => !day.hasShow),
    consecutiveBurnDaysMax: getMaxConsecutive(dayResults, (day) => day.revenue <= 0 && day.burnCost > 0),
    highBurnTravelDayCount: highBurnTravelDays.length,
    worstTravelDayDistance: roundCurrency(worstTravelDay?.travelDistance ?? 0),
    worstTravelDayBurn: roundCurrency(worstTravelDay?.burnCost ?? 0),
  };
}

export function createTourRiskSnapshot(input: TourRiskSnapshotInput): TourRiskSnapshot {
  const showResults = input.showResults.map((show) => ({
    ...show,
    variableCostFlags: uniqueStrings(show.variableCostFlags),
    missingRevenueAssumptions: Boolean(show.missingRevenueAssumptions),
  }));

  const totalGrossIncome = roundCurrency(
    input.totalGrossIncome ?? showResults.reduce((sum, show) => sum + show.grossIncome, 0),
  );
  const totalGuaranteeIncome = roundCurrency(
    input.totalGuaranteeIncome ?? showResults.reduce((sum, show) => sum + show.guaranteeIncome, 0),
  );
  const totalTicketRevenue = roundCurrency(
    input.totalTicketRevenue ?? showResults.reduce((sum, show) => sum + show.ticketRevenue, 0),
  );
  const totalMerchRevenue = roundCurrency(
    input.totalMerchRevenue ?? showResults.reduce((sum, show) => sum + show.merchRevenue, 0),
  );
  const totalOtherRevenue = roundCurrency(
    input.totalOtherRevenue ?? showResults.reduce((sum, show) => sum + show.otherRevenue, 0),
  );
  const totalCosts = roundCurrency(input.totalCosts);
  const totalNetProfit = roundCurrency(input.totalNetProfit);
  const overallMarginPercent =
    input.overallMarginPercent != null
      ? roundRatio(input.overallMarginPercent)
      : totalGrossIncome > 0
        ? roundRatio(totalNetProfit / totalGrossIncome)
        : 0;

  const profitableShowCount = showResults.filter((show) => show.netProfit > 0).length;
  const lossMakingShowCount = showResults.filter((show) => show.netProfit < 0).length;
  const speculativeShowCount = showResults.filter((show) => isSpeculativeShow(show)).length;
  const runDays = Math.round(n(input.runDays)) || input.dayResults?.length || showResults.length;
  const dayResults = buildDayResults(input.dayResults, showResults, runDays || showResults.length, totalCosts);
  const scheduleMetrics = buildScheduleMetrics(dayResults, totalCosts);

  return {
    totalGrossIncome,
    totalGuaranteeIncome,
    totalTicketRevenue,
    totalMerchRevenue,
    totalOtherRevenue,
    totalCosts,
    totalFuelCost: roundCurrency(n(input.totalFuelCost)),
    totalAccommodationCost: roundCurrency(n(input.totalAccommodationCost)),
    totalNetProfit,
    overallMarginPercent,
    totalDistance: roundCurrency(n(input.totalDistance)),
    totalTravelHours: roundRatio(n(input.totalTravelHours)),
    breakEvenPoint: Math.round(n(input.breakEvenPoint)),
    expectedTicketTotals: Math.round(n(input.expectedTicketTotals)),
    runDays,
    showCount: input.showResults.length,
    profitableShowCount,
    lossMakingShowCount,
    volatileCostFlags: uniqueStrings([
      ...(input.volatileCostFlags ?? []),
      ...showResults.flatMap((show) => show.variableCostFlags),
    ]),
    tourIntent: input.tourIntent ?? "profit",
    missingRevenueAssumptionCount: showResults.filter((show) => show.missingRevenueAssumptions).length,
    speculativeShowCount,
    dayResults,
    scheduleMetrics,
    showResults,
  };
}

function isSpeculativeShow(show: TourRiskShowSnapshot): boolean {
  if (show.missingRevenueAssumptions) return true;
  if (show.grossIncome <= 0) return true;
  const protectedIncomeShare = show.guaranteeIncome / show.grossIncome;
  return protectedIncomeShare < TOUR_RISK_CONFIG.revenueVolatility.weakGuaranteedIncomeShare &&
    (show.ticketRevenue + show.merchRevenue + show.otherRevenue) > 0;
}

function getPositiveProfitShares(snapshot: TourRiskSnapshot) {
  const positiveShows = snapshot.showResults
    .filter((show) => show.netProfit > 0)
    .sort((left, right) => right.netProfit - left.netProfit);
  const totalPositiveProfit = positiveShows.reduce((sum, show) => sum + show.netProfit, 0);
  const topShow = positiveShows[0] ?? null;
  const topShowProfitShare = totalPositiveProfit > 0 && topShow ? topShow.netProfit / totalPositiveProfit : 0;
  const top2ShowProfitShare =
    totalPositiveProfit > 0
      ? ((positiveShows[0]?.netProfit ?? 0) + (positiveShows[1]?.netProfit ?? 0)) / totalPositiveProfit
      : 0;

  return {
    positiveShows,
    totalPositiveProfit,
    topShow,
    topShowProfitShare,
    top2ShowProfitShare,
  };
}

function findAnchorShow(snapshot: TourRiskSnapshot): {
  show: TourRiskShowSnapshot | null;
  contributionShare: number;
  totalPositiveProfit: number;
} {
  const { totalPositiveProfit, topShow, topShowProfitShare } = getPositiveProfitShares(snapshot);
  if (totalPositiveProfit > 0) {
    return { show: topShow, contributionShare: topShowProfitShare, totalPositiveProfit };
  }

  const fallback = [...snapshot.showResults].sort((left, right) => {
    if (right.guaranteeIncome !== left.guaranteeIncome) return right.guaranteeIncome - left.guaranteeIncome;
    return (right.grossIncome - right.totalCosts) - (left.grossIncome - left.totalCosts);
  })[0] ?? null;

  return { show: fallback, contributionShare: 0, totalPositiveProfit };
}

export function buildAnchorCollapseStressTest(snapshot: TourRiskSnapshot): AnchorCollapseStressTest {
  const { show: anchor, contributionShare } = findAnchorShow(snapshot);
  if (!anchor) {
    return {
      anchorShowId: null,
      anchorShowName: null,
      anchorProfitContributionShare: 0,
      anchorNetImpact: 0,
      anchorCollapseNet: snapshot.totalNetProfit,
      anchorCollapseMarginPercent: snapshot.overallMarginPercent,
      remainsViableWithoutAnchor: snapshot.totalNetProfit >= 0,
      recoverableAnchorCosts: 0,
      deadDayRatio: snapshot.scheduleMetrics.deadDayRatio,
      activeDayCoverageRatio: snapshot.scheduleMetrics.efficiencyRatio,
      anchorCollapseWithBurnNet: snapshot.totalNetProfit,
    };
  }

  const anchorDay = snapshot.dayResults.find((day) => day.hasShow && String(day.showId) === String(anchor.showId));
  const routeCosts = anchorDay?.dailyTravelBurn ?? anchor.fuelCost;
  const accommodationCosts = anchorDay?.accommodationCost ?? anchor.accommodationCost;
  const showSpecificCosts = anchorDay?.showSpecificCosts ?? Math.max(0, anchor.totalCosts - routeCosts - accommodationCosts);
  const recoverableAnchorCosts = roundCurrency(
    showSpecificCosts * TOUR_RISK_CONFIG.costRecovery.showSpecificCostRecoveryRate +
    accommodationCosts * TOUR_RISK_CONFIG.costRecovery.accommodationRecoveryRate +
    routeCosts * TOUR_RISK_CONFIG.costRecovery.routeCostRecoveryRate,
  );
  const anchorLostRevenue = anchor.grossIncome;
  const anchorNetImpact = roundCurrency(anchorLostRevenue - recoverableAnchorCosts);
  const anchorCollapseNet = roundCurrency(snapshot.totalNetProfit - anchorNetImpact);
  const anchorCollapseGross = Math.max(0, snapshot.totalGrossIncome - anchorLostRevenue);
  const anchorCollapseMarginPercent = anchorCollapseGross > 0
    ? roundRatio(anchorCollapseNet / anchorCollapseGross)
    : 0;

  return {
    anchorShowId: anchor.showId,
    anchorShowName: anchor.venueName,
    anchorProfitContributionShare: roundRatio(contributionShare),
    anchorNetImpact,
    anchorCollapseNet,
    anchorCollapseMarginPercent,
    remainsViableWithoutAnchor: anchorCollapseNet >= 0,
    recoverableAnchorCosts,
    deadDayRatio: snapshot.scheduleMetrics.deadDayRatio,
    activeDayCoverageRatio: snapshot.scheduleMetrics.efficiencyRatio,
    anchorCollapseWithBurnNet: anchorCollapseNet,
  };
}

function getDistanceToRuinRiskBand(distanceToRuinPercent: number, revenueSensitiveIncome: number): string {
  if (revenueSensitiveIncome <= 0) return "No variable revenue context";
  if (distanceToRuinPercent < TOUR_RISK_CONFIG.revenueVolatility.criticalDistanceToRuin) return "Critical";
  if (distanceToRuinPercent < TOUR_RISK_CONFIG.revenueVolatility.dangerousDistanceToRuin) return "Dangerous";
  if (distanceToRuinPercent < TOUR_RISK_CONFIG.revenueVolatility.fragileDistanceToRuin) return "Fragile";
  if (distanceToRuinPercent < TOUR_RISK_CONFIG.revenueVolatility.guardedDistanceToRuin) return "Guarded";
  if (distanceToRuinPercent < TOUR_RISK_CONFIG.revenueVolatility.strongDistanceToRuin) return "Decent";
  return "Strong";
}

export function buildDistanceToRuinStressTest(snapshot: TourRiskSnapshot): DistanceToRuinStressTest {
  const revenueSensitiveIncome = roundCurrency(
    snapshot.totalTicketRevenue + snapshot.totalMerchRevenue + snapshot.totalOtherRevenue,
  );
  const distanceToRuinRatio = revenueSensitiveIncome > 0
    ? clamp(snapshot.totalNetProfit / revenueSensitiveIncome, 0, 1)
    : snapshot.totalNetProfit > 0
      ? 1
      : 0;
  const distanceToRuinPercent = roundRatio(distanceToRuinRatio) * 100;

  return {
    revenueSensitiveIncome,
    loadedBreakevenRevenueThreshold: snapshot.totalCosts,
    costPerShowDay: snapshot.scheduleMetrics.loadedCostPerShowDay,
    operationalLoadPerShow: snapshot.scheduleMetrics.operationalLoadPerShow,
    distanceToRuinRatio: roundRatio(distanceToRuinRatio),
    distanceToRuinPercent: roundRatio(distanceToRuinPercent),
    riskBand: getDistanceToRuinRiskBand(distanceToRuinPercent, revenueSensitiveIncome),
  };
}

export function buildLogisticsSpikeStressTest(snapshot: TourRiskSnapshot): LogisticsSpikeStressTest {
  const dayLogisticsOpEx = snapshot.dayResults.reduce(
    (sum, day) => sum + day.dailyTravelBurn + day.accommodationCost,
    0,
  );
  const logisticsOpEx = roundCurrency(dayLogisticsOpEx || snapshot.totalFuelCost + snapshot.totalAccommodationCost);
  const highBurnTravelDayLoad = snapshot.dayResults
    .filter((day) => !day.hasShow && day.travelDistance >= TOUR_RISK_CONFIG.schedule.highTravelDayDistanceKm)
    .reduce((sum, day) => sum + day.dailyTravelBurn, 0);
  const spikeCostIncrease = roundCurrency((logisticsOpEx + highBurnTravelDayLoad) * TOUR_RISK_CONFIG.logisticsSpikeRate);
  const postSpikeNet = roundCurrency(snapshot.totalNetProfit - spikeCostIncrease);
  const netErosionPercent = snapshot.totalNetProfit > 0
    ? roundRatio((snapshot.totalNetProfit - postSpikeNet) / snapshot.totalNetProfit)
    : null;

  return {
    logisticsOpEx,
    spikeCostIncrease,
    postSpikeNet,
    netErosionPercent,
    highBurnTravelDayCount: snapshot.scheduleMetrics.highBurnTravelDayCount,
    worstTravelDayDistance: snapshot.scheduleMetrics.worstTravelDayDistance,
    worstTravelDayBurn: snapshot.scheduleMetrics.worstTravelDayBurn,
  };
}

function getConcentrationRisk(snapshot: TourRiskSnapshot): CategoryResult {
  const { topShowProfitShare, top2ShowProfitShare } = getPositiveProfitShares(snapshot);
  let score = 0;

  if (topShowProfitShare <= TOUR_RISK_CONFIG.concentration.topShowLow) score = 0;
  else if (topShowProfitShare <= TOUR_RISK_CONFIG.concentration.topShowGuarded) score = 10;
  else if (topShowProfitShare <= TOUR_RISK_CONFIG.concentration.topShowFragile) score = 20;
  else score = 30;

  if (top2ShowProfitShare > TOUR_RISK_CONFIG.concentration.topTwoHigh) score += 10;
  else if (top2ShowProfitShare > TOUR_RISK_CONFIG.concentration.topTwoFragile) score += 7;
  else if (top2ShowProfitShare > TOUR_RISK_CONFIG.concentration.topTwoGuarded) score += 3;

  score = clamp(score, 0, 30);

  if (score >= 25) {
    return {
      score,
      explanation: "Profit is heavily concentrated in one or two dates, so the tour has a clear single-point-of-failure problem.",
      reason: "One or two dates are carrying too much of the run.",
    };
  }
  if (score >= 10) {
    return {
      score,
      explanation: "The tour has some anchor-date dependence, but it is not fully balanced across the run.",
      reason: "Profit is somewhat concentrated in the strongest dates.",
    };
  }
  return {
    score,
    explanation: "Positive profit is spread well enough across the route.",
    reason: "Profit is reasonably diversified across the run.",
  };
}

function getLiquidityRisk(snapshot: TourRiskSnapshot): CategoryResult {
  const guaranteeCoverage = ratio(snapshot.totalGuaranteeIncome, snapshot.totalCosts);
  const upfrontRouteCosts = snapshot.totalFuelCost + snapshot.totalAccommodationCost;
  const upfrontCostExposure = ratio(Math.max(0, upfrontRouteCosts - snapshot.totalGuaranteeIncome), snapshot.totalCosts);
  const schedule = snapshot.scheduleMetrics;
  let score = 0;

  if (snapshot.overallMarginPercent <= 0) score += snapshot.tourIntent === "strategic_loss_leader" ? 4 : 10;
  else if (snapshot.overallMarginPercent < TOUR_RISK_CONFIG.liquidity.thinMargin) score += 8;
  else if (snapshot.overallMarginPercent < TOUR_RISK_CONFIG.liquidity.guardedMargin) score += 6;
  else if (snapshot.overallMarginPercent < TOUR_RISK_CONFIG.liquidity.healthyMargin) score += 3;

  if (guaranteeCoverage < TOUR_RISK_CONFIG.liquidity.weakGuaranteeCoverage) score += 8;
  else if (guaranteeCoverage < TOUR_RISK_CONFIG.liquidity.workableGuaranteeCoverage) score += 6;
  else if (guaranteeCoverage < TOUR_RISK_CONFIG.liquidity.strongGuaranteeCoverage) score += 3;

  if (upfrontCostExposure > 0.5) score += 7;
  else if (upfrontCostExposure > 0.3) score += 4;
  else if (upfrontCostExposure > 0.15) score += 2;

  if (schedule.deadDayRatio > TOUR_RISK_CONFIG.schedule.redDeadDayRatio) score += 5;
  else if (schedule.deadDayRatio >= TOUR_RISK_CONFIG.schedule.amberDeadDayRatio) score += 3;

  if (schedule.operationalLoadPerShow >= TOUR_RISK_CONFIG.schedule.severeOperationalLoadPerShow) score += 4;
  else if (schedule.operationalLoadPerShow > TOUR_RISK_CONFIG.schedule.highOperationalLoadPerShow) score += 2;

  if (schedule.consecutiveBurnDaysMax >= TOUR_RISK_CONFIG.schedule.consecutiveBurnDaysHigh) score += 3;

  score = clamp(score, 0, 25);

  if (score >= 18) {
    return {
      score,
      explanation: "The cash buffer is thin once guarantee coverage, upfront costs, and empty-day burn are all counted.",
      reason: "The run has weak liquidity protection.",
    };
  }
  if (score >= 8) {
    return {
      score,
      explanation: "The tour has some buffer, but spacing, margin, or guarantee coverage is not especially forgiving.",
      reason: "Cash-flow protection is only moderate.",
    };
  }
  return {
    score,
    explanation: "Margin and guaranteed coverage give the tour a useful operating cushion.",
    reason: "The run has a healthy liquidity cushion.",
  };
}

function getStructuralFragilityRisk(snapshot: TourRiskSnapshot, anchorCollapse: AnchorCollapseStressTest): CategoryResult {
  let score = 0;

  if (!anchorCollapse.remainsViableWithoutAnchor || anchorCollapse.anchorCollapseNet < 0) score = 20;
  else if (anchorCollapse.anchorCollapseMarginPercent <= 0) score = 18;
  else if (anchorCollapse.anchorCollapseMarginPercent <= TOUR_RISK_CONFIG.structuralFragility.thinMargin) score = 16;
  else if (anchorCollapse.anchorCollapseMarginPercent <= TOUR_RISK_CONFIG.structuralFragility.guardedMargin) score = 12;
  else if (anchorCollapse.anchorCollapseMarginPercent <= TOUR_RISK_CONFIG.structuralFragility.healthyMargin) score = 7;
  else score = 2;

  if (snapshot.scheduleMetrics.deadDayRatio > TOUR_RISK_CONFIG.schedule.sparseDeadDayRatio) score += 3;
  if (snapshot.scheduleMetrics.efficiencyRatio < TOUR_RISK_CONFIG.schedule.weakEfficiencyRatio) score += 3;
  if (snapshot.scheduleMetrics.totalShowDays <= 2 && snapshot.scheduleMetrics.totalCalendarDays > snapshot.scheduleMetrics.totalShowDays) score += 2;
  score = clamp(score, 0, 20);

  if (score >= 18) {
    return {
      score,
      explanation: "The tour does not survive the anchor-date collapse cleanly, especially once schedule sparsity is counted.",
      reason: "The route is not viable without its anchor date.",
    };
  }
  if (score >= 10) {
    return {
      score,
      explanation: "The tour survives losing its anchor, but the remaining result is thin.",
      reason: "The anchor collapse leaves only a narrow safety buffer.",
    };
  }
  return {
    score,
    explanation: "The tour remains structurally viable even if its strongest date disappears.",
    reason: "The run can still withstand losing its anchor date.",
  };
}

function getLogisticsPressureRisk(
  snapshot: TourRiskSnapshot,
  logisticsSpike: LogisticsSpikeStressTest,
): CategoryResult {
  const logisticsOpExShare = ratio(logisticsSpike.logisticsOpEx, snapshot.totalGrossIncome);
  const schedule = snapshot.scheduleMetrics;
  let score = 0;

  if (logisticsSpike.postSpikeNet < 0) score += 8;
  if ((logisticsSpike.netErosionPercent ?? 0) > TOUR_RISK_CONFIG.logistics.highNetErosion) score += 5;

  if (logisticsOpExShare >= TOUR_RISK_CONFIG.logistics.highOpExShare) score += 6;
  else if (logisticsOpExShare >= TOUR_RISK_CONFIG.logistics.pressuredOpExShare) score += 4;
  else if (logisticsOpExShare >= TOUR_RISK_CONFIG.logistics.noticeableOpExShare) score += 2;

  if (schedule.totalTravelDays >= 2) score += 2;
  if (schedule.highBurnTravelDayCount > 0) score += Math.min(4, schedule.highBurnTravelDayCount * 2);
  if (schedule.deadDayRatio > TOUR_RISK_CONFIG.schedule.sparseDeadDayRatio && logisticsSpike.postSpikeNet < 0) score += 2;

  score = clamp(score, 0, 15);

  if (score >= 11) {
    return {
      score,
      explanation: "Route operating costs and non-show travel days are heavy enough that a normal logistics spike could damage or erase the tour result.",
      reason: "Logistics pressure is high relative to the return.",
    };
  }
  if (score >= 5) {
    return {
      score,
      explanation: "Fuel and accommodation are meaningful enough to watch, even though they do not overwhelm the result yet.",
      reason: "Route costs create some operating pressure.",
    };
  }
  return {
    score,
    explanation: "Route operating costs look proportionate to the current return.",
    reason: "Logistics pressure is contained.",
  };
}

function getRevenueVolatilityRisk(
  snapshot: TourRiskSnapshot,
  distanceToRuin: DistanceToRuinStressTest,
): CategoryResult {
  const percentGuaranteedIncome = ratio(snapshot.totalGuaranteeIncome, snapshot.totalGrossIncome);
  const speculativeShowShare = ratio(snapshot.speculativeShowCount, snapshot.showCount);
  const schedule = snapshot.scheduleMetrics;
  let score = 0;

  if (distanceToRuin.revenueSensitiveIncome > 0) {
    if (distanceToRuin.distanceToRuinPercent < TOUR_RISK_CONFIG.revenueVolatility.criticalDistanceToRuin) score += 5;
    else if (distanceToRuin.distanceToRuinPercent < TOUR_RISK_CONFIG.revenueVolatility.fragileDistanceToRuin) score += 4;
    else if (distanceToRuin.distanceToRuinPercent < TOUR_RISK_CONFIG.revenueVolatility.guardedDistanceToRuin) score += 2;
  }

  if (percentGuaranteedIncome < TOUR_RISK_CONFIG.revenueVolatility.weakGuaranteedIncomeShare) score += 4;
  else if (percentGuaranteedIncome < TOUR_RISK_CONFIG.revenueVolatility.guardedGuaranteedIncomeShare) score += 2;

  if (speculativeShowShare > 0.5) score += 2;
  else if (speculativeShowShare > 0.3) score += 1;

  if (schedule.deadDayRatio > TOUR_RISK_CONFIG.schedule.sparseDeadDayRatio && percentGuaranteedIncome < TOUR_RISK_CONFIG.revenueVolatility.weakGuaranteedIncomeShare) score += 2;
  if (schedule.efficiencyRatio < TOUR_RISK_CONFIG.schedule.weakEfficiencyRatio && distanceToRuin.distanceToRuinPercent < TOUR_RISK_CONFIG.revenueVolatility.fragileDistanceToRuin) score += 2;

  score = clamp(score, 0, 10);

  if (score >= 7) {
    return {
      score,
      explanation: "The tour depends heavily on variable revenue and has limited room before profit disappears.",
      reason: "Revenue volatility could wipe out the tour's upside quickly.",
    };
  }
  if (score >= 3) {
    return {
      score,
      explanation: "Some of the result relies on variable income rather than protected money.",
      reason: "There is moderate dependence on speculative revenue.",
    };
  }
  return {
    score,
    explanation: "The tour is not overly reliant on speculative backend revenue.",
    reason: "Revenue volatility is controlled.",
  };
}

function buildFlags(
  snapshot: TourRiskSnapshot,
  stressTests: TourRiskStressTests,
): { redFlags: TourRiskFlag[]; amberFlags: TourRiskFlag[] } {
  const redFlags: TourRiskFlag[] = [];
  const amberFlags: TourRiskFlag[] = [];
  const { topShowProfitShare, top2ShowProfitShare } = getPositiveProfitShares(snapshot);
  const guaranteeCoverage = ratio(snapshot.totalGuaranteeIncome, snapshot.totalCosts);
  const weakMargin = snapshot.overallMarginPercent < TOUR_RISK_CONFIG.liquidity.guardedMargin;
  const missingRevenueShare = ratio(snapshot.missingRevenueAssumptionCount, snapshot.showCount);
  const speculativeShowShare = ratio(snapshot.speculativeShowCount, snapshot.showCount);
  const schedule = snapshot.scheduleMetrics;

  if (stressTests.anchorCollapse.anchorCollapseNet < 0) {
    redFlags.push({
      code: "anchor_collapse_negative",
      label: "Tour fails without anchor date",
      explanation: `${stressTests.anchorCollapse.anchorShowName ?? "The anchor date"} appears essential to keeping the tour profitable.`,
    });
  }

  if (stressTests.logisticsSpike.postSpikeNet < 0) {
    redFlags.push({
      code: "logistics_spike_negative",
      label: "Logistics spike turns tour negative",
      explanation: "A 20% rise in core travel and accommodation costs pushes the run into the red.",
    });
  }

  if (
    stressTests.distanceToRuin.revenueSensitiveIncome > 0 &&
    stressTests.distanceToRuin.distanceToRuinPercent < TOUR_RISK_CONFIG.revenueVolatility.criticalDistanceToRuin
  ) {
    redFlags.push({
      code: "tiny_distance_to_ruin",
      label: "Tiny distance to ruin",
      explanation: "Only a small fall in variable revenue would erase the tour profit.",
    });
  }

  if (topShowProfitShare > TOUR_RISK_CONFIG.concentration.topShowFragile) {
    redFlags.push({
      code: "top_show_concentration",
      label: "One show carries too much profit",
      explanation: "More than half of positive tour profit comes from one date.",
    });
  }

  if (top2ShowProfitShare > TOUR_RISK_CONFIG.concentration.topTwoHigh && weakMargin) {
    redFlags.push({
      code: "top_two_dependency_weak_margin",
      label: "Two dates carry a thin run",
      explanation: "The top two dates carry most of the profit while the overall margin remains weak.",
    });
  }

  if (snapshot.totalNetProfit < 0 && snapshot.tourIntent !== "strategic_loss_leader") {
    redFlags.push({
      code: "tour_negative",
      label: "Tour net is negative",
      explanation: "The run is losing money against a profit or break-even intent.",
    });
  }

  if (schedule.deadDayRatio > TOUR_RISK_CONFIG.schedule.redDeadDayRatio) {
    redFlags.push({
      code: "high_dead_day_ratio",
      label: "Too many non-earning days",
      explanation: "More than 40% of the calendar is off or travel time with no venue income.",
    });
  }

  if (schedule.efficiencyRatio < TOUR_RISK_CONFIG.schedule.weakEfficiencyRatio && weakMargin) {
    redFlags.push({
      code: "weak_efficiency_thin_margin",
      label: "Sparse schedule with weak margin",
      explanation: "The run has more non-earning time than earning time and does not have much margin to absorb it.",
    });
  }

  if (stressTests.anchorCollapse.anchorCollapseNet < 0 && schedule.deadDayRatio > TOUR_RISK_CONFIG.schedule.sparseDeadDayRatio) {
    redFlags.push({
      code: "sparse_anchor_dependency",
      label: "Sparse route depends on one anchor",
      explanation: "The tour is both thinly scheduled and not viable without the anchor date.",
    });
  }

  if (stressTests.logisticsSpike.postSpikeNet < 0 && schedule.highBurnTravelDayCount > 1) {
    redFlags.push({
      code: "logistics_spike_high_burn_travel",
      label: "High-burn travel days break the run",
      explanation: "A logistics spike turns the tour negative while multiple non-show travel days already carry heavy burden.",
    });
  }

  if (
    schedule.consecutiveBurnDaysMax >= TOUR_RISK_CONFIG.schedule.consecutiveBurnDaysHigh &&
    guaranteeCoverage < TOUR_RISK_CONFIG.liquidity.workableGuaranteeCoverage
  ) {
    redFlags.push({
      code: "consecutive_burn_days_weak_guarantees",
      label: "Consecutive burn days with weak guarantees",
      explanation: "The tour has three or more zero-income burn days in a row without enough protected income.",
    });
  }

  if (
    stressTests.distanceToRuin.revenueSensitiveIncome > 0 &&
    stressTests.distanceToRuin.distanceToRuinPercent >= TOUR_RISK_CONFIG.revenueVolatility.criticalDistanceToRuin &&
    stressTests.distanceToRuin.distanceToRuinPercent < TOUR_RISK_CONFIG.revenueVolatility.fragileDistanceToRuin
  ) {
    amberFlags.push({
      code: "weak_distance_to_ruin",
      label: "Weak distance to ruin",
      explanation: "The revenue buffer before break-even is still thin.",
    });
  }

  if (guaranteeCoverage < TOUR_RISK_CONFIG.liquidity.workableGuaranteeCoverage) {
    amberFlags.push({
      code: "weak_guarantee_coverage",
      label: "Weak guaranteed-income coverage",
      explanation: "Guaranteed income covers less than a workable share of the cost base.",
    });
  }

  if ((stressTests.logisticsSpike.netErosionPercent ?? 0) > TOUR_RISK_CONFIG.logistics.highNetErosion) {
    amberFlags.push({
      code: "logistics_erodes_net",
      label: "Logistics spike erodes most profit",
      explanation: "A normal operating-cost spike would wipe out more than half the projected net.",
    });
  }

  if (speculativeShowShare > 0.5) {
    amberFlags.push({
      code: "many_speculative_shows",
      label: "Many speculative shows",
      explanation: "More than half the run depends heavily on variable ticket, merch, or other backend income.",
    });
  }

  if (top2ShowProfitShare > TOUR_RISK_CONFIG.concentration.topTwoFragile) {
    amberFlags.push({
      code: "weak_diversification",
      label: "Weak diversification across dates",
      explanation: "The tour result is not spread evenly across enough dates.",
    });
  }

  if (missingRevenueShare > TOUR_RISK_CONFIG.missingData.partialWarningShare) {
    amberFlags.push({
      code: "reduced_confidence_missing_revenue_data",
      label: "Reduced confidence",
      explanation: "Several shows are missing key revenue assumptions, so the analysis should be treated as directional.",
    });
  }

  if (
    schedule.deadDayRatio >= TOUR_RISK_CONFIG.schedule.amberDeadDayRatio &&
    schedule.deadDayRatio <= TOUR_RISK_CONFIG.schedule.redDeadDayRatio
  ) {
    amberFlags.push({
      code: "elevated_dead_day_ratio",
      label: "Elevated idle burn",
      explanation: "A meaningful share of the calendar is non-earning time.",
    });
  }

  if (schedule.efficiencyRatio < TOUR_RISK_CONFIG.schedule.healthyEfficiencyRatio) {
    amberFlags.push({
      code: "schedule_efficiency_below_target",
      label: "Schedule efficiency below target",
      explanation: "The route has fewer earning days than a healthy tour schedule would normally want.",
    });
  }

  if (schedule.operationalLoadPerShow > TOUR_RISK_CONFIG.schedule.highOperationalLoadPerShow) {
    amberFlags.push({
      code: "high_operational_load_per_show",
      label: "High operating load per show",
      explanation: "Each show is carrying more than two calendar days of tour burden.",
    });
  }

  if (schedule.loadedCostPerShowDay > snapshot.totalGrossIncome / Math.max(snapshot.showCount, 1) * TOUR_RISK_CONFIG.schedule.loadedCostBurdenMultiplier) {
    amberFlags.push({
      code: "loaded_cost_per_show_high",
      label: "Loaded cost per show is high",
      explanation: "Once empty days are included, each show has to carry an unusually heavy cost load.",
    });
  }

  if (schedule.highBurnTravelDayCount > 0) {
    amberFlags.push({
      code: "high_burn_non_show_travel",
      label: "High-burn non-show travel",
      explanation: "At least one non-show day carries a major travel burden.",
    });
  }

  return { redFlags, amberFlags };
}

function buildRecommendations(
  snapshot: TourRiskSnapshot,
  stressTests: TourRiskStressTests,
): TourRiskRecommendation[] {
  const recommendations: TourRiskRecommendation[] = [];
  const { topShowProfitShare, top2ShowProfitShare } = getPositiveProfitShares(snapshot);
  const percentGuaranteedIncome = ratio(snapshot.totalGuaranteeIncome, snapshot.totalGrossIncome);
  const anchorName = stressTests.anchorCollapse.anchorShowName ?? "the anchor show";
  const schedule = snapshot.scheduleMetrics;
  const averageShowContribution = ratio(
    snapshot.showResults.reduce((sum, show) => sum + Math.max(0, show.netProfit), 0),
    Math.max(snapshot.profitableShowCount, 1),
  );

  if (schedule.consecutiveBurnDaysMax >= TOUR_RISK_CONFIG.schedule.consecutiveBurnDaysHigh) {
    recommendations.push({
      code: "fill_consecutive_burn_days",
      message: "Idle Risk: multiple burn days in a row with zero intake.",
      mitigation: "Look for a routing or fill-in date, even at a low guarantee, to cover fuel and food.",
    });
  }

  if (
    averageShowContribution > 0 &&
    schedule.loadedCostPerShowDay > averageShowContribution * TOUR_RISK_CONFIG.schedule.loadedCostBurdenMultiplier
  ) {
    recommendations.push({
      code: "reduce_loaded_show_cost",
      message: "High Carry Cost: off-days are eating into show profits.",
      mitigation: "Reduce accommodation cost, trim per-diems, or use free stay options on non-show days.",
    });
  }

  if (schedule.highBurnTravelDayCount > 0) {
    recommendations.push({
      code: "manage_high_burn_travel_day",
      message: "Fatigue / travel risk: this non-show day carries major route burden.",
      mitigation: "Add maintenance buffer, reduce next-day expectations, or break the journey with a better-placed date.",
    });
  }

  if (schedule.efficiencyRatio < TOUR_RISK_CONFIG.schedule.weakEfficiencyRatio) {
    recommendations.push({
      code: "improve_schedule_efficiency",
      message: "This run has more non-earning time than earning time.",
      mitigation: "Tighten routing, remove weak spacing, or increase guaranteed income on remaining dates.",
    });
  }

  if (
    schedule.deadDayRatio > TOUR_RISK_CONFIG.schedule.sparseDeadDayRatio &&
    stressTests.anchorCollapse.anchorCollapseNet < 0
  ) {
    recommendations.push({
      code: "fix_sparse_anchor_dependency",
      message: "Sparse schedule + anchor dependency makes this run structurally fragile.",
      mitigation: "Add a filler date, reduce route cost, or diversify the profit base before confirming.",
    });
  }

  if (topShowProfitShare > 0.4) {
    recommendations.push({
      code: "protect_anchor_show",
      message: `Profit is overly concentrated in ${anchorName}.`,
      mitigation: "Secure a deposit, confirm promoter confidence early, or add a nearby support date.",
    });
  }

  if (
    stressTests.distanceToRuin.revenueSensitiveIncome > 0 &&
    stressTests.distanceToRuin.distanceToRuinPercent < TOUR_RISK_CONFIG.revenueVolatility.dangerousDistanceToRuin
  ) {
    recommendations.push({
      code: "increase_distance_to_ruin",
      message: "A small drop in revenue would wipe out the tour's profit.",
      mitigation: "Raise ticket targets, trim fixed costs, or increase guaranteed income.",
    });
  }

  if (
    stressTests.logisticsSpike.postSpikeNet < 0 ||
    (stressTests.logisticsSpike.netErosionPercent ?? 0) > TOUR_RISK_CONFIG.logistics.highNetErosion
  ) {
    recommendations.push({
      code: "contain_logistics_spike",
      message: "A normal logistics cost spike could make this run unprofitable.",
      mitigation: "Add contingency budget, shorten the route, or remove the weakest travel-heavy date.",
    });
  }

  if (top2ShowProfitShare > TOUR_RISK_CONFIG.concentration.topTwoHigh) {
    recommendations.push({
      code: "reduce_top_two_dependency",
      message: "Most of the tour's result is carried by two dates.",
      mitigation: "Treat the rest of the run as support, or strengthen midweek dates before locking travel.",
    });
  }

  if (percentGuaranteedIncome < TOUR_RISK_CONFIG.revenueVolatility.weakGuaranteedIncomeShare) {
    recommendations.push({
      code: "increase_protected_income",
      message: "This tour relies heavily on speculative income.",
      mitigation: "Convert at least one low-certainty deal into a guarantee or versus arrangement.",
    });
  }

  if (stressTests.anchorCollapse.anchorCollapseNet < 0) {
    recommendations.push({
      code: "diversify_anchor_risk",
      message: `The tour is not viable without ${anchorName}.`,
      mitigation: "Diversify the run, strengthen other dates, or reduce route cost before confirming.",
    });
  }

  if (snapshot.tourIntent === "strategic_loss_leader") {
    recommendations.push({
      code: "contain_loss_leader_downside",
      message: "This run is intentionally loss-leading.",
      mitigation: "Set a maximum acceptable loss and protect against logistics blowouts before confirming.",
    });
  }

  return recommendations.slice(0, 4);
}

function getPrimaryConcern(
  categoryScores: TourRiskCategoryScores,
  flags: { redFlags: TourRiskFlag[]; amberFlags: TourRiskFlag[] },
  insufficientData: boolean,
): string {
  if (insufficientData) return "Insufficient data to produce a reliable structural risk score.";
  if (flags.redFlags[0]) return flags.redFlags[0].label;

  const ranked = [
    { label: "Concentration risk", category: categoryScores.concentrationRisk },
    { label: "Liquidity risk", category: categoryScores.liquidityRisk },
    { label: "Structural fragility", category: categoryScores.structuralFragility },
    { label: "Logistics pressure", category: categoryScores.logisticsPressure },
    { label: "Revenue volatility", category: categoryScores.revenueVolatility },
  ].sort((left, right) => right.category.score - left.category.score);

  return ranked[0]?.category.score > 0 ? ranked[0].label : "No major structural concern detected.";
}

function getConfidenceLevel(snapshot: TourRiskSnapshot): RiskConfidenceLevel {
  const missingRevenueShare = ratio(snapshot.missingRevenueAssumptionCount, snapshot.showCount);
  if (missingRevenueShare > TOUR_RISK_CONFIG.missingData.partialWarningShare) return "low";
  if (snapshot.showCount < 3 || snapshot.volatileCostFlags.length > 4) return "medium";
  return "high";
}

function buildWeakestShows(snapshot: TourRiskSnapshot): TourRiskWeakShow[] {
  return snapshot.showResults
    .map((show) => {
      const travelBurden = show.fuelCost + show.accommodationCost;
      const travelShare = ratio(travelBurden, show.grossIncome);
      const severity =
        (show.netProfit < 0 ? 40 : show.marginPercent < 0.08 ? 18 : 0) +
        (travelShare > 0.5 ? 12 : travelShare > 0.25 ? 6 : 0) +
        (show.missingRevenueAssumptions ? 10 : 0);
      let explanation = "This date has a weaker return profile than the rest of the route.";
      if (show.netProfit < 0) explanation = "This date is loss-making in the current tour result.";
      else if (travelShare > 0.5) explanation = "Travel and accommodation take too much of this date's return.";
      else if (show.missingRevenueAssumptions) explanation = "This date is missing key revenue assumptions.";

      return {
        showId: show.showId,
        venueName: show.venueName,
        date: show.date,
        netProfit: show.netProfit,
        travelBurden: roundCurrency(travelBurden),
        explanation,
        severity,
      };
    })
    .sort((left, right) => right.severity - left.severity)
    .slice(0, TOUR_RISK_CONFIG.weakestShowCount)
    .map(({ severity: _severity, ...show }) => show);
}

function getSummaryText(
  snapshot: TourRiskSnapshot,
  result: {
    label: string;
    primaryConcern: string;
    insufficientData: boolean;
  },
): string {
  if (result.insufficientData) {
    return "Insufficient Data for Risk Analysis. Too many shows are missing key revenue assumptions for a reliable structural score.";
  }
  if (snapshot.tourIntent === "strategic_loss_leader") {
    return "This run is intentionally loss-leading. Risk analysis is focused on downside control, not profitability.";
  }
  if (result.label === "Bulletproof" || result.label === "Healthy") {
    return "The tour has a workable structural base, with the strongest checks focused on preserving the current cushion.";
  }
  return `The main structural concern is ${result.primaryConcern.toLowerCase()}. Treat this as a decision-layer warning, not just a softer revenue case.`;
}

export function analyzeTourRisk(snapshot: TourRiskSnapshot): TourRiskResult {
  const stressTests: TourRiskStressTests = {
    anchorCollapse: buildAnchorCollapseStressTest(snapshot),
    distanceToRuin: buildDistanceToRuinStressTest(snapshot),
    logisticsSpike: buildLogisticsSpikeStressTest(snapshot),
  };

  const concentrationRisk = getConcentrationRisk(snapshot);
  const liquidityRisk = getLiquidityRisk(snapshot);
  const structuralFragility = getStructuralFragilityRisk(snapshot, stressTests.anchorCollapse);
  const logisticsPressure = getLogisticsPressureRisk(snapshot, stressTests.logisticsSpike);
  const revenueVolatility = getRevenueVolatilityRisk(snapshot, stressTests.distanceToRuin);

  const categoryScores: TourRiskCategoryScores = {
    concentrationRisk: { score: concentrationRisk.score, explanation: concentrationRisk.explanation },
    liquidityRisk: { score: liquidityRisk.score, explanation: liquidityRisk.explanation },
    structuralFragility: { score: structuralFragility.score, explanation: structuralFragility.explanation },
    logisticsPressure: { score: logisticsPressure.score, explanation: logisticsPressure.explanation },
    revenueVolatility: { score: revenueVolatility.score, explanation: revenueVolatility.explanation },
  };

  const missingRevenueShare = ratio(snapshot.missingRevenueAssumptionCount, snapshot.showCount);
  const insufficientData =
    snapshot.showCount === 0 ||
    missingRevenueShare > TOUR_RISK_CONFIG.missingData.insufficientShare ||
    (snapshot.totalGrossIncome <= 0 && snapshot.totalCosts <= 0);

  const overallScore = insufficientData
    ? 0
    : clamp(
      Math.round(
        concentrationRisk.score +
        liquidityRisk.score +
        structuralFragility.score +
        logisticsPressure.score +
        revenueVolatility.score,
      ),
      0,
      100,
    );

  const flags = buildFlags(snapshot, stressTests);
  const label = insufficientData ? "Insufficient Data for Risk Analysis" : getTourRiskLabel(overallScore);
  const primaryConcern = getPrimaryConcern(categoryScores, flags, insufficientData);
  const confidenceLevel = insufficientData ? "low" : getConfidenceLevel(snapshot);
  const recommendations = insufficientData ? [] : buildRecommendations(snapshot, stressTests);

  return {
    riskSummary: {
      overallScore,
      label,
      primaryConcern,
      confidenceLevel,
    },
    stressTests,
    categoryScores,
    flags,
    recommendations,
    summaryText: getSummaryText(snapshot, { label, primaryConcern, insufficientData }),
    insufficientData,
    scheduleMetrics: snapshot.scheduleMetrics,
    weakestShows: buildWeakestShows(snapshot),
  };
}
