import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db, venuesTable } from "@workspace/db";

export function normalizeVenueName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

function normalizeVenueKeyPart(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function normalizeVenueKey(
  name: string | null | undefined,
  city: string | null | undefined,
  country: string | null | undefined,
): string {
  return [normalizeVenueName(name ?? ""), normalizeVenueKeyPart(city), normalizeVenueKeyPart(country)].join("|");
}

function normalizeLegacyVenueKey(
  name: string | null | undefined,
  city: string | null | undefined,
  country: string | null | undefined,
): string {
  return [name, city, country].map(normalizeVenueKeyPart).join("|");
}

export interface VenueIdentity {
  userId: string;
  venueName: string | null | undefined;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  /**
   * Optional band-profile binding. Stored on insert so the venue stays
   * associated with the profile that first saved it. Existing venues are not
   * re-bound when this field is supplied — see legacy fallback below.
   */
  profileId?: number | null;
}

export interface VenueResolutionResult {
  venueId: number;
  created: boolean;
}

/**
 * Resolves a (userId, venueName, city, country) tuple to a venue row,
 * creating one when none exists. Returns null only when venueName is missing
 * or blank — there is nothing to anchor a venue to in that case.
 *
 * Lookup strategy:
 *  1. Match by canonical (userId, normalizedVenueKey).
 *  2. Fall back to the old raw-name key format for rows saved before the
 *     key normalization was tightened.
 *  3. Fall back to legacy (userId, normalizedVenueName) when the canonical
 *     key is null, covering venues created before the key column existed.
 *
 * When the legacy match is used, we opportunistically backfill the key,
 * city, state, and country on that row so subsequent lookups hit step 1.
 */
export async function findOrCreateUserVenue(
  identity: VenueIdentity,
): Promise<VenueResolutionResult | null> {
  const name = (identity.venueName ?? "").trim();
  if (!name) return null;
  const normalizedName = normalizeVenueName(name);
  if (!normalizedName) return null;

  const city = identity.city?.trim() || null;
  const state = identity.state?.trim() || null;
  const country = identity.country?.trim() || null;
  const key = normalizeVenueKey(name, city, country);
  const legacyKey = normalizeLegacyVenueKey(name, city, country);

  const [byKey] = await db
    .select({
      id: venuesTable.id,
      city: venuesTable.city,
      state: venuesTable.state,
      country: venuesTable.country,
      normalizedVenueKey: venuesTable.normalizedVenueKey,
    })
    .from(venuesTable)
    .where(and(eq(venuesTable.userId, identity.userId), eq(venuesTable.normalizedVenueKey, key)))
    .limit(1);

  if (byKey) return { venueId: byKey.id, created: false };

  if (legacyKey !== key) {
    const [byLegacyKey] = await db
      .select({ id: venuesTable.id })
      .from(venuesTable)
      .where(and(eq(venuesTable.userId, identity.userId), eq(venuesTable.normalizedVenueKey, legacyKey)))
      .limit(1);

    if (byLegacyKey) {
      return { venueId: byLegacyKey.id, created: false };
    }
  }

  // Legacy fallback: venues saved before the canonical key existed have a
  // null key. Match by (userId, normalizedVenueName) and prefer rows whose
  // city is null or matches the incoming city to avoid collapsing distinct
  // locations of the same chain.
  const cityPredicate = city
    ? or(isNull(venuesTable.city), eq(venuesTable.city, city))
    : undefined;
  const [byName] = await db
    .select({
      id: venuesTable.id,
      city: venuesTable.city,
      state: venuesTable.state,
      country: venuesTable.country,
    })
    .from(venuesTable)
    .where(
      and(
        eq(venuesTable.userId, identity.userId),
        eq(venuesTable.normalizedVenueName, normalizedName),
        isNull(venuesTable.normalizedVenueKey),
        ...(cityPredicate ? [cityPredicate] : []),
      ),
    )
    .limit(1);

  if (byName) {
    // Only fill genuinely missing legacy fields — never overwrite an existing
    // non-null value (with null OR a different non-null). The legacy row's
    // existing data is the source of truth; we only enrich gaps.
    const legacyUpdate: Partial<typeof venuesTable.$inferInsert> = {
      normalizedVenueKey: key,
    };
    if (byName.city == null && city != null) legacyUpdate.city = city;
    if (byName.state == null && state != null) legacyUpdate.state = state;
    if (byName.country == null && country != null) legacyUpdate.country = country;
    await db
      .update(venuesTable)
      .set(legacyUpdate)
      .where(eq(venuesTable.id, byName.id));
    return { venueId: byName.id, created: false };
  }

  // Conflict-safe insert. The DB has a PARTIAL unique index
  // venues_user_id_normalized_key_unique on (user_id, normalized_venue_key)
  // WHERE user_id IS NOT NULL AND normalized_venue_key IS NOT NULL.
  // Postgres requires the ON CONFLICT predicate to match the partial-index
  // predicate exactly, so we pass the WHERE clause via raw sql. If a
  // concurrent request just inserted the same key we re-select instead
  // of erroring out.
  const inserted = await db
    .insert(venuesTable)
    .values({
      userId: identity.userId,
      name,
      normalizedVenueName: normalizedName,
      normalizedVenueKey: key,
      venueType: "personal",
      city,
      state,
      country,
      profileId: identity.profileId ?? null,
    })
    .onConflictDoNothing({
      target: [venuesTable.userId, venuesTable.normalizedVenueKey],
      where: sql`user_id IS NOT NULL AND normalized_venue_key IS NOT NULL`,
    })
    .returning({ id: venuesTable.id });

  if (inserted[0]) return { venueId: inserted[0].id, created: true };

  // Lost the race — another request created the same venue. Re-select.
  const [reselect] = await db
    .select({ id: venuesTable.id })
    .from(venuesTable)
    .where(and(eq(venuesTable.userId, identity.userId), eq(venuesTable.normalizedVenueKey, key)))
    .limit(1);
  if (!reselect) return null;
  return { venueId: reselect.id, created: false };
}
