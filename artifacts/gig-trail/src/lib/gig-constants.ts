export const SINGLE_ROOM_RATE = 120;
export const DOUBLE_ROOM_RATE = 180;

export const DEFAULT_MAX_DRIVE_HOURS_PER_DAY = 5;

export const LONG_DRIVE_HOURS_THRESHOLD = 8;
export const EXTREME_DRIVE_HOURS_THRESHOLD = 12;

export type DriveSeverity = "none" | "long" | "extreme";

export function getDriveSeverity(driveTimeMinutes: number): DriveSeverity {
  const hours = driveTimeMinutes / 60;
  if (hours > EXTREME_DRIVE_HOURS_THRESHOLD) return "extreme";
  if (hours > LONG_DRIVE_HOURS_THRESHOLD) return "long";
  return "none";
}

export const SYSTEM_FALLBACK_FUEL_PRICE = 1.80;
