import { describe, expect, it } from "vitest";
import {
  analyzeTourRisk,
  buildTourRiskShowSnapshot,
  createTourRiskSnapshot,
  getTourRiskLabel,
  type TourRiskDaySnapshotInput,
  type TourRiskShowSnapshot,
  type TourIntent,
} from "./tour-risk";

function show(input: Partial<Parameters<typeof buildTourRiskShowSnapshot>[0]> & {
  showId: number;
  venueName: string;
  totalCosts: number;
}): TourRiskShowSnapshot {
  return buildTourRiskShowSnapshot({
    showType: "Flat Fee",
    fee: 1000,
    totalCosts: input.totalCosts,
    showId: input.showId,
    venueName: input.venueName,
    ...input,
  });
}

function snapshot(
  shows: TourRiskShowSnapshot[],
  overrides: Partial<Parameters<typeof createTourRiskSnapshot>[0]> & { tourIntent?: TourIntent } = {},
) {
  const totalGrossIncome = shows.reduce((sum, item) => sum + item.grossIncome, 0);
  const totalCosts = shows.reduce((sum, item) => sum + item.totalCosts, 0);
  return createTourRiskSnapshot({
    showResults: shows,
    totalGrossIncome,
    totalCosts,
    totalNetProfit: totalGrossIncome - totalCosts,
    totalFuelCost: shows.reduce((sum, item) => sum + item.fuelCost, 0),
    totalAccommodationCost: shows.reduce((sum, item) => sum + item.accommodationCost, 0),
    totalDistance: shows.reduce((sum, item) => sum + item.travelDistance, 0),
    totalTravelHours: shows.reduce((sum, item) => sum + item.travelHours, 0),
    expectedTicketTotals: shows.reduce((sum, item) => sum + item.expectedTickets, 0),
    breakEvenPoint: shows.reduce((sum, item) => sum + item.breakEvenTickets, 0),
    runDays: shows.length,
    ...overrides,
  });
}

function day(input: TourRiskDaySnapshotInput): TourRiskDaySnapshotInput {
  return input;
}

