// Backfill: populate runsTable.venueId for runs saved before run→venue
// linkage was enforced. For each candidate run we resolve a venue using the
// canonical (userId, name|city|country) key, creating a personal venue if
// none exists. Existing venueId values are NEVER overwritten.
//
// Run with:
//   pnpm --filter @workspace/scripts run backfill-run-venue-ids        # report only
//   pnpm --filter @workspace/scripts run backfill-run-venue-ids --apply # write changes

import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db, pool, runsTable, venuesTable } from "@workspace/db";

function normalizeVenueName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

function normalizeVenueKey(
  name: string | null | undefined,
  city: string | null | undefined,
  country: string | null | undefined,
): string {
  return [name, city, country].map((p) => (p ?? "").trim().toLowerCase()).join("|");
}

interface ResolveOutcome {
  venueId: number;
  created: boolean;
  legacyKeyBackfilled: boolean;
}

async function resolveVenue(
  userId: string,
  venueName: string,
  city: string | null,
  state: string | null,
  country: string | null,
  apply: boolean,
): Promise<ResolveOutcome | null> {
  const trimmed = venueName.trim();
  if (!trimmed) return null;
  const normalizedName = normalizeVenueName(trimmed);
  if (!normalizedName) return null;

  const cleanCity = city?.trim() || null;
  const cleanState = state?.trim() || null;
  const cleanCountry = country?.trim() || null;
  const key = normalizeVenueKey(trimmed, cleanCity, cleanCountry);

  const [byKey] = await db
    .select({ id: venuesTable.id })
    .from(venuesTable)
    .where(and(eq(venuesTable.userId, userId), eq(venuesTable.normalizedVenueKey, key)))
    .limit(1);
  if (byKey) return { venueId: byKey.id, created: false, legacyKeyBackfilled: false };

  const cityPredicate = cleanCity
    ? or(isNull(venuesTable.city), eq(venuesTable.city, cleanCity))
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
        eq(venuesTable.userId, userId),
        eq(venuesTable.normalizedVenueName, normalizedName),
        isNull(venuesTable.normalizedVenueKey),
        ...(cityPredicate ? [cityPredicate] : []),
      ),
    )
    .limit(1);
  if (byName) {
    if (apply) {
      // Only fill genuinely missing legacy fields — never overwrite an
      // existing non-null value (with null OR with a different non-null).
      const legacyUpdate: Record<string, unknown> = { normalizedVenueKey: key };
      if (byName.city == null && cleanCity != null) legacyUpdate.city = cleanCity;
      if (byName.state == null && cleanState != null) legacyUpdate.state = cleanState;
      if (byName.country == null && cleanCountry != null) legacyUpdate.country = cleanCountry;
      await db.update(venuesTable).set(legacyUpdate).where(eq(venuesTable.id, byName.id));
    }
    return { venueId: byName.id, created: false, legacyKeyBackfilled: true };
  }

  if (!apply) {
    return { venueId: -1, created: true, legacyKeyBackfilled: false };
  }
  const inserted = await db
    .insert(venuesTable)
    .values({
      userId,
      name: trimmed,
      normalizedVenueName: normalizedName,
      normalizedVenueKey: key,
      venueType: "personal",
      city: cleanCity,
      state: cleanState,
      country: cleanCountry,
    })
    .onConflictDoNothing({
      target: [venuesTable.userId, venuesTable.normalizedVenueKey],
    })
    .returning({ id: venuesTable.id });
  if (inserted[0]) return { venueId: inserted[0].id, created: true, legacyKeyBackfilled: false };

  const [reselect] = await db
    .select({ id: venuesTable.id })
    .from(venuesTable)
    .where(and(eq(venuesTable.userId, userId), eq(venuesTable.normalizedVenueKey, key)))
    .limit(1);
  if (!reselect) return null;
  return { venueId: reselect.id, created: false, legacyKeyBackfilled: false };
}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`[backfill-run-venue-ids] mode=${apply ? "APPLY" : "DRY-RUN"}`);

  const candidates = await db
    .select({
      id: runsTable.id,
      userId: runsTable.userId,
      venueName: runsTable.venueName,
      city: runsTable.city,
      state: runsTable.state,
      country: runsTable.country,
    })
    .from(runsTable)
    .where(
      and(
        isNull(runsTable.venueId),
        sql`${runsTable.venueName} IS NOT NULL AND length(trim(${runsTable.venueName})) > 0`,
      ),
    );

  console.log(`[backfill-run-venue-ids] candidates: ${candidates.length}`);

  let linkedExisting = 0;
  let linkedLegacy = 0;
  let createdVenues = 0;
  let unmatched = 0;
  let updatedRuns = 0;

  for (const run of candidates) {
    if (!run.userId || !run.venueName) {
      unmatched++;
      continue;
    }

    const outcome = await resolveVenue(
      run.userId,
      run.venueName,
      run.city,
      run.state,
      run.country,
      apply,
    );
    if (!outcome) {
      unmatched++;
      continue;
    }

    if (outcome.created) {
      createdVenues++;
      if (apply) {
        console.log(`  created venue ${outcome.venueId} for run ${run.id} ("${run.venueName}")`);
      } else {
        console.log(`  would create venue for run ${run.id} ("${run.venueName}", city="${run.city ?? ""}", country="${run.country ?? ""}")`);
      }
    } else if (outcome.legacyKeyBackfilled) {
      linkedLegacy++;
      console.log(`  ${apply ? "linked" : "would link"} run ${run.id} -> legacy venue ${outcome.venueId} (key backfilled)`);
    } else {
      linkedExisting++;
    }

    if (apply && outcome.venueId > 0) {
      const result = await db
        .update(runsTable)
        .set({ venueId: outcome.venueId })
        .where(and(eq(runsTable.id, run.id), isNull(runsTable.venueId)))
        .returning({ id: runsTable.id });
      if (result.length > 0) updatedRuns++;
    }
  }

  console.log(`[backfill-run-venue-ids] summary:`);
  console.log(`  linked to existing venue (by key):    ${linkedExisting}`);
  console.log(`  linked to legacy venue (key written): ${linkedLegacy}`);
  console.log(`  new venues created:                   ${createdVenues}`);
  console.log(`  unmatched (no venueName/userId):      ${unmatched}`);
  if (apply) {
    console.log(`  runs updated:                         ${updatedRuns}`);
  } else {
    console.log(`  (dry-run; pass --apply to write)`);
  }
}

main()
  .catch((err) => {
    console.error("[backfill-run-venue-ids] failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
