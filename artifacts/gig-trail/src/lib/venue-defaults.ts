export type VenueDefaultsSource = {
  id?: number;
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
  venueStatus?: string | null;
  willPlayAgain?: string | null;
  playingDays?: string[] | null;
  accommodationAvailable?: boolean | null;
  riderProvided?: boolean | null;
};

export type RunVenueDefaults = {
  venueName?: string | null;
  destination?: string;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  capacity?: number | null;
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
  const destination =
    clean(venue.fullAddress) ||
    [venue.venueName, venue.suburb ?? venue.city, venue.state, venue.country].filter(Boolean).join(", ");

  const noteParts = [
    clean(currentNotes),
    clean(venue.roomNotes) ? `Room notes: ${clean(venue.roomNotes)}` : null,
    clean(venue.venueNotes) ? `Venue notes: ${clean(venue.venueNotes)}` : null,
    clean(venue.contactName) ? `Booking contact: ${clean(venue.contactName)}` : null,
    clean(venue.contactPhone) ? `Booking phone: ${clean(venue.contactPhone)}` : null,
    clean(venue.contactEmail) ? `Booking email: ${clean(venue.contactEmail)}` : null,
    clean(venue.productionContactName) ? `Production contact: ${clean(venue.productionContactName)}` : null,
    clean(venue.productionContactPhone) ? `Production phone: ${clean(venue.productionContactPhone)}` : null,
    clean(venue.productionContactEmail) ? `Production email: ${clean(venue.productionContactEmail)}` : null,
    clean(venue.venueStatus) ? `Venue status: ${clean(venue.venueStatus)}` : null,
    clean(venue.willPlayAgain) ? `Will play again: ${clean(venue.willPlayAgain)}` : null,
    venue.playingDays && venue.playingDays.length > 0 ? `Playing days: ${venue.playingDays.join(", ")}` : null,
    venue.riderProvided ? "Venue default: rider provided." : null,
    venue.accommodationAvailable ? "Venue default: accommodation available." : null,
  ].filter(Boolean);

  return {
    venueName: venue.venueName ?? null,
    destination: destination || undefined,
    city: (venue.suburb ?? venue.city) || null,
    state: venue.state || null,
    country: venue.country || null,
    capacity: venue.capacity ?? null,
    accommodationRequired: venue.accommodationAvailable ? false : undefined,
    notes: noteParts.length > 0 ? Array.from(new Set(noteParts)).join("\n") : currentNotes ?? null,
  };
}

export function stripVenueOutcomeFields<T extends Record<string, unknown>>(payload: T): Omit<T, "actualTicketSales"> {
  const venuePayload = { ...payload };
  delete venuePayload.actualTicketSales;
  return venuePayload;
}
