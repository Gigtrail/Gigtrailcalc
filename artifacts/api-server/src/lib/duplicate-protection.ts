import { db, toursTable, vehiclesTable } from "@workspace/db";
import { and, eq, ne } from "drizzle-orm";

export function normalizeDuplicateName(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function n(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function tourSummary(tour: typeof toursTable.$inferSelect) {
  return {
    id: tour.id,
    name: tour.name,
    startDate: tour.startDate,
    endDate: tour.endDate,
    createdAt: tour.createdAt instanceof Date ? tour.createdAt.toISOString() : String(tour.createdAt),
  };
}

function vehicleSummary(vehicle: typeof vehiclesTable.$inferSelect, reasons: string[]) {
  return {
    id: vehicle.id,
    name: vehicle.name,
    vehicleType: vehicle.vehicleType,
    fuelType: vehicle.fuelType,
    avgConsumption: n(vehicle.avgConsumption),
    reasons,
  };
}

export async function checkTourDuplicateName(
  userId: string,
  name: string,
  currentTourId?: number,
) {
  const normalized = normalizeDuplicateName(name);
  if (!normalized) {
    return { duplicateFound: false, matchingRecordIds: [], matchingRecords: [] };
  }

  const rows = await db
    .select()
    .from(toursTable)
    .where(
      currentTourId
        ? and(eq(toursTable.userId, userId), ne(toursTable.id, currentTourId))
        : eq(toursTable.userId, userId),
    );
  const matches = rows.filter((tour) => normalizeDuplicateName(tour.name) === normalized);
  return {
    duplicateFound: matches.length > 0,
    matchingRecordIds: matches.map((tour) => tour.id),
    matchingRecords: matches.map(tourSummary),
    rules: ["trim whitespace", "collapse repeated spaces", "case-insensitive name compare", "same user only"],
  };
}

export async function checkLikelyVehicleDuplicate(
  userId: string,
  candidate: {
    name: string;
    vehicleType?: string | null;
    fuelType?: string | null;
    avgConsumption?: number | string | null;
  },
  currentVehicleId?: number,
) {
  const normalized = normalizeDuplicateName(candidate.name);
  if (!normalized) {
    return { duplicateFound: false, matchingRecordIds: [], matchingRecords: [] };
  }

  const rows = await db
    .select()
    .from(vehiclesTable)
    .where(
      currentVehicleId
        ? and(eq(vehiclesTable.userId, userId), ne(vehiclesTable.id, currentVehicleId))
        : eq(vehiclesTable.userId, userId),
    );

  const candidateConsumption = n(candidate.avgConsumption);
  const matches = rows
    .filter((vehicle) => normalizeDuplicateName(vehicle.name) === normalized)
    .map((vehicle) => {
      const reasons: string[] = [];
      if (
        candidate.fuelType &&
        vehicle.fuelType &&
        candidate.fuelType.toLowerCase() === vehicle.fuelType.toLowerCase()
      ) {
        reasons.push("same fuel type");
      }
      const vehicleConsumption = n(vehicle.avgConsumption);
      if (
        candidateConsumption != null &&
        vehicleConsumption != null &&
        Math.abs(candidateConsumption - vehicleConsumption) <= 0.2
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
      return { vehicle, reasons };
    })
    .filter((match) => match.reasons.length > 0);

  return {
    duplicateFound: matches.length > 0,
    matchingRecordIds: matches.map((match) => match.vehicle.id),
    matchingRecords: matches.map((match) => vehicleSummary(match.vehicle, match.reasons)),
    rules: [
      "trim whitespace",
      "collapse repeated spaces",
      "case-insensitive name compare",
      "same user only",
      "same normalized name plus same fuel type, very close L/100km, or same vehicle type",
    ],
  };
}
