export type LocationSource = "autocomplete" | "geocode" | "geolocation" | "profile";

export interface AppLocation {
  label: string;
  lat: number;
  lng: number;
  source?: LocationSource;
}

export function isFiniteCoordinate(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function buildAppLocation(
  label: string | null | undefined,
  lat: number | null | undefined,
  lng: number | null | undefined,
  source?: LocationSource,
): AppLocation | null {
  const trimmedLabel = label?.trim() ?? "";
  if (!trimmedLabel || !isFiniteCoordinate(lat) || !isFiniteCoordinate(lng)) {
    return null;
  }

  return {
    label: trimmedLabel,
    lat,
    lng,
    source,
  };
}

export function formatCoordinateLabel(lat: number, lng: number): string {
  return `Lat ${lat.toFixed(5)}, Lng ${lng.toFixed(5)}`;
}

export function looksLikeCoordinateLabel(value: string | null | undefined): boolean {
  return /^Lat\s*-?\d+(\.\d+)?,\s*Lng\s*-?\d+(\.\d+)?$/i.test((value ?? "").trim());
}
