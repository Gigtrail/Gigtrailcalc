/**
 * Gig Trail — Shared Calculation Engine
 *
 * Single source of truth for all financial logic. The UI gathers inputs
 * and calls these pure functions; no page or component should contain
 * its own custom profit math.
 *
 * Exported functions
 * ──────────────────
 * calculateShowIncome()      — income for a single show (all deal types)
 * calculateFuelCost()        — fuel cost for a leg / round trip
 * calculateVehicleCosts()    — multi-vehicle fleet fuel breakdown
 * calculateAccommodationCost() — nightly room cost
 * calculateTicketBreakEven() — tickets needed to break even
 * calculateShowViability()   — "Worth the Drive" / "Tight Margins" / "Probably Not Worth It"
 * calculateMemberPayouts()   — per-member fee breakdown (re-export from member-utils)
 * calculateSingleShow()      — complete single-show result (used by run-form)
 * calculateStopPreview()     — inline stop preview (used by tour-stop-form)
 */

/**
 * Calculation engine version — bump this whenever the financial logic changes
 * in a way that would produce different outputs for the same inputs.
 * Snapshots record this at save-time so future engineers can identify which
 * engine version produced a given result.
 *
 * Versioning convention:
 *   MAJOR — break in outputs for identical inputs (e.g. algorithm change)
 *   MINOR — new derived outputs added; existing outputs unchanged
 *   PATCH — bug fix that corrects previously wrong outputs
 */
export const CALC_ENGINE_VERSION = "1.0.0";

