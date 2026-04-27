import { buildAppLocation, type AppLocation, type LocationSource } from "@/lib/location";

declare global {
  interface Window {
    __gigTrailGoogleMapsReady?: () => void;
  }
}

export interface ParsedAddress {
  suburb?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
}

export interface ResolvedPlace extends AppLocation {
  parsed?: ParsedAddress;
}

export interface DrivingRoute {
  distanceKm: number;
  durationMinutes: number;
  source: "distance-matrix" | "directions";
}

type ScriptStatus = "idle" | "loading" | "loaded" | "error";

const SCRIPT_CALLBACK = "__gigTrailGoogleMapsReady";
const SCRIPT_SELECTOR = 'script[data-gigtrail-google-maps="true"]';

let scriptStatus: ScriptStatus = "idle";
let loadedApiKey: string | null = null;
let loadPromise: Promise<boolean> | null = null;
let hasLoggedMissingKey = false;
let lastLoadError: string | null = null;

function logGoogleMapsEvent(message: string, extra?: unknown) {
  if (extra !== undefined) {
    console.info(`[GoogleMaps] ${message}`, extra);
    return;
  }
  console.info(`[GoogleMaps] ${message}`);
}

function logGoogleMapsError(message: string, error?: unknown) {
  if (error !== undefined) {
    console.error(`[GoogleMaps] ${message}`, error);
    return;
  }
  console.error(`[GoogleMaps] ${message}`);
}

function resetLoaderState() {
  document.querySelector(SCRIPT_SELECTOR)?.remove();
  delete window.__gigTrailGoogleMapsReady;
  scriptStatus = "idle";
  loadedApiKey = null;
  loadPromise = null;
  lastLoadError = null;
}

export function getGoogleMapsApiKey(): string | null {
  const apiKey = (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined)?.trim();
  if (apiKey) {
    return apiKey;
  }

  if (!hasLoggedMissingKey) {
    hasLoggedMissingKey = true;
    lastLoadError = "Missing VITE_GOOGLE_MAPS_API_KEY";
    logGoogleMapsError("Missing VITE_GOOGLE_MAPS_API_KEY. Location services unavailable.");
  }

  return null;
}

export function getGoogleMapsLoadError(): string | null {
  return lastLoadError;
}

export function loadGoogleMaps(apiKey = getGoogleMapsApiKey()): Promise<boolean> {
  if (window.google?.maps?.places) {
    scriptStatus = "loaded";
    lastLoadError = null;
    return Promise.resolve(true);
  }

  if (!apiKey) {
    scriptStatus = "error";
    return Promise.resolve(false);
  }

  if (scriptStatus === "error") {
    loadPromise = null;
  }

  if (loadPromise && loadedApiKey === apiKey) {
    return loadPromise;
  }

  if (loadedApiKey && loadedApiKey !== apiKey) {
    resetLoaderState();
  }

  scriptStatus = "loading";
  loadedApiKey = apiKey;
  lastLoadError = null;

  loadPromise = new Promise((resolve) => {
    const existingScript = document.querySelector(SCRIPT_SELECTOR);
    if (existingScript) {
      existingScript.remove();
    }

    const script = document.createElement("script");
    script.dataset.gigtrailGoogleMaps = "true";
    script.src =
      `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}` +
      `&libraries=places&loading=async&v=weekly&callback=${SCRIPT_CALLBACK}`;
    script.async = true;
    script.defer = true;

    window.__gigTrailGoogleMapsReady = () => {
      scriptStatus = "loaded";
      lastLoadError = null;
      logGoogleMapsEvent("Google Maps JavaScript API loaded");
      resolve(true);
    };

    script.onerror = (event) => {
      scriptStatus = "error";
      lastLoadError = "Google Maps JavaScript API failed to load";
      logGoogleMapsError(lastLoadError, event);
      resolve(false);
    };

    document.head.appendChild(script);
  });

  return loadPromise;
}

export async function waitForGoogleMapsReady(timeoutMs = 10_000): Promise<boolean> {
  if (window.google?.maps) {
    return true;
  }

  const apiKey = getGoogleMapsApiKey();
  if (!apiKey) {
    return false;
  }

  const loaded = await Promise.race<boolean>([
    loadGoogleMaps(apiKey),
    new Promise((resolve) => {
      window.setTimeout(() => resolve(false), timeoutMs);
    }),
  ]);

  if (!loaded && !lastLoadError) {
    lastLoadError = "Google Maps JavaScript API timed out";
    logGoogleMapsError(lastLoadError);
  }

  return loaded;
}

function getComponent(
  components: google.maps.GeocoderAddressComponent[],
  types: string[],
  key: "long_name" | "short_name" = "long_name",
): string {
  return components.find((component) => component.types.some((type) => types.includes(type)))?.[key] ?? "";
}

export function parseAddressComponents(
  components: google.maps.GeocoderAddressComponent[],
): ParsedAddress {
  const sublocality = getComponent(components, ["sublocality_level_1", "sublocality"]);
  const locality = getComponent(components, ["locality"]);
  const admin2 = getComponent(components, ["administrative_area_level_2"]);
  const admin1Short = getComponent(components, ["administrative_area_level_1"], "short_name");
  const postalCode = getComponent(components, ["postal_code"]);
  const countryLong = getComponent(components, ["country"]);

  const suburb = sublocality || locality || "";
  const city = locality && locality !== suburb ? locality : (admin2 || "");

  return {
    suburb: suburb || undefined,
    city: city || undefined,
    state: admin1Short || undefined,
    postcode: postalCode || undefined,
    country: countryLong || undefined,
  };
}

