import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { LocateFixed, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";

export interface ParsedAddress {
  suburb?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
}

export interface PlaceResult {
  name: string;
  lat?: number;
  lng?: number;
  parsed?: ParsedAddress;
}

interface PlacesAutocompleteProps {
  value: string;
  onChange: (value: string, place?: PlaceResult) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  onKeyDown?: (e: KeyboardEvent<HTMLInputElement>) => void;
  enableCurrentLocation?: boolean;
}

type ScriptStatus = "idle" | "loading" | "loaded" | "error";

let scriptStatus: ScriptStatus = "idle";
let loadedApiKey: string | null = null;
const readyCallbacks: Array<() => void> = [];

function logPlacesEvent(message: string, extra?: unknown) {
  if (extra !== undefined) {
    console.info(`[PlacesAutocomplete] ${message}`, extra);
    return;
  }
  console.info(`[PlacesAutocomplete] ${message}`);
}

function logPlacesError(message: string, error?: unknown) {
  if (error !== undefined) {
    console.error(`[PlacesAutocomplete] ${message}`, error);
    return;
  }
  console.error(`[PlacesAutocomplete] ${message}`);
}

export function loadGoogleMaps(apiKey: string): void {
  if (scriptStatus === "loaded" && loadedApiKey === apiKey) {
    readyCallbacks.splice(0).forEach((callback) => callback());
    return;
  }

  if (loadedApiKey && loadedApiKey !== apiKey) {
    document.querySelector(`script[src*="maps.googleapis.com"]`)?.remove();
    scriptStatus = "idle";
    loadedApiKey = null;
  }

  if (scriptStatus === "loading") return;

  scriptStatus = "loading";
  loadedApiKey = apiKey;

  const script = document.createElement("script");
  script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&loading=async&callback=__gmapsReady`;
  script.async = true;
  script.defer = true;

  (window as typeof window & { __gmapsReady?: () => void }).__gmapsReady = () => {
    scriptStatus = "loaded";
    readyCallbacks.splice(0).forEach((callback) => callback());
    logPlacesEvent("Google Maps Places library loaded");
  };

  script.onerror = (event) => {
    scriptStatus = "error";
    logPlacesError("Google Maps script failed to load", event);
  };

  document.head.appendChild(script);
}

export function onGoogleMapsReady(callback: () => void) {
  if (scriptStatus === "loaded") {
    callback();
    return;
  }
  readyCallbacks.push(callback);
}

export function waitForGoogleMapsReady(apiKey?: string, timeoutMs = 4_000): Promise<boolean> {
  if ((window as typeof window & { google?: typeof google }).google?.maps) {
    return Promise.resolve(true);
  }

  if (!apiKey) {
    return Promise.resolve(false);
  }

  loadGoogleMaps(apiKey);

  return new Promise((resolve) => {
    let resolved = false;
    const finish = (value: boolean) => {
      if (resolved) return;
      resolved = true;
      resolve(value);
    };

    const timer = window.setTimeout(() => finish(false), timeoutMs);
    onGoogleMapsReady(() => {
      window.clearTimeout(timer);
      finish(true);
    });
  });
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

export function reverseGeocodeLocation(lat: number, lng: number): Promise<PlaceResult | null> {
  return new Promise((resolve) => {
    if (!(window as typeof window & { google?: typeof google }).google?.maps?.Geocoder) {
      resolve(null);
      return;
    }

    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ location: { lat, lng } }, (results, status) => {
      if (status !== "OK" || !results?.length) {
        logPlacesError("Reverse geocoding failed", { lat, lng, status });
        resolve(null);
        return;
      }

      const first = results[0];
      const parsed = first.address_components
        ? parseAddressComponents(first.address_components)
        : undefined;
      resolve({
        name: formatPlaceLabel(parsed, first.formatted_address),
        lat,
        lng,
        parsed,
      });
    });
  });
}

export function geocodeAddress(address: string): Promise<PlaceResult | null> {
  return new Promise((resolve) => {
    const query = address.trim();
    if (!query || !(window as typeof window & { google?: typeof google }).google?.maps?.Geocoder) {
      resolve(null);
      return;
    }

    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address: query }, (results, status) => {
      if (status !== "OK" || !results?.length) {
        logPlacesError("Address geocoding failed", { address: query, status });
        resolve(null);
        return;
      }

      const first = results[0];
      const parsed = first.address_components
        ? parseAddressComponents(first.address_components)
        : undefined;

      resolve({
        name: formatPlaceLabel(parsed, first.formatted_address),
        lat: first.geometry?.location?.lat(),
        lng: first.geometry?.location?.lng(),
        parsed,
      });
    });
  });
}

export function PlacesAutocomplete({
  value,
  onChange,
  placeholder,
  className,
  id,
  onKeyDown,
  enableCurrentLocation = false,
}: PlacesAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const onChangeRef = useRef(onChange);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [locationHint, setLocationHint] = useState<string | null>(null);

  onChangeRef.current = onChange;

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

  const initAutocomplete = useCallback(() => {
    if (!inputRef.current || autocompleteRef.current || !(window as typeof window & { google?: typeof google }).google?.maps?.places) {
      return;
    }

    const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
      fields: ["formatted_address", "name", "geometry", "address_components"],
    });

    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      const name = place.formatted_address || place.name || "";
      const lat = place.geometry?.location?.lat();
      const lng = place.geometry?.location?.lng();
      const parsed = place.address_components
        ? parseAddressComponents(place.address_components)
        : undefined;

      setLocationError(null);
      setLocationHint(null);
      onChangeRef.current(name, { name, lat, lng, parsed });
    });

    autocompleteRef.current = autocomplete;
  }, []);

  useEffect(() => {
    if (!apiKey) {
      logPlacesEvent("No Google Maps API key found - falling back to manual entry");
      return;
    }

    loadGoogleMaps(apiKey);
    onGoogleMapsReady(initAutocomplete);

    return () => {
      if (autocompleteRef.current) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current);
        autocompleteRef.current = null;
      }
    };
  }, [apiKey, initAutocomplete]);

  const handleManualChange = useCallback((nextValue: string) => {
    setLocationError(null);
    setLocationHint(null);
    onChange(nextValue);
  }, [onChange]);

  const handleUseCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      const message = "Current location is not available on this device.";
      setLocationError(message);
      logPlacesError(message);
      return;
    }

    setIsLocating(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        try {
          await waitForGoogleMapsReady(apiKey);
          const geocodedPlace = await reverseGeocodeLocation(lat, lng);
          if (geocodedPlace) {
            setLocationHint("Using current location");
            onChangeRef.current(geocodedPlace.name, geocodedPlace);
          } else {
            const fallbackName = `Lat ${lat.toFixed(5)}, Lng ${lng.toFixed(5)}`;
            setLocationHint("Using current location");
            onChangeRef.current(fallbackName, { name: fallbackName, lat, lng });
          }
        } catch (error) {
          const fallbackName = `Lat ${lat.toFixed(5)}, Lng ${lng.toFixed(5)}`;
          logPlacesError("Failed to resolve the user's current location", error);
          setLocationHint("Using current location");
          onChangeRef.current(fallbackName, { name: fallbackName, lat, lng });
        } finally {
          setIsLocating(false);
        }
      },
      (error) => {
        setIsLocating(false);
        const message =
          error.code === error.PERMISSION_DENIED
            ? "Location access was denied. You can still type your home base manually."
            : "We couldn't fetch your current location. Try typing it instead.";
        setLocationError(message);
        logPlacesError("Geolocation request failed", error);
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 60_000 },
    );
  }, [apiKey]);

  const input = (
    <Input
      id={id}
      ref={inputRef}
      value={value}
      onChange={(event) => handleManualChange(event.target.value)}
      placeholder={placeholder}
      className={`pl-8 ${className || ""}`.trim()}
      onKeyDown={onKeyDown}
      autoComplete="off"
    />
  );

  return (
    <div className="space-y-2">
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 z-10 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/40" />
        {input}
      </div>

      {enableCurrentLocation && (
        <div className="flex items-center justify-between gap-3 text-xs">
          <button
            type="button"
            onClick={handleUseCurrentLocation}
            disabled={isLocating}
            className="inline-flex items-center gap-1.5 font-medium text-primary transition-colors hover:text-primary/80 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <LocateFixed className="h-3.5 w-3.5" />
            {isLocating ? "Finding your current location..." : "Use my current location"}
          </button>

          {!apiKey && (
            <span className="text-muted-foreground">Manual entry only</span>
          )}
        </div>
      )}

      {locationError && (
        <p className="text-xs text-muted-foreground" role="status">
          {locationError}
        </p>
      )}

      {!locationError && locationHint && (
        <p className="text-xs text-muted-foreground" role="status">
          {locationHint}
        </p>
      )}
    </div>
  );
}
