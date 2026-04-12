export const ACCOM_RATES: Record<string, number> = {
  Single: 120,
  Queen: 180,
  Twin: 200,
  "Double Room": 180,
  "Multiple Rooms": 300,
};

export const ACCOM_TYPES = Object.keys(ACCOM_RATES) as Array<keyof typeof ACCOM_RATES>;

export const DEFAULT_MAX_DRIVE_HOURS_PER_DAY = 8;

export const SYSTEM_FALLBACK_FUEL_PRICE = 1.80;
