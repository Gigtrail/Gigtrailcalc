import { useEffect, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { MapPin } from "lucide-react";

export interface PlaceResult {
  name: string;
  lat?: number;
  lng?: number;
}

interface PlacesAutocompleteProps {
  value: string;
  onChange: (value: string, place?: PlaceResult) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

// Singleton script loader — tracks which key was loaded so key changes force a reload
type ScriptStatus = "idle" | "loading" | "loaded" | "error";
let scriptStatus: ScriptStatus = "idle";
let loadedApiKey: string | null = null;
const readyCallbacks: Array<() => void> = [];

export function loadGoogleMaps(apiKey: string): void {
  // Already loaded with the same key — fire callbacks immediately
  if (scriptStatus === "loaded" && loadedApiKey === apiKey) {
    readyCallbacks.forEach(cb => cb());
    readyCallbacks.length = 0;
    return;
  }
  // Key changed — remove old script and reset
  if (loadedApiKey && loadedApiKey !== apiKey) {
    const old = document.querySelector(`script[src*="maps.googleapis.com"]`);
    if (old) old.remove();
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
  (window as any).__gmapsReady = () => {
    scriptStatus = "loaded";
    readyCallbacks.forEach(cb => cb());
    readyCallbacks.length = 0;
  };
  script.onerror = () => {
    scriptStatus = "error";
  };
  document.head.appendChild(script);
}

export function onGoogleMapsReady(cb: () => void) {
  if (scriptStatus === "loaded") {
    cb();
  } else {
    readyCallbacks.push(cb);
  }
}

export function PlacesAutocomplete({
  value,
  onChange,
  placeholder,
  className,
  id,
  onKeyDown,
}: PlacesAutocompleteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

  const initAutocomplete = useCallback(() => {
    if (!inputRef.current || autocompleteRef.current) return;

    const ac = new google.maps.places.Autocomplete(inputRef.current, {
      fields: ["formatted_address", "name", "geometry"],
    });

    ac.addListener("place_changed", () => {
      const place = ac.getPlace();
      const name = place.formatted_address || place.name || "";
      const lat = place.geometry?.location?.lat();
      const lng = place.geometry?.location?.lng();
      onChangeRef.current(name, { name, lat, lng });
    });

    autocompleteRef.current = ac;
  }, []);

  useEffect(() => {
    if (!apiKey) return;
    loadGoogleMaps(apiKey);
    onGoogleMapsReady(initAutocomplete);
    return () => {
      if (autocompleteRef.current) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current);
        autocompleteRef.current = null;
      }
    };
  }, [apiKey, initAutocomplete]);

  if (!apiKey) {
    return (
      <Input
        id={id}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={className}
        onKeyDown={onKeyDown}
      />
    );
  }

  return (
    <div className="relative">
      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40 pointer-events-none z-10" />
      <Input
        id={id}
        ref={inputRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className={`pl-8 ${className || ""}`}
        onKeyDown={onKeyDown}
        autoComplete="off"
      />
    </div>
  );
}
