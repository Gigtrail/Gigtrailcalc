/**
 * Gig Trail — Calculation Snapshot Types
 *
 * A CalcSnapshot is stored as JSONB in the `calculation_snapshot` column of the
 * `runs` table whenever the user completes a calculation.  It is fully
 * self-contained: every number on the results screen can be reproduced from
 * this object alone without hitting any other table.
 *
 * Design principles
 * ─────────────────
 * • Immutable at write-time — never mutated after save
 * • Forward-compatible — new optional fields may be added without bumping the
 *   engine version; only changes that alter output values for identical inputs
 *   warrant a MAJOR version bump in CALC_ENGINE_VERSION
 * • Backward-compatible reads — all fields beyond the core are optional so old
 *   snapshots without them can still be displayed gracefully
 */

import type { FeeType } from "@/types/member";

// ─────────────────────────────────────────────────────────────────────────────
// Sub-shapes (frozen copies of live data at calculation time)
// ─────────────────────────────────────────────────────────────────────────────

/** A single band/crew member as they existed when the calculation was run. */
export interface SnapMember {
  id: string;
  name: string;
  role?: string;
  expectedGigFee: number;
  feeType: FeeType;
}

/** Key profile fields frozen at calculation time. */
export interface SnapProfile {
  id: number;
  name: string;
  peopleCount: number;
  actType: string | null;
  /** @deprecated — no longer written; kept optional for backward compat with old snapshots */
  minTakeHomePerPerson?: number;
  maxDriveHoursPerDay: number;
  fuelConsumption: number;
  defaultFuelPrice: number | null;
  vehicleType: string | null;
  vehicleName: string | null;
  accommodationRequired: boolean;
  singleRoomsDefault: number;
  doubleRoomsDefault: number;
}

/** Key vehicle fields frozen at calculation time (null if no garage vehicle selected). */
export interface SnapVehicle {
  id: number;
  name: string;
  vehicleType: string;
  avgConsumption: number;
  fuelType: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// All form inputs used in the calculation
// ─────────────────────────────────────────────────────────────────────────────

export interface SnapFormInputs {
  showType: string;
  dealType?: string | null;
  venueName?: string | null;
  showDate?: string | null;
  origin?: string | null;
  destination?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  distanceKm: number;
  returnTrip: boolean;
  fuelPrice: number;
  fuelEfficiency: number;
  fee?: number | null;
  capacity?: number | null;
  ticketPrice?: number | null;
  expectedAttendancePct?: number | null;
  splitPct?: number | null;
  guarantee?: number | null;
  bookingFeePerTicket?: number | null;
  supportActCost?: number | null;
  merchEstimate?: number | null;
  accommodationRequired: boolean;
  singleRooms: number;
  doubleRooms: number;
  accommodationNights: number;
  foodCost?: number | null;
  marketingCost?: number | null;
  extraCosts?: number | null;
  notes?: string | null;
  actType?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// All calculation outputs
// ─────────────────────────────────────────────────────────────────────────────

export interface SnapOutputs {
  fuelCost: number;
  fuelUsedLitres: number;
  accommodationCost: number;
  totalCost: number;
  totalIncome: number;
  netProfit: number;
  status: "Worth the Drive" | "Tight Margins" | "Probably Not Worth It";
  profitPerMember: number;
  /** @deprecated — kept optional for backward compat with old snapshots */
  takeHomePerPerson?: number;
  /** @deprecated — no longer written; kept optional for backward compat with old snapshots */
  minTakeHomePerPerson?: number;
  breakEvenTickets: number;
  /** 0–100 (percentage, not decimal) */
  breakEvenCapacity: number;
  expectedTicketsSold: number;
  grossRevenue: number;
  /** Total booking platform fees (bookingFeePerTicket × expectedTicketsSold) */
  bookingFeeTotal?: number;
  /** Net door revenue after booking fees, before artist's split */
  netTicketRevenue?: number;
  /** Tickets needed to cover just show-specific costs (marketing + support act) */
  showCostBreakEvenTickets?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Top-level snapshot (stored as JSONB in `calculation_snapshot` column)
// ─────────────────────────────────────────────────────────────────────────────

export interface CalcSnapshot {
  /**
   * Semver string from CALC_ENGINE_VERSION at the time the calculation ran.
   * Compare this against the current CALC_ENGINE_VERSION to detect stale math.
   */
  calculationVersion: string;

  /** ISO 8601 timestamp of when the calculation completed. */
  calculatedAt: string;

  /** Frozen copy of the profile used. Null if no profile was selected. */
  snapshotProfile: SnapProfile | null;

  /**
   * Frozen copy of the garage vehicle used.
   * Null if no specific vehicle was selected from the garage.
   */
  snapshotVehicle: SnapVehicle | null;

  /**
   * Frozen list of band/crew members active at calculation time.
   * Empty array if the profile had no members or no profile was selected.
   * This is the source of truth for the Member Payouts section in history view.
   */
  snapshotMembers: SnapMember[];

  /** How the fuel price was determined. */
  fuelPriceSource: "manual" | "profile" | "system_fallback";

  /** The actual fuel price used in the calculation ($/L). */
  resolvedFuelPrice: number;

  /** All user inputs and resolved defaults that fed into the calculation. */
  formInputs: SnapFormInputs;

  /** All computed financial outputs. */
  outputs: SnapOutputs;

  // ── Derived display values ────────────────────────────────────────────────
  // These are pre-computed from inputs and stored for fast display.
  // They are re-derivable from formInputs + outputs.

  distanceKm: number;
  /**
   * How `distanceKm` was determined at calculation time:
   * - `"google"`  — resolved automatically by the Google Maps Directions API
   * - `"manual"`  — user toggled to Manual mode and entered the distance
   * - `"unavailable"` — Maps could not return a route (e.g. ZERO_RESULTS) and
   *                    the user proceeded anyway; `distanceKm` will be 0 and
   *                    fuel/travel costs are 0
   * Optional for backward compatibility with older snapshots that predate this
   * field — readers should treat `undefined` as `"google"`.
   */
  distanceSource?: "google" | "manual" | "unavailable";
  driveTimeMinutes: number | null;
  recommendedNights: number;
  maxDriveHoursPerDay: number;
  accomSingleRooms: number;
  accomDoubleRooms: number;
  estimatedAccomCostFromDrive: number;
  profileName: string | null;
  profilePeopleCount: number;
  vehicleType: string | null;
  vehicleName: string | null;

  // ── Legacy compatibility ──────────────────────────────────────────────────
  // Kept so old code that reads `snap.formData.*` or `snap.fuelCost` still works.
  // Prefer reading from `outputs.*` and `formInputs.*` in new code.

  fuelCost: number;
  totalCost: number;
  totalIncome: number;
  netProfit: number;
  status: "Worth the Drive" | "Tight Margins" | "Probably Not Worth It";
  profitPerMember: number;
  /** @deprecated — kept optional for backward compat with old snapshots */
  takeHomePerPerson?: number;
  /** @deprecated — no longer written; kept optional for backward compat with old snapshots */
  minTakeHomePerPerson?: number;
  expectedTicketsSold: number;
  grossRevenue: number;
  breakEvenTickets: number;
  breakEvenCapacity: number;
  /** Optional — present on snapshots saved with engine ≥ 1.1.0 */
  showCostBreakEvenTickets?: number;
  /** Optional — present on snapshots saved with engine ≥ 1.1.0 */
  bookingFeeTotal?: number;
  /** Optional — present on snapshots saved with engine ≥ 1.1.0 */
  netTicketRevenue?: number;
  fuelUsedLitres: number;
  formData: Record<string, unknown>;
}
