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
export const CALC_ENGINE_VERSION = "1.1.0";

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
  /** Per-ticket platform/booking fee deducted from gross before any split (e.g. Humanitix, Eventbrite) */
  bookingFeePerTicket?: number | null;
}

export interface ShowIncomeResult {
  showIncome: number;
  expectedTicketsSold: number;
  /** Total ticket revenue before booking fees and splits (tickets × price) */
  grossRevenue: number;
  /** Total booking platform fees deducted from gross */
  bookingFeeTotal: number;
  /** Revenue available for splitting after booking fees: grossRevenue − bookingFeeTotal */
  netTicketRevenue: number;
}

/**
 * Calculate show income from any deal structure.
 * This is the single source of truth — no page should reimplement this logic.
 *
 * Booking fee flow:
 *   grossRevenue      = tickets × ticketPrice
 *   bookingFeeTotal   = tickets × bookingFeePerTicket
 *   netTicketRevenue  = grossRevenue − bookingFeeTotal
 *   artist share      = based on netTicketRevenue (split/door deal applied to net)
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
    bookingFeePerTicket,
  } = input;

  if (showType === "Flat Fee") {
    return { showIncome: n(fee), expectedTicketsSold: 0, grossRevenue: 0, bookingFeeTotal: 0, netTicketRevenue: 0 };
  }

  if (showType === "Ticketed Show" || showType === "Hybrid") {
    const cap = n(capacity);
    const pct = n(expectedAttendancePct);
    const price = n(ticketPrice);
    const split = n(splitPct);
    const guar = n(guarantee);
    const feePerTicket = n(bookingFeePerTicket);

    const expectedTicketsSold = Math.floor((cap * pct) / 100);
    const grossRevenue = expectedTicketsSold * price;
    const bookingFeeTotal = expectedTicketsSold * feePerTicket;
    const netTicketRevenue = Math.max(0, grossRevenue - bookingFeeTotal);

    let doorIncome = 0;
    if (dealType === "100% door") {
      doorIncome = netTicketRevenue;
    } else if (dealType === "percentage split") {
      doorIncome = netTicketRevenue * (split / 100);
    } else if (dealType === "guarantee vs door") {
      doorIncome = Math.max(guar, netTicketRevenue * (split / 100));
    }

    const showIncome = showType === "Hybrid" ? guar + doorIncome : doorIncome;

    return { showIncome, expectedTicketsSold, grossRevenue, bookingFeeTotal, netTicketRevenue };
  }

  return { showIncome: 0, expectedTicketsSold: 0, grossRevenue: 0, bookingFeeTotal: 0, netTicketRevenue: 0 };
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
  /** Per-ticket platform fee — reduces artist's net per ticket sold */
  bookingFeePerTicket?: number | null;
}

export interface TicketBreakEvenResult {
  breakEvenTickets: number;
  /** As a percentage of capacity (0–100+); null if capacity unknown */
  breakEvenCapacityPct: number | null;
  /** True when break-even cannot be achieved even with full capacity */
  impossible: boolean;
}

/** Tickets needed for a single ticketed show to break even on ALL costs. */
export function calculateTicketBreakEven(input: TicketBreakEvenInput): TicketBreakEvenResult {
  const { showType, dealType, ticketPrice, splitPct, guarantee, capacity, totalCost, merchEstimate, bookingFeePerTicket } = input;

  const isTicketed = showType === "Ticketed Show" || showType === "Hybrid";
  if (!isTicketed || n(ticketPrice) <= 0) {
    return { breakEvenTickets: 0, breakEvenCapacityPct: null, impossible: false };
  }

  const price = n(ticketPrice);
  const feePerTicket = n(bookingFeePerTicket);
  const netPricePerTicket = Math.max(0, price - feePerTicket);
  const split = n(splitPct);
  const guar = showType === "Hybrid" ? n(guarantee) : 0;
  const merch = n(merchEstimate);

  // Costs to recover via ticket sales only (deduct guaranteed income already baked in)
  const remainingCosts = Math.max(0, n(totalCost) - merch - guar);

  let breakEvenTickets: number;
  if (dealType === "100% door") {
    // Artist gets full net price per ticket
    breakEvenTickets = netPricePerTicket > 0 && remainingCosts > 0
      ? Math.ceil(remainingCosts / netPricePerTicket)
      : 0;
  } else {
    // percentage split or guarantee vs door — artist only receives their share of net per ticket
    const effectiveSplit = split > 0 ? split / 100 : 1.0;
    const artistNetPerTicket = netPricePerTicket * effectiveSplit;
    breakEvenTickets = artistNetPerTicket > 0 && remainingCosts > 0
      ? Math.ceil(remainingCosts / artistNetPerTicket)
      : 0;
  }

  const cap = n(capacity);
  const breakEvenCapacityPct = cap > 0 ? (breakEvenTickets / cap) * 100 : null;
  const impossible = cap > 0 && breakEvenTickets > cap;

  return { breakEvenTickets, breakEvenCapacityPct, impossible };
}

