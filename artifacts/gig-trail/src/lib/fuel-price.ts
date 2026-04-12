import { SYSTEM_FALLBACK_FUEL_PRICE } from "./gig-constants";

export type FuelPriceSource = "manual" | "profile" | "system_fallback";

export interface ResolvedFuelPrice {
  price: number;
  source: FuelPriceSource;
}

/**
 * Resolves the fuel price to use for a calculation.
 *
 * Fallback order:
 *   1. manualFuelPrice — value entered by the user in the form (> 0)
 *   2. profileDefaultFuelPrice — default set on the user's profile (> 0)
 *   3. SYSTEM_FALLBACK_FUEL_PRICE — hardcoded safe default (> 0)
 *
 * Any value <= 0 is treated as invalid and skipped.
 */
export function resolveFuelPrice(
  manualFuelPrice: number | null | undefined,
  profileDefaultFuelPrice: number | null | undefined
): ResolvedFuelPrice {
  const manual = Number(manualFuelPrice);
  if (isFinite(manual) && manual > 0) {
    return { price: manual, source: "manual" };
  }

  const profileDefault = Number(profileDefaultFuelPrice);
  if (isFinite(profileDefault) && profileDefault > 0) {
    return { price: profileDefault, source: "profile" };
  }

  return { price: SYSTEM_FALLBACK_FUEL_PRICE, source: "system_fallback" };
}
