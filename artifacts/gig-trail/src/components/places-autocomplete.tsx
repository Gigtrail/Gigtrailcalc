import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { LocateFixed, MapPin } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  formatPlaceLabel,
  getGoogleMapsApiKey,
  getGoogleMapsLoadError,
  loadGoogleMaps,
  parseAddressComponents,
  reverseGeocodeLocation,
} from "@/lib/google-maps";
import { buildAppLocation, formatCoordinateLabel, type AppLocation } from "@/lib/location";

export type PlaceResult = AppLocation & {
  parsed?: import("@/lib/google-maps").ParsedAddress;
};

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
  const [mapsStatus, setMapsStatus] = useState<ScriptStatus>("idle");

  onChangeRef.current = onChange;

  const apiKey = getGoogleMapsApiKey();

  const initAutocomplete = useCallback(() => {
    if (!inputRef.current || autocompleteRef.current || !(window as typeof window & { google?: typeof google }).google?.maps?.places) {
      return;
    }

    const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
      fields: ["formatted_address", "name", "geometry", "address_components"],
    });

    autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      const label = place.formatted_address || place.name || "";
      const lat = place.geometry?.location?.lat();
      const lng = place.geometry?.location?.lng();
      const parsed = place.address_components
        ? parseAddressComponents(place.address_components)
        : undefined;
      const resolvedPlace = buildAppLocation(
        formatPlaceLabel(parsed, label),
        lat,
        lng,
        "autocomplete",
      );

      setLocationError(null);
      setLocationHint(null);
      onChangeRef.current(
        resolvedPlace?.label || label,
        resolvedPlace ? { ...resolvedPlace, parsed } : undefined,
      );
    });

    autocompleteRef.current = autocomplete;
  }, []);

  useEffect(() => {
    if (!apiKey) {
      setMapsStatus("error");
      setLocationHint(null);
      setLocationError(enableCurrentLocation ? "Location services unavailable" : null);
      return;
    }

    let cancelled = false;
    setMapsStatus("loading");

    void loadGoogleMaps(apiKey).then((loaded) => {
      if (cancelled) {
        return;
      }

      if (!loaded) {
        setMapsStatus("error");
        setLocationError("Location services unavailable");
        logPlacesError(getGoogleMapsLoadError() ?? "Google Maps failed to load");
        return;
      }

      setMapsStatus("loaded");
      setLocationError(null);
      initAutocomplete();
      logPlacesEvent("Google Maps Places library ready");
    });

    return () => {
      cancelled = true;
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
    setLocationHint(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;

        try {
          const geocodedPlace = await reverseGeocodeLocation(lat, lng);
          if (geocodedPlace) {
            setLocationHint("Using current location");
            onChangeRef.current(geocodedPlace.label, geocodedPlace);
          } else {
            const fallbackName = formatCoordinateLabel(lat, lng);
            const fallbackLocation = buildAppLocation(fallbackName, lat, lng, "geolocation");
            setLocationError("Location services unavailable");
            setLocationHint("Using current location");
            onChangeRef.current(fallbackName, fallbackLocation ?? undefined);
          }
        } catch (error) {
          const fallbackName = formatCoordinateLabel(lat, lng);
          const fallbackLocation = buildAppLocation(fallbackName, lat, lng, "geolocation");
          logPlacesError("Failed to resolve the user's current location", error);
          setLocationError("Location services unavailable");
          setLocationHint("Using current location");
          onChangeRef.current(fallbackName, fallbackLocation ?? undefined);
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

          {mapsStatus === "error" && (
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

      {!locationError && mapsStatus === "error" && (
        <p className="text-xs text-muted-foreground" role="status">
          Location services unavailable
        </p>
      )}
    </div>
  );
}
