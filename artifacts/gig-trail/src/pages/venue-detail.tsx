import { useParams, useLocation } from "wouter";
import {
  useGetVenue,
  usePatchVenue,
  getGetVenueQueryKey,
  getGetVenuesQueryKey,
} from "@workspace/api-client-react";
import type { VenueShow, VenueStop } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlacesAutocomplete } from "@/components/places-autocomplete";
import type { PlaceResult } from "@/components/places-autocomplete";
import {
  ArrowLeft, MapPin, Mic2, TrendingUp, Calendar, Globe,
  Star, StarOff, ExternalLink, Music, Save, RotateCcw,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  try { return format(parseISO(d + "T00:00:00"), "d MMM yyyy"); } catch { return d; }
}

function WouldDoAgainBadge({ value }: { value?: string | null }) {
  if (!value || value === "unsure") return <span className="text-muted-foreground/50 text-xs">—</span>;
  if (value === "yes") return (
    <span className="inline-flex items-center gap-1 text-xs text-[#2E7D32] font-medium">
      <Star className="w-3 h-3 fill-current" /> Yes
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs text-destructive font-medium">
      <StarOff className="w-3 h-3" /> No
    </span>
  );
}

function bookingStatusBadge(status: string | null | undefined) {
  if (status === "pending") return <Badge variant="outline" className="text-[10px] py-0 border-yellow-400/60 text-yellow-700 dark:text-yellow-400">Pending</Badge>;
  if (status === "hold") return <Badge variant="outline" className="text-[10px] py-0 border-blue-400/60 text-blue-700 dark:text-blue-400">On Hold</Badge>;
  return <Badge variant="outline" className="text-[10px] py-0 border-[#2E7D32]/60 text-[#2E7D32]">Confirmed</Badge>;
}

function ShowRow({ show }: { show: VenueShow }) {
  const profit = show.actualProfit ?? show.totalProfit;
  const income = show.totalIncome;
  return (
    <tr className="group border-t border-border/30 hover:bg-primary/3 transition-colors">
      <td className="py-3 pl-4 pr-2 text-sm text-muted-foreground whitespace-nowrap w-28">
        {fmtDate(show.showDate)}
      </td>
      <td className="py-3 px-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{show.venueName ?? "—"}</span>
          {show.importedFromTour && show.tourName && (
            <Badge variant="outline" className="text-[10px] py-0 font-normal border-primary/30 text-primary/70">
              Tour: {show.tourName}
            </Badge>
          )}
        </div>
        {show.notes && (
          <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{show.notes}</p>
        )}
      </td>
      <td className="py-3 px-2 text-sm tabular-nums whitespace-nowrap text-muted-foreground">
        {income != null ? fmt(income) : "—"}
      </td>
      <td className="py-3 px-2 text-sm tabular-nums whitespace-nowrap">
        {profit != null ? (
          <span className={profit >= 0 ? "text-[#2E7D32] font-semibold" : "text-destructive font-semibold"}>
            {profit < 0 ? "-" : ""}{fmt(Math.abs(profit))}
          </span>
        ) : "—"}
      </td>
      <td className="py-3 px-2">
        <WouldDoAgainBadge value={show.wouldDoAgain} />
      </td>
      <td className="py-3 pl-2 pr-4 text-xs text-muted-foreground whitespace-nowrap">
        {show.actualAttendance != null ? `${show.actualAttendance} pax` : "—"}
      </td>
    </tr>
  );
}

