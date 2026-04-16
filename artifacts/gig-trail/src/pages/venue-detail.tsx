import { useParams, useLocation } from "wouter";
import {
  useGetVenue,
  usePatchVenue,
  getGetVenueQueryKey,
  getGetVenuesQueryKey,
} from "@workspace/api-client-react";
import type { VenueShow, PatchVenueBody } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft, MapPin, Mic2, TrendingUp, Calendar, Globe, Phone, Mail,
  Star, StarOff, Edit2, Check, X, ExternalLink, Music,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
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

function ShowRow({ show }: { show: VenueShow }) {
  const profit = show.actualProfit ?? show.totalProfit;
  const income = show.totalIncome;
  const fee = show.actualProfit != null ? (show.actualProfit + (show.fee ?? show.guarantee ?? 0)) : (show.fee ?? show.guarantee);

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

// ─── Edit field helper ────────────────────────────────────────────────────────

function EditableField({
  label, value, onSave, multiline = false, placeholder,
}: {
  label: string;
  value?: string | null;
  onSave: (v: string | null) => void;
  multiline?: boolean;
  placeholder?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");

  const save = () => {
    onSave(draft.trim() || null);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</Label>
        {multiline ? (
          <Textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            className="text-sm min-h-[80px]"
            placeholder={placeholder}
            autoFocus
          />
        ) : (
          <Input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            className="text-sm h-8"
            placeholder={placeholder}
            autoFocus
            onKeyDown={e => { if (e.key === "Enter") save(); if (e.key === "Escape") setEditing(false); }}
          />
        )}
        <div className="flex gap-1.5">
          <Button size="sm" variant="secondary" className="h-6 text-xs px-2" onClick={save}>
            <Check className="w-3 h-3 mr-1" /> Save
          </Button>
          <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => { setDraft(value ?? ""); setEditing(false); }}>
            <X className="w-3 h-3" />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="group/field space-y-1">
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</Label>
      <div className="flex items-start gap-2">
        <p className={cn("text-sm flex-1", !value && "text-muted-foreground/50 italic")}>{value || "—"}</p>
        <button
          onClick={() => { setDraft(value ?? ""); setEditing(true); }}
          className="opacity-0 group-hover/field:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted text-muted-foreground"
        >
          <Edit2 className="w-3 h-3" />
        </button>
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
      },
      onError: () => toast({ title: "Failed to save", variant: "destructive" }),
    },
  });

  const save = (data: PatchVenueBody) => patchVenue.mutate({ id: venueId, data });

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

  const { stats, shows } = venue;
  const timesPlayed = stats?.timesPlayed ?? 0;
  const wouldPlayPct = stats?.wouldPlayAgainRatio != null
    ? Math.round(stats.wouldPlayAgainRatio * 100)
    : null;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">

      {/* Back + header */}
      <div>
        <Button variant="ghost" size="sm" className="mb-3 -ml-1 text-muted-foreground" onClick={() => setLocation("/runs")}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Past Shows
        </Button>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">{venue.venueName}</h1>
            {(venue.city || venue.state || venue.country) && (
              <p className="text-muted-foreground mt-1 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                {[venue.suburb, venue.city, venue.state, venue.country].filter(Boolean).join(", ")}
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

      {/* Stats cards */}
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

      <div className="grid md:grid-cols-3 gap-5">

        {/* Venue details (editable) */}
        <Card className="md:col-span-1 bg-card/50 border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Venue Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <EditableField
              label="Full address"
              value={venue.fullAddress}
              placeholder="123 Gig Street, Melbourne VIC 3000"
              onSave={v => save({ fullAddress: v })}
            />
            <EditableField
              label="Suburb / city"
              value={venue.suburb || venue.city}
              placeholder="Fitzroy"
              onSave={v => save({ suburb: v })}
            />
            <EditableField
              label="Capacity"
              value={venue.capacity != null ? String(venue.capacity) : null}
              placeholder="200"
              onSave={v => save({ capacity: v ? parseInt(v) || null : null })}
            />
            <EditableField
              label="Website"
              value={venue.website}
              placeholder="https://thevenue.com.au"
              onSave={v => save({ website: v })}
            />
            {venue.website && (
              <a
                href={venue.website}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <Globe className="w-3 h-3" /> Visit website <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
            <EditableField
              label="Contact email"
              value={venue.contactEmail}
              placeholder="booking@thevenue.com"
              onSave={v => save({ contactEmail: v })}
            />
            <EditableField
              label="Contact phone"
              value={venue.contactPhone}
              placeholder="04xx xxx xxx"
              onSave={v => save({ contactPhone: v })}
            />
            <EditableField
              label="Notes (room, sound, parking…)"
              value={venue.roomNotes}
              placeholder="Great sound, limited parking. Load in from rear lane."
              multiline
              onSave={v => save({ roomNotes: v })}
            />
          </CardContent>
        </Card>

        {/* Show history */}
        <Card className="md:col-span-2 bg-card/50 border-border/50 overflow-hidden">
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
    </div>
  );
}
