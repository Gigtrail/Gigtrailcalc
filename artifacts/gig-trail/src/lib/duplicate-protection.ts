import { format } from "date-fns";

export function normalizeDuplicateName(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTourDateRange(startDate?: string | null, endDate?: string | null): string | null {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  if (!start && !end) return null;
  if (start && end) {
    const sameYear = start.getFullYear() === end.getFullYear();
    const sameMonth = sameYear && start.getMonth() === end.getMonth();
    if (sameMonth) return `${format(start, "MMM d")}-${format(end, "d, yyyy")}`;
    if (sameYear) return `${format(start, "MMM d")}-${format(end, "MMM d, yyyy")}`;
    return `${format(start, "MMM d, yyyy")}-${format(end, "MMM d, yyyy")}`;
  }
  return format((start ?? end) as Date, "MMM d, yyyy");
}

export type TourLabelInput = {
  id: number;
  name: string;
  startDate?: string | null;
  endDate?: string | null;
  stopCount?: number | null;
};

export type VehicleLabelInput = {
  id: number;
  name: string;
  fuelType?: string | null;
  avgConsumption?: number | null;
  vehicleType?: string | null;
};

export function formatTourLabel(tour: TourLabelInput): string {
  const dateRange = formatTourDateRange(tour.startDate, tour.endDate);
  if (dateRange) return `${tour.name} · ${dateRange}`;
  const stopCount = tour.stopCount ?? 0;
  if (stopCount > 0) return `${tour.name} · ${stopCount} ${stopCount === 1 ? "show" : "shows"}`;
  return `${tour.name} · Draft`;
}

export function formatVehicleLabel(vehicle: VehicleLabelInput): string {
  const fuelType = vehicle.fuelType ? vehicle.fuelType.charAt(0).toUpperCase() + vehicle.fuelType.slice(1) : null;
  const consumption = vehicle.avgConsumption != null ? `${Number(vehicle.avgConsumption).toFixed(1)} L/100km` : null;
  return [vehicle.name, fuelType, consumption].filter(Boolean).join(" · ");
}

export function findDuplicateTourName<T extends TourLabelInput>(
  tours: T[] | undefined,
  name: string | null | undefined,
  currentTourId?: number,
): T | null {
  const normalized = normalizeDuplicateName(name);
  if (!normalized) return null;
  return (
    tours?.find((tour) => tour.id !== currentTourId && normalizeDuplicateName(tour.name) === normalized) ?? null
  );
}

export function getTourRenameSuggestions(name: string, startDate?: string | null): string[] {
  const cleaned = name.trim().replace(/\s+/g, " ");
  if (!cleaned) return [];
  const monthYear = parseDate(startDate) ? format(parseDate(startDate) as Date, "MMM yyyy") : format(new Date(), "MMM yyyy");
  return [`${cleaned} (2)`, `${cleaned} - Draft`, `${cleaned} - ${monthYear}`];
}

export function findLikelyDuplicateVehicle<T extends VehicleLabelInput>(
  vehicles: T[] | undefined,
  candidate: Omit<VehicleLabelInput, "id" | "name"> & { name?: string | null },
  currentVehicleId?: number,
): { vehicle: T; reasons: string[] } | null {
  const normalized = normalizeDuplicateName(candidate.name);
  if (!normalized) return null;

  for (const vehicle of vehicles ?? []) {
    if (vehicle.id === currentVehicleId) continue;
    if (normalizeDuplicateName(vehicle.name) !== normalized) continue;

    const reasons: string[] = [];
    if (
      candidate.fuelType &&
      vehicle.fuelType &&
      candidate.fuelType.toLowerCase() === vehicle.fuelType.toLowerCase()
    ) {
      reasons.push("same fuel type");
    }
    if (
      candidate.avgConsumption != null &&
      vehicle.avgConsumption != null &&
      Math.abs(Number(candidate.avgConsumption) - Number(vehicle.avgConsumption)) <= 0.2
    ) {
      reasons.push("very close L/100km");
    }
    if (
      candidate.vehicleType &&
      vehicle.vehicleType &&
      candidate.vehicleType.toLowerCase() === vehicle.vehicleType.toLowerCase()
    ) {
      reasons.push("same vehicle type");
    }

    if (reasons.length > 0) return { vehicle, reasons };
  }

  return null;
}