describe("tour risk engine 2.0", () => {
  it("labels score ranges correctly", () => {
    expect(getTourRiskLabel(0)).toBe("Bulletproof");
    expect(getTourRiskLabel(21)).toBe("Healthy");
    expect(getTourRiskLabel(41)).toBe("Balanced / Caution");
    expect(getTourRiskLabel(61)).toBe("Fragile");
    expect(getTourRiskLabel(81)).toBe("High Stakes / Dangerous");
  });

  it("diversified safe tour: low structural risk and no red flags", () => {
    const result = analyzeTourRisk(snapshot([
      show({ showId: 1, venueName: "The Metro", fee: 1600, totalCosts: 650 }),
      show({ showId: 2, venueName: "Theatre Royal", fee: 1700, totalCosts: 700 }),
      show({ showId: 3, venueName: "Northcote Social", fee: 1500, totalCosts: 650 }),
      show({ showId: 4, venueName: "The Gov", fee: 1650, totalCosts: 700 }),
      show({ showId: 5, venueName: "Jive", fee: 1550, totalCosts: 650 }),
    ]));

    expect(["Bulletproof", "Healthy"]).toContain(result.riskSummary.label);
    expect(result.riskSummary.overallScore).toBeLessThanOrEqual(40);
    expect(result.flags.redFlags).toHaveLength(0);
  });

  it("one-anchor-show tour: detects top show concentration", () => {
    const result = analyzeTourRisk(snapshot([
      show({ showId: 1, venueName: "Major Festival", fee: 6000, totalCosts: 900 }),
      show({ showId: 2, venueName: "Small Bar 1", fee: 450, totalCosts: 360 }),
      show({ showId: 3, venueName: "Small Bar 2", fee: 450, totalCosts: 360 }),
      show({ showId: 4, venueName: "Small Bar 3", fee: 450, totalCosts: 360 }),
      show({ showId: 5, venueName: "Small Bar 4", fee: 450, totalCosts: 360 }),
    ]));

    expect(result.stressTests.anchorCollapse.anchorShowName).toBe("Major Festival");
    expect(result.stressTests.anchorCollapse.anchorProfitContributionShare).toBeGreaterThan(0.5);
    expect(result.categoryScores.concentrationRisk.score).toBe(30);
    expect(result.flags.redFlags.some((flag) => flag.code === "top_show_concentration")).toBe(true);
  });

  it("top-2-weekend dependency tour: flags weak diversification", () => {
    const result = analyzeTourRisk(snapshot([
      show({ showId: 1, venueName: "Friday Anchor", fee: 4000, totalCosts: 900 }),
      show({ showId: 2, venueName: "Saturday Anchor", fee: 3800, totalCosts: 900 }),
      show({ showId: 3, venueName: "Tuesday Support", fee: 500, totalCosts: 450 }),
      show({ showId: 4, venueName: "Wednesday Support", fee: 500, totalCosts: 450 }),
      show({ showId: 5, venueName: "Thursday Support", fee: 500, totalCosts: 450 }),
    ]));

    expect(result.flags.amberFlags.some((flag) => flag.code === "weak_diversification")).toBe(true);
    expect(result.recommendations.some((recommendation) => recommendation.code === "reduce_top_two_dependency")).toBe(true);
  });

  it("negative anchor collapse outcome: marks the route structurally fragile", () => {
    const result = analyzeTourRisk(snapshot([
      show({ showId: 1, venueName: "Only Big Win", fee: 5000, totalCosts: 800 }),
      show({ showId: 2, venueName: "Loss Date A", fee: 300, totalCosts: 800 }),
      show({ showId: 3, venueName: "Loss Date B", fee: 300, totalCosts: 800 }),
      show({ showId: 4, venueName: "Loss Date C", fee: 300, totalCosts: 800 }),
    ]));

    expect(result.stressTests.anchorCollapse.anchorCollapseNet).toBeLessThan(0);
    expect(result.categoryScores.structuralFragility.score).toBe(20);
    expect(result.flags.redFlags.some((flag) => flag.code === "anchor_collapse_negative")).toBe(true);
  });

  it("very small distance-to-ruin buffer: flags revenue fragility", () => {
    const result = analyzeTourRisk(snapshot([
      show({
        showId: 1,
        venueName: "Soft Ticketed A",
        showType: "Ticketed Show",
        dealType: "100% door",
        capacity: 100,
        ticketPrice: 20,
        expectedAttendancePct: 90,
        totalCosts: 1700,
      }),
      show({
        showId: 2,
        venueName: "Soft Ticketed B",
        showType: "Ticketed Show",
        dealType: "100% door",
        capacity: 100,
        ticketPrice: 20,
        expectedAttendancePct: 90,
        totalCosts: 1700,
      }),
    ]));

    expect(result.stressTests.distanceToRuin.distanceToRuinPercent).toBeLessThan(12);
    expect(result.flags.redFlags.some((flag) => flag.code === "tiny_distance_to_ruin")).toBe(true);
    expect(result.recommendations.some((recommendation) => recommendation.code === "increase_distance_to_ruin")).toBe(true);
  });

  it("logistics spike turning tour negative: detects operating over-leverage", () => {
    const result = analyzeTourRisk(snapshot([
      show({
        showId: 1,
        venueName: "Regional A",
        fee: 1000,
        totalCosts: 920,
        fuelCost: 320,
        accommodationCost: 220,
      }),
      show({
        showId: 2,
        venueName: "Regional B",
        fee: 1000,
        totalCosts: 920,
        fuelCost: 320,
        accommodationCost: 220,
      }),
      show({
        showId: 3,
        venueName: "Regional C",
        fee: 1000,
        totalCosts: 920,
        fuelCost: 320,
        accommodationCost: 220,
      }),
    ]));

    expect(result.stressTests.logisticsSpike.postSpikeNet).toBeLessThan(0);
    expect(result.flags.redFlags.some((flag) => flag.code === "logistics_spike_negative")).toBe(true);
    expect(result.recommendations.some((recommendation) => recommendation.code === "contain_logistics_spike")).toBe(true);
  });

  it("strategic loss leader tour: does not fail purely because original net is negative", () => {
    const result = analyzeTourRisk(snapshot([
      show({ showId: 1, venueName: "Showcase A", fee: 700, totalCosts: 900 }),
      show({ showId: 2, venueName: "Showcase B", fee: 700, totalCosts: 900 }),
      show({ showId: 3, venueName: "Showcase C", fee: 700, totalCosts: 900 }),
    ], {
      tourIntent: "strategic_loss_leader",
    }));

    expect(result.summaryText).toContain("intentionally loss-leading");
    expect(result.flags.redFlags.some((flag) => flag.code === "tour_negative")).toBe(false);
    expect(result.recommendations.some((recommendation) => recommendation.code === "contain_loss_leader_downside")).toBe(true);
  });

  it("insufficient-data tour: refuses misleading certainty", () => {
    const result = analyzeTourRisk(snapshot([
      show({ showId: 1, venueName: "Unknown A", showType: "Ticketed Show", dealType: "100% door", totalCosts: 300 }),
      show({ showId: 2, venueName: "Unknown B", showType: "Ticketed Show", dealType: "100% door", totalCosts: 300 }),
      show({ showId: 3, venueName: "Unknown C", showType: "Ticketed Show", dealType: "100% door", totalCosts: 300 }),
    ]));

    expect(result.insufficientData).toBe(true);
    expect(result.riskSummary.label).toBe("Insufficient Data for Risk Analysis");
    expect(result.riskSummary.confidenceLevel).toBe("low");
  });

  it("tiny acoustic tour with fewer than three shows: still produces a directional score", () => {
    const result = analyzeTourRisk(snapshot([
      show({ showId: 1, venueName: "Listening Room", fee: 900, totalCosts: 350 }),
      show({ showId: 2, venueName: "House Concert", fee: 850, totalCosts: 300 }),
    ]));

    expect(result.insufficientData).toBe(false);
    expect(result.riskSummary.overallScore).toBeGreaterThanOrEqual(0);
    expect(result.riskSummary.confidenceLevel).toBe("medium");
  });

  it("dense profitable tour with no dead days: keeps schedule efficiency high", () => {
    const shows = [
      show({ showId: 1, venueName: "Room A", fee: 1400, totalCosts: 550 }),
      show({ showId: 2, venueName: "Room B", fee: 1400, totalCosts: 550 }),
      show({ showId: 3, venueName: "Room C", fee: 1400, totalCosts: 550 }),
    ];
    const result = analyzeTourRisk(snapshot(shows, {
      runDays: 3,
      dayResults: shows.map((item, index) => day({
        date: `2026-06-0${index + 1}`,
        type: "show_day",
        hasShow: true,
        showId: item.showId,
        revenue: item.grossIncome,
        showSpecificCosts: 250,
        fixedOperatingCosts: 100,
        accommodationCost: 100,
        dailyTravelBurn: 100,
      })),
    }));

    expect(result.scheduleMetrics.deadDayRatio).toBe(0);
    expect(result.scheduleMetrics.efficiencyRatio).toBe(1);
    expect(result.flags.redFlags.some((flag) => flag.code === "high_dead_day_ratio")).toBe(false);
  });

  it("sparse tour with many off days but positive headline net: increases idle burn risk", () => {
    const shows = [
      show({ showId: 1, venueName: "Anchor A", fee: 2200, totalCosts: 500 }),
      show({ showId: 2, venueName: "Anchor B", fee: 2200, totalCosts: 500 }),
      show({ showId: 3, venueName: "Anchor C", fee: 2200, totalCosts: 500 }),
    ];
    const totalGrossIncome = shows.reduce((sum, item) => sum + item.grossIncome, 0);
    const totalCosts = 4200;
    const result = analyzeTourRisk(snapshot(shows, {
      totalGrossIncome,
      totalCosts,
      totalNetProfit: totalGrossIncome - totalCosts,
      runDays: 9,
      dayResults: [
        day({ date: "2026-06-01", type: "show_day", hasShow: true, showId: 1, revenue: 2200, showSpecificCosts: 300, fixedOperatingCosts: 100 }),
        day({ date: "2026-06-02", type: "day_off", fixedOperatingCosts: 150, accommodationCost: 120 }),
        day({ date: "2026-06-03", type: "day_off", fixedOperatingCosts: 150, accommodationCost: 120 }),
        day({ date: "2026-06-04", type: "show_day", hasShow: true, showId: 2, revenue: 2200, showSpecificCosts: 300, fixedOperatingCosts: 100 }),
        day({ date: "2026-06-05", type: "day_off", fixedOperatingCosts: 150, accommodationCost: 120 }),
        day({ date: "2026-06-06", type: "day_off", fixedOperatingCosts: 150, accommodationCost: 120 }),
        day({ date: "2026-06-07", type: "day_off", fixedOperatingCosts: 150, accommodationCost: 120 }),
        day({ date: "2026-06-08", type: "show_day", hasShow: true, showId: 3, revenue: 2200, showSpecificCosts: 300, fixedOperatingCosts: 100 }),
        day({ date: "2026-06-09", type: "day_off", fixedOperatingCosts: 150, accommodationCost: 120 }),
      ],
    }));

    expect(result.scheduleMetrics.deadDayRatio).toBeGreaterThan(0.4);
    expect(result.flags.redFlags.some((flag) => flag.code === "high_dead_day_ratio")).toBe(true);
    expect(result.recommendations.some((recommendation) => recommendation.code === "improve_schedule_efficiency")).toBe(true);
  });

  it("anchor-dependent sparse tour: flags sparse anchor dependency", () => {
    const shows = [
      show({ showId: 1, venueName: "Only Big Win", fee: 5000, totalCosts: 700 }),
      show({ showId: 2, venueName: "Support A", fee: 400, totalCosts: 800 }),
      show({ showId: 3, venueName: "Support B", fee: 400, totalCosts: 800 }),
    ];
    const result = analyzeTourRisk(snapshot(shows, {
      runDays: 7,
      dayResults: [
        day({ date: "2026-07-01", type: "show_day", hasShow: true, showId: 1, revenue: 5000, showSpecificCosts: 300 }),
        day({ date: "2026-07-02", type: "day_off", fixedOperatingCosts: 120, accommodationCost: 100 }),
        day({ date: "2026-07-03", type: "day_off", fixedOperatingCosts: 120, accommodationCost: 100 }),
        day({ date: "2026-07-04", type: "show_day", hasShow: true, showId: 2, revenue: 400, showSpecificCosts: 300 }),
        day({ date: "2026-07-05", type: "day_off", fixedOperatingCosts: 120, accommodationCost: 100 }),
        day({ date: "2026-07-06", type: "day_off", fixedOperatingCosts: 120, accommodationCost: 100 }),
        day({ date: "2026-07-07", type: "show_day", hasShow: true, showId: 3, revenue: 400, showSpecificCosts: 300 }),
      ],
    }));

    expect(result.stressTests.anchorCollapse.anchorCollapseNet).toBeLessThan(0);
    expect(result.flags.redFlags.some((flag) => flag.code === "sparse_anchor_dependency")).toBe(true);
    expect(result.recommendations.some((recommendation) => recommendation.code === "fix_sparse_anchor_dependency")).toBe(true);
  });

  it("tour with 3 consecutive burn days: recommends a fill-in date", () => {
    const result = analyzeTourRisk(snapshot([
      show({ showId: 1, venueName: "Start Show", fee: 1500, totalCosts: 500 }),
      show({ showId: 2, venueName: "End Show", fee: 1500, totalCosts: 500 }),
    ], {
      runDays: 5,
      dayResults: [
        day({ date: "2026-08-01", type: "show_day", hasShow: true, showId: 1, revenue: 1500, showSpecificCosts: 300 }),
        day({ date: "2026-08-02", type: "day_off", fixedOperatingCosts: 100, accommodationCost: 100 }),
        day({ date: "2026-08-03", type: "day_off", fixedOperatingCosts: 100, accommodationCost: 100 }),
        day({ date: "2026-08-04", type: "day_off", fixedOperatingCosts: 100, accommodationCost: 100 }),
        day({ date: "2026-08-05", type: "show_day", hasShow: true, showId: 2, revenue: 1500, showSpecificCosts: 300 }),
      ],
    }));

    expect(result.scheduleMetrics.consecutiveBurnDaysMax).toBe(3);
    expect(result.recommendations.some((recommendation) => recommendation.code === "fill_consecutive_burn_days")).toBe(true);
  });

  it("travel-day trap case with over 400km non-show day: materially affects logistics", () => {
    const result = analyzeTourRisk(snapshot([
      show({ showId: 1, venueName: "Town A", fee: 1200, totalCosts: 400 }),
      show({ showId: 2, venueName: "Town B", fee: 1200, totalCosts: 400 }),
    ], {
      runDays: 3,
      dayResults: [
        day({ date: "2026-09-01", type: "show_day", hasShow: true, showId: 1, revenue: 1200, showSpecificCosts: 300 }),
        day({ date: "2026-09-02", type: "travel_day", travelDistance: 520, travelHours: 6, dailyTravelBurn: 260, fixedOperatingCosts: 100, accommodationCost: 110 }),
        day({ date: "2026-09-03", type: "show_day", hasShow: true, showId: 2, revenue: 1200, showSpecificCosts: 300 }),
      ],
    }));

    expect(result.scheduleMetrics.highBurnTravelDayCount).toBe(1);
    expect(result.flags.amberFlags.some((flag) => flag.code === "high_burn_non_show_travel")).toBe(true);
    expect(result.recommendations.some((recommendation) => recommendation.code === "manage_high_burn_travel_day")).toBe(true);
  });

  it("logistics spike plus high-burn travel day can turn tour negative", () => {
    const shows = [
      show({ showId: 1, venueName: "Town A", fee: 900, totalCosts: 500 }),
      show({ showId: 2, venueName: "Town B", fee: 900, totalCosts: 500 }),
    ];
    const result = analyzeTourRisk(snapshot(shows, {
      totalGrossIncome: 1800,
      totalCosts: 1680,
      totalNetProfit: 120,
      runDays: 4,
      dayResults: [
        day({ date: "2026-10-01", type: "show_day", hasShow: true, showId: 1, revenue: 900, showSpecificCosts: 400 }),
        day({ date: "2026-10-02", type: "travel_day", travelDistance: 620, travelHours: 7, dailyTravelBurn: 420, fixedOperatingCosts: 90, accommodationCost: 120 }),
        day({ date: "2026-10-03", type: "day_off", fixedOperatingCosts: 90, accommodationCost: 120 }),
        day({ date: "2026-10-04", type: "show_day", hasShow: true, showId: 2, revenue: 900, showSpecificCosts: 400 }),
      ],
    }));

    expect(result.stressTests.logisticsSpike.postSpikeNet).toBeLessThan(0);
    expect(result.flags.redFlags.some((flag) => flag.code === "logistics_spike_negative")).toBe(true);
  });

  it("partial-data tour with inferred day types: shifts long show-leg travel onto the prior empty day", () => {
    const result = analyzeTourRisk(snapshot([
      show({ showId: 1, venueName: "Known Flat Fee", fee: 1200, totalCosts: 400 }),
      show({ showId: 2, venueName: "Unknown Ticketed", showType: "Ticketed Show", dealType: "100% door", totalCosts: 400 }),
    ], {
      runDays: 3,
      dayResults: [
        day({ date: "2026-11-01", type: "show_day", hasShow: true, showId: 1, revenue: 1200, showSpecificCosts: 300 }),
        day({ date: "2026-11-02", type: "day_off", fixedOperatingCosts: 90, accommodationCost: 100 }),
        day({ date: "2026-11-03", type: "show_day", hasShow: true, showId: 2, revenue: 0, showSpecificCosts: 300, travelDistance: 480, travelHours: 5.5, dailyTravelBurn: 220 }),
      ],
    }));

    expect(result.scheduleMetrics.totalTravelDays).toBe(1);
    expect(result.scheduleMetrics.highBurnTravelDayCount).toBe(1);
    expect(result.riskSummary.confidenceLevel).toBe("low");
  });
});