import { SINGLE_ROOM_RATE, DOUBLE_ROOM_RATE, SYSTEM_FALLBACK_FUEL_PRICE } from "./gig-constants";
import { calculateMemberEarnings, type MemberEarningsSummary } from "./member-utils";
import type { Member } from "@/types/member";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Coerce any value to a finite number, defaulting to 0. */
function n(val: unknown): number {
  const num = parseFloat(String(val ?? 0));
  return Number.isFinite(num) ? num : 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Show Income
// ─────────────────────────────────────────────────────────────────────────────

export interface ShowIncomeInput {
  showType: string;        // "Flat Fee" | "Ticketed Show" | "Hybrid"
  fee?: number | null;
  capacity?: number | null;
  ticketPrice?: number | null;
  expectedAttendancePct?: number | null;
  dealType?: string | null; // "100% door" | "percentage split" | "guarantee vs door"
  splitPct?: number | null;
  guarantee?: number | null;
}

export interface ShowIncomeResult {
  showIncome: number;
  expectedTicketsSold: number;
  grossRevenue: number;
}

/**
 * Calculate show income from any deal structure.
 * This is the single source of truth — no page should reimplement this logic.
 */
export function calculateShowIncome(input: ShowIncomeInput): ShowIncomeResult {
  const {
    showType,
    fee,
    capacity,
    ticketPrice,
    expectedAttendancePct,
    dealType,
    splitPct,
    guarantee,
  } = input;

  if (showType === "Flat Fee") {
    return { showIncome: n(fee), expectedTicketsSold: 0, grossRevenue: 0 };
  }

  if (showType === "Ticketed Show" || showType === "Hybrid") {
    const cap = n(capacity);
    const pct = n(expectedAttendancePct);
    const price = n(ticketPrice);
    const split = n(splitPct);
    const guar = n(guarantee);

    const expectedTicketsSold = Math.floor((cap * pct) / 100);
    const grossRevenue = expectedTicketsSold * price;

    let doorIncome = 0;
    if (dealType === "100% door") {
      doorIncome = grossRevenue;
    } else if (dealType === "percentage split") {
      doorIncome = grossRevenue * (split / 100);
    } else if (dealType === "guarantee vs door") {
      doorIncome = Math.max(guar, grossRevenue * (split / 100));
    }

    const showIncome = showType === "Hybrid" ? guar + doorIncome : doorIncome;

    return { showIncome, expectedTicketsSold, grossRevenue };
  }

  return { showIncome: 0, expectedTicketsSold: 0, grossRevenue: 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Fuel
// ─────────────────────────────────────────────────────────────────────────────

export interface FuelCostInput {
  distanceKm: number;
  consumptionLPer100: number;
  pricePerLitre: number;
  returnTrip?: boolean;
}

export interface FuelCostResult {
  totalDistanceKm: number;
  fuelUsedLitres: number;
  fuelCost: number;
}

/** Fuel cost for a single leg or round-trip single-show run. */
export function calculateFuelCost(input: FuelCostInput): FuelCostResult {
  const { distanceKm, consumptionLPer100, pricePerLitre, returnTrip = false } = input;
  const multiplier = returnTrip ? 2 : 1;
  const totalDistanceKm = n(distanceKm) * multiplier;
  const fuelUsedLitres =
    n(consumptionLPer100) > 0 ? (totalDistanceKm * n(consumptionLPer100)) / 100 : 0;
  const fuelCost = fuelUsedLitres * n(pricePerLitre);
  return { totalDistanceKm, fuelUsedLitres, fuelCost };
}

// ─────────────────────────────────────────────────────────────────────────────
// Multi-vehicle fleet fuel
// ─────────────────────────────────────────────────────────────────────────────

export interface VehicleCostInput {
  id: number;
  name: string;
  fuelType: string;       // "petrol" | "diesel" | "lpg"
  consumptionLPer100: number;
}

export interface VehicleCostPrices {
  petrol: number;
  diesel: number;
  lpg: number;
}

export interface VehicleCostResult {
  vehicleId: number;
  vehicleName: string;
  fuelType: string;
  consumptionLPer100: number;
  totalLitres: number;
  totalCost: number;
}

/**
 * Break down fuel cost per vehicle given total tour distance and per-fuel-type prices.
 * Each vehicle uses its own fuel type's price.
 */
export function calculateVehicleCosts(
  vehicles: VehicleCostInput[],
  totalDistanceKm: number,
  prices: VehicleCostPrices,
): VehicleCostResult[] {
  return vehicles.map(v => {
    const consumption = n(v.consumptionLPer100);
    const totalLitres = consumption > 0 ? (n(totalDistanceKm) * consumption) / 100 : 0;
    const typeKey = (v.fuelType ?? "petrol").toLowerCase() as keyof VehicleCostPrices;
    const pricePerLitre = prices[typeKey] ?? prices.petrol;
    const totalCost = totalLitres * n(pricePerLitre);
    return {
      vehicleId: v.id,
      vehicleName: v.name,
      fuelType: v.fuelType,
      consumptionLPer100: consumption,
      totalLitres,
      totalCost,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Accommodation
// ─────────────────────────────────────────────────────────────────────────────

export interface AccommodationInput {
  accommodationRequired: boolean;
  singleRooms: number;
  doubleRooms: number;
  nights: number;
}

export interface AccommodationResult {
  accommodationCost: number;
  singleNightlyCost: number;
  doubleNightlyCost: number;
}

/** Nightly room cost using the shared room rates from gig-constants. */
export function calculateAccommodationCost(input: AccommodationInput): AccommodationResult {
  const { accommodationRequired, singleRooms, doubleRooms, nights } = input;
  if (!accommodationRequired) {
    return { accommodationCost: 0, singleNightlyCost: SINGLE_ROOM_RATE, doubleNightlyCost: DOUBLE_ROOM_RATE };
  }
  const singleNightlyCost = n(singleRooms) * SINGLE_ROOM_RATE;
  const doubleNightlyCost = n(doubleRooms) * DOUBLE_ROOM_RATE;
  const accommodationCost = (singleNightlyCost + doubleNightlyCost) * n(nights);
  return { accommodationCost, singleNightlyCost, doubleNightlyCost };
}

// ─────────────────────────────────────────────────────────────────────────────
// Break-Even (ticket recovery for a single show)
// ─────────────────────────────────────────────────────────────────────────────

export interface TicketBreakEvenInput {
  showType: string;
  dealType?: string | null;
  ticketPrice: number;
  splitPct?: number | null;
  guarantee?: number | null;
  capacity?: number | null;
  totalCost: number;
  /** Merch and guarantee are deducted from costs before calculating ticket need */
  merchEstimate?: number | null;
}

export interface TicketBreakEvenResult {
  breakEvenTickets: number;
  /** As a percentage of capacity (0–100+); null if capacity unknown */
  breakEvenCapacityPct: number | null;
  /** True when break-even cannot be achieved even with full capacity */
  impossible: boolean;
}

/** Tickets needed for a single ticketed show to break even. */
export function calculateTicketBreakEven(input: TicketBreakEvenInput): TicketBreakEvenResult {
  const { showType, dealType, ticketPrice, splitPct, guarantee, capacity, totalCost, merchEstimate } = input;

  const isTicketed = showType === "Ticketed Show" || showType === "Hybrid";
  if (!isTicketed || n(ticketPrice) <= 0) {
    return { breakEvenTickets: 0, breakEvenCapacityPct: null, impossible: false };
  }

  const price = n(ticketPrice);
  const split = n(splitPct);
  const guar = showType === "Hybrid" ? n(guarantee) : 0;
  const merch = n(merchEstimate);

  // Costs to recover via ticket sales only (deduct guaranteed income already baked in)
  const remainingCosts = Math.max(0, n(totalCost) - merch - guar);

  let breakEvenTickets: number;
  if (dealType === "100% door") {
    breakEvenTickets = remainingCosts > 0 ? Math.ceil(remainingCosts / price) : 0;
  } else {
    // percentage split or guarantee vs door — artist only receives their share per ticket
    const effectiveSplit = split > 0 ? split / 100 : 1.0;
    const netPerTicket = price * effectiveSplit;
    breakEvenTickets = netPerTicket > 0 ? Math.ceil(remainingCosts / netPerTicket) : 0;
  }

  const cap = n(capacity);
  const breakEvenCapacityPct = cap > 0 ? (breakEvenTickets / cap) * 100 : null;
  const impossible = cap > 0 && breakEvenTickets > cap;

  return { breakEvenTickets, breakEvenCapacityPct, impossible };
}

// ─────────────────────────────────────────────────────────────────────────────
// Show viability
// ─────────────────────────────────────────────────────────────────────────────

export type ViabilityStatus = "Worth the Drive" | "Tight Margins" | "Probably Not Worth It";

export interface ShowViabilityInput {
  netProfit: number;
  totalIncome: number;
  takeHomePerPerson: number;
  minTakeHomePerPerson: number;
}

export interface ShowViabilityResult {
  status: ViabilityStatus;
  /** Tailwind colour classes for the badge */
  statusColor: string;
}

/** Classify a show result into a human-readable viability bucket. */
export function calculateShowViability(input: ShowViabilityInput): ShowViabilityResult {
  const { netProfit, totalIncome, takeHomePerPerson, minTakeHomePerPerson } = input;

  if (netProfit <= 0) {
    return { status: "Probably Not Worth It", statusColor: "text-red-500 bg-red-500/10" };
  }

  const margin = n(totalIncome) > 0 ? netProfit / totalIncome : 0;
  const meetsMinimum = minTakeHomePerPerson <= 0 || takeHomePerPerson >= minTakeHomePerPerson;

  if (margin > 0.2 && meetsMinimum) {
    return { status: "Worth the Drive", statusColor: "text-green-500 bg-green-500/10" };
  }

  return { status: "Tight Margins", statusColor: "text-amber-500 bg-amber-500/10" };
}

// ─────────────────────────────────────────────────────────────────────────────
// Member payouts (thin wrapper, keeps the call site consistent)
// ─────────────────────────────────────────────────────────────────────────────

export { calculateMemberEarnings };
export type { MemberEarningsSummary };

/** Convenience wrapper so callers import everything from one place. */
export function calculateMemberPayouts(
  activeMembers: Member[],
  qualifyingShowCount: number,
): MemberEarningsSummary {
  return calculateMemberEarnings(activeMembers, qualifyingShowCount);
}

// ─────────────────────────────────────────────────────────────────────────────
// calculateSingleShow  —  complete single-show result (replaces run-form inline calc)
// ─────────────────────────────────────────────────────────────────────────────

export interface SingleShowInput {
  // Show income
  showType: string;
  fee?: number | null;
  capacity?: number | null;
  ticketPrice?: number | null;
  expectedAttendancePct?: number | null;
  dealType?: string | null;
  splitPct?: number | null;
  guarantee?: number | null;
  // Merch & extra income
  merchEstimate?: number | null;
  // Route / fuel
  distanceKm: number;
  vehicleConsumptionLPer100: number;
  fuelPricePerLitre: number;
  returnTrip?: boolean;
  // Accommodation
  accommodationRequired?: boolean;
  singleRooms?: number | null;
  doubleRooms?: number | null;
  accommodationNights?: number | null;
  // Other costs
  foodCost?: number | null;
  marketingCost?: number | null;
  extraCosts?: number | null;
  // People
  peopleCount?: number | null;
  minTakeHomePerPerson?: number | null;
}

export interface SingleShowResult {
  // Income
  showIncome: number;
  expectedTicketsSold: number;
  grossRevenue: number;
  merch: number;
  totalIncome: number;
  // Costs
  fuelCost: number;
  fuelUsedLitres: number;
  totalDistanceKm: number;
  accommodationCost: number;
  foodCost: number;
  marketingCost: number;
  extraCosts: number;
  totalCost: number;
  // Profit
  netProfit: number;
  takeHomePerPerson: number;
  profitPerMember: number;
  // Viability
  status: ViabilityStatus;
  statusColor: string;
  // Break-even
  breakEvenTickets: number;
  breakEvenCapacityPct: number | null;
  breakEvenImpossible: boolean;
}

/**
 * Full single-show calculation.
 * Used by run-form to produce all the numbers needed for display and saving.
 */
export function calculateSingleShow(input: SingleShowInput): SingleShowResult {
  // Income
  const { showIncome, expectedTicketsSold, grossRevenue } = calculateShowIncome({
    showType: input.showType,
    fee: input.fee,
    capacity: input.capacity,
    ticketPrice: input.ticketPrice,
    expectedAttendancePct: input.expectedAttendancePct,
    dealType: input.dealType,
    splitPct: input.splitPct,
    guarantee: input.guarantee,
  });

  const merch = n(input.merchEstimate);
  const totalIncome = showIncome + merch;

  // Fuel
  const fuel = calculateFuelCost({
    distanceKm: input.distanceKm,
    consumptionLPer100: input.vehicleConsumptionLPer100,
    pricePerLitre: input.fuelPricePerLitre,
    returnTrip: input.returnTrip ?? false,
  });

  // Accommodation
  const accom = calculateAccommodationCost({
    accommodationRequired: input.accommodationRequired ?? false,
    singleRooms: n(input.singleRooms),
    doubleRooms: n(input.doubleRooms),
    nights: n(input.accommodationNights),
  });

  // Other costs
  const foodCost = n(input.foodCost);
  const marketingCost = n(input.marketingCost);
  const extraCosts = n(input.extraCosts);

  const totalCost =
    fuel.fuelCost + accom.accommodationCost + foodCost + marketingCost + extraCosts;
  const netProfit = totalIncome - totalCost;

  // Per-person
  const peopleCount = n(input.peopleCount) > 0 ? n(input.peopleCount) : 1;
  const takeHomePerPerson = netProfit / peopleCount;
  const minTakeHomePerPerson = n(input.minTakeHomePerPerson);

  // Viability
  const { status, statusColor } = calculateShowViability({
    netProfit,
    totalIncome,
    takeHomePerPerson,
    minTakeHomePerPerson,
  });

  // Break-even
  const be = calculateTicketBreakEven({
    showType: input.showType,
    dealType: input.dealType,
    ticketPrice: n(input.ticketPrice),
    splitPct: input.splitPct,
    guarantee: input.guarantee,
    capacity: n(input.capacity),
    totalCost,
    merchEstimate: input.merchEstimate,
  });

  return {
    showIncome,
    expectedTicketsSold,
    grossRevenue,
    merch,
    totalIncome,
    fuelCost: fuel.fuelCost,
    fuelUsedLitres: fuel.fuelUsedLitres,
    totalDistanceKm: fuel.totalDistanceKm,
    accommodationCost: accom.accommodationCost,
    foodCost,
    marketingCost,
    extraCosts,
    totalCost,
    netProfit,
    takeHomePerPerson,
    profitPerMember: takeHomePerPerson,
    status,
    statusColor,
    breakEvenTickets: be.breakEvenTickets,
    breakEvenCapacityPct: be.breakEvenCapacityPct,
    breakEvenImpossible: be.impossible,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// calculateStopPreview  —  inline stop editor preview (replaces tour-stop-form inline calc)
// ─────────────────────────────────────────────────────────────────────────────

export interface StopPreviewInput {
  showType: string;
  fee?: number | null;
  capacity?: number | null;
  ticketPrice?: number | null;
  expectedAttendancePct?: number | null;
  dealType?: string | null;
  splitPct?: number | null;
  guarantee?: number | null;
  merchEstimate?: number | null;
  accommodationCost?: number | null;
  marketingCost?: number | null;
  extraCosts?: number | null;
}

export interface StopPreviewResult {
  showIncome: number;
  expectedTicketsSold: number;
  grossRevenue: number;
  merch: number;
  totalIncome: number;
  totalCost: number;
  netProfit: number;
}

/**
 * Preview calculation for the tour-stop editor.
 * No fuel — fuel is calculated at the tour level from stop coordinates.
 */
export function calculateStopPreview(input: StopPreviewInput): StopPreviewResult {
  const { showIncome, expectedTicketsSold, grossRevenue } = calculateShowIncome({
    showType: input.showType,
    fee: input.fee,
    capacity: input.capacity,
    ticketPrice: input.ticketPrice,
    expectedAttendancePct: input.expectedAttendancePct,
    dealType: input.dealType,
    splitPct: input.splitPct,
    guarantee: input.guarantee,
  });

  const merch = n(input.merchEstimate);
  const totalIncome = showIncome + merch;

  const accommodationCost = n(input.accommodationCost);
  const marketingCost = n(input.marketingCost);
  const extraCosts = n(input.extraCosts);
  const totalCost = accommodationCost + marketingCost + extraCosts;

  return {
    showIncome,
    expectedTicketsSold,
    grossRevenue,
    merch,
    totalIncome,
    totalCost,
    netProfit: totalIncome - totalCost,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-export constants and utilities used alongside calculations
// ─────────────────────────────────────────────────────────────────────────────

export { SINGLE_ROOM_RATE, DOUBLE_ROOM_RATE, SYSTEM_FALLBACK_FUEL_PRICE };