/**
 * Tickets needed just to cover show-specific costs (marketing + support act).
 * Answers: "How many tickets until this show stops costing me money on the night?"
 * Does NOT include travel costs (fuel, accommodation, food).
 */
export function calculateShowCostBreakEven(input: {
  showType: string;
  dealType?: string | null;
  ticketPrice: number;
  splitPct?: number | null;
  guarantee?: number | null;
  bookingFeePerTicket?: number | null;
  showOnlyCosts: number;
}): number {
  const { showType, dealType, ticketPrice, splitPct, guarantee, bookingFeePerTicket, showOnlyCosts } = input;
  const isTicketed = showType === "Ticketed Show" || showType === "Hybrid";
  if (!isTicketed || n(ticketPrice) <= 0 || showOnlyCosts <= 0) return 0;

  const price = n(ticketPrice);
  const feePerTicket = n(bookingFeePerTicket);
  const netPricePerTicket = Math.max(0, price - feePerTicket);
  const split = n(splitPct);
  const guar = showType === "Hybrid" ? n(guarantee) : 0;
  const costsAfterGuarantee = Math.max(0, showOnlyCosts - guar);

  if (dealType === "100% door") {
    return netPricePerTicket > 0 ? Math.ceil(costsAfterGuarantee / netPricePerTicket) : 0;
  }
  const effectiveSplit = split > 0 ? split / 100 : 1.0;
  const artistNetPerTicket = netPricePerTicket * effectiveSplit;
  return artistNetPerTicket > 0 ? Math.ceil(costsAfterGuarantee / artistNetPerTicket) : 0;
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
  /** Per-ticket platform/booking fee (e.g. Humanitix, Eventbrite) */
  bookingFeePerTicket?: number | null;
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
  /** Cost of the support act on the bill */
  supportActCost?: number | null;
  // People
  peopleCount?: number | null;
  minTakeHomePerPerson?: number | null;
}

export interface SingleShowResult {
  // Income
  showIncome: number;
  expectedTicketsSold: number;
  /** Gross: tickets × ticket price before any fees or splits */
  grossRevenue: number;
  /** Total booking platform fees deducted from gross */
  bookingFeeTotal: number;
  /** Net door revenue after booking fees, before split */
  netTicketRevenue: number;
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
  supportActCost: number;
  totalCost: number;
  // Profit
  netProfit: number;
  takeHomePerPerson: number;
  profitPerMember: number;
  // Viability
  status: ViabilityStatus;
  statusColor: string;
  // Break-even (full — all costs)
  breakEvenTickets: number;
  breakEvenCapacityPct: number | null;
  breakEvenImpossible: boolean;
  /** Tickets to cover show-specific costs only (marketing + support act, not travel) */
  showCostBreakEvenTickets: number;
}

/**
 * Full single-show calculation.
 * Used by run-form to produce all the numbers needed for display and saving.
 */
