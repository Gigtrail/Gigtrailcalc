import { useParams, useLocation } from "wouter";
import {
  useGetVenue,
  usePatchVenue,
  getGetVenueQueryKey,
  getGetVenuesQueryKey,
} from "@workspace/api-client-react";
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
  Phone,
  Plus,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Star,
  Ticket,
  TrendingUp,
  Utensils,
  X,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { cn } from "@/lib/utils";
import { formatVenueAddressSummary } from "@/lib/venue-defaults";

type VenueStatus = "great" | "risky" | "avoid" | "untested";
type WillPlayAgain = "yes" | "no" | "unsure";
type VenuePerformanceSummary = {
  totalShows: number;
  avgTicketSales: number | null;
  avgProfit: number | null;
  bestShowProfit: number | null;
  worstShowProfit: number | null;
};

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
  { value: "mon", label: "Mon", title: "Monday" },
  { value: "tue", label: "Tue", title: "Tuesday" },
  { value: "wed", label: "Wed", title: "Wednesday" },
  { value: "thu", label: "Thu", title: "Thursday" },
  { value: "fri", label: "Fri", title: "Friday" },
  { value: "sat", label: "Sat", title: "Saturday" },
  { value: "sun", label: "Sun", title: "Sunday" },
];

const EMPTY_TEXT = "—";
const UNKNOWN_TEXT = "Unknown";

function displayText(value: string | number | null | undefined, fallback = EMPTY_TEXT): string {
  if (value == null) return fallback;
  const text = String(value).trim();
  return text || fallback;
}

function fmtMoney(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return EMPTY_TEXT;
  return `$${Math.round(n).toLocaleString()}`;
}

function fmtSignedMoney(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return EMPTY_TEXT;
  const prefix = n > 0 ? "+" : n < 0 ? "-" : "";
  return `${prefix}${fmtMoney(Math.abs(n))}`;
}

