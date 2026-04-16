/**
 * Fuel Price Provider — clean architecture for fuel price resolution.
 *
 * Separation of concerns:
 *   - FuelPriceProvider: interface that any price source must implement
 *   - ManualFuelPriceProvider: the current implementation (user-entered assumptions)
 *   - Future: ApiCacheFuelPriceProvider (swap in when live data is available)
 *
 * Resolution waterfall (per calculation):
 *   1. Per-show manual override entered by the user in the form (> 0)
 *   2. Profile fuel assumption for the vehicle's fuel type (> 0)
 *   3. System default for the vehicle's fuel type
 */

export type FuelType = "petrol" | "diesel" | "lpg";

export type FuelPriceSourceKind =
  | "manual"           // User typed a price directly into the show/tour form
  | "profile_assumption" // Pulled from the profile's saved fuel assumptions
  | "system_default";  // Fell back to built-in Australian averages

export interface FuelAssumptions {
  petrol: number;
  diesel: number;
  lpg: number;
}

export interface ResolvedFuelPriceV2 {
  price: number;
  fuelType: FuelType;
  source: FuelPriceSourceKind;
  /** Human-readable label shown on results/disclaimer. */
  label: string;
}

/**
 * System-wide default fuel price assumptions (AUS averages, $/L).
 * These are intentionally conservative estimates and should be updated periodically.
 * When live API integration is added, ManualFuelPriceProvider will be replaced
 * by an ApiCacheFuelPriceProvider that fetches real-time state averages.
 */
export const SYSTEM_FUEL_DEFAULTS: FuelAssumptions = {
  petrol: 1.85,
  diesel: 1.95,
  lpg: 0.90,
};

/**
 * FuelPriceProvider interface.
 * Implement this to add a new price source (e.g. live API, cached state prices).
 */
export interface FuelPriceProvider {
  /**
   * Returns the base assumptions for all fuel types from this source.
   * Used to pre-populate form fields and as the fallback when no manual override exists.
   */
  getAssumptions(): FuelAssumptions;

  /**
   * Resolves the final price for a specific fuel type, applying the per-show
   * manual override if provided.
   */
  resolve(
    fuelType: FuelType,
    manualOverride?: number | null
  ): ResolvedFuelPriceV2;
}

/**
 * ManualFuelPriceProvider — the current implementation.
 * Uses profile-saved assumptions (if set) with a system-default fallback.
 * No network calls. Fully synchronous.
 *
 * Future replacement: ApiCacheFuelPriceProvider
 *   - Fetches state-based averages from a fuel price API
 *   - Falls back to ManualFuelPriceProvider when offline/unavailable
 */
export class ManualFuelPriceProvider implements FuelPriceProvider {
  private profileAssumptions: Partial<FuelAssumptions>;

  constructor(profileAssumptions: Partial<FuelAssumptions> = {}) {
    this.profileAssumptions = profileAssumptions;
  }

  getAssumptions(): FuelAssumptions {
    return {
      petrol: this.profileAssumptions.petrol ?? SYSTEM_FUEL_DEFAULTS.petrol,
      diesel: this.profileAssumptions.diesel ?? SYSTEM_FUEL_DEFAULTS.diesel,
      lpg: this.profileAssumptions.lpg ?? SYSTEM_FUEL_DEFAULTS.lpg,
    };
  }

  resolve(fuelType: FuelType, manualOverride?: number | null): ResolvedFuelPriceV2 {
    const overrideNum = Number(manualOverride ?? 0);
    if (isFinite(overrideNum) && overrideNum > 0) {
      return {
        price: overrideNum,
        fuelType,
        source: "manual",
        label: `Manual — $${overrideNum.toFixed(2)}/L`,
      };
    }

    const profilePrice = this.profileAssumptions[fuelType];
    const profileNum = Number(profilePrice ?? 0);
    if (isFinite(profileNum) && profileNum > 0) {
      return {
        price: profileNum,
        fuelType,
        source: "profile_assumption",
        label: `Profile assumption — $${profileNum.toFixed(2)}/L`,
      };
    }

    const systemPrice = SYSTEM_FUEL_DEFAULTS[fuelType];
    return {
      price: systemPrice,
      fuelType,
      source: "system_default",
      label: `Australian average — $${systemPrice.toFixed(2)}/L`,
    };
  }
}

/**
 * Convenience factory: build a ManualFuelPriceProvider from profile data.
 * Pass the profile object (or null for no profile) and get back a ready-to-use provider.
 */
export function createFuelPriceProvider(
  profileAssumptions?: Partial<FuelAssumptions> | null
): FuelPriceProvider {
  return new ManualFuelPriceProvider(profileAssumptions ?? {});
}

/**
 * Maps a free-text fuelType string (from the DB/vehicle) to a typed FuelType.
 * Defaults to "petrol" for unrecognised values.
 */
export function normalizeFuelType(raw: string | null | undefined): FuelType {
  const lower = (raw ?? "").toLowerCase().trim();
  if (lower === "diesel") return "diesel";
  if (lower === "lpg") return "lpg";
  return "petrol";
}

/**
 * Disclaimer text shown in UI when price source is not a manual per-show override.
 */
export function fuelPriceDisclaimerText(source: FuelPriceSourceKind, price: number, fuelType: FuelType): string {
  const typeLabel = fuelType.charAt(0).toUpperCase() + fuelType.slice(1);
  const priceStr = `$${price.toFixed(2)}/L`;
  switch (source) {
    case "manual":
      return `Using manually entered ${typeLabel} price (${priceStr}).`;
    case "profile_assumption":
      return `Using your saved ${typeLabel} assumption (${priceStr}). Automatic fuel pricing coming soon.`;
    case "system_default":
      return `No ${typeLabel} price set — using Australian average of ${priceStr}. Set your own in your profile. Automatic fuel pricing coming soon.`;
  }
}
