// One-off backfill: populate runsTable.venueId for legacy runs that were
// saved before the calculator started persisting venueId. Matches a run to
// the user's venue by (userId, normalizedVenueName) and only writes when
// there is exactly one confident match. Existing venueId values are NEVER
// overwritten.
//
// Run with:
//   pnpm --filter @workspace/scripts run backfill-run-venue-ids        # report only
//   pnpm --filter @workspace/scripts run backfill-run-venue-ids --apply # write changes

import { and, eq, isNull, sql } from "drizzle-orm";
import { db, pool, runsTable, venuesTable } from "@workspace/db";

function normalizeVenueName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, "").replace(/\s+/g, " ").trim();
}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(`[backfill-run-venue-ids] mode=${apply ? "APPLY" : "DRY-RUN"}`);

  const candidates = await db
    .select({
      id: runsTable.id,
      userId: runsTable.userId,
      venueName: runsTable.venueName,
    })
    .from(runsTable)
    .where(and(isNull(runsTable.venueId), sql`${runsTable.venueName} IS NOT NULL AND length(trim(${runsTable.venueName})) > 0`));

  console.log(`[backfill-run-venue-ids] candidates: ${candidates.length}`);

  let matched = 0;
  let ambiguous = 0;
  let unmatched = 0;
  let updated = 0;

  for (const run of candidates) {
    if (!run.userId || !run.venueName) {
      unmatched++;
      continue;
    }
    const normalized = normalizeVenueName(run.venueName);
    if (!normalized) {
      unmatched++;
      continue;
    }

    const matches = await db
      .select({ id: venuesTable.id })
      .from(venuesTable)
      .where(and(eq(venuesTable.userId, run.userId), eq(venuesTable.normalizedVenueName, normalized)))
      .limit(2);

    if (matches.length === 0) {
      unmatched++;
      continue;
    }
    if (matches.length > 1) {
      ambiguous++;
      console.log(`  ambiguous: run ${run.id} ("${run.venueName}") matched ${matches.length} venues`);
      continue;
    }

    matched++;
    const venueId = matches[0]!.id;
    if (apply) {
      const result = await db
        .update(runsTable)
        .set({ venueId })
        .where(and(eq(runsTable.id, run.id), isNull(runsTable.venueId)))
        .returning({ id: runsTable.id });
      if (result.length > 0) {
        updated++;
      }
    } else {
      console.log(`  would link: run ${run.id} ("${run.venueName}") -> venue ${venueId}`);
    }
  }

  console.log(`[backfill-run-venue-ids] summary:`);
  console.log(`  matched (single confident): ${matched}`);
  console.log(`  ambiguous (skipped):        ${ambiguous}`);
  console.log(`  unmatched:                  ${unmatched}`);
  if (apply) {
    console.log(`  updated:                    ${updated}`);
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
