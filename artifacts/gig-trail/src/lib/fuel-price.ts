import { SYSTEM_FALLBACK_FUEL_PRICE } from "./gig-constants";
import {
  type FuelType,
  type FuelAssumptions,
  type FuelPriceSourceKind,
  createFuelPriceProvider,
  normalizeFuelType,
  fuelPriceDisclaimerText,
} from "./fuel-price-provider";

export type { FuelType, FuelAssumptions, FuelPriceSourceKind };
export { normalizeFuelType, fuelPriceDisclaimerText };

/**
 * Legacy source type — kept for backward compat with snapshots and run-results.tsx.
 * New code should use FuelPriceSourceKind from fuel-price-provider.
 */
export type FuelPriceSource = "manual" | "profile" | "system_fallback" | "profile_assumption" | "system_default";

export interface ResolvedFuelPrice {
  price: number;
  source: FuelPriceSource;
}

/**
 * Legacy resolver — kept for backward compat.
 * New code should call resolveFuelPriceForVehicle() instead.
 *
 * Fallback order:
 *   1. manualFuelPrice — value entered by the user in the form (> 0)
 *   2. profileDefaultFuelPrice — generic default from the user's profile (> 0)
 *   3. SYSTEM_FALLBACK_FUEL_PRICE — hardcoded safe default (> 0)
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

/**
 * Fuel-type-aware resolver — the preferred new path.
 *
 * Resolution waterfall:
 *   1. manualFuelPrice — explicitly entered per-show value (> 0)
 *   2. Profile per-type assumption (defaultPetrolPrice / defaultDieselPrice / defaultLpgPrice) (> 0)
 *   3. Profile generic defaultFuelPrice (legacy fallback for existing profiles) (> 0)
 *   4. System default for the vehicle's fuel type
 *
 * @param fuelTypeRaw       - vehicle's fuel type string (e.g. "petrol", "Diesel")
 * @param manualFuelPrice   - price entered directly in the show form
 * @param profileAssumptions - per-type prices from the profile (defaultPetrolPrice etc.)
 * @param profileGenericDefault - legacy profile.defaultFuelPrice (fallback)
 */
export function resolveFuelPriceForVehicle(
  fuelTypeRaw: string | null | undefined,
  manualFuelPrice: number | null | undefined,
  profileAssumptions: Partial<FuelAssumptions> | null | undefined,
  profileGenericDefault: number | null | undefined
): { price: number; source: FuelPriceSource; fuelType: FuelType } {
  const fuelType = normalizeFuelType(fuelTypeRaw);

  // Build a provider with profile assumptions, falling back to generic default
  // when no per-type assumption is set.
  const effectiveAssumptions: Partial<FuelAssumptions> = { ...profileAssumptions };

  // Fill in any missing per-type values with the generic default (if it exists)
  const generic = Number(profileGenericDefault ?? 0);
  if (isFinite(generic) && generic > 0) {
    if (!effectiveAssumptions.petrol) effectiveAssumptions.petrol = generic;
    if (!effectiveAssumptions.diesel) effectiveAssumptions.diesel = generic;
    if (!effectiveAssumptions.lpg) effectiveAssumptions.lpg = generic;
  }

  const provider = createFuelPriceProvider(effectiveAssumptions);
  const resolved = provider.resolve(fuelType, manualFuelPrice);

  return {
    price: resolved.price,
    fuelType,
    source: resolved.source as FuelPriceSource,
  };
}