export function calculateSingleShow(input: SingleShowInput): SingleShowResult {
  // Income
  const { showIncome, expectedTicketsSold, grossRevenue, bookingFeeTotal, netTicketRevenue } = calculateShowIncome({
    showType: input.showType,
    fee: input.fee,
    capacity: input.capacity,
    ticketPrice: input.ticketPrice,
    expectedAttendancePct: input.expectedAttendancePct,
    dealType: input.dealType,
    splitPct: input.splitPct,
    guarantee: input.guarantee,
    bookingFeePerTicket: input.bookingFeePerTicket,
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
  const supportActCost = n(input.supportActCost);

  const totalCost =
    fuel.fuelCost + accom.accommodationCost + foodCost + marketingCost + extraCosts + supportActCost;
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

  // Full break-even (all costs)
  const be = calculateTicketBreakEven({
    showType: input.showType,
    dealType: input.dealType,
    ticketPrice: n(input.ticketPrice),
    splitPct: input.splitPct,
    guarantee: input.guarantee,
    capacity: n(input.capacity),
    totalCost,
    merchEstimate: input.merchEstimate,
    bookingFeePerTicket: input.bookingFeePerTicket,
  });

  // Show-cost break-even (just marketing + support act, not travel/accom/food)
  const showOnlyCosts = marketingCost + supportActCost;
  const showCostBreakEvenTickets = calculateShowCostBreakEven({
    showType: input.showType,
    dealType: input.dealType,
    ticketPrice: n(input.ticketPrice),
    splitPct: input.splitPct,
    guarantee: input.guarantee,
    bookingFeePerTicket: input.bookingFeePerTicket,
    showOnlyCosts,
  });

  return {
    showIncome,
    expectedTicketsSold,
    grossRevenue,
    bookingFeeTotal,
    netTicketRevenue,
    merch,
    totalIncome,
    fuelCost: fuel.fuelCost,
    fuelUsedLitres: fuel.fuelUsedLitres,
    totalDistanceKm: fuel.totalDistanceKm,
    accommodationCost: accom.accommodationCost,
    foodCost,
    marketingCost,
    extraCosts,
    supportActCost,
    totalCost,
    netProfit,
    takeHomePerPerson,
    profitPerMember: takeHomePerPerson,
    status,
    statusColor,
    breakEvenTickets: be.breakEvenTickets,
    breakEvenCapacityPct: be.breakEvenCapacityPct,
    breakEvenImpossible: be.impossible,
    showCostBreakEvenTickets,
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
  bookingFeePerTicket?: number | null;
  merchEstimate?: number | null;
  accommodationCost?: number | null;
  marketingCost?: number | null;
  extraCosts?: number | null;
  supportActCost?: number | null;
}

export interface AttendanceScenario {
  /** Attendance percentage (e.g. 25, 50, 75, 100) */
  pct: number;
  tickets: number;
  grossRevenue: number;
  netTicketRevenue: number;
  /** The door/ticketed portion of income (after deal type applied) */
  doorIncome: number;
  totalIncome: number;
  netEarnings: number;
  /** True when guarantee floor is applied (for guarantee vs door) */
  guaranteeApplied: boolean;
}

export interface StopPreviewResult {
  showIncome: number;
  expectedTicketsSold: number;
  grossRevenue: number;
  bookingFeeTotal: number;
  netTicketRevenue: number;
  merch: number;
  totalIncome: number;
  totalCost: number;
  netProfit: number;
  /** Attendance scenarios for 25 / 50 / 75 / 100 % (only populated for ticketed shows) */
  attendanceScenarios: AttendanceScenario[];
  /**
   * "Guarantee vs Door" only — ticket count at which door earnings first exceed the guarantee.
   * null when not applicable or cannot be computed (e.g. ticketPrice = 0).
   */
  guaranteeBreakpointTickets: number | null;
  /** Net earnings at 25 % attendance */
  worstCase: number;
  /** Net earnings at 100 % attendance */
  bestCase: number;
}

// ── Private helper ─────────────────────────────────────────────────────────────

/**
 * Calculate door income for a given number of tickets, applying booking fees and deal type.
 * Used internally by scenario generation.
 */
function calcDoorIncome(
  tickets: number,
  ticketPrice: number,
  feePerTicket: number,
  dealType: string,
  splitPct: number,
  guarantee: number,
): { doorIncome: number; guaranteeApplied: boolean } {
  const gross = tickets * ticketPrice;
  const netRev = Math.max(0, gross - tickets * feePerTicket);
  let doorIncome: number;
  let guaranteeApplied = false;
  if (dealType === "100% door") {
    doorIncome = netRev;
  } else if (dealType === "percentage split") {
    doorIncome = netRev * (splitPct / 100);
  } else if (dealType === "guarantee vs door") {
    const doorShare = netRev * (splitPct / 100);
    guaranteeApplied = guarantee > doorShare;
    doorIncome = Math.max(guarantee, doorShare);
  } else {
    doorIncome = netRev;
  }
  return { doorIncome, guaranteeApplied };
}

/**
 * Preview calculation for the tour-stop editor.
 * No fuel — fuel is calculated at the tour level from stop coordinates.
 */
export function calculateStopPreview(input: StopPreviewInput): StopPreviewResult {
  const { showIncome, expectedTicketsSold, grossRevenue, bookingFeeTotal, netTicketRevenue } = calculateShowIncome({
    showType: input.showType,
    fee: input.fee,
    capacity: input.capacity,
    ticketPrice: input.ticketPrice,
    expectedAttendancePct: input.expectedAttendancePct,
    dealType: input.dealType,
    splitPct: input.splitPct,
    guarantee: input.guarantee,
    bookingFeePerTicket: input.bookingFeePerTicket,
  });

  const merch = n(input.merchEstimate);
  const totalIncome = showIncome + merch;

  const accommodationCost = n(input.accommodationCost);
  const marketingCost = n(input.marketingCost);
  const extraCosts = n(input.extraCosts);
  const supportActCost = n(input.supportActCost);
  const totalCost = accommodationCost + marketingCost + extraCosts + supportActCost;

  const isTicketed = input.showType === "Ticketed Show" || input.showType === "Hybrid";
  const cap = n(input.capacity);
  const price = n(input.ticketPrice);
  const feePerTicket = n(input.bookingFeePerTicket);
  const split = n(input.splitPct);
  const guar = n(input.guarantee);
  const dealType = input.dealType ?? "100% door";
  const hybridGuarantee = input.showType === "Hybrid" ? guar : 0;

  // ── Attendance scenarios ──────────────────────────────────────────────────
  const scenarios: AttendanceScenario[] = [];
  if (isTicketed && cap > 0 && price > 0) {
    for (const pct of [25, 50, 75, 100]) {
      const tickets = Math.floor((cap * pct) / 100);
      const grossRev = tickets * price;
      const netRev = Math.max(0, grossRev - tickets * feePerTicket);
      const { doorIncome, guaranteeApplied } = calcDoorIncome(tickets, price, feePerTicket, dealType, split, guar);
      const scenarioIncome = hybridGuarantee + doorIncome + merch;
      scenarios.push({
        pct,
        tickets,
        grossRevenue: grossRev,
        netTicketRevenue: netRev,
        doorIncome,
        totalIncome: scenarioIncome,
        netEarnings: scenarioIncome - totalCost,
        guaranteeApplied,
      });
    }
  }

  // ── Guarantee breakpoint ──────────────────────────────────────────────────
  // The ticket count where door earnings (after split) first equal the guarantee.
  let guaranteeBreakpointTickets: number | null = null;
  if (isTicketed && dealType === "guarantee vs door" && guar > 0 && price > 0) {
    const netPricePerTicket = Math.max(0, price - feePerTicket);
    const artistNetPerTicket = netPricePerTicket * (split > 0 ? split / 100 : 1);
    if (artistNetPerTicket > 0) {
      guaranteeBreakpointTickets = Math.ceil(guar / artistNetPerTicket);
    }
  }

  const worstCase = scenarios.find(s => s.pct === 25)?.netEarnings ?? totalIncome - totalCost;
  const bestCase = scenarios.find(s => s.pct === 100)?.netEarnings ?? totalIncome - totalCost;

  return {
    showIncome,
    expectedTicketsSold,
    grossRevenue,
    bookingFeeTotal,
    netTicketRevenue,
    merch,
    totalIncome,
    totalCost,
    netProfit: totalIncome - totalCost,
    attendanceScenarios: scenarios,
    guaranteeBreakpointTickets,
    worstCase,
    bestCase,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-export constants and utilities used alongside calculations
// ─────────────────────────────────────────────────────────────────────────────

export { SINGLE_ROOM_RATE, DOUBLE_ROOM_RATE, SYSTEM_FALLBACK_FUEL_PRICE };
