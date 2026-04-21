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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { PlacesAutocomplete } from "@/components/places-autocomplete";
import type { PlaceResult } from "@/components/places-autocomplete";
import {
  ArrowLeft,
  Bed,
  Calendar,
  Check,
  ChevronDown,
  Edit2,
  ExternalLink,
  FileText,
  Globe,
  Mail,
  MapPin,
  Mic2,
  Music,
  Phone,
  Plus,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Star,
  StarOff,
  Ticket,
  Utensils,
  X,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type VenueStatus = "great" | "risky" | "avoid" | "untested";
type WillPlayAgain = "yes" | "no" | "unsure";

const VENUE_STATUSES: { value: VenueStatus; label: string }[] = [
  { value: "great", label: "Great" },
  { value: "risky", label: "Risky" },
  { value: "avoid", label: "Avoid" },
  { value: "untested", label: "Untested" },
];

const WILL_PLAY_AGAIN: { value: WillPlayAgain; label: string }[] = [
  { value: "yes", label: "Yes" },
  { value: "unsure", label: "Unsure" },
  { value: "no", label: "No" },
];

const WEEKDAYS = [
  { value: "mon", label: "M", title: "Monday" },
  { value: "tue", label: "T", title: "Tuesday" },
  { value: "wed", label: "W", title: "Wednesday" },
  { value: "thu", label: "T", title: "Thursday" },
  { value: "fri", label: "F", title: "Friday" },
  { value: "sat", label: "S", title: "Saturday" },
  { value: "sun", label: "S", title: "Sunday" },
];

function fmtMoney(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "-";
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtSignedMoney(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "-";
  const prefix = n > 0 ? "+" : n < 0 ? "-" : "";
  return `${prefix}${fmtMoney(Math.abs(n))}`;
}

function fmtNumber(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "-";
  return Math.round(n).toLocaleString();
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "-";
  try {
    return format(parseISO(`${d}T00:00:00`), "d MMM yyyy");
  } catch {
    return d;
  }
}

function normalizeVenueStatus(value?: string | null): VenueStatus | null {
  return VENUE_STATUSES.some(status => status.value === value) ? value as VenueStatus : null;
}

function normalizeWillPlayAgain(value?: string | null): WillPlayAgain | null {
  return WILL_PLAY_AGAIN.some(option => option.value === value) ? value as WillPlayAgain : null;
}

function venueStatusLabel(value: VenueStatus): string {
  return VENUE_STATUSES.find(status => status.value === value)?.label ?? "Untested";
}

function willPlayAgainLabel(value: WillPlayAgain | null | undefined): string {
  return WILL_PLAY_AGAIN.find(option => option.value === value)?.label ?? "Unsure";
}

function deriveVenueStatus({
  storedStatus,
  storedWillPlayAgain,
  avgProfit,
  wouldPlayAgainRatio,
  shows,
}: {
  storedStatus?: string | null;
  storedWillPlayAgain?: string | null;
  avgProfit?: number | null;
  wouldPlayAgainRatio?: number | null;
  shows: VenueShow[];
}): VenueStatus {
  const explicit = normalizeVenueStatus(storedStatus);
  if (explicit) return explicit;
  if (shows.length === 0) return "untested";

  const willPlayAgain = normalizeWillPlayAgain(storedWillPlayAgain);
  if (willPlayAgain === "no") return "avoid";

  const profits = shows
    .map(show => show.actualProfit ?? show.totalProfit)
    .filter((profit): profit is number => profit != null);
  const lossCount = profits.filter(profit => profit < 0).length;

  if ((avgProfit ?? 0) > 0 && (willPlayAgain === "yes" || (wouldPlayAgainRatio ?? 0) >= 0.6)) {
    return "great";
  }
  if (profits.length >= 2 && lossCount >= 2 && (wouldPlayAgainRatio == null || wouldPlayAgainRatio <= 0.4)) {
    return "avoid";
  }
  return "risky";
}

function calcBreakEvenTickets(shows: VenueShow[]): number | null {
  const values = shows
    .map(show => {
      const profit = show.actualProfit ?? show.totalProfit;
      const income = show.totalIncome;
      const ticketPrice = show.ticketPrice;
      if (profit == null || income == null || ticketPrice == null || ticketPrice <= 0) return null;
      const cost = income - profit;
      if (cost <= 0) return null;
      return Math.ceil(cost / ticketPrice);
    })
    .filter((value): value is number => value != null);

  if (values.length === 0) return null;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function statusBadgeClass(status: VenueStatus): string {
  if (status === "great") return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700";
  if (status === "risky") return "border-amber-500/40 bg-amber-500/10 text-amber-700";
  if (status === "avoid") return "border-red-500/40 bg-red-500/10 text-red-700";
  return "border-slate-400/40 bg-slate-500/10 text-slate-700";
}

function VenueStatusBadge({ status }: { status: VenueStatus }) {
  return (
    <Badge variant="outline" className={cn("rounded-md px-2.5 py-1 text-xs font-semibold", statusBadgeClass(status))}>
      {venueStatusLabel(status)}
    </Badge>
  );
}

function bookingStatusBadge(status: string | null | undefined) {
  if (status === "pending") {
    return <Badge variant="outline" className="border-amber-400/60 bg-amber-500/10 text-amber-700">Pending</Badge>;
  }
  if (status === "hold") {
    return <Badge variant="outline" className="border-sky-400/60 bg-sky-500/10 text-sky-700">On Hold</Badge>;
  }
  return <Badge variant="outline" className="border-emerald-500/50 bg-emerald-500/10 text-emerald-700">Confirmed</Badge>;
}

function showStatusBadge(status: string | null | undefined) {
  if (status === "past") return <Badge variant="secondary">Past</Badge>;
  if (status === "planned") return <Badge variant="outline">Planned</Badge>;
  return <Badge variant="outline">{status ?? "Draft"}</Badge>;
}

function WouldDoAgainBadge({ value }: { value?: string | null }) {
  const normalized = normalizeWillPlayAgain(value);
  if (!normalized || normalized === "unsure") {
    return <span className="text-xs font-medium text-muted-foreground">Unsure</span>;
  }
  if (normalized === "yes") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
        <Star className="h-3.5 w-3.5 fill-current" /> Yes
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
      <StarOff className="h-3.5 w-3.5" /> No
    </span>
  );
}

function SnapshotCard({
  label,
  value,
  helper,
  tone,
  icon,
}: {
  label: string;
  value: string;
  helper?: string;
  tone?: "positive" | "negative" | "neutral";
  icon: ReactNode;
}) {
  return (
    <Card className="border-border/60 bg-card">
      <CardContent className="p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
          <div className="rounded-md bg-primary/10 p-2 text-primary/70">{icon}</div>
        </div>
        <p
          className={cn(
            "text-2xl font-bold tracking-tight",
            tone === "positive" && "text-emerald-700",
            tone === "negative" && "text-red-600",
          )}
        >
          {value}
        </p>
        {helper && <p className="mt-1 text-xs text-muted-foreground">{helper}</p>}
      </CardContent>
    </Card>
  );
}

function ShowCard({ show }: { show: VenueShow }) {
  const profit = show.actualProfit ?? show.totalProfit;
  const audience = show.actualAttendance;

  return (
    <div className="rounded-lg border border-border/60 bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-foreground">{fmtDate(show.showDate)}</p>
            {showStatusBadge(show.status)}
            {show.importedFromTour && show.tourName && (
              <Badge variant="outline" className="border-primary/30 text-primary/70">
                {show.tourName}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {show.showType.replace(/_/g, " ")}
          </p>
        </div>
        <div className="text-right">
          <p className={cn("text-lg font-bold", profit != null && profit < 0 ? "text-red-600" : "text-emerald-700")}>
            {fmtSignedMoney(profit)}
          </p>
          <p className="text-xs text-muted-foreground">profit</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <div>
          <p className="text-xs text-muted-foreground">Audience</p>
          <p className="font-semibold">{audience != null ? `${audience} pax` : "-"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Ticket sales</p>
          <p className="font-semibold">{show.actualTicketSales != null ? fmtNumber(show.actualTicketSales) : "-"}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Would play again</p>
          <WouldDoAgainBadge value={show.wouldDoAgain} />
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Income</p>
          <p className="font-semibold">{fmtMoney(show.totalIncome)}</p>
        </div>
      </div>

      {show.notes && (
        <p className="mt-3 line-clamp-2 rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {show.notes}
        </p>
      )}
    </div>
  );
}

function VenueStopCard({ stop }: { stop: VenueStop }) {
  const income = stop.fee ?? stop.guarantee;

  return (
    <div className="rounded-lg border border-border/60 bg-background p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{fmtDate(stop.date)}</p>
            {bookingStatusBadge(stop.bookingStatus)}
          </div>
          {stop.tourName && (
            <p className="mt-1 text-xs text-muted-foreground">
              via <span className="font-medium text-foreground/80">{stop.tourName}</span>
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="font-bold">{fmtMoney(income)}</p>
          <p className="text-xs text-muted-foreground">fee</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Music className="h-3.5 w-3.5" />
        <span>{stop.showType.replace(/_/g, " ")}</span>
        {stop.notes && <span className="min-w-0 truncate">- {stop.notes}</span>}
      </div>
    </div>
  );
}

function InfoRow({ label, value, icon }: { label: string; value?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-md border border-border/40 bg-muted/20 px-3 py-2.5">
      {icon && <div className="mt-0.5 text-muted-foreground">{icon}</div>}
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <div className="mt-0.5 break-words text-sm font-medium text-foreground">{value || "-"}</div>
      </div>
    </div>
  );
}

function DashboardSection({
  title,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string;
  icon: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border border-border/60 bg-card">
      <CollapsibleTrigger asChild>
        <button className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left">
          <span className="flex items-center gap-2 text-sm font-semibold">
            <span className="text-primary/70">{icon}</span>
            {title}
          </span>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-3 border-t border-border/50 p-4">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface DraftForm {
  fullAddress: string;
  suburb: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  capacity: string;
  website: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  productionContactName: string;
  productionContactPhone: string;
  productionContactEmail: string;
  roomNotes: string;
  venueStatus: VenueStatus;
  willPlayAgain: WillPlayAgain;
  accommodationAvailable: boolean;
  riderProvided: boolean;
  playingDays: string[];
  venueNotes: string;
}

type VenueDraftSource = {
  fullAddress?: string | null;
  suburb?: string | null;
  city?: string | null;
  state?: string | null;
  postcode?: string | null;
  country?: string | null;
  capacity?: number | null;
  website?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  productionContactName?: string | null;
  productionContactPhone?: string | null;
  productionContactEmail?: string | null;
  roomNotes?: string | null;
  venueStatus?: string | null;
  willPlayAgain?: string | null;
  accommodationAvailable?: boolean | null;
  riderProvided?: boolean | null;
  playingDays?: string[] | null;
  venueNotes?: string | null;
};

function makeDraft(venue: VenueDraftSource): DraftForm {
  return {
    fullAddress: venue.fullAddress ?? "",
    suburb: venue.suburb ?? "",
    city: venue.city ?? "",
    state: venue.state ?? "",
    postcode: venue.postcode ?? "",
    country: venue.country ?? "",
    capacity: venue.capacity != null ? String(venue.capacity) : "",
    website: venue.website ?? "",
    contactName: venue.contactName ?? "",
    contactEmail: venue.contactEmail ?? "",
    contactPhone: venue.contactPhone ?? "",
    productionContactName: venue.productionContactName ?? "",
    productionContactPhone: venue.productionContactPhone ?? "",
    productionContactEmail: venue.productionContactEmail ?? "",
    roomNotes: venue.roomNotes ?? "",
    venueStatus: normalizeVenueStatus(venue.venueStatus) ?? "untested",
    willPlayAgain: normalizeWillPlayAgain(venue.willPlayAgain) ?? "unsure",
    accommodationAvailable: venue.accommodationAvailable ?? false,
    riderProvided: venue.riderProvided ?? false,
    playingDays: venue.playingDays ?? [],
    venueNotes: venue.venueNotes ?? "",
  };
}

function VenueDetailsDashboard({
  venue,
  onSave,
  isSaving,
}: {
  venue: VenueDraftSource;
  onSave: (data: Partial<{
    fullAddress: string | null;
    suburb: string | null;
    city: string | null;
    state: string | null;
    postcode: string | null;
    country: string | null;
    capacity: number | null;
    website: string | null;
    contactName: string | null;
    contactEmail: string | null;
    contactPhone: string | null;
    productionContactName: string | null;
    productionContactPhone: string | null;
    productionContactEmail: string | null;
    roomNotes: string | null;
    venueStatus: VenueStatus | null;
    willPlayAgain: WillPlayAgain | null;
    accommodationAvailable: boolean | null;
    riderProvided: boolean | null;
    playingDays: string[] | null;
    venueNotes: string | null;
  }>) => void;
  isSaving: boolean;
}) {
  const [draft, setDraft] = useState<DraftForm>(() => makeDraft(venue));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDraft(makeDraft(venue));
    setDirty(false);
  }, [
    venue.fullAddress,
    venue.suburb,
    venue.city,
    venue.state,
    venue.postcode,
    venue.country,
    venue.capacity,
    venue.website,
    venue.contactName,
    venue.contactEmail,
    venue.contactPhone,
    venue.productionContactName,
    venue.productionContactPhone,
    venue.productionContactEmail,
    venue.roomNotes,
    venue.venueStatus,
    venue.willPlayAgain,
    venue.accommodationAvailable,
    venue.riderProvided,
    venue.playingDays,
    venue.venueNotes,
  ]);

  const set = <K extends keyof DraftForm>(field: K, value: DraftForm[K]) => {
    setDraft(current => ({ ...current, [field]: value }));
    setDirty(true);
  };

  const handleAddressSelect = (text: string, place?: PlaceResult) => {
    if (!place) return;
    const parsed = place.parsed ?? {};
    const nextAddress = (place.label ?? text ?? "").trim();
    setDraft(current => ({
      ...current,
      fullAddress: nextAddress || current.fullAddress,
      suburb: parsed.suburb ?? current.suburb,
      city: parsed.city ?? current.city,
      state: parsed.state ?? current.state,
      postcode: parsed.postcode ?? current.postcode,
      country: parsed.country ?? current.country,
    }));
    setDirty(true);
  };

  const toggleDay = (day: string, checked: boolean) => {
    set("playingDays", checked
      ? Array.from(new Set([...draft.playingDays, day]))
      : draft.playingDays.filter(value => value !== day));
  };

  const handleSave = () => {
    const trim = (v: string | null | undefined) => (v ?? "").trim();
    const capacityRaw = trim(draft.capacity);
    onSave({
      fullAddress: trim(draft.fullAddress) || null,
      suburb: trim(draft.suburb) || null,
      city: trim(draft.city) || null,
      state: trim(draft.state) || null,
      postcode: trim(draft.postcode) || null,
      country: trim(draft.country) || null,
      capacity: capacityRaw ? parseInt(capacityRaw, 10) || null : null,
      website: trim(draft.website) || null,
      contactName: trim(draft.contactName) || null,
      contactEmail: trim(draft.contactEmail) || null,
      contactPhone: trim(draft.contactPhone) || null,
      productionContactName: trim(draft.productionContactName) || null,
      productionContactPhone: trim(draft.productionContactPhone) || null,
      productionContactEmail: trim(draft.productionContactEmail) || null,
      roomNotes: trim(draft.roomNotes) || null,
      venueStatus: draft.venueStatus,
      willPlayAgain: draft.willPlayAgain,
      accommodationAvailable: draft.accommodationAvailable,
      riderProvided: draft.riderProvided,
      playingDays: draft.playingDays && draft.playingDays.length > 0 ? draft.playingDays : null,
      venueNotes: trim(draft.venueNotes) || null,
    });
    setDirty(false);
  };

  const handleReset = () => {
    setDraft(makeDraft(venue));
    setDirty(false);
  };

  const field = (label: string, key: keyof Pick<DraftForm, "suburb" | "city" | "state" | "postcode" | "country" | "capacity" | "website" | "contactName" | "contactEmail" | "contactPhone" | "productionContactName" | "productionContactPhone" | "productionContactEmail">, placeholder?: string) => (
    <div className="space-y-1">
      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</Label>
      <Input
        value={draft[key]}
        onChange={event => set(key, event.target.value)}
        placeholder={placeholder ?? ""}
        className="h-9 text-sm"
        inputMode={key === "capacity" ? "numeric" : undefined}
      />
    </div>
  );

  return (
    <div id="venue-edit" className="space-y-3">
      <DashboardSection title="Location" icon={<MapPin className="h-4 w-4" />} defaultOpen>
        <div className="space-y-1">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Full address</Label>
          <PlacesAutocomplete
            value={draft.fullAddress}
            onChange={(text, place) => {
              set("fullAddress", text);
              if (place?.parsed) handleAddressSelect(text, place);
            }}
            placeholder="123 Gig Street, Melbourne VIC 3000"
            className="h-9 text-sm"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          {field("Suburb", "suburb", "Fitzroy")}
          {field("City", "city", "Melbourne")}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {field("State", "state", "VIC")}
          {field("Postcode", "postcode", "3065")}
          {field("Country", "country", "Australia")}
        </div>
      </DashboardSection>

      <DashboardSection title="Venue Details" icon={<Mic2 className="h-4 w-4" />}>
        {field("Capacity", "capacity", "200")}
        {field("Website", "website", "https://thevenue.com.au")}
        {draft.website && (
          <a
            href={draft.website.startsWith("http") ? draft.website : `https://${draft.website}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            <Globe className="h-3.5 w-3.5" /> Visit website <ExternalLink className="h-3 w-3" />
          </a>
        )}
        <div className="space-y-1">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Room, sound, parking</Label>
          <Textarea
            value={draft.roomNotes}
            onChange={event => set("roomNotes", event.target.value)}
            placeholder="Great sound, limited parking. Load in from rear lane."
            className="min-h-[86px] resize-none text-sm"
          />
        </div>
      </DashboardSection>

      <DashboardSection title="Contact Info" icon={<Phone className="h-4 w-4" />}>
        {field("Contact name", "contactName", "Booking contact")}
        {field("Contact email", "contactEmail", "booking@thevenue.com")}
        {field("Contact phone", "contactPhone", "04xx xxx xxx")}
        <div className="border-t border-border/50 pt-3" />
        {field("Production contact", "productionContactName", "Production contact")}
        {field("Production phone", "productionContactPhone", "04xx xxx xxx")}
        {field("Production email", "productionContactEmail", "production@thevenue.com")}
      </DashboardSection>

      <DashboardSection title="Musician Notes" icon={<FileText className="h-4 w-4" />}>
        <div className="space-y-1">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Private notes</Label>
          <Textarea
            value={draft.venueNotes}
            onChange={event => set("venueNotes", event.target.value)}
            placeholder="Promoter is responsive, green room is tiny, ask for early load-in."
            className="min-h-[110px] resize-none text-sm"
          />
        </div>
      </DashboardSection>

      <DashboardSection title="Booking Preferences" icon={<SlidersHorizontal className="h-4 w-4" />} defaultOpen>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Venue status</Label>
            <Select value={draft.venueStatus} onValueChange={value => set("venueStatus", value as VenueStatus)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VENUE_STATUSES.map(option => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Will play again</Label>
            <Select value={draft.willPlayAgain} onValueChange={value => set("willPlayAgain", value as WillPlayAgain)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WILL_PLAY_AGAIN.map(option => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-3 rounded-md border border-border/60 px-3 py-2.5 text-sm">
            <Checkbox
              checked={draft.accommodationAvailable}
              onCheckedChange={checked => set("accommodationAvailable", checked === true)}
            />
            <span className="font-medium">Accommodation</span>
          </label>
          <label className="flex items-center gap-3 rounded-md border border-border/60 px-3 py-2.5 text-sm">
            <Checkbox
              checked={draft.riderProvided}
              onCheckedChange={checked => set("riderProvided", checked === true)}
            />
            <span className="font-medium">Rider provided</span>
          </label>
        </div>

        <div className="space-y-2">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Playing days</Label>
          <div className="grid grid-cols-7 gap-2">
            {WEEKDAYS.map(day => {
              const checked = draft.playingDays.includes(day.value);
              return (
                <label
                  key={day.value}
                  title={day.title}
                  className={cn(
                    "flex h-9 cursor-pointer items-center justify-center rounded-md border text-sm font-semibold transition-colors",
                    checked
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:bg-muted",
                  )}
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={value => toggleDay(day.value, value === true)}
                    className="sr-only"
                  />
                  {day.label}
                </label>
              );
            })}
          </div>
        </div>
      </DashboardSection>

      <div className="sticky bottom-3 z-10 flex gap-2 rounded-lg border border-border/70 bg-background/95 p-2 shadow-sm backdrop-blur">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={!dirty || isSaving}
          className="flex-1"
        >
          <Save className="mr-1.5 h-3.5 w-3.5" />
          {isSaving ? "Saving..." : "Save changes"}
        </Button>
        {dirty && (
          <Button size="sm" variant="ghost" onClick={handleReset} disabled={isSaving}>
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}

export default function VenueDetail() {
  const { id } = useParams<{ id: string }>();
  const venueId = parseInt(id ?? "", 10);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: venue, isLoading } = useGetVenue(venueId, {
    query: { enabled: !Number.isNaN(venueId) },
  });

  const [nameEditing, setNameEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

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

  const startNameEdit = (currentName: string) => {
    setNameDraft(currentName);
    setNameEditing(true);
    setTimeout(() => nameInputRef.current?.focus(), 0);
  };

  const commitNameEdit = () => {
    const trimmed = nameDraft.trim();
    if (!trimmed) return;
    setNameEditing(false);
    patchVenue.mutate({ id: venueId, data: { venueName: trimmed } });
  };

  const cancelNameEdit = () => {
    setNameEditing(false);
    setNameDraft("");
  };

  if (isLoading) {
    return (
      <div className="space-y-5 p-4 md:p-6">
        <Skeleton className="h-28 rounded-xl" />
        <div className="grid gap-5 lg:grid-cols-2">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!venue) {
    return (
      <div className="space-y-4 p-4 md:p-6">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/venues")}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to Venues
        </Button>
        <p className="text-muted-foreground">Venue not found.</p>
      </div>
    );
  }

  const { stats, shows, upcomingRuns = [], upcomingStops = [], pendingStops = [] } = venue;
  const timesPlayed = stats?.timesPlayed ?? 0;
  const wouldPlayPct = stats?.wouldPlayAgainRatio != null
    ? Math.round(stats.wouldPlayAgainRatio * 100)
    : null;
  const breakEvenTickets = calcBreakEvenTickets(shows);
  const effectiveStatus = deriveVenueStatus({
    storedStatus: venue.venueStatus,
    storedWillPlayAgain: venue.willPlayAgain,
    avgProfit: stats?.avgProfit,
    wouldPlayAgainRatio: stats?.wouldPlayAgainRatio,
    shows,
  });
  const safeSuburb = venue.suburb && !/^\d/.test(venue.suburb.trim()) ? venue.suburb : null;
  const locationLine = [safeSuburb, venue.city, venue.state, venue.country].filter(Boolean).join(", ");
  const upcomingItems = [...upcomingRuns, ...upcomingStops, ...pendingStops];
  const upcomingItemDate = (item: VenueShow | VenueStop) => "date" in item ? item.date : item.showDate;
  const nextShow = upcomingItems
    .filter(item => Boolean(upcomingItemDate(item)))
    .sort((a, b) => String(upcomingItemDate(a) ?? "").localeCompare(String(upcomingItemDate(b) ?? "")))[0];
  const allUpcomingStops = [...upcomingStops, ...pendingStops]
    .sort((a, b) => String(a.date ?? "").localeCompare(String(b.date ?? "")));
  const willPlayAgain = normalizeWillPlayAgain(venue.willPlayAgain);

  const scrollToEdit = () => {
    document.getElementById("venue-edit")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <Button variant="ghost" size="sm" className="-ml-1 text-muted-foreground" onClick={() => setLocation("/venues")}>
        <ArrowLeft className="mr-1 h-4 w-4" /> Venues
      </Button>

      <Card className="border-border/60 bg-card">
        <CardContent className="p-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <VenueStatusBadge status={effectiveStatus} />
                {timesPlayed > 0 && (
                  <Badge variant="outline" className="rounded-md px-2.5 py-1">
                    <Mic2 className="mr-1.5 h-3.5 w-3.5" />
                    {timesPlayed} {timesPlayed === 1 ? "show" : "shows"}
                  </Badge>
                )}
              </div>

              {nameEditing ? (
                <div className="flex max-w-xl items-center gap-2">
                  <Input
                    ref={nameInputRef}
                    value={nameDraft}
                    onChange={event => setNameDraft(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === "Enter") commitNameEdit();
                      if (event.key === "Escape") cancelNameEdit();
                    }}
                    className="h-auto py-1 text-2xl font-bold"
                    aria-label="Venue name"
                  />
                  <Button size="icon" variant="secondary" onClick={commitNameEdit} disabled={!nameDraft.trim()}>
                    <Check className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={cancelNameEdit}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="group/name flex min-w-0 items-center gap-2">
                  <h1 className="truncate text-3xl font-bold tracking-tight">{venue.venueName}</h1>
                  <button
                    onClick={() => startNameEdit(venue.venueName)}
                    className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover/name:opacity-100"
                    aria-label="Edit venue name"
                  >
                    <Edit2 className="h-4 w-4" />
                  </button>
                </div>
              )}

              {(locationLine || venue.fullAddress) && (
                <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  {locationLine || venue.fullAddress}
                </p>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[420px]">
              <InfoRow label="Last played" value={fmtDate(stats?.lastPlayed)} icon={<Calendar className="h-4 w-4" />} />
              <InfoRow
                label="Next show"
                value={nextShow ? `${fmtDate(upcomingItemDate(nextShow))} (${"bookingStatus" in nextShow ? nextShow.bookingStatus ?? "confirmed" : nextShow.status ?? "planned"})` : "-"}
                icon={<Music className="h-4 w-4" />}
              />
              <Button variant="outline" onClick={scrollToEdit}>
                <Edit2 className="mr-2 h-4 w-4" /> Edit Venue
              </Button>
              <Button onClick={() => setLocation(`/runs/new?venueId=${venue.id}`)}>
                <Plus className="mr-2 h-4 w-4" /> Add Show
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
        <div className="space-y-5">
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight">Performance Snapshot</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <SnapshotCard
                label="Avg Profit"
                value={fmtSignedMoney(stats?.avgProfit)}
                helper={timesPlayed > 0 ? `${timesPlayed} recorded ${timesPlayed === 1 ? "show" : "shows"}` : "No history yet"}
                tone={(stats?.avgProfit ?? 0) < 0 ? "negative" : "positive"}
                icon={<Ticket className="h-4 w-4" />}
              />
              <SnapshotCard
                label="Break-even Tickets"
                value={breakEvenTickets != null ? fmtNumber(breakEvenTickets) : "-"}
                helper={breakEvenTickets != null ? "Average from ticketed history" : "Needs ticket price and cost data"}
                icon={<SlidersHorizontal className="h-4 w-4" />}
              />
              <SnapshotCard
                label="Avg Audience"
                value={fmtNumber(stats?.avgAudience)}
                helper={timesPlayed > 0 ? "Average from linked shows" : "No history yet"}
                icon={<Mic2 className="h-4 w-4" />}
              />
              <SnapshotCard
                label="Will Play Again"
                value={willPlayAgain ? willPlayAgainLabel(willPlayAgain) : wouldPlayPct != null ? `${wouldPlayPct}%` : "-"}
                helper={willPlayAgain ? "Stored preference" : "Based on show history"}
                tone={willPlayAgain === "no" ? "negative" : willPlayAgain === "yes" ? "positive" : "neutral"}
                icon={<Star className="h-4 w-4" />}
              />
            </div>
          </section>

          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Music className="h-4 w-4 text-primary/70" /> Show History
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {shows.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/70 py-8 text-center">
                  <Calendar className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
                  <p className="text-sm font-medium">No shows recorded yet.</p>
                  <p className="mt-1 text-xs text-muted-foreground">Past shows will build this venue's decision history.</p>
                </div>
              ) : (
                shows.map(show => <ShowCard key={show.id} show={show} />)
              )}
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Calendar className="h-4 w-4 text-primary/70" /> Upcoming Shows
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {upcomingRuns.length === 0 && allUpcomingStops.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/70 py-8 text-center text-sm text-muted-foreground">
                  No upcoming confirmed, pending, or on-hold shows.
                </div>
              ) : (
                <>
                  {upcomingRuns.map(show => <ShowCard key={`run-${show.id}`} show={show} />)}
                  {allUpcomingStops.map(stop => <VenueStopCard key={`stop-${stop.id}`} stop={stop} />)}
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Venue Details</CardTitle>
              <p className="text-sm text-muted-foreground">Details, contacts, and booking preferences for future decisions.</p>
            </CardHeader>
            <CardContent>
              <VenueDetailsDashboard
                venue={venue}
                onSave={data => patchVenue.mutate({ id: venueId, data })}
                isSaving={patchVenue.isPending}
              />
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <InfoRow label="Accommodation" value={venue.accommodationAvailable ? "Available" : "-"} icon={<Bed className="h-4 w-4" />} />
            <InfoRow label="Rider" value={venue.riderProvided ? "Provided" : "-"} icon={<Utensils className="h-4 w-4" />} />
            <InfoRow label="Contact" value={venue.contactName || "-"} icon={<Phone className="h-4 w-4" />} />
            <InfoRow label="Email" value={venue.contactEmail || "-"} icon={<Mail className="h-4 w-4" />} />
            <InfoRow label="Production" value={venue.productionContactName || "-"} icon={<Mic2 className="h-4 w-4" />} />
            <InfoRow label="Production phone" value={venue.productionContactPhone || "-"} icon={<Phone className="h-4 w-4" />} />
          </div>
        </div>
      </div>
    </div>
  );
}
