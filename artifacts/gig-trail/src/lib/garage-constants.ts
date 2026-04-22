import { Car, Truck, Bus, Compass } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type StandardVehicleKey = "small_car" | "suv_wagon" | "van" | "bus";

export interface StandardVehicle {
  key: StandardVehicleKey;
  displayName: string;
  fuelConsumptionL100km: number;
  tankSizeLitres: number;
  /** Most common fuel type for this class — used as a sensible default when the preset is saved. */
  defaultFuelType: "petrol" | "diesel";
  shortDescription: string;
  Icon: LucideIcon;
}

export const STANDARD_VEHICLES: StandardVehicle[] = [
  {
    key: "small_car",
    displayName: "Small Car",
    fuelConsumptionL100km: 7.5,
    tankSizeLitres: 50,
    defaultFuelType: "petrol",
    shortDescription: "Best for solo or light touring.",
    Icon: Car,
  },
  {
    key: "suv_wagon",
    displayName: "SUV / Wagon",
    fuelConsumptionL100km: 10.0,
    tankSizeLitres: 65,
    defaultFuelType: "petrol",
    shortDescription: "More room for gear and short regional runs.",
    Icon: Compass,
  },
  {
    key: "van",
    displayName: "Van",
    fuelConsumptionL100km: 11.5,
    tankSizeLitres: 70,
    defaultFuelType: "diesel",
    shortDescription: "A practical touring setup for duo and band travel.",
    Icon: Truck,
  },
  {
    key: "bus",
    displayName: "Bus",
    fuelConsumptionL100km: 16.0,
    tankSizeLitres: 100,
    defaultFuelType: "diesel",
    shortDescription: "Best for larger touring setups and long runs.",
    Icon: Bus,
  },
];

export const STANDARD_VEHICLE_MAP: Record<StandardVehicleKey, StandardVehicle> =
  Object.fromEntries(STANDARD_VEHICLES.map((v) => [v.key, v])) as Record<
    StandardVehicleKey,
    StandardVehicle
  >;

/** Normalise legacy vehicle type values from old presets to new keys */
export function normaliseVehicleKey(raw: string | null | undefined): StandardVehicleKey {
  if (!raw) return "van";
  const lower = raw.toLowerCase();
  if (lower === "car") return "small_car";
  if (lower === "suv" || lower === "suv_wagon" || lower === "suv / wagon") return "suv_wagon";
  if (lower === "van") return "van";
  if (lower === "bus") return "bus";
  if (lower === "small_car") return "small_car";
  return "van";
}

export function getStandardVehicle(key: string | null | undefined): StandardVehicle {
  const normalised = normaliseVehicleKey(key);
  return STANDARD_VEHICLE_MAP[normalised] ?? STANDARD_VEHICLE_MAP.van;
}