function VenueStopRow({ stop }: { stop: VenueStop }) {
  const income = stop.fee ?? stop.guarantee;
  return (
    <tr className="group border-t border-border/30 hover:bg-primary/3 transition-colors">
      <td className="py-2.5 pl-4 pr-2 text-sm text-muted-foreground whitespace-nowrap w-28">
        {fmtDate(stop.date)}
      </td>
      <td className="py-2.5 px-2">
        <div className="flex items-center gap-2 flex-wrap">
          {bookingStatusBadge(stop.bookingStatus)}
          {stop.tourName && (
            <span className="text-xs text-muted-foreground/70">via <span className="font-medium text-foreground/70">{stop.tourName}</span></span>
          )}
        </div>
        {stop.notes && <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">{stop.notes}</p>}
      </td>
      <td className="py-2.5 px-2 text-sm tabular-nums whitespace-nowrap text-muted-foreground">
        {income != null ? fmt(income) : "—"}
      </td>
      <td className="py-2.5 px-2 text-xs text-muted-foreground">{stop.showType ?? "—"}</td>
    </tr>
  );
}

// ─── Venue Details Form ────────────────────────────────────────────────────────

interface DraftForm {
  fullAddress: string;
  suburb: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  capacity: string;
  website: string;
  contactEmail: string;
  contactPhone: string;
  roomNotes: string;
}

function makeDraft(venue: {
  fullAddress?: string | null;
  suburb?: string | null;
  city?: string | null;
  state?: string | null;
  postcode?: string | null;
  country?: string | null;
  capacity?: number | null;
  website?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  roomNotes?: string | null;
}): DraftForm {
  return {
    fullAddress:  venue.fullAddress  ?? "",
    suburb:       venue.suburb       ?? "",
    city:         venue.city         ?? "",
    state:        venue.state        ?? "",
    postcode:     venue.postcode     ?? "",
    country:      venue.country      ?? "",
    capacity:     venue.capacity != null ? String(venue.capacity) : "",
    website:      venue.website      ?? "",
    contactEmail: venue.contactEmail ?? "",
    contactPhone: venue.contactPhone ?? "",
    roomNotes:    venue.roomNotes    ?? "",
  };
}

function VenueDetailsForm({
  venue,
  onSave,
  isSaving,
}: {
  venue: ReturnType<typeof makeDraft> & { venueName: string };
  onSave: (data: Partial<{
    fullAddress: string | null; suburb: string | null; city: string | null;
    state: string | null; postcode: string | null; country: string | null;
    capacity: number | null; website: string | null; contactEmail: string | null;
    contactPhone: string | null; roomNotes: string | null;
  }>) => void;
  isSaving: boolean;
}) {
  const [draft, setDraft] = useState<DraftForm>(() => makeDraft(venue));
  const [dirty, setDirty] = useState(false);

  // Reset when venue data changes from server
  useEffect(() => {
    setDraft(makeDraft(venue));
    setDirty(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venue.fullAddress, venue.suburb, venue.city, venue.state, venue.postcode, venue.country,
      venue.capacity, venue.website, venue.contactEmail, venue.contactPhone, venue.roomNotes]);

  const set = (field: keyof DraftForm, value: string) => {
    setDraft(d => ({ ...d, [field]: value }));
    setDirty(true);
  };

  const handleAddressSelect = (_text: string, place?: PlaceResult) => {
    if (!place) return;
    const p = place.parsed ?? {};
    setDraft(d => ({
      ...d,
      fullAddress: place.name,
      suburb:      p.suburb   ?? d.suburb,
      city:        p.city     ?? d.city,
      state:       p.state    ?? d.state,
      postcode:    p.postcode ?? d.postcode,
      country:     p.country  ?? d.country,
    }));
    setDirty(true);
  };

  const handleSave = () => {
    onSave({
      fullAddress:  draft.fullAddress  || null,
      suburb:       draft.suburb       || null,
      city:         draft.city         || null,
      state:        draft.state        || null,
      postcode:     draft.postcode     || null,
      country:      draft.country      || null,
      capacity:     draft.capacity ? (parseInt(draft.capacity) || null) : null,
      website:      draft.website      || null,
      contactEmail: draft.contactEmail || null,
      contactPhone: draft.contactPhone || null,
      roomNotes:    draft.roomNotes    || null,
    });
    setDirty(false);
  };

  const handleReset = () => {
    setDraft(makeDraft(venue));
    setDirty(false);
  };

  const field = (label: string, key: keyof DraftForm, placeholder?: string) => (
    <div className="space-y-1">
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</Label>
      <Input
        value={draft[key]}
        onChange={e => set(key, e.target.value)}
        placeholder={placeholder ?? ""}
        className="text-sm h-8"
      />
    </div>
  );

  return (
    <div className="space-y-5">

      {/* Address section */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/40 pb-1.5">Address</p>

        <div className="space-y-1">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Full address</Label>
          <PlacesAutocomplete
            value={draft.fullAddress}
            onChange={(text, place) => {
              set("fullAddress", text);
              if (place?.parsed) handleAddressSelect(text, place);
            }}
            placeholder="123 Gig Street, Melbourne VIC 3000"
            className="text-sm h-8"
          />
          <p className="text-[10px] text-muted-foreground/60 mt-0.5">
            Select from suggestions to auto-fill suburb, city, state and postcode below.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {field("Suburb", "suburb", "Fitzroy")}
          {field("City", "city", "Melbourne")}
        </div>
        <div className="grid grid-cols-3 gap-2">
          {field("State", "state", "VIC")}
          {field("Postcode", "postcode", "3065")}
          {field("Country", "country", "Australia")}
        </div>
      </div>

      {/* Venue details section */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/40 pb-1.5">Venue Details</p>
        {field("Capacity", "capacity", "200")}
        {field("Website", "website", "https://thevenue.com.au")}
        {draft.website && (
          <a
            href={draft.website.startsWith("http") ? draft.website : `https://${draft.website}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <Globe className="w-3 h-3" /> Visit website <ExternalLink className="w-2.5 h-2.5" />
          </a>
        )}
        {field("Contact email", "contactEmail", "booking@thevenue.com")}
        {field("Contact phone", "contactPhone", "04xx xxx xxx")}
      </div>

      {/* Notes section */}
      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/40 pb-1.5">Notes</p>
        <div className="space-y-1">
          <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Room, sound, parking…</Label>
          <Textarea
            value={draft.roomNotes}
            onChange={e => set("roomNotes", e.target.value)}
            placeholder="Great sound, limited parking. Load in from rear lane."
            className="text-sm min-h-[80px] resize-none"
          />
        </div>
      </div>

      {/* Save / Cancel */}
      <div className="flex gap-2 pt-1 border-t border-border/30">
        <Button
          size="sm"
          variant="secondary"
          onClick={handleSave}
          disabled={!dirty || isSaving}
          className="flex-1"
        >
          <Save className="w-3.5 h-3.5 mr-1.5" />
          {isSaving ? "Saving…" : "Save changes"}
        </Button>
        {dirty && (
          <Button size="sm" variant="ghost" onClick={handleReset} disabled={isSaving}>
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function VenueDetail() {
  const { id } = useParams<{ id: string }>();
  const venueId = parseInt(id ?? "");
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: venue, isLoading } = useGetVenue(venueId, {
    query: { enabled: !isNaN(venueId) },
  });

  const patchVenue = usePatchVenue({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetVenueQueryKey(venueId) });
        queryClient.invalidateQueries({ queryKey: getGetVenuesQueryKey() });
        toast({ title: "Venue saved" });
      },
      onError: () => toast({ title: "Failed to save", variant: "destructive" }),
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (!venue) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/runs")}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <p className="text-muted-foreground">Venue not found.</p>
      </div>
    );
  }

  const { stats, shows, upcomingStops = [], pendingStops = [] } = venue;
  const timesPlayed = stats?.timesPlayed ?? 0;
  const wouldPlayPct = stats?.wouldPlayAgainRatio != null
    ? Math.round(stats.wouldPlayAgainRatio * 100)
    : null;

  // Build a clean location line: skip suburb if it looks like a street address
  // (starts with a digit — indicates old polluted data). Prefer blank over wrong.
  const safeSuburb = venue.suburb && !/^\d/.test(venue.suburb.trim()) ? venue.suburb : null;
  const locationLine = [safeSuburb, venue.city, venue.state, venue.country]
    .filter(Boolean).join(", ");

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div>
        <Button variant="ghost" size="sm" className="mb-3 -ml-1 text-muted-foreground" onClick={() => setLocation("/runs")}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Past Shows
        </Button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{venue.venueName}</h1>
            {(locationLine || venue.fullAddress) && (
              <p className="text-muted-foreground mt-1 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                {locationLine || venue.fullAddress}
              </p>
            )}
          </div>
          {timesPlayed > 0 && (
            <Badge variant="outline" className="text-sm px-3 py-1 shrink-0">
              <Mic2 className="w-3.5 h-3.5 mr-1.5" />
              {timesPlayed} {timesPlayed === 1 ? "show" : "shows"}
            </Badge>
          )}
        </div>
      </div>

      {/* ── Stats cards ─────────────────────────────────────────────────────── */}
      {timesPlayed > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1">Last played</p>
              <p className="text-lg font-bold">{fmtDate(stats?.lastPlayed)}</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1">Avg profit</p>
              <p className={cn("text-lg font-bold", (stats?.avgProfit ?? 0) >= 0 ? "text-[#2E7D32]" : "text-destructive")}>
                {stats?.avgProfit != null ? fmt(stats.avgProfit) : "—"}
              </p>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1">Avg fee</p>
              <p className="text-lg font-bold">{stats?.avgFee != null ? fmt(stats.avgFee) : "—"}</p>
            </CardContent>
          </Card>
          <Card className="bg-card/50 border-border/50">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-1">Would play again</p>
              <p className={cn("text-lg font-bold", wouldPlayPct != null && wouldPlayPct >= 50 ? "text-[#2E7D32]" : "text-muted-foreground")}>
                {wouldPlayPct != null ? `${wouldPlayPct}%` : "—"}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Main two-column grid: Activity + Details ─────────────────────────── */}
      <div className="grid md:grid-cols-12 gap-5 items-start">

        {/* Left column: Activity (upcoming + pending) + Show History */}
        <div className="md:col-span-7 space-y-4">

          {/* Upcoming confirmed */}
          {upcomingStops.length > 0 && (
            <Card className="border-[#2E7D32]/30 bg-[#2E7D32]/5">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold text-[#2E7D32] flex items-center gap-2">
                  <Calendar className="w-4 h-4" /> Upcoming Confirmed Dates ({upcomingStops.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/30 bg-muted/10">
                        <th className="py-1.5 pl-4 pr-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
                        <th className="py-1.5 px-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Tour / Status</th>
                        <th className="py-1.5 px-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Fee</th>
                        <th className="py-1.5 px-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {upcomingStops.map(stop => <VenueStopRow key={stop.id} stop={stop} />)}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Pending / On Hold */}
          {pendingStops.length > 0 && (
            <Card className="border-yellow-400/30 bg-yellow-50/30 dark:bg-yellow-900/5">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold text-yellow-700 dark:text-yellow-500 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" /> Pending / On Hold ({pendingStops.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/30 bg-muted/10">
                        <th className="py-1.5 pl-4 pr-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
                        <th className="py-1.5 px-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Tour / Status</th>
                        <th className="py-1.5 px-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Fee</th>
                        <th className="py-1.5 px-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingStops.map(stop => <VenueStopRow key={stop.id} stop={stop} />)}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Show History */}
          <Card className="bg-card/50 border-border/50 overflow-hidden">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Music className="w-4 h-4 text-primary/60" />
                Show History
                {timesPlayed > 0 && (
                  <span className="text-sm font-normal text-muted-foreground">({timesPlayed})</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {shows.length === 0 ? (
                <div className="px-6 pb-6 text-center">
                  <Calendar className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="text-sm text-muted-foreground">No shows recorded yet.</p>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">
                    Save tour stops to Past Shows to build history.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border/40 bg-muted/20">
                        <th className="py-2 pl-4 pr-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Date</th>
                        <th className="py-2 px-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Show</th>
                        <th className="py-2 px-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Income</th>
                        <th className="py-2 px-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Profit</th>
                        <th className="py-2 px-2 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Again?</th>
                        <th className="py-2 pl-2 pr-4 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Audience</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shows.map(show => <ShowRow key={show.id} show={show} />)}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: Venue Details form */}
        <div className="md:col-span-5">
          <Card className="bg-card/50 border-border/50 sticky top-4">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">Venue Details</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Fill in missing details and save all at once below.
              </p>
            </CardHeader>
            <CardContent>
              <VenueDetailsForm
                venue={{ ...makeDraft(venue), venueName: venue.venueName }}
                onSave={data => patchVenue.mutate({ id: venueId, data })}
                isSaving={patchVenue.isPending}
              />
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  );
}