export function formatPlaceLabel(parsed?: ParsedAddress, fallback?: string): string {
  if (!parsed) {
    return fallback?.trim() || "";
  }

  const locality = parsed.suburb || parsed.city || "";
  const region = [locality, parsed.state].filter(Boolean).join(" ");
  const regionalWithPostcode = [region, parsed.postcode].filter(Boolean).join(" ");
  const country = parsed.country || "";

  return [regionalWithPostcode || region || locality, country].filter(Boolean).join(", ") || fallback?.trim() || "";
}

function mapPlaceResult(
  label: string,
  lat: number | null | undefined,
  lng: number | null | undefined,
  source: LocationSource,
  parsed?: ParsedAddress,
): ResolvedPlace | null {
  const location = buildAppLocation(label, lat, lng, source);
  return location ? { ...location, parsed } : null;
}

export async function reverseGeocodeLocation(lat: number, lng: number): Promise<ResolvedPlace | null> {
  const mapsReady = await waitForGoogleMapsReady();
  if (!mapsReady || !window.google?.maps?.Geocoder) {
    logGoogleMapsError("Reverse geocoding unavailable");
    return null;
  }

  return new Promise((resolve) => {
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status !== "OK" || !results?.length) {
        logGoogleMapsError("Reverse geocoding failed", { lat, lng, status });
        resolve(null);
        return;
      }

      const first = results[0];
      const parsed = first.address_components
        ? parseAddressComponents(first.address_components)
        : undefined;
      resolve(mapPlaceResult(
        formatPlaceLabel(parsed, first.formatted_address),
        lat,
        lng,
        "geolocation",
        parsed,
      ));
    });
  });
}

export async function geocodeAddress(address: string): Promise<ResolvedPlace | null> {
  const query = address.trim();
  if (!query) {
    return null;
  }

  const mapsReady = await waitForGoogleMapsReady();
  if (!mapsReady || !window.google?.maps?.Geocoder) {
    logGoogleMapsError("Address geocoding unavailable", { address: query });
    return null;
  }

  return new Promise((resolve) => {
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address: query }, (results, status) => {
      if (status !== "OK" || !results?.length) {
        logGoogleMapsError("Address geocoding failed", { address: query, status });
        resolve(null);
        return;
      }

      const first = results[0];
      const parsed = first.address_components
        ? parseAddressComponents(first.address_components)
        : undefined;

      resolve(mapPlaceResult(
        formatPlaceLabel(parsed, first.formatted_address),
        first.geometry?.location?.lat(),
        first.geometry?.location?.lng(),
        "geocode",
        parsed,
      ));
    });
  });
}

function getDirectionsDistance(origin: AppLocation, destination: AppLocation): Promise<DrivingRoute | null> {
  if (!window.google?.maps?.DirectionsService) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const directionsService = new google.maps.DirectionsService();
    directionsService.route(
      {
        origin: { lat: origin.lat, lng: origin.lng },
        destination: { lat: destination.lat, lng: destination.lng },
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        if (status !== "OK" || !result?.routes?.length) {
          logGoogleMapsError("Directions route request failed", {
            status,
            origin,
            destination,
          });
          resolve(null);
          return;
        }

        const route = result.routes[0];
        const distanceMeters = route.legs.reduce((sum, leg) => sum + (leg.distance?.value ?? 0), 0);
        const durationSeconds = route.legs.reduce((sum, leg) => sum + (leg.duration?.value ?? 0), 0);

        resolve({
          distanceKm: Math.round((distanceMeters / 1000) * 10) / 10,
          durationMinutes: Math.round(durationSeconds / 60),
          source: "directions",
        });
      },
    );
  });
}

function getDistanceMatrixDistance(origin: AppLocation, destination: AppLocation): Promise<DrivingRoute | null> {
  if (!window.google?.maps?.DistanceMatrixService) {
    logGoogleMapsError("Distance Matrix service unavailable");
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const service = new google.maps.DistanceMatrixService();
    service.getDistanceMatrix(
      {
        origins: [{ lat: origin.lat, lng: origin.lng }],
        destinations: [{ lat: destination.lat, lng: destination.lng }],
        travelMode: google.maps.TravelMode.DRIVING,
        unitSystem: google.maps.UnitSystem.METRIC,
      },
      (result, status) => {
        if (status !== "OK" || !result) {
          logGoogleMapsError("Distance Matrix request failed", {
            status,
            origin,
            destination,
          });
          resolve(null);
          return;
        }

        const element = result.rows[0]?.elements[0];
        if (element?.status !== "OK") {
          logGoogleMapsError("Distance Matrix element unavailable", {
            elementStatus: element?.status,
            origin,
            destination,
          });
          resolve(null);
          return;
        }

        resolve({
          distanceKm: Math.round((element.distance.value / 1000) * 10) / 10,
          durationMinutes: Math.round(element.duration.value / 60),
          source: "distance-matrix",
        });
      },
    );
  });
}

export async function calculateDrivingRoute(
  origin: AppLocation,
  destination: AppLocation,
): Promise<DrivingRoute | null> {
  const mapsReady = await waitForGoogleMapsReady();
  if (!mapsReady) {
    logGoogleMapsError("Location services unavailable. Route unavailable.");
    return null;
  }

  const distanceMatrixRoute = await getDistanceMatrixDistance(origin, destination);
  if (distanceMatrixRoute) {
    return distanceMatrixRoute;
  }

  const directionsRoute = await getDirectionsDistance(origin, destination);
  if (directionsRoute) {
    return directionsRoute;
  }

  logGoogleMapsError("Route unavailable", { origin, destination });
  return null;
}