function fmtNumber(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return EMPTY_TEXT;
  return Math.round(n).toLocaleString();
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return EMPTY_TEXT;
  try {
    return format(parseISO(`${d}T00:00:00`), "d MMM yyyy");
  } catch {
    return displayText(d);
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

function InfoRow({ label, value, icon }: { label: string; value?: ReactNode; icon?: ReactNode }) {
  const safeValue = typeof value === "string" || typeof value === "number" ? displayText(value) : value;

  return (
    <div className="flex items-start gap-3 rounded-md border border-border/40 bg-muted/20 px-3 py-2.5">
      {icon && <div className="mt-0.5 text-muted-foreground">{icon}</div>}
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <div className="mt-0.5 break-words text-sm font-medium text-foreground">{safeValue || EMPTY_TEXT}</div>
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
  typicalSoundcheckTime: string;
  typicalSetTime: string;
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
  typicalSoundcheckTime?: string | null;
  typicalSetTime?: string | null;
  roomNotes?: string | null;
  generalNotes?: string | null;
  productionNotes?: string | null;
  techSpecs?: string | null;
  stagePlotNotes?: string | null;
  venueStatus?: string | null;
  willPlayAgain?: string | null;
  accommodationAvailable?: boolean | null;
  riderProvided?: boolean | null;
  riderFriendly?: boolean | null;
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
    typicalSoundcheckTime: venue.typicalSoundcheckTime ?? "",
    typicalSetTime: venue.typicalSetTime ?? "",
    roomNotes: venue.generalNotes ?? venue.roomNotes ?? "",
    venueStatus: normalizeVenueStatus(venue.venueStatus) ?? "untested",
    willPlayAgain: normalizeWillPlayAgain(venue.willPlayAgain) ?? "unsure",
    accommodationAvailable: venue.accommodationAvailable ?? false,
    riderProvided: venue.riderFriendly ?? venue.riderProvided ?? false,
    playingDays: venue.playingDays ?? [],
    venueNotes: venue.generalNotes ?? venue.venueNotes ?? "",
  };
}

function VenueHeader({
  venueName,
  locationLine,
  status,
  willPlayAgain,
  lastPlayed,
  nameEditing,
  nameDraft,
  nameInputRef,
  setNameDraft,
  startNameEdit,
  commitNameEdit,
  cancelNameEdit,
  onEditVenue,
  onAddShow,
}: {
  venueName: string;
  locationLine?: string | null;
  status: VenueStatus;
  willPlayAgain: WillPlayAgain | null;
  lastPlayed?: string | null;
  nameEditing: boolean;
  nameDraft: string;
  nameInputRef: RefObject<HTMLInputElement | null>;
  setNameDraft: (value: string) => void;
  startNameEdit: () => void;
  commitNameEdit: () => void;
  cancelNameEdit: () => void;
  onEditVenue: () => void;
  onAddShow: () => void;
}) {
  return (
    <Card className="border-border/60 bg-card">
      <CardContent className="p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 flex-1">
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
                <h1 className="truncate text-3xl font-bold tracking-tight">{displayText(venueName, "Unknown Venue")}</h1>
                <button
                  onClick={startNameEdit}
                  className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-muted group-hover/name:opacity-100"
                  aria-label="Edit venue name"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
              </div>
            )}

            {locationLine && (
              <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                {locationLine}
              </p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <VenueStatusBadge status={status} />
              <Badge variant="outline" className="rounded-md px-2.5 py-1">
                <Star className="mr-1.5 h-3.5 w-3.5" />
                Will play again: {willPlayAgainLabel(willPlayAgain)}
              </Badge>
              {lastPlayed && (
                <Badge variant="secondary" className="rounded-md px-2.5 py-1">
                  <Calendar className="mr-1.5 h-3.5 w-3.5" />
                  Last played: {fmtDate(lastPlayed)}
                </Badge>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Button variant="outline" onClick={onEditVenue}>
              <Edit2 className="mr-2 h-4 w-4" /> Edit Venue
            </Button>
            <Button onClick={onAddShow}>
              <Plus className="mr-2 h-4 w-4" /> Add Show
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function VenueContacts({ venue }: { venue: VenueDraftSource }) {
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Phone className="h-4 w-4 text-primary/70" /> Contacts
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <InfoRow label="Contact name" value={venue.contactName} icon={<Phone className="h-4 w-4" />} />
        <InfoRow label="Email" value={venue.contactEmail} icon={<Mail className="h-4 w-4" />} />
        <InfoRow label="Phone" value={venue.contactPhone} icon={<Phone className="h-4 w-4" />} />
        <InfoRow label="Production contact" value={venue.productionContactName} icon={<Mic2 className="h-4 w-4" />} />
        <InfoRow label="Production email" value={venue.productionContactEmail} icon={<Mail className="h-4 w-4" />} />
        <InfoRow label="Production phone" value={venue.productionContactPhone} icon={<Phone className="h-4 w-4" />} />
      </CardContent>
    </Card>
  );
}

function PlayingDayChips({ days }: { days?: string[] | null }) {
  if (!days?.length) return <span>{EMPTY_TEXT}</span>;

  return (
    <div className="flex flex-wrap gap-1.5">
      {WEEKDAYS.map(day => {
        const active = days.includes(day.value);
        return (
          <Badge
            key={day.value}
            variant={active ? "default" : "outline"}
            className={cn("rounded-md px-2 py-0.5 text-[11px]", !active && "text-muted-foreground")}
          >
            {day.label}
          </Badge>
        );
      })}
    </div>
  );
}

function VenueLogistics({ venue }: { venue: VenueDraftSource }) {
  const riderFriendly = venue.riderFriendly ?? venue.riderProvided ?? false;

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <SlidersHorizontal className="h-4 w-4 text-primary/70" /> Logistics
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-2">
        <InfoRow label="Capacity" value={fmtNumber(venue.capacity)} icon={<Ticket className="h-4 w-4" />} />
        <InfoRow label="Accommodation" value={venue.accommodationAvailable ? "Yes" : "No"} icon={<Bed className="h-4 w-4" />} />
        <InfoRow label="Rider friendly" value={riderFriendly ? "Yes" : "No"} icon={<Utensils className="h-4 w-4" />} />
        <InfoRow label="Soundcheck" value={venue.typicalSoundcheckTime} icon={<Mic2 className="h-4 w-4" />} />
        <InfoRow label="Set time" value={venue.typicalSetTime} icon={<Calendar className="h-4 w-4" />} />
        <InfoRow label="Playing days" value={<PlayingDayChips days={venue.playingDays} />} icon={<Calendar className="h-4 w-4" />} />
      </CardContent>
    </Card>
  );
}

function VenueStats({ performance }: { performance?: VenuePerformanceSummary }) {
  const totalShows = performance?.totalShows ?? 0;
  const avgProfit = performance?.avgProfit ?? null;

  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <TrendingUp className="h-4 w-4 text-primary/70" /> Performance Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm font-medium">
            You've played here {totalShows} {totalShows === 1 ? "time" : "times"}
          </p>
          <p className="text-sm text-muted-foreground">
            Avg profit: <span className="font-semibold text-foreground">{fmtSignedMoney(avgProfit)}</span>
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <SnapshotCard
            label="Total Shows"
            value={fmtNumber(totalShows)}
            helper="Derived from runs"
            icon={<Calendar className="h-4 w-4" />}
          />
          <SnapshotCard
            label="Avg Ticket Sales"
            value={fmtNumber(performance?.avgTicketSales)}
            helper={totalShows > 0 ? "Average actual sales" : "No history yet"}
            icon={<Ticket className="h-4 w-4" />}
          />
          <SnapshotCard
            label="Avg Profit"
            value={fmtSignedMoney(avgProfit)}
            helper="Income minus expenses"
            tone={avgProfit == null ? "neutral" : avgProfit < 0 ? "negative" : "positive"}
            icon={<TrendingUp className="h-4 w-4" />}
          />
          <SnapshotCard
            label="Best Show"
            value={fmtSignedMoney(performance?.bestShowProfit)}
            helper="Highest profit"
            icon={<Star className="h-4 w-4" />}
          />
          <SnapshotCard
            label="Worst Show"
            value={fmtSignedMoney(performance?.worstShowProfit)}
            helper="Lowest profit"
            tone={(performance?.worstShowProfit ?? 0) < 0 ? "negative" : "neutral"}
            icon={<SlidersHorizontal className="h-4 w-4" />}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function VenueNotes({ notes }: { notes?: string | null }) {
  return (
    <Card className="border-border/60">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <FileText className="h-4 w-4 text-primary/70" /> Notes
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="whitespace-pre-wrap rounded-md border border-border/40 bg-muted/20 p-4 text-sm leading-6 text-muted-foreground">
          {displayText(notes, "No venue notes yet.")}
        </div>
      </CardContent>
    </Card>
  );
}

type AdvancedVenueDraft = {
  productionNotes: string;
  techSpecs: string;
  stagePlotNotes: string;
};

function makeAdvancedDraft(venue: VenueDraftSource): AdvancedVenueDraft {
  return {
    productionNotes: venue.productionNotes ?? "",
    techSpecs: venue.techSpecs ?? "",
    stagePlotNotes: venue.stagePlotNotes ?? "",
  };
}

function AdvancedVenueFields({
  venue,
  onSave,
  isSaving,
}: {
  venue: VenueDraftSource;
  onSave: (data: Partial<{
    productionNotes: string | null;
    techSpecs: string | null;
    stagePlotNotes: string | null;
  }>) => void;
  isSaving: boolean;
}) {
  const [draft, setDraft] = useState<AdvancedVenueDraft>(() => makeAdvancedDraft(venue));
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setDraft(makeAdvancedDraft(venue));
    setDirty(false);
  }, [venue.productionNotes, venue.techSpecs, venue.stagePlotNotes]);

  const set = (field: keyof AdvancedVenueDraft, value: string) => {
    setDraft(current => ({ ...current, [field]: value }));
    setDirty(true);
  };

  const handleSave = () => {
    const trim = (value: string) => value.trim() || null;
    onSave({
      productionNotes: trim(draft.productionNotes),
      techSpecs: trim(draft.techSpecs),
      stagePlotNotes: trim(draft.stagePlotNotes),
    });
    setDirty(false);
  };

  const handleReset = () => {
    setDraft(makeAdvancedDraft(venue));
    setDirty(false);
  };

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Production notes</Label>
        <Textarea
          value={draft.productionNotes}
          onChange={event => set("productionNotes", event.target.value)}
          placeholder="House engineer preferences, load-in details, patching quirks."
          className="min-h-[96px] resize-none text-sm"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tech specs</Label>
        <Textarea
          value={draft.techSpecs}
          onChange={event => set("techSpecs", event.target.value)}
          placeholder="PA, console, monitors, power, backline, lighting."
          className="min-h-[96px] resize-none text-sm"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stage plot notes</Label>
        <Textarea
          value={draft.stagePlotNotes}
          onChange={event => set("stagePlotNotes", event.target.value)}
          placeholder="Stage dimensions, risers, drum position, DI locations."
          className="min-h-[96px] resize-none text-sm"
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        {dirty && (
          <Button size="sm" variant="ghost" onClick={handleReset} disabled={isSaving}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset
          </Button>
        )}
        <Button size="sm" onClick={handleSave} disabled={!dirty || isSaving}>
          <Save className="mr-1.5 h-3.5 w-3.5" />
          {isSaving ? "Saving..." : "Save advanced fields"}
        </Button>
      </div>
    </div>
  );
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
    typicalSoundcheckTime: string | null;
    typicalSetTime: string | null;
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
  // Hidden/editable address pattern:
  // The detailed address fields (suburb, city, state, postcode, country) stay
  // in form state at all times so save always uses the full picture, but they
  // are hidden behind an "Edit address details" toggle. Default collapsed —
  // most users only need the autocomplete + summary line. Selecting a place
  // fills the structured fields automatically; manual editing is opt-in.
  const [isEditingAddressDetails, setIsEditingAddressDetails] = useState(false);

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
    venue.typicalSoundcheckTime,
    venue.typicalSetTime,
    venue.roomNotes,
    venue.generalNotes,
    venue.venueStatus,
    venue.willPlayAgain,
    venue.accommodationAvailable,
    venue.riderProvided,
    venue.riderFriendly,
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
      typicalSoundcheckTime: trim(draft.typicalSoundcheckTime) || null,
      typicalSetTime: trim(draft.typicalSetTime) || null,
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

  const field = (label: string, key: keyof Pick<DraftForm, "suburb" | "city" | "state" | "postcode" | "country" | "capacity" | "website" | "contactName" | "contactEmail" | "contactPhone" | "productionContactName" | "productionContactPhone" | "productionContactEmail" | "typicalSoundcheckTime" | "typicalSetTime">, placeholder?: string) => (
    <div className="space-y-1">
      <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</Label>
      <Input
        value={draft[key]}
        onChange={event => set(key, event.target.value)}
        placeholder={placeholder ?? ""}
        className="h-9 text-sm"
        inputMode={key === "capacity" ? "numeric" : undefined}
        required={key === "city"}
      />
    </div>
  );

  return (
    <div id="venue-edit" className="space-y-3">
      <DashboardSection title="Location" icon={<MapPin className="h-4 w-4" />} defaultOpen>
        <div className="space-y-1">
          <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Search location</Label>
          <PlacesAutocomplete
            value={draft.fullAddress}
            onChange={(text, place) => {
              set("fullAddress", text);
              if (place?.parsed) handleAddressSelect(text, place);
            }}
            placeholder="Start typing a venue or address…"
            className="h-9 text-sm"
          />
        </div>

        {/*
          Hidden/editable address pattern:
          Show a muted summary line built from the structured fields and keep
          suburb/city/state/postcode/country tucked behind an Edit button. The
          underlying form state always carries the full address — collapsing
          never discards values, and save uses draft state directly.
        */}
        {(() => {
          const summary = formatVenueAddressSummary({
            fullAddress: draft.fullAddress,
            suburb: draft.suburb,
            city: draft.city,
            state: draft.state,
            postcode: draft.postcode,
            country: draft.country,
          });
          return (
            <div className="flex items-start justify-between gap-3 rounded-md border border-border/60 bg-muted/30 px-3 py-2">
              <div className="min-w-0 flex-1 text-sm">
                {summary ? (
                  <span className="text-foreground/90">{summary}</span>
                ) : (
                  <span className="text-muted-foreground">No address yet — search above or add details manually.</span>
                )}
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 shrink-0 px-2 text-xs"
                onClick={() => setIsEditingAddressDetails(prev => !prev)}
              >
                <Edit2 className="mr-1 h-3 w-3" />
                {isEditingAddressDetails ? "Hide details" : "Edit address details"}
              </Button>
            </div>
          );
        })()}

        {isEditingAddressDetails && (
          <div className="space-y-3 pt-1">
            <div className="grid grid-cols-2 gap-3">
              {field("Suburb", "suburb", "Fitzroy")}
              {field("City", "city", "Melbourne")}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {field("State", "state", "VIC")}
              {field("Postcode", "postcode", "3065")}
              {field("Country", "country", "Australia")}
            </div>
          </div>
        )}
      </DashboardSection>

      <DashboardSection title="Venue Details" icon={<Mic2 className="h-4 w-4" />}>
        {field("Capacity", "capacity", "200")}
        {field("Website", "website", "https://thevenue.com.au")}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {field("Typical soundcheck", "typicalSoundcheckTime", "5:00 PM")}
          {field("Typical set time", "typicalSetTime", "8:30 PM")}
        </div>
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
  const [editOpen, setEditOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
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

  const venueMemory = venue as typeof venue & VenueDraftSource & {
    performanceSummary?: VenuePerformanceSummary;
  };
  const performance = venueMemory.performanceSummary;
  const effectiveStatus = normalizeVenueStatus(venueMemory.venueStatus) ?? "untested";
  const willPlayAgain = normalizeWillPlayAgain(venueMemory.willPlayAgain) ?? "unsure";
  const cityName = displayText(venueMemory.city, UNKNOWN_TEXT);
  const countryName = displayText(venueMemory.country, "");
  const cityCountryLine = countryName ? `${cityName} / ${countryName}` : cityName;
  const headerLocationLine = cityCountryLine || displayText(venueMemory.fullAddress, UNKNOWN_TEXT);
  const visibleNotes = venueMemory.generalNotes || venueMemory.venueNotes || venueMemory.roomNotes || "";

  const openVenueEditor = () => {
    setEditOpen(true);
    setTimeout(() => {
      document.getElementById("venue-editor")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
      <Button variant="ghost" size="sm" className="-ml-1 text-muted-foreground" onClick={() => setLocation("/venues")}>
        <ArrowLeft className="mr-1 h-4 w-4" /> Venues
      </Button>

      <VenueHeader
        venueName={venue.venueName}
        locationLine={headerLocationLine}
        status={effectiveStatus}
        willPlayAgain={willPlayAgain}
        lastPlayed={venue.stats?.lastPlayed}
        nameEditing={nameEditing}
        nameDraft={nameDraft}
        nameInputRef={nameInputRef}
        setNameDraft={setNameDraft}
        startNameEdit={() => startNameEdit(venue.venueName)}
        commitNameEdit={commitNameEdit}
        cancelNameEdit={cancelNameEdit}
        onEditVenue={openVenueEditor}
        onAddShow={() => setLocation(`/runs/new?venueId=${venue.id}`)}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <VenueContacts venue={venueMemory} />
        <VenueLogistics venue={venueMemory} />
      </div>

      <VenueStats performance={performance} />

      <VenueNotes notes={visibleNotes} />

      {editOpen && (
        <Card id="venue-editor" className="border-border/60">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Edit2 className="h-4 w-4 text-primary/70" /> Venue Defaults Editor
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => setEditOpen(false)}>
                <X className="mr-1.5 h-4 w-4" /> Close
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <VenueDetailsDashboard
              venue={venueMemory}
              onSave={data => patchVenue.mutate({ id: venueId, data })}
              isSaving={patchVenue.isPending}
            />
          </CardContent>
        </Card>
      )}

      <Card id="venue-advanced" className="border-border/60">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <SlidersHorizontal className="h-4 w-4 text-primary/70" /> Advanced Fields
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => setAdvancedOpen(open => !open)}>
              <ChevronDown className={cn("mr-2 h-4 w-4 transition-transform", advancedOpen && "rotate-180")} />
              {advancedOpen ? "Hide Advanced Fields" : "Show Advanced Fields"}
            </Button>
          </div>
        </CardHeader>
        {advancedOpen && (
          <CardContent>
            <AdvancedVenueFields
              venue={venueMemory}
              onSave={data => patchVenue.mutate({ id: venueId, data })}
              isSaving={patchVenue.isPending}
            />
          </CardContent>
        )}
      </Card>
    </div>
  );
}
