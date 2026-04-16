/**
 * Gig Trail — Calculation Engine Tests
 *
 * Each test is named around a real-world musician scenario.
 * Constants: SINGLE_ROOM_RATE = $120/night, DOUBLE_ROOM_RATE = $180/night
 */

import { describe, it, expect } from "vitest";
import {
  calculateShowIncome,
  calculateFuelCost,
  calculateVehicleCosts,
  calculateAccommodationCost,
  calculateTicketBreakEven,
  calculateShowViability,
  calculateSingleShow,
  calculateMemberPayouts,
  SINGLE_ROOM_RATE,
  DOUBLE_ROOM_RATE,
} from "./calculations";
import { calculateMemberEarnings } from "./member-utils";
import type { Member } from "@/types/member";

// ─────────────────────────────────────────────────────────────────────────────
// Show Income — all deal types
// ─────────────────────────────────────────────────────────────────────────────

describe("calculateShowIncome", () => {
  it("flat fee: returns the guaranteed fee with no ticket math", () => {
    const result = calculateShowIncome({ showType: "Flat Fee", fee: 500 });
    expect(result.showIncome).toBe(500);
    expect(result.expectedTicketsSold).toBe(0);
    expect(result.grossRevenue).toBe(0);
  });

  it("ticketed 100% door: artist takes the full door at expected attendance", () => {
    // 200-cap venue, $20 tickets, 70% expected fill → 140 tickets → $2 800
    const result = calculateShowIncome({
      showType: "Ticketed Show",
      dealType: "100% door",
      capacity: 200,
      ticketPrice: 20,
      expectedAttendancePct: 70,
    });
    expect(result.expectedTicketsSold).toBe(140);
    expect(result.grossRevenue).toBe(2800);
    expect(result.showIncome).toBe(2800);
  });

  it("ticketed percentage split: artist only receives their share of door", () => {
    // 100-cap, $25 tickets, 80% fill, 65% split → 80 tickets → $2 000 gross → $1 300 artist share
    const result = calculateShowIncome({
      showType: "Ticketed Show",
      dealType: "percentage split",
      capacity: 100,
      ticketPrice: 25,
      expectedAttendancePct: 80,
      splitPct: 65,
    });
    expect(result.expectedTicketsSold).toBe(80);
    expect(result.grossRevenue).toBe(2000);
    expect(result.showIncome).toBe(1300);
  });

  it("guarantee vs door: artist takes the split when the crowd is big enough", () => {
    // $400 guarantee vs 60% split — 80% fill on 100-cap → split = $1 200 > guarantee
    const result = calculateShowIncome({
      showType: "Ticketed Show",
      dealType: "guarantee vs door",
      capacity: 100,
      ticketPrice: 25,
      expectedAttendancePct: 80,
      splitPct: 60,
      guarantee: 400,
    });
    expect(result.showIncome).toBe(1200);
  });

  it("guarantee vs door: falls back to guarantee when the turnout is poor", () => {
    // Only 20% fill → split = $300 < $400 guarantee → artist takes the guarantee
    const result = calculateShowIncome({
      showType: "Ticketed Show",
      dealType: "guarantee vs door",
      capacity: 100,
      ticketPrice: 25,
      expectedAttendancePct: 20,
      splitPct: 60,
      guarantee: 400,
    });
    expect(result.showIncome).toBe(400);
  });

  it("hybrid show: flat guarantee stacks on top of door income", () => {
    // $250 guarantee + 100% door on 75 tickets at $18 = $250 + $1 350 = $1 600
    const result = calculateShowIncome({
      showType: "Hybrid",
      dealType: "100% door",
      capacity: 150,
      ticketPrice: 18,
      expectedAttendancePct: 50,
      guarantee: 250,
    });
    expect(result.showIncome).toBe(1600);
  });

  it("unknown show type: returns zeros rather than crashing", () => {
    const result = calculateShowIncome({ showType: "Something New" });
    expect(result.showIncome).toBe(0);
    expect(result.expectedTicketsSold).toBe(0);
    expect(result.grossRevenue).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fuel
// ─────────────────────────────────────────────────────────────────────────────

describe("calculateFuelCost", () => {
  it("one-way trip: costs half of a return trip", () => {
    const oneWay = calculateFuelCost({
      distanceKm: 200,
      consumptionLPer100: 10,
      pricePerLitre: 1.90,
      returnTrip: false,
    });
    // 200km × 10 L/100 = 20 L × $1.90 = $38
    expect(oneWay.totalDistanceKm).toBe(200);
    expect(oneWay.fuelUsedLitres).toBe(20);
    expect(oneWay.fuelCost).toBeCloseTo(38.0);
  });

  it("return trip: doubles both distance and fuel cost", () => {
    const roundTrip = calculateFuelCost({
      distanceKm: 120,
      consumptionLPer100: 10,
      pricePerLitre: 1.90,
      returnTrip: true,
    });
    // 240km × 10 L/100 = 24 L × $1.90 = $45.60
    expect(roundTrip.totalDistanceKm).toBe(240);
    expect(roundTrip.fuelUsedLitres).toBe(24);
    expect(roundTrip.fuelCost).toBeCloseTo(45.6);
  });

  it("zero distance: no fuel cost regardless of consumption or price", () => {
    const result = calculateFuelCost({
      distanceKm: 0,
      consumptionLPer100: 10,
      pricePerLitre: 1.90,
    });
    expect(result.fuelCost).toBe(0);
    expect(result.fuelUsedLitres).toBe(0);
  });

  it("zero consumption (electric/walk-on): no fuel cost", () => {
    const result = calculateFuelCost({
      distanceKm: 300,
      consumptionLPer100: 0,
      pricePerLitre: 1.90,
    });
    expect(result.fuelCost).toBe(0);
    expect(result.fuelUsedLitres).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Multi-vehicle fleet
// ─────────────────────────────────────────────────────────────────────────────

describe("calculateVehicleCosts", () => {
  it("two-vehicle tour: each vehicle uses its own fuel type price", () => {
    const vehicles = [
      { id: 1, name: "The Van", fuelType: "petrol", consumptionLPer100: 12 },
      { id: 2, name: "The Wagon", fuelType: "diesel", consumptionLPer100: 7 },
    ];
    const prices = { petrol: 1.90, diesel: 1.95, lpg: 0.95 };
    const results = calculateVehicleCosts(vehicles, 500, prices);

    // Van: 500 × 12/100 = 60 L × $1.90 = $114
    expect(results[0].totalLitres).toBe(60);
    expect(results[0].totalCost).toBeCloseTo(114.0);

    // Wagon: 500 × 7/100 = 35 L × $1.95 = $68.25
    expect(results[1].totalLitres).toBe(35);
    expect(results[1].totalCost).toBeCloseTo(68.25);
  });

  it("lpg vehicle: correctly uses the LPG price", () => {
    const vehicles = [
      { id: 3, name: "LPG Ute", fuelType: "lpg", consumptionLPer100: 14 },
    ];
    const prices = { petrol: 1.90, diesel: 1.95, lpg: 0.95 };
    const [result] = calculateVehicleCosts(vehicles, 100, prices);
    // 100 × 14/100 = 14 L × $0.95 = $13.30
    expect(result.totalLitres).toBe(14);
    expect(result.totalCost).toBeCloseTo(13.3);
  });

  it("unknown fuel type: falls back to petrol price", () => {
    const vehicles = [
      { id: 4, name: "Mystery Machine", fuelType: "hydrogen", consumptionLPer100: 10 },
    ];
    const prices = { petrol: 1.90, diesel: 1.95, lpg: 0.95 };
    const [result] = calculateVehicleCosts(vehicles, 100, prices);
    expect(result.totalCost).toBeCloseTo(19.0);
  });

  it("empty fleet: returns an empty array", () => {
    expect(calculateVehicleCosts([], 500, { petrol: 1.90, diesel: 1.95, lpg: 0.95 })).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Accommodation
// ─────────────────────────────────────────────────────────────────────────────

describe("calculateAccommodationCost", () => {
  it("band stays 1 night: charges the correct room-type rates", () => {
    const result = calculateAccommodationCost({
      accommodationRequired: true,
      singleRooms: 1,
      doubleRooms: 2,
      nights: 1,
    });
    // 1 single ($120) + 2 doubles ($360) = $480 per night × 1 = $480
    const expected = SINGLE_ROOM_RATE * 1 + DOUBLE_ROOM_RATE * 2;
    expect(result.accommodationCost).toBe(expected);
    expect(result.singleNightlyCost).toBe(SINGLE_ROOM_RATE);
    expect(result.doubleNightlyCost).toBe(DOUBLE_ROOM_RATE * 2);
  });

  it("multi-night stay: multiplies the nightly rate correctly", () => {
    const result = calculateAccommodationCost({
      accommodationRequired: true,
      singleRooms: 2,
      doubleRooms: 1,
      nights: 3,
    });
    // Per night: 2 singles ($240) + 1 double ($180) = $420 × 3 = $1 260
    expect(result.accommodationCost).toBe((SINGLE_ROOM_RATE * 2 + DOUBLE_ROOM_RATE) * 3);
  });

  it("accommodation not required: zero cost regardless of rooms and nights", () => {
    const result = calculateAccommodationCost({
      accommodationRequired: false,
      singleRooms: 3,
      doubleRooms: 2,
      nights: 5,
    });
    expect(result.accommodationCost).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Break-even
// ─────────────────────────────────────────────────────────────────────────────

describe("calculateTicketBreakEven", () => {
  it("100% door: break-even is just enough tickets to cover costs", () => {
    // $212.16 costs ÷ $20/ticket → ceil(10.608) = 11 tickets
    const result = calculateTicketBreakEven({
      showType: "Ticketed Show",
      dealType: "100% door",
      ticketPrice: 20,
      capacity: 200,
      totalCost: 212.16,
    });
    expect(result.breakEvenTickets).toBe(11);
    expect(result.breakEvenCapacityPct).toBeCloseTo(5.5);
    expect(result.impossible).toBe(false);
  });

  it("percentage split: more tickets needed because artist only gets their share", () => {
    // $300 costs at 60% split: artist nets $15/ticket → ceil(300/15) = 20 tickets
    const result = calculateTicketBreakEven({
      showType: "Ticketed Show",
      dealType: "percentage split",
      ticketPrice: 25,
      splitPct: 60,
      capacity: 100,
      totalCost: 300,
    });
    // artist net per ticket = $25 × 0.60 = $15 → ceil(300/15) = 20
    expect(result.breakEvenTickets).toBe(20);
    expect(result.impossible).toBe(false);
  });

  it("merch income reduces the tickets needed to break even", () => {
    // $500 costs, $100 merch already in pocket → only $400 to recover via tickets
    const result = calculateTicketBreakEven({
      showType: "Ticketed Show",
      dealType: "100% door",
      ticketPrice: 20,
      capacity: 100,
      totalCost: 500,
      merchEstimate: 100,
    });
    // remainingCosts = 500 - 100 = 400 → ceil(400/20) = 20
    expect(result.breakEvenTickets).toBe(20);
  });

  it("hybrid show: guarantee reduces the tickets needed to break even", () => {
    // $600 costs, $200 guarantee already guaranteed → only $400 via tickets
    const result = calculateTicketBreakEven({
      showType: "Hybrid",
      dealType: "100% door",
      ticketPrice: 20,
      guarantee: 200,
      capacity: 100,
      totalCost: 600,
    });
    expect(result.breakEvenTickets).toBe(20);
  });

  it("impossible to break even: flags when full house still isn't enough", () => {
    // Need 500 tickets but the room only holds 200 → impossible
    const result = calculateTicketBreakEven({
      showType: "Ticketed Show",
      dealType: "100% door",
      ticketPrice: 5,
      capacity: 200,
      totalCost: 5000,
    });
    expect(result.impossible).toBe(true);
    expect(result.breakEvenTickets).toBeGreaterThan(200);
  });

  it("flat fee show: no break-even analysis (not a ticket deal)", () => {
    const result = calculateTicketBreakEven({
      showType: "Flat Fee",
      ticketPrice: 20,
      capacity: 200,
      totalCost: 300,
    });
    expect(result.breakEvenTickets).toBe(0);
    expect(result.breakEvenCapacityPct).toBeNull();
  });

  it("unknown capacity: break-even ticket count exists but capacity % is null", () => {
    const result = calculateTicketBreakEven({
      showType: "Ticketed Show",
      dealType: "100% door",
      ticketPrice: 20,
      capacity: 0,
      totalCost: 100,
    });
    expect(result.breakEvenTickets).toBe(5);
    expect(result.breakEvenCapacityPct).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Show viability
// ─────────────────────────────────────────────────────────────────────────────

describe("calculateShowViability", () => {
  it("losing show: flagged as Probably Not Worth It", () => {
    const result = calculateShowViability({
      netProfit: -50,
      totalIncome: 200,
      takeHomePerPerson: -25,
      minTakeHomePerPerson: 0,
    });
    expect(result.status).toBe("Probably Not Worth It");
  });

  it("good margin + meets minimum take-home: Worth the Drive", () => {
    // $300 profit on $800 income = 37.5% margin, well over 20%
    const result = calculateShowViability({
      netProfit: 300,
      totalIncome: 800,
      takeHomePerPerson: 150,
      minTakeHomePerPerson: 100,
    });
    expect(result.status).toBe("Worth the Drive");
  });

  it("barely profitable but under minimum take-home per person: Tight Margins", () => {
    // Profitable but each person walks away with less than their minimum
    const result = calculateShowViability({
      netProfit: 50,
      totalIncome: 400,
      takeHomePerPerson: 25,
      minTakeHomePerPerson: 75,
    });
    expect(result.status).toBe("Tight Margins");
  });

  it("profitable but slim margin (under 20%): Tight Margins", () => {
    // 10% margin
    const result = calculateShowViability({
      netProfit: 80,
      totalIncome: 800,
      takeHomePerPerson: 40,
      minTakeHomePerPerson: 0,
    });
    expect(result.status).toBe("Tight Margins");
  });

  it("zero minimum take-home: only margin matters for Worth the Drive", () => {
    const result = calculateShowViability({
      netProfit: 250,
      totalIncome: 500,
      takeHomePerPerson: 125,
      minTakeHomePerPerson: 0,
    });
    expect(result.status).toBe("Worth the Drive");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Member payouts
// ─────────────────────────────────────────────────────────────────────────────

describe("calculateMemberPayouts / calculateMemberEarnings", () => {
  const members: Member[] = [
    { id: "m1", name: "Alice", role: "Lead", feeType: "per_show", expectedGigFee: 150 },
    { id: "m2", name: "Bob", role: "Bass", feeType: "per_tour", expectedGigFee: 500 },
    { id: "m3", name: "Charlie", role: "Merch", feeType: "none", expectedGigFee: 0 },
  ];

  it("per-show fee scales with the number of qualifying shows", () => {
    const summary = calculateMemberPayouts(members, 3);
    const alice = summary.rows.find(r => r.memberId === "m1")!;
    // 3 shows × $150 = $450
    expect(alice.totalEarnings).toBe(450);
  });

  it("per-tour fee is a flat amount regardless of show count", () => {
    const summary = calculateMemberPayouts(members, 10);
    const bob = summary.rows.find(r => r.memberId === "m2")!;
    expect(bob.totalEarnings).toBe(500);
  });

  it("no-fee member earns nothing", () => {
    const summary = calculateMemberPayouts(members, 3);
    const charlie = summary.rows.find(r => r.memberId === "m3")!;
    expect(charlie.totalEarnings).toBe(0);
  });

  it("total payout is the sum of all member earnings", () => {
    // Alice: $450, Bob: $500, Charlie: $0 → $950
    const summary = calculateMemberPayouts(members, 3);
    expect(summary.totalPayout).toBe(950);
  });

  it("member payout can exceed show net profit (shortfall scenario)", () => {
    // A small, poorly-attended show earns only $200 net profit
    // but members expect $950 in fees — a $750 shortfall
    const summary = calculateMemberPayouts(members, 3);
    const showNetProfit = 200;
    const shortfall = summary.totalPayout - showNetProfit;
    expect(shortfall).toBe(750);
  });

  it("legacy member with no feeType field is treated as per_show if they have a fee", () => {
    const legacyMember: Member = {
      id: "m4",
      name: "Dave",
      expectedGigFee: 80,
    } as Member;
    const summary = calculateMemberEarnings([legacyMember], 2);
    // resolveFeeType: no feeType but expectedGigFee > 0 → "per_show"
    expect(summary.rows[0].feeType).toBe("per_show");
    expect(summary.rows[0].totalEarnings).toBe(160);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// calculateSingleShow — full show calculation integration tests
// ─────────────────────────────────────────────────────────────────────────────

describe("calculateSingleShow", () => {
  it("flat fee guarantee with return trip and overnight stay: profit and viability are correct", () => {
    // $500 fee, 120km return, 10 L/100km, $1.90/L
    // 1 single + 1 double room, 1 night, $50 food, 3 people, min take-home $30
    const result = calculateSingleShow({
      showType: "Flat Fee",
      fee: 500,
      distanceKm: 120,
      vehicleConsumptionLPer100: 10,
      fuelPricePerLitre: 1.90,
      returnTrip: true,
      accommodationRequired: true,
      singleRooms: 1,
      doubleRooms: 1,
      accommodationNights: 1,
      foodCost: 50,
      peopleCount: 3,
      minTakeHomePerPerson: 30,
    });

    // fuelCost = 240km × 10/100 × $1.90 = $45.60
    expect(result.fuelCost).toBeCloseTo(45.6);
    // accommodationCost = ($120 + $180) × 1 night = $300
    expect(result.accommodationCost).toBe(300);
    // totalCost = $45.60 + $300 + $50 = $395.60
    expect(result.totalCost).toBeCloseTo(395.6);
    // netProfit = $500 - $395.60 = $104.40
    expect(result.netProfit).toBeCloseTo(104.4);
    // takeHomePerPerson = $104.40 / 3 = $34.80 (> $30 min) and margin = 20.88% > 20%
    expect(result.takeHomePerPerson).toBeCloseTo(34.8);
    expect(result.status).toBe("Worth the Drive");
  });

  it("merch turns a loss-making show into a profit", () => {
    // $150 flat fee, 100km one-way, 9 L/100km, $1.90/L, $80 food, $100 extra costs
    // Without merch: income $150, costs ≈ $197.10 → loss
    const lossRun = calculateSingleShow({
      showType: "Flat Fee",
      fee: 150,
      distanceKm: 100,
      vehicleConsumptionLPer100: 9,
      fuelPricePerLitre: 1.90,
      foodCost: 80,
      extraCosts: 100,
    });
    expect(lossRun.netProfit).toBeLessThan(0);
    expect(lossRun.status).toBe("Probably Not Worth It");

    // With $80 merch: income $230, costs same → profit
    const profitRun = calculateSingleShow({
      showType: "Flat Fee",
      fee: 150,
      distanceKm: 100,
      vehicleConsumptionLPer100: 9,
      fuelPricePerLitre: 1.90,
      foodCost: 80,
      extraCosts: 100,
      merchEstimate: 80,
    });
    expect(profitRun.netProfit).toBeGreaterThan(0);
    expect(profitRun.merch).toBe(80);
  });

  it("ticketed show: break-even capacity is well below expected attendance", () => {
    // 200-cap, $20 tickets, 70% expected, 100% door, $212 costs
    const result = calculateSingleShow({
      showType: "Ticketed Show",
      dealType: "100% door",
      capacity: 200,
      ticketPrice: 20,
      expectedAttendancePct: 70,
      distanceKm: 80,
      vehicleConsumptionLPer100: 8,
      fuelPricePerLitre: 1.90,
      marketingCost: 200,
    });

    expect(result.expectedTicketsSold).toBe(140);
    expect(result.grossRevenue).toBe(2800);
    // break-even should be comfortably below 70% expected fill
    expect(result.breakEvenTickets).toBeLessThan(140);
    expect(result.breakEvenCapacityPct).not.toBeNull();
    expect(result.breakEvenCapacityPct!).toBeLessThan(70);
    expect(result.status).toBe("Worth the Drive");
  });

  it("high-cost regional run: viability is Probably Not Worth It", () => {
    // $300 flat fee but 400km each way, 12 L/100km, return trip → very high fuel bill
    const result = calculateSingleShow({
      showType: "Flat Fee",
      fee: 300,
      distanceKm: 400,
      vehicleConsumptionLPer100: 12,
      fuelPricePerLitre: 1.90,
      returnTrip: true,
      accommodationRequired: true,
      singleRooms: 2,
      doubleRooms: 1,
      accommodationNights: 1,
      foodCost: 60,
    });
    // fuelCost = 800km × 12/100 × $1.90 = $182.40
    expect(result.fuelCost).toBeCloseTo(182.4);
    // Should be a loss
    expect(result.netProfit).toBeLessThan(0);
    expect(result.status).toBe("Probably Not Worth It");
  });

  it("zero-distance local show: no fuel cost affects the result", () => {
    const result = calculateSingleShow({
      showType: "Flat Fee",
      fee: 200,
      distanceKm: 0,
      vehicleConsumptionLPer100: 10,
      fuelPricePerLitre: 1.90,
    });
    expect(result.fuelCost).toBe(0);
    expect(result.netProfit).toBe(200);
  });

  it("no accommodation required: accommodation cost is zero", () => {
    const result = calculateSingleShow({
      showType: "Flat Fee",
      fee: 400,
      distanceKm: 50,
      vehicleConsumptionLPer100: 8,
      fuelPricePerLitre: 1.90,
      accommodationRequired: false,
      singleRooms: 2,
      doubleRooms: 1,
      accommodationNights: 2,
    });
    expect(result.accommodationCost).toBe(0);
  });

  it("no people count provided: defaults to 1 person (solo act)", () => {
    const result = calculateSingleShow({
      showType: "Flat Fee",
      fee: 300,
      distanceKm: 0,
      vehicleConsumptionLPer100: 0,
      fuelPricePerLitre: 1.90,
    });
    expect(result.takeHomePerPerson).toBe(300);
  });

  it("all values null/zero: returns zero profit without throwing", () => {
    const result = calculateSingleShow({
      showType: "Flat Fee",
      fee: null,
      distanceKm: 0,
      vehicleConsumptionLPer100: 0,
      fuelPricePerLitre: 0,
    });
    expect(result.netProfit).toBe(0);
    expect(result.totalIncome).toBe(0);
    expect(result.totalCost).toBe(0);
  });
});
