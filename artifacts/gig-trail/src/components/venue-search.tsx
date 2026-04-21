import { useState, useRef, useEffect, useCallback } from "react";
import { MapPin, Search, X, Building2, PenLine, Clock, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { PlacesAutocomplete } from "@/components/places-autocomplete";
import { useSearchVenues } from "@workspace/api-client-react";
import { getGoogleMapsApiKey, getGoogleMapsLoadError, loadGoogleMaps, parseAddressComponents } from "@/lib/google-maps";
import { buildAppLocation, type AppLocation } from "@/lib/location";

export interface VenueSelection {
  venueName: string;
  destination: string;
  suburb?: string;
  state?: string;
  country?: string;
  location?: AppLocation;
  /** Set when the venue was selected from the user's own venue database */
  venueId?: number;
}

interface PastVenue {
  id: number;
  venueName: string;
  city?: string | null;
  state?: string | null;
  country?: string | null;
}

interface GooglePrediction {
  placeId: string;
  mainText: string;
  secondaryText: string;
}

interface VenueSearchProps {
  venueName?: string;
  destination?: string;
  onSelect: (venue: VenueSelection) => void;
  apiKey?: string;
}

const RECENT_VENUES_KEY = "gigtrail_recent_venues";
const MAX_RECENT = 5;

function getRecentVenues(): VenueSelection[] {
  try {
    const raw = localStorage.getItem(RECENT_VENUES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as VenueSelection[];
  } catch {
    return [];
  }
}

function saveRecentVenue(venue: VenueSelection) {
  try {
    const existing = getRecentVenues().filter(
      (v) => v.venueName.toLowerCase() !== venue.venueName.toLowerCase()
    );
    const updated = [venue, ...existing].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_VENUES_KEY, JSON.stringify(updated));
  } catch {
    // ignore
  }
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export function VenueSearch({ venueName, destination, onSelect, apiKey }: VenueSearchProps) {
  const [mode, setMode] = useState<"search" | "manual">("search");
  const [query, setQuery] = useState("");
  const [isSelected, setIsSelected] = useState(!!(venueName || destination));
  const [googlePredictions, setGooglePredictions] = useState<GooglePrediction[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isLoadingPlace, setIsLoadingPlace] = useState(false);
  const [mapsUnavailable, setMapsUnavailable] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const acServiceRef = useRef<google.maps.places.AutocompleteService | null>(null);
  const placeServiceDivRef = useRef<HTMLDivElement | null>(null);

  const debouncedQuery = useDebounce(query, 280);
  const { data: pastVenues } = useSearchVenues(
    { q: debouncedQuery },
    { query: { enabled: debouncedQuery.length >= 2 } }
  );

  const selectedVenueName = venueName || "";
  const selectedDestination = destination || "";

  useEffect(() => {
    if (venueName) setIsSelected(true);
  }, [venueName]);

  const envApiKey = apiKey || getGoogleMapsApiKey() || undefined;

  const initGoogleServices = useCallback(() => {
    if (!window.google?.maps?.places) return;
    if (!acServiceRef.current) {
      acServiceRef.current = new window.google.maps.places.AutocompleteService();
    }
    if (!placeServiceDivRef.current) {
      placeServiceDivRef.current = document.createElement("div");
    }
  }, []);

  useEffect(() => {
    if (!envApiKey) {
      setMapsUnavailable(true);
      return;
    }

    let cancelled = false;

    void loadGoogleMaps(envApiKey).then((loaded) => {
      if (cancelled) {
        return;
      }

      setMapsUnavailable(!loaded);
      if (!loaded) {
        console.error("[VenueSearch] %s", getGoogleMapsLoadError() ?? "Location services unavailable");
        return;
      }

      initGoogleServices();
    });

    return () => {
      cancelled = true;
    };
  }, [envApiKey, initGoogleServices]);

  useEffect(() => {
    if (debouncedQuery.length < 3 || !acServiceRef.current) {
      setGooglePredictions([]);
      return;
    }
    acServiceRef.current.getPlacePredictions(
      { input: debouncedQuery },
      (predictions, status) => {
        if (status === "OK" && predictions) {
          setGooglePredictions(
            predictions.slice(0, 5).map((p) => ({
              placeId: p.place_id,
              mainText: p.structured_formatting.main_text,
              secondaryText: p.structured_formatting.secondary_text || "",
            }))
          );
        } else {
          setGooglePredictions([]);
        }
      }
    );
  }, [debouncedQuery]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function selectVenue(venue: VenueSelection) {
    saveRecentVenue(venue);
    onSelect(venue);
    setIsSelected(true);
    setShowDropdown(false);
    setQuery("");
  }

  function selectGooglePrediction(prediction: GooglePrediction) {
    if (!window.google?.maps?.places || !placeServiceDivRef.current) return;
    setIsLoadingPlace(true);
    const svc = new window.google.maps.places.PlacesService(placeServiceDivRef.current);
    svc.getDetails(
      {
        placeId: prediction.placeId,
        fields: ["name", "formatted_address", "geometry", "address_components"],
      },
      (place, status) => {
        setIsLoadingPlace(false);
        if (status !== "OK" || !place) return;

        const parsed = place.address_components
          ? parseAddressComponents(place.address_components)
          : undefined;
        const destinationLabel = place.formatted_address || prediction.secondaryText;
        const location = buildAppLocation(
          destinationLabel,
          place.geometry?.location?.lat(),
          place.geometry?.location?.lng(),
          "autocomplete",
        );

        selectVenue({
          venueName: place.name || prediction.mainText,
          destination: destinationLabel,
          suburb: parsed?.suburb,
          state: parsed?.state,
          country: parsed?.country,
          location: location ?? undefined,
        });
      }
    );
  }

  function selectPastVenue(v: PastVenue) {
    selectVenue({
      venueName: v.venueName,
      destination: [v.city, v.state, v.country].filter(Boolean).join(", "),
      suburb: v.city ?? undefined,
      state: v.state ?? undefined,
      country: v.country ?? undefined,
      venueId: v.id,
    });
  }

  function clearSelection() {
    setIsSelected(false);
    setQuery("");
    setGooglePredictions([]);
    onSelect({ venueName: "", destination: "" });
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  const recentVenues = getRecentVenues();
  const filteredRecent = query.length < 2
    ? recentVenues
    : recentVenues.filter((v) => v.venueName.toLowerCase().includes(query.toLowerCase()));

  const filteredPast = (debouncedQuery.length >= 2 && pastVenues) ? pastVenues.slice(0, 4) : [];

  const hasDropdownContent =
    filteredRecent.length > 0 || filteredPast.length > 0 || googlePredictions.length > 0;

  if (mode === "manual") {
    return (
      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-sm font-medium leading-none">Venue Name</label>
          <Input
            value={selectedVenueName}
            onChange={(e) => onSelect({ venueName: e.target.value, destination: selectedDestination })}
            placeholder="e.g. The Bottleneck"
            autoComplete="off"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium leading-none">Destination / Address</label>
          {envApiKey ? (
            <PlacesAutocomplete
              value={selectedDestination}
              onChange={(text, place) => {
                onSelect({
                  venueName: selectedVenueName,
                  destination: text,
                  location: place,
                });
              }}
              placeholder="City or address"
            />
          ) : (
            <Input
              value={selectedDestination}
              onChange={(e) => onSelect({ venueName: selectedVenueName, destination: e.target.value })}
              placeholder="City or address"
            />
          )}
        </div>
        <button
          type="button"
          onClick={() => setMode("search")}
          className="text-xs text-primary underline underline-offset-2"
        >
          ← Back to venue search
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {isSelected && selectedVenueName ? (
        <div className="flex items-start justify-between gap-2 rounded-md border border-border/70 bg-muted/30 px-3 py-2.5 min-h-[48px]">
          <div className="flex items-start gap-2.5 min-w-0">
            <Building2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight truncate">{selectedVenueName}</p>
              {selectedDestination && (
                <p className="text-xs text-muted-foreground leading-tight mt-0.5 line-clamp-1">
                  {selectedDestination}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={clearSelection}
            className="flex-shrink-0 p-0.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors mt-0.5"
            aria-label="Clear venue"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <div className="relative" ref={dropdownRef}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50 pointer-events-none z-10" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowDropdown(true);
              }}
              onFocus={() => setShowDropdown(true)}
              placeholder="Search for venue or city…"
              className="pl-8"
              autoComplete="off"
              disabled={isLoadingPlace}
            />
            {isLoadingPlace && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            )}
          </div>

          {showDropdown && hasDropdownContent && (
            <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg overflow-hidden max-h-64 overflow-y-auto">
              {filteredRecent.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide border-b border-border/50">
                    Recent
                  </div>
                  {filteredRecent.map((v, i) => (
                    <button
                      key={i}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2.5 transition-colors"
                      onMouseDown={() => selectVenue(v)}
                    >
                      <Clock className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                      <span className="font-medium truncate">{v.venueName}</span>
                      {v.destination && (
                        <span className="text-muted-foreground text-xs ml-auto flex-shrink-0 truncate max-w-[40%]">
                          {v.destination}
                        </span>
                      )}
                    </button>
                  ))}
                </>
              )}

              {filteredPast.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide border-b border-border/50">
                    Past Venues
                  </div>
                  {filteredPast.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center gap-2.5 transition-colors"
                      onMouseDown={() => selectPastVenue(v)}
                    >
                      <Building2 className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                      <span className="font-medium truncate">{v.venueName}</span>
                      {v.city && (
                        <span className="text-muted-foreground text-xs ml-auto flex-shrink-0">
                          {v.city}
                        </span>
                      )}
                    </button>
                  ))}
                </>
              )}

              {googlePredictions.length > 0 && (
                <>
                  <div className="px-3 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide border-b border-border/50">
                    Places
                  </div>
                  {googlePredictions.map((p) => (
                    <button
                      key={p.placeId}
                      type="button"
                      className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-start gap-2.5 transition-colors"
                      onMouseDown={() => selectGooglePrediction(p)}
                    >
                      <MapPin className="w-3 h-3 text-muted-foreground flex-shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="font-medium leading-tight truncate">{p.mainText}</p>
                        {p.secondaryText && (
                          <p className="text-xs text-muted-foreground leading-tight truncate">
                            {p.secondaryText}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="w-3 h-3 text-muted-foreground flex-shrink-0 ml-auto mt-0.5" />
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={() => setMode("manual")}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <PenLine className="w-3 h-3" />
        Can't find venue? Enter manually
      </button>

      {mapsUnavailable && (
        <p className="text-xs text-muted-foreground">Location services unavailable</p>
      )}
    </div>
  );
}
