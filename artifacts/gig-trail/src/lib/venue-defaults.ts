export type VenueDefaultsSource = {
  id?: number;
  name?: string | null;
  venueName?: string | null;
  fullAddress?: string | null;
  suburb?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  capacity?: number | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  productionContactName?: string | null;
  productionContactPhone?: string | null;
  productionContactEmail?: string | null;
  roomNotes?: string | null;
  venueNotes?: string | null;
  generalNotes?: string | null;
  typicalSoundcheckTime?: string | null;
  typicalSetTime?: string | null;
  venueStatus?: string | null;
  willPlayAgain?: string | null;
  playingDays?: string[] | null;
  accommodationAvailable?: boolean | null;
  riderProvided?: boolean | null;
  riderFriendly?: boolean | null;
};

export type RunVenueDefaults = {
  venueName?: string | null;
  destination?: string;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  capacity?: number | null;
  soundcheckTime?: string | null;
  playingTime?: string | null;
  accommodationRequired?: boolean;
  notes?: string | null;
};

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function buildRunVenueDefaults(
  venue: VenueDefaultsSource,
  currentNotes?: string | null,
): RunVenueDefaults {
  const venueName = venue.name ?? venue.venueName ?? null;
  const roomOrGeneralNotes = clean(venue.generalNotes) ?? clean(venue.roomNotes) ?? clean(venue.venueNotes);
  const riderFriendly = venue.riderFriendly ?? venue.riderProvided ?? false;
  const destination =
    clean(venue.fullAddress) ||
    [venueName, venue.suburb ?? venue.city, venue.state, venue.country].filter(Boolean).join(", ");

  const noteParts = [
    clean(currentNotes),
    roomOrGeneralNotes ? `Venue notes: ${roomOrGeneralNotes}` : null,
    clean(venue.contactName) ? `Booking contact: ${clean(venue.contactName)}` : null,
    clean(venue.contactPhone) ? `Booking phone: ${clean(venue.contactPhone)}` : null,
    clean(venue.contactEmail) ? `Booking email: ${clean(venue.contactEmail)}` : null,
    clean(venue.productionContactName) ? `Production contact: ${clean(venue.productionContactName)}` : null,
    clean(venue.productionContactPhone) ? `Production phone: ${clean(venue.productionContactPhone)}` : null,
    clean(venue.productionContactEmail) ? `Production email: ${clean(venue.productionContactEmail)}` : null,
    venue.playingDays && venue.playingDays.length > 0 ? `Playing days: ${venue.playingDays.join(", ")}` : null,
    riderFriendly ? "Venue default: rider friendly." : null,
    venue.accommodationAvailable ? "Venue default: accommodation available." : null,
  ].filter(Boolean);

  return {
    venueName,
    destination: destination || undefined,
    city: (venue.suburb ?? venue.city) || null,
    state: venue.state || null,
    country: venue.country || null,
    capacity: venue.capacity ?? null,
    soundcheckTime: clean(venue.typicalSoundcheckTime),
    playingTime: clean(venue.typicalSetTime),
    accommodationRequired: undefined,
    notes: noteParts.length > 0 ? Array.from(new Set(noteParts)).join("\n") : currentNotes ?? null,
  };
}

export type VenueDefaultDisplayRow = {
  label: string;
  venueDefault: string;
  showOverride: string;
};

function display(value: string | number | boolean | null | undefined): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value == null || value === "") return "-";
  return String(value);
}

export function buildVenueDefaultDisplayRows(
  venue: VenueDefaultsSource | null | undefined,
  show: {
    venueName?: string | null;
    capacity?: number | string | null;
    soundcheckTime?: string | null;
    playingTime?: string | null;
    accommodationRequired?: boolean | null;
    notes?: string | null;
  },
): VenueDefaultDisplayRow[] {
  if (!venue) return [];

  const riderFriendly = venue.riderFriendly ?? venue.riderProvided ?? false;
  const venueName = venue.name ?? venue.venueName ?? null;
  const contact = [venue.contactName, venue.contactEmail, venue.contactPhone].map(clean).filter(Boolean).join(" / ");
  const production = [venue.productionContactName, venue.productionContactEmail, venue.productionContactPhone].map(clean).filter(Boolean).join(" / ");

  return [
    { label: "Venue", venueDefault: display(venueName), showOverride: display(show.venueName ?? venueName) },
    { label: "Capacity", venueDefault: display(venue.capacity), showOverride: display(show.capacity) },
    { label: "Soundcheck", venueDefault: display(venue.typicalSoundcheckTime), showOverride: display(show.soundcheckTime) },
    { label: "Set time", venueDefault: display(venue.typicalSetTime), showOverride: display(show.playingTime) },
    { label: "Accommodation", venueDefault: display(venue.accommodationAvailable), showOverride: display(show.accommodationRequired) },
    { label: "Rider", venueDefault: display(riderFriendly), showOverride: show.notes?.toLowerCase().includes("rider") ? "In show notes" : "-" },
    { label: "Booking contact", venueDefault: display(contact), showOverride: show.notes?.toLowerCase().includes("booking contact") ? "In show notes" : "-" },
    { label: "Production contact", venueDefault: display(production), showOverride: show.notes?.toLowerCase().includes("production contact") ? "In show notes" : "-" },
  ];
}
